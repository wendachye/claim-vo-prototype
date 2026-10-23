import assert from 'node:assert/strict';
import test from 'node:test';
import { createProject, loadWorkspace, resetProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { saveClaimDraft, markClaimPrepared } from '../src/data/claims.ts';
import { getClaimTracking, normalizeClaimTracking, recordClaimStage } from '../src/data/claim-tracking.ts';
import { getClaimRevisionContext, saveClaimRevision } from '../src/data/claim-revisions.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

function fixture(code = 'QUERY') {
  const project = createProject({ code, name: 'Mock claim query test', country: 'Singapore' });
  Object.assign(project, { locked: true, lockedAt: '2026-10-19T12:00:00+08:00',
    items: ['A', 'B'].map((id) => ({ id, ref: `A/${id}`, description: `Measured scaffold ${id}`,
      unit: 'm²', quantity: 100, rate: 10, amount: 1000, pricingType: 'measured', verified: 60, reported: 60 })),
    reports: [{ id: 'R-A', projectId: project.id, itemId: 'A', status: 'verified', completion: 60,
      date: '2026-10-20T09:00:00+08:00', verifiedAt: '2026-10-20T12:00:00+08:00' },
    { id: 'R-VO', projectId: project.id, vo: true, status: 'voApproved', date: '2026-10-20T09:00:00+08:00', message: 'Mock extra access' }],
    voReviews: [{ id: 'R-VO', reportId: 'R-VO', projectId: project.id, status: 'approved', title: 'Extra access',
      approvedValue: 300, approvalReference: 'DEMO-APP', approver: 'Demo approver',
      reviewChecksVersion: 1, scopeDisposition: 'variation', scopeAssessment: 'Fictional additional access outside the original scope.',
      instructionStatus: 'documented', instructionReference: 'DEMO-INSTRUCTION',
      executionStatus: 'verified', executionReference: 'DEMO-WORK-CHECK', executionVerifiedAt: '2026-10-20T12:00:00+08:00',
      claimEligibility: 'eligible', eligibilityNote: 'Explicit fictional QS claim eligibility check.', eligibilityReviewedAt: '2026-10-20T12:00:00+08:00',
      history: [{ id: 'APP-VO', action: 'approve', to: 'approved', date: '2026-10-20T12:00:00+08:00' }] }],
  });
  project.sourceItems = structuredClone(project.items);
  const saved = saveClaimDraft(project, '2026-10', { work: { A: { include: true, assessedQuantity: 60, previousValue: 100 } },
    vos: { 'R-VO': { include: true, assessedValue: 200, previousValue: 50 } }, priorConfirmed: true, note: 'Original measured assessment.' });
  const prepared = markClaimPrepared(saved.project, saved.draft.id);
  prepared.project.claimDrafts[0].preparedAt = '2026-10-20T12:00:00+08:00';
  assert.equal(prepared.project.claimDrafts[0].snapshot.totals.currentValue, 650);
  return { project: prepared.project, id: saved.draft.id };
}
const submit = (project, id, date = '2026-10-21') => recordClaimStage(project, id, 'submitted', { date, reference: 'DEMO-SUB' });
const query = (project, id, fields = {}) => recordClaimStage(project, id, 'query', {
  date: '2026-10-22', reference: 'DEMO-QUERY', note: 'Confirm measured quantity against the area update.', targetType: 'work', targetId: 'A', ...fields,
});
const assessmentFor = (project, id, quantity = 55) => ({ ...structuredClone(project.claimDrafts.find((draft) => draft.id === id).assessment),
  work: { A: { include: true, assessedQuantity: quantity, previousValue: 100 } },
});

test('query, revise, prepare and resubmit retain the original assessment, evidence and tracking history', () => {
  const { project, id } = fixture();
  const original = structuredClone(project);
  const originalPack = buildClaimPack(project, id).pack;
  const sent = submit(project, id);
  const queried = query(sent.project, id);
  assert.equal(queried.outcome, 'updated');
  assert.equal(queried.tracking.status, 'queried');
  assert.equal(queried.tracking.submissionReference, 'DEMO-SUB');
  assert.equal(queried.tracking.query.targetId, 'A');
  const queryHistory = structuredClone(queried.tracking.history);
  const context = getClaimRevisionContext(queried.project, id);
  assert.equal(context.canRevise, true);
  assert.equal(context.source.id, id);
  assert.equal(context.revision, null);
  const revised = saveClaimRevision(queried.project, id, assessmentFor(project, id), 'Measured total corrected to 55 m²; earlier claimed values retained.');
  assert.equal(revised.outcome, 'updated');
  assert.notEqual(revised.draft.id, id);
  assert.equal(revised.draft.revision, 2);
  assert.equal(revised.draft.revisionOf, id);
  assert.equal(revised.draft.queryId, context.query.id);
  assert.equal(revised.draft.snapshot.totals.previousValue, 150);
  assert.equal(revised.draft.snapshot.totals.currentValue, 600);
  assert.equal(revised.draft.snapshot.canPrepare, true);
  assert.equal(getClaimRevisionContext(revised.project, id).revision.id, revised.draft.id);
  const prepared = markClaimPrepared(revised.project, revised.draft.id);
  assert.equal(prepared.outcome, 'updated');
  assert.equal(getClaimTracking(prepared.project, revised.draft.id).status, 'prepared');
  const resubmitted = submit(prepared.project, revised.draft.id, '2026-10-24');
  assert.equal(resubmitted.outcome, 'updated');
  assert.equal(resubmitted.tracking.status, 'submitted');
  assert.equal(resubmitted.tracking.claimedValue, 600);
  assert.deepEqual(resubmitted.project.claimDrafts.find((draft) => draft.id === id), original.claimDrafts[0]);
  assert.deepEqual(getClaimTracking(resubmitted.project, id).history, queryHistory);
  assert.deepEqual(buildClaimPack(resubmitted.project, id).pack, originalPack);
  assert.equal(toClaimCSV(buildClaimPack(resubmitted.project, id).pack), toClaimCSV(originalPack));
  for (const key of ['items', 'reports', 'voReviews', 'baselines', 'contract']) assert.deepEqual(resubmitted.project[key], original[key]);
  assert.deepEqual(project, original);

  const data = new Map([[WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id, projects: [resubmitted.project] })]]);
  const loaded = loadWorkspace({ getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) });
  assert.equal(getClaimTracking(loaded.projects[0], id).status, 'queried');
  assert.equal(getClaimTracking(loaded.projects[0], revised.draft.id).status, 'submitted');
  assert.equal(getClaimRevisionContext(loaded.projects[0], id).revision.revisionResponse, revised.draft.revisionResponse);
});

test('queries require a submitted claim, explicit remarks, dates and targets from the saved included rows', () => {
  const { project, id } = fixture();
  assert.equal(query(project, id).outcome, 'invalid');
  const sent = submit(project, id);
  for (const fields of [{ note: '' }, { reference: '' }, { date: '2026-10-20' }, { date: '2026-02-30' },
    { targetType: 'unknown' }, { targetType: 'claim', targetId: 'A' }, { targetId: 'B' }, { targetId: 'FOREIGN' },
    { targetType: 'vo', targetId: 'A' }]) assert.equal(query(sent.project, id, fields).outcome, 'invalid');
  const whole = query(sent.project, id, { targetType: 'claim', targetId: '' });
  assert.equal(whole.outcome, 'updated');
  assert.equal(query(sent.project, id, { targetType: 'vo', targetId: 'R-VO' }).outcome, 'updated');
  const removedLiveRows = { ...sent.project, items: [], reports: [], voReviews: [] };
  assert.equal(query(removedLiveRows, id).outcome, 'updated'); // Saved evidence remains the query target.
  const queried = query(sent.project, id);
  assert.equal(query(queried.project, id).outcome, 'unchanged');
  assert.equal(query(queried.project, id, { note: 'A second query on the same submitted revision.' }).outcome, 'invalid');
  assert.equal(recordClaimStage(queried.project, id, 'certified', { date: '2026-10-23', reference: 'CERT', value: 650 }).outcome, 'invalid');
  const certified = recordClaimStage(sent.project, id, 'certified', { date: '2026-10-22', reference: 'CERT', value: 650 });
  assert.equal(query(certified.project, id).outcome, 'invalid');
});

test('clarification-only responses force a distinct revision, then unchanged saves replay idempotently', () => {
  const { project, id } = fixture();
  const queried = query(submit(project, id).project, id, { targetType: 'claim', targetId: '' });
  const assessment = structuredClone(project.claimDrafts[0].assessment);
  assert.equal(saveClaimRevision(queried.project, id, assessment, ' ').outcome, 'invalid');
  const saved = saveClaimRevision(queried.project, id, assessment, 'Clarified the existing measured quantity; amount unchanged.');
  assert.equal(saved.outcome, 'updated');
  assert.equal(saved.draft.status, 'draft');
  assert.equal(saved.draft.preparedAt, undefined);
  assert.equal(saved.draft.snapshot.totals.currentValue, 650);
  assert.equal(saved.draft.revision, 2);
  const again = saveClaimRevision(saved.project, id, assessment, saved.draft.revisionResponse);
  assert.equal(again.outcome, 'unchanged');
  assert.equal(again.project, saved.project);
  const more = saveClaimRevision(saved.project, id, assessment, 'Added a more detailed response with the same claim amount.');
  assert.equal(more.outcome, 'updated');
  assert.equal(more.draft.revision, 3);
  assert.equal(more.draft.revisionOf, id);
  assert.deepEqual(more.project.claimDrafts.slice(0, 2), saved.project.claimDrafts);
  const quantityChange = saveClaimRevision(more.project, id, assessmentFor(project, id, 54), 'Rechecked the measurement.');
  assert.equal(quantityChange.draft.revision, 4);
  assert.equal(quantityChange.draft.snapshot.totals.currentValue, 590);
});

test('revision guards prevent unrelated branches, prepared overwrites and cross-project query use', () => {
  const { project, id } = fixture();
  const other = fixture('OTHER');
  const otherBefore = structuredClone(other.project);
  const queried = query(submit(project, id).project, id);
  assert.equal(getClaimRevisionContext(other.project, id), null);
  assert.equal(saveClaimRevision(other.project, id, project.claimDrafts[0].assessment, 'Foreign response').outcome, 'invalid');
  assert.equal(query(other.project, id).outcome, 'invalid');
  const unrelated = saveClaimDraft(queried.project, '2026-10', assessmentFor(project, id, 51));
  assert.equal(getClaimRevisionContext(unrelated.project, id).canRevise, false);
  assert.equal(saveClaimRevision(unrelated.project, id, assessmentFor(project, id), 'Cannot branch over another draft.').outcome, 'invalid');
  const revised = saveClaimRevision(queried.project, id, assessmentFor(project, id), 'Corrected quantity.');
  const prepared = markClaimPrepared(revised.project, revised.draft.id);
  assert.equal(getClaimRevisionContext(prepared.project, id).canRevise, false);
  assert.equal(saveClaimRevision(prepared.project, id, assessmentFor(project, id, 54), 'Cannot overwrite the prepared revision.').outcome, 'invalid');
  assert.deepEqual(other.project, otherBefore);
  const reset = resetProject(queried.project);
  assert.equal(getClaimRevisionContext(reset, id), null);
  assert.deepEqual(reset.claimTracking, []);
});

test('resubmission validates query lineage and timing on write and reload', () => {
  const { project, id } = fixture();
  const queried = query(submit(project, id).project, id);
  const revised = saveClaimRevision(queried.project, id, assessmentFor(project, id), 'Measurement corrected.');
  const prepared = markClaimPrepared(revised.project, revised.draft.id);
  assert.equal(submit(prepared.project, revised.draft.id, '2026-10-21').outcome, 'invalid');
  for (const patch of [{ revisionOf: 'FOREIGN' }, { queryId: 'STALE-QUERY' }, { revisionResponse: '' }]) {
    const changed = structuredClone(prepared.project);
    Object.assign(changed.claimDrafts.find((draft) => draft.id === revised.draft.id), patch);
    assert.equal(submit(changed, revised.draft.id, '2026-10-24').outcome, 'invalid');
  }
  const resubmitted = submit(prepared.project, revised.draft.id, '2026-10-24');
  const tampered = structuredClone(resubmitted.project);
  tampered.claimDrafts.find((draft) => draft.id === revised.draft.id).queryId = 'STALE-QUERY';
  assert.equal(normalizeClaimTracking(tampered).some((entry) => entry.draftId === revised.draft.id), false);
  assert.equal(getClaimTracking(tampered, id).status, 'queried');
});

test('a queried resubmission can form the next revision without merging earlier histories', () => {
  const { project, id } = fixture();
  const firstQuery = query(submit(project, id).project, id);
  const revised = saveClaimRevision(firstQuery.project, id, assessmentFor(project, id), 'First response.');
  const prepared = markClaimPrepared(revised.project, revised.draft.id);
  const secondSubmit = submit(prepared.project, revised.draft.id, '2026-10-24');
  const secondQuery = query(secondSubmit.project, revised.draft.id, { date: '2026-10-25', reference: 'QUERY-2', targetType: 'vo', targetId: 'R-VO', note: 'Clarify the separate extra access value.' });
  const secondRevision = saveClaimRevision(secondQuery.project, revised.draft.id, assessmentFor(secondQuery.project, revised.draft.id, 55), 'Extra access values confirmed; amount unchanged.');
  assert.equal(secondRevision.outcome, 'updated');
  assert.equal(secondRevision.draft.revisionOf, revised.draft.id);
  assert.equal(secondRevision.draft.revision, 3);
  const secondPrepared = markClaimPrepared(secondRevision.project, secondRevision.draft.id);
  const thirdSubmit = submit(secondPrepared.project, secondRevision.draft.id, '2026-10-26');
  assert.equal(thirdSubmit.outcome, 'updated');
  assert.equal(getClaimTracking(thirdSubmit.project, id).status, 'queried');
  assert.equal(getClaimTracking(thirdSubmit.project, revised.draft.id).status, 'queried');
  assert.equal(getClaimTracking(thirdSubmit.project, secondRevision.draft.id).status, 'submitted');
  assert.deepEqual(thirdSubmit.project.claimDrafts[0], project.claimDrafts[0]);
});

test('revisions preserve zero, credit adjustments and incomplete values without assuming prior submission was paid', () => {
  for (const prior of [600, 700]) {
    const { project } = fixture(`SIGNED-${prior}`);
    const assessment = { work: { A: { include: true, assessedQuantity: 60, previousValue: prior } },
      vos: { 'R-VO': { include: true, assessedValue: 200, previousValue: 200 } },
      priorConfirmed: true, adjustmentReason: prior > 600 ? 'Corrected an earlier measurement.' : '' };
    const saved = saveClaimDraft(project, '2026-10', assessment);
    const prepared = markClaimPrepared(saved.project, saved.draft.id);
    prepared.project.claimDrafts.find((draft) => draft.id === saved.draft.id).preparedAt = '2026-10-20T12:00:00+08:00';
    const queried = query(submit(prepared.project, saved.draft.id).project, saved.draft.id);
    const revised = saveClaimRevision(queried.project, saved.draft.id, assessment, 'Clarification only; measured totals and prior values retained.');
    assert.equal(revised.draft.snapshot.totals.currentValue, 600 - prior);
    assert.equal(revised.draft.snapshot.workRows.find((row) => row.id === 'A').previousValue, prior);
    assert.equal(revised.draft.assessment.work.A.previousValue, prior);
    assert.equal(revised.draft.revision, 3);
  }
  const { project, id } = fixture();
  const queried = query(submit(project, id).project, id);
  const incomplete = assessmentFor(project, id);
  incomplete.work.A.assessedQuantity = '';
  const saved = saveClaimRevision(queried.project, id, incomplete, 'Need to confirm the revised quantity before preparation.');
  assert.equal(saved.outcome, 'updated');
  assert.equal(saved.draft.snapshot.totals.currentValue, null);
  assert.equal(saved.draft.snapshot.canPrepare, false);
  assert.equal(markClaimPrepared(saved.project, saved.draft.id).outcome, 'invalid');
  assert.equal(saveClaimRevision(queried.project, id, { work: { FOREIGN: { include: true } } }, 'Invalid item.').outcome, 'invalid');
});
