import assert from 'node:assert/strict';
import test from 'node:test';
import { createManualVO, MANUAL_VO_PHOTOS } from '../src/data/manual-vo.ts';
import { getVOCases, getVOClaimEligibility, updateVOReview } from '../src/data/vo.ts';
import { getDrawingMapping, installDrawing, saveAreaMapping, removeMappedArea } from '../src/data/drawing-mapping.ts';
import { getAreaVOFlags } from '../src/data/drawing-vo.ts';
import { seedWorkspace, loadWorkspace, updateProjectState, WORKSPACE_STORE, createProject } from '../src/data/projects.ts';

const at = '2026-10-23T02:00:00.000Z';
const entry = (changes = {}) => ({ submissionId: 'manual-test-0001', title: 'Additional temporary access',
  description: 'Mock QS note: supervisor reported a new access platform outside the listed work face.',
  areaId: '', areaText: 'Area X', relatedItemId: '', instructionReference: 'Phone instruction reported by foreman, DEMO-23',
  photo: '', ...changes });
const project = () => seedWorkspace().projects[0];
function mappedProject() {
  let value = installDrawing(project(), { inputKind: 'sample' }, at).project;
  const mapping = getDrawingMapping(value);
  value = saveAreaMapping(value, { drawingId: mapping.drawing.id, areaId: mapping.areas[0].id,
    code: 'A1', name: 'Access work face', page: 1, position: { x: 0.23, y: 0.41 }, workItemIds: ['WI-001'] }, at).project;
  return value;
}

test('manual entry adds one unpriced review without fabricating WhatsApp or altering workflow facts', () => {
  const before = project();
  before.claimDrafts = [{ id: 'previous-saved-claim', snapshot: { value: 14094, evidence: 'frozen' } }];
  const frozen = structuredClone(before);
  const refs = getVOCases(before).map(value => value.reference);
  const result = createManualVO(before, entry({ photo: MANUAL_VO_PHOTOS[0].value }), at);
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(before, frozen);
  assert.equal(result.caseId, result.reportId);
  assert.deepEqual(result.project.items, before.items);
  assert.deepEqual(result.project.sourceItems, before.sourceItems);
  assert.deepEqual(result.project.claimDrafts, before.claimDrafts);
  assert.deepEqual(result.project.whatsappMessages, before.whatsappMessages);
  assert.deepEqual(result.project.reports.slice(0, -1), before.reports);
  assert.deepEqual(getVOCases(result.project).slice(0, -1).map(value => value.reference), refs);
  const created = getVOCases(result.project).find(value => value.id === result.caseId);
  assert.equal(created.title, entry().title);
  assert.equal(created.status, 'flagged');
  assert.equal(created.relatedItemId, null);
  assert.equal(created.instructionStatus, 'reported');
  assert.equal(created.instructionReference, entry().instructionReference);
  assert.equal(created.executionStatus, 'notVerified');
  assert.equal(created.claimEligibility, 'needsReview');
  assert.equal(created.approvedValue, null);
  assert.equal(created.proposedValue, null);
  assert.equal(getVOClaimEligibility(created).eligible, false);
  assert.deepEqual(created.history, []);
  assert.equal(created.report.channel, 'manual-vo-mock');
  assert.equal(created.report.message, entry().description);
  assert.equal(created.report.completion, null);
  assert.deepEqual(created.report.areaMapping, { areaId: null });
  assert.equal(created.report.receivedAt, at);
  assert.equal(created.report.reportedInstructionReference, entry().instructionReference);
  assert.equal(created.report.photo, MANUAL_VO_PHOTOS[0].value);
  assert.match(created.report.photoAlt, /Generated demo/);
  assert.ok(!Object.hasOwn(created.report, 'sourceMessageId'));
  assert.equal(result.project.history[0].action, 'Manual extra work added');
  assert.equal(createManualVO(createProject({ name: 'Empty project', code: 'EMPTY-MANUAL' }), entry(), at).outcome, 'updated');
});

test('omitted instruction and optional location/photo remain unknown without inference', () => {
  const result = createManualVO(project(), entry({ instructionReference: '', areaText: '', photo: '' }), at);
  const created = getVOCases(result.project).find(value => value.id === result.caseId);
  assert.equal(created.instructionStatus, 'notRecorded');
  assert.equal(created.instructionReference, '');
  assert.equal(created.report.area, '');
  assert.equal(created.report.location, '');
  assert.equal(created.report.photo, null);
  assert.equal(created.report.photoAlt, null);
});

test('save retries are idempotent and cannot overwrite the original entry', () => {
  const original = project();
  const first = createManualVO(original, entry(), at);
  const retry = createManualVO(first.project, entry(), '2026-10-24T02:00:00Z');
  assert.equal(retry.outcome, 'unchanged');
  assert.equal(retry.project, first.project);
  assert.equal(retry.caseId, first.caseId);
  assert.equal(retry.reportId, first.reportId);
  const changed = createManualVO(first.project, entry({ description: 'Replace prior notes' }), at);
  assert.equal(changed.outcome, 'invalid');
  assert.equal(changed.project, first.project);
  const another = createManualVO(first.project, entry({ submissionId: 'manual-test-0002' }), at);
  assert.equal(another.outcome, 'updated');
  assert.notEqual(another.caseId, first.caseId);
  assert.equal(another.project.reports.length, first.project.reports.length + 1);
});

test('saved area and comparison context preserve the original mapping independently of later changes', () => {
  const before = mappedProject();
  const area = getDrawingMapping(before).areas[0];
  // A comparison item outside an area's normal scope remains valid VO context.
  const input = entry({ areaId: area.id, areaText: '', relatedItemId: 'WI-002' });
  const created = createManualVO(before, input, at);
  const report = created.project.reports.find(value => value.id === created.caseId);
  assert.equal(report.area, 'A1');
  assert.equal(report.itemId, null);
  assert.equal(getVOCases(created.project).find(value => value.id === created.caseId).relatedItemId, 'WI-002');
  assert.equal(report.areaMapping.areaId, area.id);
  assert.deepEqual(report.areaMapping.workItemIds, ['WI-001']);
  const originalMapping = structuredClone(report.areaMapping);
  const removed = removeMappedArea(created.project, area.id, at).project;
  assert.deepEqual(removed.reports.find(value => value.id === created.caseId).areaMapping, originalMapping);
  assert.equal(createManualVO(removed, input, at).outcome, 'unchanged');
});

test('unlisted location and comparison links never infer a drawing-area association', () => {
  const before = mappedProject();
  const area = getDrawingMapping(before).areas[0];
  const originalFlags = getAreaVOFlags(before, area.id);
  const result = createManualVO(before, entry({ areaText: area.code, relatedItemId: 'WI-001' }), at);
  assert.equal(result.outcome, 'updated');
  const current = getVOCases(result.project).find(value => value.id === result.caseId);
  assert.equal(current.relatedItemId, 'WI-001');
  assert.equal(current.report.itemId, null);
  assert.deepEqual(current.report.areaMapping, { areaId: null });
  assert.deepEqual(getAreaVOFlags(result.project, area.id), originalFlags);
  assert.equal(createManualVO(before, entry({ areaId: area.id, areaText: 'different location' }), at).outcome, 'invalid');
});

test('invalid fields, foreign records and arbitrary photos leave selected-project state untouched', () => {
  const before = mappedProject();
  const otherArea = getDrawingMapping(installDrawing(seedWorkspace().projects[1], { inputKind: 'sample' }, at).project).areas[0];
  const invalidEntries = [
    entry({ title: '' }), entry({ title: 'x'.repeat(161) }), entry({ description: '' }),
    entry({ description: 'x'.repeat(4001) }), entry({ description: {} }), entry({ areaText: 'x'.repeat(121) }),
    entry({ instructionReference: 'x'.repeat(501) }), entry({ submissionId: '' }), entry({ projectId: 'WH02' }),
    entry({ areaId: otherArea.id }), entry({ relatedItemId: 'FOREIGN-ITEM' }), entry({ photo: 'https://example.com/photo.jpg' }),
    entry({ photo: '/assets/../private.jpg' }), entry({ photo: { url: MANUAL_VO_PHOTOS[0].value } }),
    entry({ approvedValue: 100 }), entry({ status: 'approved' }),
  ];
  const frozen = structuredClone(before);
  for (const values of invalidEntries) {
    const result = createManualVO(before, values, at);
    assert.equal(result.outcome, 'invalid', JSON.stringify(values));
    assert.equal(result.project, before);
  }
  assert.equal(createManualVO(before, entry(), 'invalid-date').outcome, 'invalid');
  assert.equal(createManualVO(null, entry(), at).outcome, 'invalid');
  assert.equal(createManualVO(before, null, at).outcome, 'invalid');
  assert.deepEqual(before, frozen);
});

test('the existing explicit review and approval flow retains manual evidence and separates eligibility', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(at) });
  const created = createManualVO(project(), entry(), at);
  const originalReport = structuredClone(created.project.reports.find(value => value.id === created.caseId));
  assert.equal(updateVOReview(created.project, created.caseId, 'approve', { approvedValue: 2200, approvalReference: 'APP-01', approver: 'Demo QS' }).outcome, 'invalid');
  const submitted = updateVOReview(created.project, created.caseId, 'submit', {
    title: 'QS-reviewed additional platform', scopeDisposition: 'variation', scopeAssessment: 'Different work face from baseline.',
    instructionStatus: 'documented', instructionReference: 'DOCUMENTED-DEMO-SI-01', proposedValue: null,
  });
  assert.equal(submitted.outcome, 'updated');
  const approved = updateVOReview(submitted.project, created.caseId, 'approve', {
    approvedValue: 2200, approvalReference: 'DEMO-APP-01', approver: 'Demo approving QS',
  });
  assert.equal(approved.outcome, 'updated');
  let current = getVOCases(approved.project).find(value => value.id === created.caseId);
  assert.equal(current.approvedValue, 2200);
  assert.equal(current.proposedValue, null);
  assert.equal(getVOClaimEligibility(current).eligible, false);
  assert.deepEqual(current.report, { ...originalReport, status: 'voApproved' });
  assert.equal(current.report.message, entry().description);
  assert.equal(current.report.reportedInstructionReference, entry().instructionReference);
  const assessed = updateVOReview(approved.project, created.caseId, 'assessEligibility', {
    executionStatus: 'verified', executionReference: 'DEMO-MEAS-01', claimEligibility: 'eligible', eligibilityNote: 'Measured platform confirmed for QS valuation.',
  });
  assert.equal(assessed.outcome, 'updated', assessed.error);
  current = getVOCases(assessed.project).find(value => value.id === created.caseId);
  assert.equal(getVOClaimEligibility(current).eligible, true);
  assert.deepEqual(assessed.project.items, created.project.items);
  assert.deepEqual(assessed.project.claimDrafts, created.project.claimDrafts);
  assert.equal(current.report.message, originalReport.message);
});

test('workspace persistence and project reset boundaries preserve independent manual case records', () => {
  const workspace = seedWorkspace();
  const other = structuredClone(workspace.projects[1]);
  const created = createManualVO(workspace.projects[0], entry(), at);
  const updated = updateProjectState(workspace, workspace.projects[0].id, () => created.project);
  assert.deepEqual(updated.projects[1], other);
  const storage = { getItem: key => key === WORKSPACE_STORE ? JSON.stringify(updated) : null, setItem() {} };
  const loaded = loadWorkspace(storage);
  const current = getVOCases(loaded.projects[0]).find(value => value.id === created.caseId);
  assert.ok(current);
  assert.equal(current.report.message, entry().description);
  assert.equal(current.report.reportedInstructionReference, entry().instructionReference);
  assert.equal(current.instructionStatus, 'reported');
  assert.equal(current.approvedValue, null);
  assert.deepEqual(getVOCases(loaded.projects[1]), getVOCases(other));
});
