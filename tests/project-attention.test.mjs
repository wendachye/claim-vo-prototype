import assert from 'node:assert/strict';
import test from 'node:test';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { updateVOReview } from '../src/data/vo.ts';
import { createProject } from '../src/data/projects.ts';
import { saveClaimDraft, markClaimPrepared } from '../src/data/claims.ts';
import { recordClaimStage } from '../src/data/claim-tracking.ts';
import { saveClaimRevision } from '../src/data/claim-revisions.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

function fixture(code = 'ATTN') {
  const project = createProject({ code, name: 'Needs attention demo', country: 'Singapore' });
  Object.assign(project, { locked: true, lockedAt: '2026-10-19T12:00:00+08:00',
    items: [{ id: 'A', ref: 'A/01', description: 'Scaffold work', unit: 'm²', quantity: 100,
      rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 50 }],
    reports: [{ id: 'VERIFIED', projectId: project.id, projectCode: project.code, itemId: 'A',
      status: 'verified', completion: 50, date: '2026-10-20T09:00:00+08:00', verifiedAt: '2026-10-20T12:00:00+08:00' }],
    whatsappMessages: [], voReviews: [], claimDrafts: [], claimTracking: [],
  });
  project.sourceItems = structuredClone(project.items);
  return project;
}
const tasks = (project, category) => getProjectAttention(project).filter((task) => !category || task.category === category);
function save(project, period = '2026-10', quantity = 50) {
  return saveClaimDraft(project, period, { work: { A: { include: true, assessedQuantity: quantity, previousValue: 0 } }, priorConfirmed: true });
}
function prepare(result) {
  const prepared = markClaimPrepared(result.project, result.draft.id);
  assert.equal(prepared.outcome, 'updated');
  prepared.project.claimDrafts.find((draft) => draft.id === result.draft.id).preparedAt = '2026-10-20T12:00:00+08:00';
  prepared.draft.preparedAt = '2026-10-20T12:00:00+08:00';
  return prepared;
}
const stage = (project, id, action, fields = {}) => {
  const result = recordClaimStage(project, id, action, { date: '2026-10-21', reference: `DEMO-${action}`, ...fields });
  assert.equal(result.outcome, 'updated', result.error);
  return result;
};

test('inbox messages and their latest progress report form one task which clears after verification', () => {
  const project = fixture();
  project.reports.push({ id: 'PENDING', projectId: project.id, itemId: 'A', sourceMessageId: 'WA-1', status: 'pending',
    date: '2026-10-21T09:00:00+08:00', completion: 65 });
  project.whatsappMessages = [{ id: 'WA-1', projectId: project.id, projectCode: project.code, status: 'new',
    kind: 'progress', itemId: 'A', date: '2026-10-21T09:00:00+08:00' }];
  const before = structuredClone(project);
  assert.equal(tasks(project).length, 1);
  assert.deepEqual(tasks(project)[0].target, { route: 'completion', itemId: 'A', reportId: 'PENDING' });
  assert.equal(tasks(project)[0].statusLabel, 'Awaiting verification');
  assert.deepEqual(project, before);
  project.reports.at(-1).status = 'verified';
  project.items[0].verified = 65;
  assert.deepEqual(tasks(project), []); // Stale new inbox status must not recreate a completed task.
  project.whatsappMessages.push({ id: 'WA-2', projectId: project.id, projectCode: project.code, status: 'new', kind: 'progress' });
  assert.deepEqual(tasks(project)[0].target, { route: 'whatsapp', messageId: 'WA-2' });
});

test('only the latest reviewable report drives an item; superseded, rejected and foreign records stay out', () => {
  const project = fixture();
  project.reports.push(
    { id: 'OLD', itemId: 'A', status: 'pending', date: '2026-10-19' },
    { id: 'SUPERSEDED', itemId: 'A', status: 'superseded', date: '2026-10-21' },
    { id: 'FOREIGN', projectId: 'OTHER', itemId: 'A', status: 'pending', date: '2026-11-01' },
    { id: 'FOREIGN-CODE', projectId: project.id, projectCode: 'OTHER', itemId: 'A', status: 'pending', date: '2026-11-02' },
  );
  assert.deepEqual(tasks(project), []);
  project.reports.push({ id: 'CLARIFY', itemId: 'A', status: 'needsClarification', date: '2026-10-22' });
  assert.equal(tasks(project)[0].kind, 'clarification');
  assert.equal(tasks(project)[0].target.reportId, 'CLARIFY');
  project.reports.push({ id: 'NEW', itemId: 'A', status: 'pending', date: '2026-10-23' });
  assert.deepEqual(tasks(project).map((task) => task.target.reportId), ['NEW']);
  project.reports.at(-1).status = 'rejected';
  assert.deepEqual(tasks(project), []);
});

test('VO tasks retain claim checks after price approval and clear after explicit exclusion or rejection', () => {
  const project = fixture();
  project.reports.push(...['ONE', 'TWO'].map((id) => ({ id, projectId: project.id, projectCode: project.code,
    vo: true, status: 'needsReview', sourceMessageId: `WA-${id}`, message: `Extra work ${id}`, date: '2026-10-21' })));
  project.whatsappMessages = [{ id: 'WA-ONE', projectId: project.id, projectCode: project.code, status: 'new', kind: 'vo' }];
  project.voReviews = [{ id: 'TWO', reportId: 'TWO', projectId: project.id, status: 'pendingApproval', history: [] }];
  assert.deepEqual(tasks(project).map((task) => task.target.caseId), ['TWO', 'ONE']);
  project.voReviews.push({ id: 'ONE', reportId: 'ONE', projectId: project.id, status: 'approved', history: [] });
  project.voReviews[0].status = 'rejected';
  assert.equal(tasks(project).length, 1);
  assert.equal(tasks(project)[0].kind, 'vo-eligibility');
  assert.equal(tasks(project)[0].actionLabel, 'Review claim eligibility');
  const excluded = updateVOReview(project, 'ONE', 'assessEligibility', { claimEligibility: 'excluded', eligibilityNote: 'Not claimed in this mock assessment.' });
  assert.equal(excluded.outcome, 'updated');
  assert.deepEqual(tasks(excluded.project), []);
});

test('claim tasks advance through preparation, submission, certification and partial/full payment', () => {
  const initial = save(fixture());
  assert.equal(tasks(initial.project, 'claims')[0].kind, 'claim-prepare');
  assert.deepEqual(tasks(initial.project, 'claims')[0].target, { route: 'claims', draftId: initial.draft.id });
  const prepared = prepare(initial);
  assert.equal(tasks(prepared.project, 'claims')[0].kind, 'claim-submit');
  const submitted = stage(prepared.project, initial.draft.id, 'submitted');
  assert.equal(tasks(submitted.project, 'claims')[0].kind, 'claim-certify');
  const certified = stage(submitted.project, initial.draft.id, 'certified', { value: 500 });
  assert.equal(tasks(certified.project, 'claims')[0].statusLabel, 'Awaiting payment');
  const recordedZero = stage(certified.project, initial.draft.id, 'payment', { value: 0, reference: 'DEMO-NO-PAYMENT' });
  assert.equal(tasks(recordedZero.project, 'claims')[0].statusLabel, 'Awaiting payment');
  const partial = stage(recordedZero.project, initial.draft.id, 'payment', { value: 200 });
  assert.equal(tasks(partial.project, 'claims')[0].statusLabel, 'Part paid');
  const paid = stage(partial.project, initial.draft.id, 'payment', { value: 500, reference: 'DEMO-FINAL' });
  assert.deepEqual(tasks(paid.project), []);
  assert.deepEqual(paid.project.claimDrafts, prepared.project.claimDrafts);
});

test('a query has one actionable revision task until resubmission and never duplicates its child', () => {
  const prepared = prepare(save(fixture()));
  const originalId = prepared.draft.id;
  const originalDraft = structuredClone(prepared.draft);
  const pack = buildClaimPack(prepared.project, originalId).pack;
  const submitted = stage(prepared.project, originalId, 'submitted');
  const queried = stage(submitted.project, originalId, 'query', { note: 'Check measured quantity', targetType: 'work', targetId: 'A' });
  assert.deepEqual(tasks(queried.project).map((task) => task.kind), ['claim-query']);
  assert.deepEqual(tasks(queried.project)[0].target, { route: 'claim-status', draftId: originalId });
  const revised = saveClaimRevision(queried.project, originalId,
    { ...structuredClone(prepared.draft.assessment), work: { A: { include: true, assessedQuantity: 45, previousValue: 0 } } }, 'Measurement corrected.');
  assert.equal(revised.outcome, 'updated');
  assert.equal(tasks(revised.project).length, 1);
  assert.deepEqual(tasks(revised.project)[0].target, { route: 'claims', revisionSourceId: originalId, draftId: revised.draft.id });
  const ready = prepare(revised);
  assert.equal(tasks(ready.project).length, 1);
  assert.equal(tasks(ready.project)[0].kind, 'claim-submit');
  assert.equal(tasks(ready.project)[0].target.draftId, revised.draft.id);
  const resubmitted = stage(ready.project, revised.draft.id, 'submitted');
  assert.deepEqual(tasks(resubmitted.project).map((task) => task.kind), ['claim-certify']);
  assert.equal(tasks(resubmitted.project)[0].target.draftId, revised.draft.id);
  assert.deepEqual(resubmitted.project.claimDrafts.find((draft) => draft.id === originalId), originalDraft);
  const before = structuredClone(resubmitted.project);
  assert.equal(toClaimCSV(buildClaimPack(resubmitted.project, originalId).pack), toClaimCSV(pack));
  assert.deepEqual(tasks(resubmitted.project), tasks(resubmitted.project));
  assert.deepEqual(resubmitted.project, before);
  const nextQuery = stage(resubmitted.project, revised.draft.id, 'query', { note: 'Clarify the revised claim', targetType: 'claim' });
  const nextRevision = saveClaimRevision(nextQuery.project, revised.draft.id, revised.draft.assessment, 'The revised claim was checked again.');
  assert.equal(nextRevision.outcome, 'updated');
  assert.equal(tasks(nextRevision.project).length, 1);
  assert.equal(tasks(nextRevision.project)[0].target.revisionSourceId, revised.draft.id);
});

test('latest unsent claims replace stale drafts while older ongoing claims and other months stay actionable', () => {
  const prepared = prepare(save(fixture()));
  const second = save(prepared.project, '2026-10', 45);
  assert.deepEqual(tasks(second.project).map((task) => task.reference), [second.draft.id]);
  const submitted = stage(prepared.project, prepared.draft.id, 'submitted');
  const next = save(submitted.project, '2026-10', 45);
  const older = save(next.project, '2026-09', 40);
  assert.equal(tasks(older.project, 'claims').length, 3);
  assert.equal(tasks(older.project, 'claims').find((task) => task.reference === prepared.draft.id).kind, 'claim-certify');
  assert.ok(tasks(older.project, 'claims').some((task) => task.reference === older.draft.id));
});

test('an unrelated newer claim keeps the historical query reviewable without inventing a revision link', () => {
  const prepared = prepare(save(fixture()));
  const submitted = stage(prepared.project, prepared.draft.id, 'submitted');
  const queried = stage(submitted.project, prepared.draft.id, 'query', { note: 'Check whole assessment', targetType: 'claim' });
  const unrelated = save(queried.project, '2026-10', 45);
  const queryTask = tasks(unrelated.project).find((task) => task.kind === 'claim-query');
  assert.equal(queryTask.title, 'Review a claim query');
  assert.equal(queryTask.target.draftId, prepared.draft.id);
  assert.equal(tasks(unrelated.project).length, 2);
});

test('task targets reject foreign, missing and duplicate identifiers and output stays deterministic', () => {
  const project = fixture();
  const other = prepare(save(fixture('OTHER'))).project;
  project.reports.push({ id: '', itemId: 'A', status: 'pending', date: '2026-11-01' },
    { id: 'DUP', itemId: 'A', status: 'pending', date: '2026-11-02' },
    { id: 'DUP', itemId: 'A', status: 'pending', date: '2026-11-03' });
  project.whatsappMessages = [
    { id: 'FOREIGN', projectId: other.id, projectCode: other.code, status: 'new' },
    { id: 'BAD-CODE', projectId: project.id, projectCode: other.code, status: 'new' },
    { id: 'GOOD-B', projectId: project.id, projectCode: project.code, status: 'new', date: '2026-10-20' },
    { id: 'GOOD-A', projectId: project.id, projectCode: project.code, status: 'new', date: '2026-10-20' },
  ];
  project.claimDrafts = structuredClone(other.claimDrafts);
  project.claimTracking = structuredClone(other.claimTracking);
  const before = structuredClone(project);
  assert.deepEqual(tasks(project).map((task) => task.reference), ['GOOD-A', 'GOOD-B']);
  assert.ok(tasks(project).every((task) => task.projectId === project.id));
  assert.deepEqual(tasks(project), tasks(project));
  assert.deepEqual(project, before);
  assert.deepEqual(getProjectAttention(null), []);
  assert.deepEqual(tasks({ ...project, whatsappMessages: [], items: [] }), []);
});
