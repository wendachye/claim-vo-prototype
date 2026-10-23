import assert from 'node:assert/strict';
import test from 'node:test';
import { createManualVO, MANUAL_VO_PHOTOS } from '../src/data/manual-vo.js';
import { createProject, loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.js';
import { getVOCases, getVOClaimEligibility, updateVOReview } from '../src/data/vo.js';
import { getDrawingMapping, installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.js';
import { getAreaEvidence, resolveAreaEvidenceSource } from '../src/data/drawing-evidence.js';
import { getAreaVOFlags } from '../src/data/drawing-vo.js';
import { getProjectAttention } from '../src/data/project-attention.js';
import { buildClaimReview, saveClaimDraft, markClaimPrepared } from '../src/data/claims.js';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.js';

const now = new Date('2026-10-23T10:00:00Z');
function fixture(code = 'MANUAL-WORKFLOW') {
  const base = createProject({ code, name: 'Manual extra work workflow', country: 'Singapore' });
  const item = { id: 'WORK-A', ref: 'A / 01', description: 'External access scaffold', unit: 'm²',
    quantity: 100, rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 50, needsReview: false };
  const project = { ...base, locked: true, lockedAt: '2026-10-01T00:00:00+08:00',
    items: [item], sourceItems: [structuredClone(item)], whatsappMessages: [],
    reports: [{ id: 'VERIFIED-A', projectId: base.id, projectCode: base.code, itemId: item.id,
      status: 'verified', completion: 50, approvedCompletion: 50, message: 'Separate verified contract work.',
      date: '2026-10-20T09:00:00+08:00', verifiedAt: '2026-10-20T10:00:00+08:00' }] };
  const withDrawing = installDrawing(project, { inputKind: 'sample' }, now);
  assert.equal(withDrawing.outcome, 'updated');
  return withDrawing.project;
}
function input(project, changes = {}) {
  return { submissionId: 'manual-workflow-001', title: 'Temporary additional access platform',
    description: 'QS recorded a mock on-site request for a separate access face outside the listed scope.',
    areaId: getDrawingMapping(project).areas[0].id, instructionReference: 'DEMO-SITE-NOTE-23',
    photo: MANUAL_VO_PHOTOS[0].value, ...changes };
}
function create(project, changes = {}) {
  const result = createManualVO(project, input(project, changes), now);
  assert.equal(result.outcome, 'updated', result.error);
  return result;
}
function review(project, id, action, values) {
  const result = updateVOReview(project, id, action, values);
  assert.equal(result.outcome, 'updated', result.error);
  return result.project;
}
const workAssessment = { work: { 'WORK-A': { include: true, assessedQuantity: 50, previousValue: 0 } }, priorConfirmed: true };
const store = (workspace) => {
  const values = new Map([[WORKSPACE_STORE, JSON.stringify(workspace)]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('unmatched manual work joins exact VO tasks and area flags without creating progress or WhatsApp evidence', () => {
  const original = fixture();
  const saved = saveClaimDraft(original, '2026-10', workAssessment);
  assert.equal(saved.outcome, 'updated');
  const existingClaim = structuredClone(saved.project.claimDrafts);
  const before = structuredClone(saved.project);
  const result = create(saved.project);
  const project = result.project;
  const entry = getVOCases(project).find(value => value.id === result.caseId);
  const area = getDrawingMapping(project).areas[0];
  assert.equal(entry.status, 'flagged');
  assert.equal(entry.relatedItemId, null);
  assert.equal(entry.report.itemId, null);
  assert.equal(entry.report.completion, null);
  assert.equal(entry.proposedValue, null);
  assert.equal(entry.approvedValue, null);
  assert.equal(entry.instructionStatus, 'reported');
  assert.equal(entry.executionStatus, 'notVerified');
  assert.equal(getVOClaimEligibility(entry).eligible, false);
  assert.equal(entry.report.channel, 'manual-vo-mock');
  assert.ok(!entry.report.sourceMessageId);
  assert.deepEqual(project.whatsappMessages, before.whatsappMessages);
  assert.deepEqual(project.items, before.items);
  assert.deepEqual(project.sourceItems, before.sourceItems);
  assert.deepEqual(project.contract, before.contract);
  assert.deepEqual(project.claimDrafts, existingClaim);
  assert.deepEqual(saved.project, before);
  const tasks = getProjectAttention(project).filter(value => value.category !== 'claims');
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0].target, { route: 'vo', caseId: result.caseId });
  assert.equal(tasks[0].statusLabel, 'Needs review');
  const evidence = getAreaEvidence(project, area.id).entries.find(value => value.reportId === result.reportId);
  assert.equal(evidence.sourceLabel, 'Manual entry');
  assert.equal(evidence.messageId, null);
  assert.equal(evidence.kind, 'vo');
  assert.equal(evidence.text, input(original).description);
  assert.deepEqual(resolveAreaEvidenceSource(project, area.id, evidence.id), { kind: 'report', reportId: result.reportId });
  assert.deepEqual(getAreaVOFlags(project, area.id).cases.map(value => value.id), [result.caseId]);
  assert.equal(getAreaVOFlags(project, area.id).openCount, 1);
  const claim = buildClaimReview(project, '2026-10', { vos: { [result.caseId]: { include: true, assessedValue: 600 } }, priorConfirmed: true });
  assert.equal(claim.voRows.find(value => value.id === result.caseId).eligible, false);
  assert.equal(claim.canPrepare, false);
});

test('manual case follows existing approval and eligibility checks and freezes its evidence in a prepared claim', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const created = create(fixture());
  const id = created.caseId;
  const originalReport = structuredClone(created.project.reports.find(value => value.id === id));
  let project = review(created.project, id, 'submit', { title: input(created.project).title,
    scopeDisposition: 'variation', scopeAssessment: 'Separate temporary access outside the mock baseline.',
    instructionStatus: 'documented', instructionReference: 'DEMO-WRITTEN-SI-23', proposedValue: '' });
  assert.equal(getVOCases(project)[0].status, 'pendingApproval');
  project = review(project, id, 'approve', { approvedValue: '700', approvalReference: 'DEMO-PRICE-23', approver: 'Demo client QS' });
  assert.equal(getVOClaimEligibility(getVOCases(project)[0]).eligible, false);
  assert.equal(getProjectAttention(project).find(value => value.target.caseId === id).kind, 'vo-eligibility');
  const assessment = { vos: { [id]: { include: true, assessedValue: 600, previousValue: 0 } }, priorConfirmed: true };
  assert.equal(buildClaimReview(project, '2026-10', assessment).canPrepare, false);
  project = review(project, id, 'assessEligibility', { executionStatus: 'verified', executionReference: 'DEMO-INSPECTION-23',
    claimEligibility: 'eligible', eligibilityNote: 'Mock inspection confirms this additional platform can be assessed.' });
  assert.equal(getVOClaimEligibility(getVOCases(project)[0]).eligible, true);
  assert.equal(getProjectAttention(project).some(value => value.target.caseId === id), false);
  assert.equal(buildClaimReview(project, '2026-10', assessment).canPrepare, true);
  assert.equal(buildClaimReview(project, '2026-09', assessment).canPrepare, false);
  const saved = saveClaimDraft(project, '2026-10', assessment);
  assert.equal(saved.outcome, 'updated', saved.error);
  const prepared = markClaimPrepared(saved.project, saved.draft.id);
  assert.equal(prepared.outcome, 'updated', prepared.error);
  assert.equal(prepared.draft.snapshot.totals.currentValue, 600);
  const pack = buildClaimPack(prepared.project, saved.draft.id).pack;
  assert.equal(pack.voRows.length, 1);
  assert.equal(pack.voRows[0].evidence.channel, 'manual-vo-mock');
  assert.equal(pack.evidenceRefs[0].sourceMessageId, null);
  assert.equal(pack.evidenceRefs[0].message, originalReport.message);
  assert.equal(pack.evidenceRefs[0].photo, originalReport.photo);
  assert.ok(toClaimCSV(pack).includes(originalReport.message));
  const frozen = structuredClone(pack);
  const reopened = review(prepared.project, id, 'reopen', { reviewNote: 'Later mock review of the current VO.' });
  assert.equal(getVOCases(reopened)[0].approvedValue, null);
  assert.deepEqual(buildClaimPack(reopened, saved.draft.id).pack, frozen);
  const { status, ...reportEvidence } = reopened.reports.find(value => value.id === id);
  const { status: oldStatus, ...sourceEvidence } = originalReport;
  assert.deepEqual(reportEvidence, sourceEvidence);
  assert.deepEqual(reopened.items, created.project.items);
  assert.equal(getAreaVOFlags(reopened, getDrawingMapping(reopened).areas[0].id).openCount, 1);
});

test('saved area identity and project boundaries survive remapping, reload and foreign record injection', () => {
  const created = create(fixture());
  let project = created.project;
  const sourceArea = getDrawingMapping(project).areas[0];
  const originalMap = structuredClone(project.reports.find(value => value.id === created.caseId).areaMapping);
  project = saveAreaMapping(project, { ...sourceArea, areaId: sourceArea.id, code: 'RENAMED', name: 'Renamed access face', workItemIds: ['WORK-A'] }, now).project;
  assert.equal(getAreaVOFlags(project, sourceArea.id).cases[0].id, created.caseId);
  assert.deepEqual(project.reports.find(value => value.id === created.caseId).areaMapping, originalMap);
  const other = fixture('OTHER-MANUAL');
  const otherBefore = structuredClone(other);
  const workspace = { schemaVersion: 2, activeProjectId: project.id, projects: [project, other] };
  const loaded = loadWorkspace(store(workspace));
  assert.deepEqual(loaded.projects[1], otherBefore);
  assert.equal(getVOCases(loaded.projects[0])[0].id, created.caseId);
  assert.equal(getAreaVOFlags(loaded.projects[0], sourceArea.id).cases[0].id, created.caseId);
  const injected = { ...other, reports: [...other.reports, structuredClone(project.reports.find(value => value.id === created.caseId))],
    voReviews: structuredClone(project.voReviews), claimDrafts: structuredClone(project.claimDrafts) };
  assert.equal(getVOCases(injected).length, 0);
  assert.equal(getProjectAttention(injected).some(value => value.target.caseId === created.caseId), false);
  assert.ok(getDrawingMapping(injected).areas.every(area => getAreaVOFlags(injected, area.id).totalCount === 0));
  assert.equal(updateVOReview(other, created.caseId, 'save', { title: 'Foreign edit' }).outcome, 'invalid');
});
