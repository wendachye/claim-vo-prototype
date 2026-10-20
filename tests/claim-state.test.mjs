import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaimReview, saveClaimDraft, markClaimPrepared, normalizeClaimDrafts } from '../src/data/claims.js';
import { createProject, loadWorkspace, resetProject, updateProjectState, WORKSPACE_STORE, LEGACY_STORE } from '../src/data/projects.js';

function project() {
  const base = createProject({ name: 'Test site', code: 'T01', country: 'Singapore' });
  const item = (id, values = {}) => ({ id, ref: id, description: `Test work ${id}`, unit: 'm²', quantity: 100, rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 80, needsReview: false, ...values });
  const items = [item('A'), item('B', { quantity: 200, rate: 5, verified: 75 }),
    item('C', { pricingType: 'included', quantity: 1, rate: null, amount: null }),
    item('D', { pricingType: 'rateOnly', quantity: 1, rate: 20, amount: null }),
    item('E', { verified: 0 }), item('F', { verified: 100 }),
  ];
  const reports = [
    { id: 'R-A', itemId: 'A', status: 'verified', completion: 50, approvedCompletion: 50, verifiedAt: '2026-10-15T10:00:00+08:00', date: '2026-10-15T09:00:00+08:00', message: 'A verified observation', photo: '/demo-photo.jpg' },
    { id: 'R-B', itemId: 'B', status: 'verified', completion: 75, date: '2026-10-15T09:00:00+08:00', message: 'Undated verification fixture' },
    { id: 'R-E', itemId: 'E', status: 'pending', completion: 80, date: '2026-10-15T09:00:00+08:00' },
    { id: 'R-F', itemId: 'F', status: 'verified', completion: 100, verifiedAt: '2026-11-01T00:00:00+08:00', date: '2026-10-15T09:00:00+08:00' },
    { id: 'VO-REPORT', projectId: 'T01', vo: true, status: 'voApproved', message: 'Demo additional work', date: '2026-10-15T09:00:00+08:00', photo: '/vo-demo.jpg' },
  ];
  return { ...base, items, sourceItems: structuredClone(items), reports, locked: true, lockedAt: '2026-09-01T12:00:00+08:00',
    contract: { ...base.contract, sourceKind: 'illustrative', totalAmount: 4000 },
    voReviews: [{ id: 'VO-REPORT', reportId: 'VO-REPORT', projectId: 'T01', status: 'approved', title: 'Additional work', approvedValue: 200, proposedValue: 220, approvalReference: 'DEMO-APP-01', approver: 'Demo QS',
      history: [{ id: 'APP-1', action: 'approve', to: 'approved', date: '2026-10-16T12:00:00+08:00', values: { approvedValue: 200, approvalReference: 'DEMO-APP-01', approver: 'Demo QS' } }],
    }],
  };
}

const assessment = (changes = {}) => ({ work: { A: { include: true, assessedQuantity: 40, previousValue: 300 } }, vos: { 'VO-REPORT': { include: true, assessedValue: 120, previousValue: 50 } }, priorConfirmed: true, ...changes });
const memory = (values = {}) => {
  const data = new Map(Object.entries(values));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('claim review starts unassessed, uses explicit QS quantities and subtracts prior values once', () => {
  const original = project();
  const blank = buildClaimReview(original, '2026-10');
  assert.equal(blank.selectedCount, 0);
  assert.equal(blank.workRows[0].assessedQuantity, null);
  assert.equal(blank.workRows[0].cumulativeValue, null);
  assert.equal(blank.workRows[0].verified, 50);
  assert.equal(blank.canPrepare, false);
  const review = buildClaimReview(original, '2026-10', assessment());
  assert.equal(review.canPrepare, true);
  assert.equal(review.cutoff, '2026-10-31');
  assert.deepEqual(review.totals, { previousValue: 350, cumulativeValue: 520, currentValue: 170, workCurrentValue: 100, voCurrentValue: 70 });
  assert.equal(review.workRows[0].cumulativeValue, 400); // Not 50% × 1,000.
  assert.equal(review.voRows[0].cumulativeValue, 120); // Not the whole approved 200.
  assert.equal(review.workRows[0].evidence.photo, '/demo-photo.jpg');
  assert.equal(review.voRows[0].evidence.photo, '/vo-demo.jpg');
  assert.deepEqual(original.claimDrafts, []);
});

test('blank prior values stay unknown until the QS explicitly confirms zero assumptions', () => {
  const input = { work: { A: { include: true, assessedQuantity: 40 } } };
  const unknown = buildClaimReview(project(), '2026-10', input);
  assert.equal(unknown.totals.previousValue, null);
  assert.equal(unknown.totals.currentValue, null);
  assert.equal(unknown.canPrepare, false);
  const zero = buildClaimReview(project(), '2026-10', { ...input, priorConfirmed: true });
  assert.equal(zero.workRows[0].previousValue, 0);
  assert.equal(zero.totals.currentValue, 400);
  assert.equal(zero.canPrepare, true);
  const saved = saveClaimDraft(project(), '2026-10', { ...input, priorConfirmed: true });
  const nextMonth = buildClaimReview(saved.project, '2026-11', { ...input, priorConfirmed: true });
  assert.equal(nextMonth.workRows[0].previousValue, 0); // A saved draft was never submitted.
});

test('month cutoff uses dated verification and explicit as-of confirmation for undated progress', () => {
  const before = project();
  const b = { work: { B: { include: true, assessedQuantity: 100 } }, priorConfirmed: true };
  const undated = buildClaimReview(before, '2026-10', b);
  assert.equal(undated.workRows[1].requiresDateConfirmation, true);
  assert.equal(undated.canPrepare, false);
  const confirmed = buildClaimReview(before, '2026-10', { ...b, work: { B: { ...b.work.B, evidenceDateConfirmed: true } } });
  assert.equal(confirmed.canPrepare, true);
  assert.deepEqual(confirmed.workRows[1].evidenceDateConfirmation, { asOf: '2026-10-31', confirmed: true });
  const september = buildClaimReview(before, '2026-09', { ...b, work: { B: { ...b.work.B, evidenceDateConfirmed: true } } });
  assert.equal(september.workRows[1].eligible, false); // Observation was not yet available.
  assert.equal(september.canPrepare, false);
  assert.equal(undated.workRows.find((row) => row.id === 'F').eligible, false); // Verified at Nov 1 local time.
  before.reports.push({ ...before.reports[0], id: 'R-A-FUTURE', approvedCompletion: 70, verifiedAt: '2026-11-02T00:00:00+08:00' });
  before.items[0].verified = 70;
  assert.equal(buildClaimReview(before, '2026-10', assessment()).workRows[0].verified, 50);
  assert.equal(buildClaimReview(before, '2026-11', assessment()).workRows[0].verified, 70);
});

test('only measured verified work and currently approved VOs before cutoff are eligible', () => {
  const before = project();
  const review = buildClaimReview(before, '2026-10', assessment());
  for (const id of ['C', 'D', 'E', 'F']) assert.equal(review.workRows.find((row) => row.id === id).eligible, false);
  const future = structuredClone(before);
  future.voReviews[0].history[0].date = '2026-11-01T00:00:00+08:00';
  assert.equal(buildClaimReview(future, '2026-10', assessment()).voRows[0].eligible, false);
  const reopened = structuredClone(before);
  reopened.voReviews[0].status = 'flagged';
  reopened.voReviews[0].approvedValue = null;
  const reconcile = buildClaimReview(reopened, '2026-10', { vos: { 'VO-REPORT': { include: false, previousValue: 50, assessedValue: 0 } }, priorConfirmed: true });
  assert.equal(reconcile.voRows[0].included, true);
  assert.equal(reconcile.canPrepare, false);
  assert.match(reconcile.issues.join(' '), /Reconcile the previously claimed value/);
  const missingDate = structuredClone(before);
  missingDate.voReviews[0].history = [];
  assert.equal(buildClaimReview(missingDate, '2026-10', assessment()).voRows[0].eligible, false);
});

test('unknown and zero amounts stay distinct; limits, malformed inputs and adjustments need review', () => {
  const before = project();
  const zero = buildClaimReview(before, '2026-10', assessment({ work: { A: { include: true, assessedQuantity: 0, previousValue: 0 } }, vos: { 'VO-REPORT': { include: true, assessedValue: 0, previousValue: 0 } } }));
  assert.equal(zero.canPrepare, true);
  assert.equal(zero.totals.currentValue, 0);
  for (const invalid of [-1, Infinity, 'oops', false]) {
    assert.equal(saveClaimDraft(before, '2026-10', { work: { A: { include: true, assessedQuantity: invalid } } }).outcome, 'invalid');
  }
  assert.equal(saveClaimDraft(before, '2026-10', { work: { FOREIGN: { include: true } } }).outcome, 'invalid');
  assert.equal(saveClaimDraft(before, '2026-10', { vos: { FOREIGN: { include: true } } }).outcome, 'invalid');
  assert.equal(saveClaimDraft(before, '2026-13', {}).outcome, 'invalid');
  assert.equal(buildClaimReview(before, '2026-10', assessment({ work: { A: { include: true, assessedQuantity: 101 } } })).canPrepare, false);
  assert.equal(buildClaimReview(before, '2026-10', assessment({ vos: { 'VO-REPORT': { include: true, assessedValue: 201 } } })).canPrepare, false);
  const adjustment = assessment({ work: { A: { include: true, assessedQuantity: 20, previousValue: 300 } }, vos: {} });
  assert.equal(buildClaimReview(before, '2026-10', adjustment).canPrepare, false);
  const explained = buildClaimReview(before, '2026-10', { ...adjustment, adjustmentReason: 'QS correction of an earlier over-assessment.' });
  assert.equal(explained.canPrepare, true);
  assert.equal(explained.totals.currentValue, -100);
});

test('incomplete drafts can be saved but readiness requires the confirmed baseline and all checks', () => {
  const before = project();
  before.locked = false;
  const incomplete = saveClaimDraft(before, '2026-10', {});
  assert.equal(incomplete.outcome, 'updated');
  assert.equal(incomplete.draft.status, 'draft');
  assert.equal(markClaimPrepared(incomplete.project, incomplete.draft.id).outcome, 'invalid');
  before.locked = true;
  before.lockedAt = '2026-11-01T00:00:00+08:00';
  assert.equal(buildClaimReview(before, '2026-10', assessment()).canPrepare, false);
  before.lockedAt = '2026-09-01T00:00:00+08:00';
  before.items[0].needsReview = true;
  assert.equal(buildClaimReview(before, '2026-10', assessment()).canPrepare, false);
});

test('saved revisions are immutable and preparation rejects stale sources and decision replay', () => {
  const before = project();
  const saved = saveClaimDraft(before, '2026-10', assessment());
  assert.equal(saved.draft.id, 'CLAIM-T01-2026-10-R1');
  assert.equal(saveClaimDraft(saved.project, '2026-10', assessment()).outcome, 'unchanged');
  const source = structuredClone(saved.project);
  source.items[0].rate = 12;
  source.items[0].amount = 1200;
  assert.equal(markClaimPrepared(source, saved.draft.id).outcome, 'invalid');
  assert.equal(source.claimDrafts[0].snapshot.workRows[0].rate, 10);
  const revised = saveClaimDraft(source, '2026-10', assessment());
  assert.equal(revised.draft.revision, 2);
  assert.deepEqual(revised.project.claimDrafts[0], saved.draft);
  assert.equal(markClaimPrepared(revised.project, saved.draft.id).outcome, 'invalid');
  const prepared = markClaimPrepared(revised.project, revised.draft.id);
  assert.equal(prepared.outcome, 'updated');
  assert.equal(prepared.draft.status, 'prepared');
  assert.deepEqual(prepared.draft.snapshot, revised.draft.snapshot);
  assert.equal(markClaimPrepared(prepared.project, prepared.draft.id).outcome, 'unchanged');
  assert.equal(saveClaimDraft(prepared.project, '2026-10', assessment()).outcome, 'unchanged');
  assert.deepEqual(prepared.project.items, source.items);
  assert.deepEqual(prepared.project.reports, source.reports);
  assert.deepEqual(prepared.project.voReviews, source.voReviews);
  assert.equal(prepared.project.contract.totalAmount, 4000);
  assert.deepEqual(before.claimDrafts, []);
});

test('project isolation, old-state migration, reload and reset preserve the right claim records', () => {
  const before = project();
  const saved = saveClaimDraft(before, '2026-10', assessment()).project;
  const other = createProject({ name: 'Other site', code: 'OTHER', country: 'Malaysia' });
  assert.equal(markClaimPrepared(other, saved.claimDrafts[0].id).outcome, 'invalid');
  assert.deepEqual(normalizeClaimDrafts({ ...other, claimDrafts: saved.claimDrafts }), []);
  const workspace = { schemaVersion: 2, activeProjectId: before.id, projects: [saved, other] };
  const loaded = loadWorkspace(memory({ [WORKSPACE_STORE]: JSON.stringify(workspace) }));
  assert.deepEqual(loaded.projects[0].claimDrafts, saved.claimDrafts);
  assert.deepEqual(loaded.projects[0].items, before.items);
  assert.deepEqual(loaded.projects[0].reports, before.reports);
  const prior = structuredClone(workspace.projects[1]);
  const reset = updateProjectState(loaded, before.id, resetProject);
  assert.deepEqual(reset.projects[0].claimDrafts, []);
  assert.deepEqual(reset.projects[1], prior);
  const old = structuredClone(workspace);
  delete old.projects[0].claimDrafts;
  delete old.projects[0].seed.claimDrafts;
  const migrated = loadWorkspace(memory({ [WORKSPACE_STORE]: JSON.stringify(old) }));
  assert.deepEqual(migrated.projects[0].claimDrafts, []);
  assert.deepEqual(migrated.projects[0].items, before.items);
  const legacy = JSON.stringify({ items: before.items, reports: before.reports, history: [] });
  const storage = memory({ [LEGACY_STORE]: legacy });
  const v1 = loadWorkspace(storage);
  assert.equal(storage.getItem(LEGACY_STORE), legacy);
  assert.deepEqual(v1.projects[0].claimDrafts, []);
});
