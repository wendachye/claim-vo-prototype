import assert from 'node:assert/strict';
import test from 'node:test';
import { getClaimTracking, normalizeClaimTracking, recordClaimStage } from '../src/data/claim-tracking.js';
import { createProject, loadWorkspace, resetProject, updateProjectState, WORKSPACE_STORE } from '../src/data/projects.js';
import { saveClaimDraft, markClaimPrepared } from '../src/data/claims.js';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.js';

function fixture(value = 500, code = 'TRACK') {
  const project = createProject({ name: 'Claim tracker test', code, country: 'Singapore' });
  Object.assign(project, { locked: true, lockedAt: '2026-10-19T12:00:00+08:00',
    items: [{ id: 'A', ref: 'A/01', description: 'Measured work', unit: 'm²', quantity: 100,
      rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 50 }],
    reports: [{ id: 'R-A', projectId: project.id, itemId: 'A', status: 'verified', completion: 50,
      date: '2026-10-20T09:00:00+08:00', verifiedAt: '2026-10-20T12:00:00+08:00' }],
  });
  project.sourceItems = structuredClone(project.items);
  const assessment = { work: { A: { include: true, assessedQuantity: 50, previousValue: 500 - value } },
    priorConfirmed: true, adjustmentReason: value < 0 ? 'Correct previous measurement' : '' };
  const saved = saveClaimDraft(project, '2026-10', assessment);
  assert.equal(saved.draft.snapshot.canPrepare, true);
  const prepared = markClaimPrepared(saved.project, saved.draft.id);
  prepared.project.claimDrafts[0].createdAt = '2026-10-20T12:00:00+08:00';
  prepared.project.claimDrafts[0].preparedAt = '2026-10-20T12:00:00+08:00';
  return { project: prepared.project, id: saved.draft.id };
}

const submitted = (project, id) => recordClaimStage(project, id, 'submitted', { date: '2026-10-21', reference: 'DEMO-SUB-001', note: 'Simulated submission' });
const certified = (project, id, value = 450) => recordClaimStage(project, id, 'certified', {
  date: '2026-10-22', reference: 'DEMO-CERT-001', value, note: 'Simulated certification with measurement adjustment',
});
const payment = (project, id, value, reference = 'DEMO-PAY-001', date = '2026-10-23') => recordClaimStage(project, id, 'payment', { date, reference, value });

test('tracks prepared, submitted, certified and paid without changing saved claim values or exports', () => {
  const { project, id } = fixture();
  const original = structuredClone(project);
  const pack = buildClaimPack(project, id).pack;
  assert.equal(getClaimTracking(project, id).status, 'prepared');
  const sent = submitted(project, id);
  assert.equal(sent.outcome, 'updated');
  assert.equal(sent.tracking.status, 'submitted');
  assert.equal(sent.tracking.claimedValue, 500);
  const checked = certified(sent.project, id);
  assert.equal(checked.tracking.status, 'certified');
  assert.equal(checked.tracking.certifiedValue, 450);
  const paid = payment(checked.project, id, '450.00');
  assert.equal(paid.tracking.status, 'paid');
  assert.equal(paid.tracking.paidValue, 450);
  assert.equal(paid.tracking.paidAt, '2026-10-23');
  assert.deepEqual(paid.project.claimDrafts, original.claimDrafts);
  assert.deepEqual(paid.project.items, original.items);
  assert.deepEqual(paid.project.reports, original.reports);
  assert.deepEqual(paid.project.voReviews, original.voReviews);
  assert.deepEqual(buildClaimPack(paid.project, id).pack, pack);
  assert.equal(toClaimCSV(buildClaimPack(paid.project, id).pack), toClaimCSV(pack));
  assert.deepEqual(project, original);
  assert.equal(paid.project.claimDrafts[0].status, 'prepared');
  assert.equal(paid.tracking.history.length, 3);
});

test('records cumulative part payments once and reaches paid only at the certified total', () => {
  const { project, id } = fixture();
  const checked = certified(submitted(project, id).project, id);
  const first = payment(checked.project, id, 200);
  assert.equal(first.tracking.status, 'certified');
  assert.equal(first.tracking.paidAt, null);
  assert.equal(first.tracking.paidValue, 200);
  const repeated = payment(first.project, id, 200);
  assert.equal(repeated.outcome, 'unchanged');
  assert.equal(repeated.project, first.project);
  assert.equal(repeated.tracking.history.length, 3);
  assert.equal(payment(first.project, id, 199, 'LOWER').outcome, 'invalid');
  assert.equal(payment(first.project, id, 200, 'DUPLICATE').outcome, 'invalid');
  assert.equal(payment(first.project, id, 451, 'OVERPAID').outcome, 'invalid');
  const complete = payment(first.project, id, 450, 'DEMO-PAY-002', '2026-10-24');
  assert.equal(complete.tracking.status, 'paid');
  assert.equal(complete.tracking.paidValue, 450); // Cumulative, not 200 + 450.
  assert.equal(complete.tracking.history.length, 4);
  assert.equal(payment(complete.project, id, 450, 'AFTER-PAID').outcome, 'invalid');
  assert.equal(payment(complete.project, id, 450, 'DEMO-PAY-002', '2026-10-24').outcome, 'unchanged');
});

test('validates explicit fields, sequential stages and calendar dates before recording', () => {
  const { project, id } = fixture();
  assert.equal(certified(project, id).outcome, 'invalid');
  assert.equal(payment(project, id, 500).outcome, 'invalid');
  assert.equal(recordClaimStage(project, id, 'paid', {}).outcome, 'invalid');
  for (const fields of [{ date: '2026-02-30', reference: 'BAD-DAY' }, { date: '2026-10-19', reference: 'EARLY' },
    { date: '2026-10-21', reference: ' ' }, { date: '', reference: 'NO-DATE' }]) {
    assert.equal(recordClaimStage(project, id, 'submitted', fields).outcome, 'invalid');
  }
  const sent = submitted(project, id);
  assert.equal(submitted(sent.project, id).outcome, 'unchanged');
  const invalidCertifications = [{ value: '' }, { value: 'NaN' }, { value: Infinity }, { value: 450, note: '' }, { value: 500, date: '2026-10-20' }];
  for (const fields of invalidCertifications) assert.equal(recordClaimStage(sent.project, id, 'certified', {
    date: '2026-10-22', reference: 'CERT', value: 500, note: 'Demo assessment', ...fields,
  }).outcome, 'invalid');
  const checked = certified(sent.project, id);
  assert.equal(payment(checked.project, id, '', 'BLANK').outcome, 'invalid');
  assert.equal(payment(checked.project, id, NaN, 'NAN').outcome, 'invalid');
  assert.equal(payment(checked.project, id, 450, 'EARLY', '2026-10-21').outcome, 'invalid');
  assert.equal(recordClaimStage(checked.project, id, 'submitted', { date: '2026-10-23', reference: 'REGRESS' }).outcome, 'invalid');
});

test('preserves unknown, zero and signed credit amounts as different values', () => {
  const zero = fixture(0, 'ZERO');
  const zeroSent = submitted(zero.project, zero.id);
  const zeroCert = certified(zeroSent.project, zero.id, '0');
  const zeroPaid = payment(zeroCert.project, zero.id, '0');
  assert.equal(zeroPaid.tracking.status, 'paid');
  assert.equal(zeroPaid.tracking.claimedValue, 0);
  assert.equal(zeroPaid.tracking.certifiedValue, 0);
  assert.equal(zeroPaid.tracking.paidValue, 0);
  const credit = fixture(-100, 'CREDIT');
  const creditCert = certified(submitted(credit.project, credit.id).project, credit.id, -100);
  assert.equal(payment(creditCert.project, credit.id, 10).outcome, 'invalid');
  const creditPart = payment(creditCert.project, credit.id, -50);
  assert.equal(creditPart.tracking.status, 'certified');
  assert.equal(payment(creditPart.project, credit.id, -40, 'REGRESS').outcome, 'invalid');
  const creditPaid = payment(creditPart.project, credit.id, -100, 'FINAL', '2026-10-24');
  assert.equal(creditPaid.tracking.status, 'paid');
  assert.equal(creditPaid.tracking.claimedValue, -100);
  const unknown = fixture();
  unknown.project.claimDrafts[0].snapshot.totals.currentValue = null;
  assert.equal(getClaimTracking(unknown.project, unknown.id).claimedValue, null);
  assert.equal(submitted(unknown.project, unknown.id).outcome, 'invalid');
  assert.deepEqual(unknown.project.claimTracking, []);
});

test('keeps lifecycles bound to project and revision, including an older submitted revision', () => {
  const { project, id } = fixture();
  const other = fixture(500, 'OTHER');
  assert.equal(getClaimTracking(other.project, id), null);
  assert.equal(submitted(other.project, id).outcome, 'invalid');
  const initial = submitted(project, id);
  const second = saveClaimDraft(initial.project, '2026-10', { ...project.claimDrafts[0].assessment,
    work: { A: { include: true, assessedQuantity: 60, previousValue: 0 } },
  });
  const ready = markClaimPrepared(second.project, second.draft.id);
  const secondId = second.draft.id;
  assert.equal(getClaimTracking(ready.project, secondId).status, 'prepared');
  assert.deepEqual(getClaimTracking(ready.project, secondId).history, []);
  const oldCertified = certified(ready.project, id);
  assert.equal(oldCertified.outcome, 'updated');
  assert.equal(getClaimTracking(oldCertified.project, id).status, 'certified');
  assert.equal(getClaimTracking(oldCertified.project, secondId).status, 'prepared');
  const notYetSubmitted = structuredClone(ready.project);
  notYetSubmitted.claimTracking = [];
  assert.equal(submitted(notYetSubmitted, id).outcome, 'invalid');
  assert.deepEqual(other.project.claimTracking, []);
});

test('normalizes persisted tracking from events and selected reset leaves other projects untouched', () => {
  const { project, id } = fixture();
  const tracked = certified(submitted(project, id).project, id).project;
  const other = fixture(200, 'OTHER').project;
  const before = structuredClone(other);
  const workspace = { schemaVersion: 2, activeProjectId: project.id, projects: [tracked, other] };
  const data = new Map([[WORKSPACE_STORE, JSON.stringify(workspace)]]);
  const loaded = loadWorkspace({ getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) });
  assert.equal(getClaimTracking(loaded.projects[0], id).status, 'certified');
  assert.equal(getClaimTracking(loaded.projects[0], id).certifiedValue, 450);
  assert.deepEqual(loaded.projects[0].claimDrafts, project.claimDrafts);
  const reset = updateProjectState(loaded, project.id, resetProject);
  assert.deepEqual(reset.projects[0].claimTracking, []);
  assert.deepEqual(reset.projects[1], before);
  assert.deepEqual(normalizeClaimTracking({ ...tracked, claimTracking: [{ ...tracked.claimTracking[0], projectId: 'OTHER' }] }), []);
  const tampered = structuredClone(tracked);
  tampered.claimTracking[0].certifiedValue = 99999;
  tampered.claimTracking[0].status = 'paid';
  assert.equal(getClaimTracking(tampered, id).status, 'certified');
  assert.equal(getClaimTracking(tampered, id).certifiedValue, 450);
  const missingSource = { ...tracked, claimDrafts: [] };
  assert.deepEqual(normalizeClaimTracking(missingSource), []);
  assert.equal(getClaimTracking(missingSource, id), null);
});
