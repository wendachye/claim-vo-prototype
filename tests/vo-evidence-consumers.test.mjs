import assert from 'node:assert/strict';
import test from 'node:test';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getVOCases, linkVOEvidence } from '../src/data/vo.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { getProjectWorkflow } from '../src/data/workflow.ts';
import { getProjectDashboard } from '../src/data/project-dashboard.ts';
import { getMessageReviewStatus } from '../src/data/message-inbox.ts';
import { getAreaVOFlags } from '../src/data/drawing-vo.ts';
import { getAreaEvidence } from '../src/data/drawing-evidence.ts';
import { getVOConfirmationContext, createVOConfirmationRequest } from '../src/data/vo-confirmation.ts';

const now = new Date('2026-10-28T10:00:00Z');
function fixture() {
  const project = createSITContractDemo({ name: 'Related VO consumer fixture', code: 'RELATED24' }, now);
  const target = getVOCases(project).find(entry => entry.status === 'flagged');
  const report = { ...structuredClone(target.report), id: 'RELATED24-SECOND-PHOTO', sourceMessageId: 'RELATED24-SECOND-MESSAGE',
    message: 'A second photograph of the same additional access platform for QS review.', date: now.toISOString() };
  const sourceMessage = project.whatsappMessages.find(message => message.id === target.report.sourceMessageId);
  const message = { ...structuredClone(sourceMessage), id: report.sourceMessageId, reportId: report.id, text: report.message,
    projectId: project.id, projectCode: project.code, status: 'processed', kind: 'vo', date: report.date };
  project.reports.push(report); project.whatsappMessages.push(message);
  return { project, target, source: getVOCases(project).find(entry => entry.id === report.id), message };
}

test('linked evidence leaves only the surviving VO actionable across notifications, workflow and dashboard', () => {
  const { project, source, target } = fixture();
  const before = structuredClone(project);
  const result = linkVOEvidence(project, source.id, target.id, 'Second photo documents the same additional platform.');
  assert.equal(result.outcome, 'updated');
  const linked = result.project;
  assert.equal(getProjectWorkflow(linked, '2026-10').counts.openVOs, getProjectWorkflow(project, '2026-10').counts.openVOs - 1);
  assert.equal(getProjectDashboard(linked).vo.reviewCount, getProjectDashboard(project).vo.reviewCount - 1);
  const tasks = getProjectAttention(linked).filter(task => task.category === 'vo');
  assert.ok(tasks.some(task => task.target.caseId === target.id));
  assert.ok(!tasks.some(task => task.target.caseId === source.id));
  assert.deepEqual(linked.reports, before.reports);
  assert.deepEqual(linked.whatsappMessages, before.whatsappMessages);
  assert.deepEqual(linked.voReviews, before.voReviews);
  assert.deepEqual(linked.items, before.items);
  assert.deepEqual(linked.claimDrafts, before.claimDrafts);
  assert.deepEqual(linked.seed, before.seed);
});

test('original messages and drawing evidence identify a linked case without reviving its review warning', () => {
  const { project, source, target, message } = fixture();
  const linked = linkVOEvidence(project, source.id, target.id, 'Same platform, different view.').project;
  const entry = getVOCases(linked).find(value => value.id === source.id);
  assert.deepEqual(getMessageReviewStatus(message, source.report, entry), { label: 'Linked to existing VO', tone: 'slate' });
  const areaId = source.report.areaMapping?.areaId;
  assert.ok(areaId, 'Fixture has a saved area reference.');
  const flags = getAreaVOFlags(linked, areaId);
  const sourceFlag = flags.cases.find(value => value.id === source.id);
  assert.equal(sourceFlag.status, 'linked');
  assert.equal(sourceFlag.tone, 'slate');
  assert.equal(flags.openCount, getAreaVOFlags(project, areaId).openCount - 1);
  const evidence = getAreaEvidence(linked, areaId).entries.find(value => value.reportId === source.id);
  assert.equal(evidence.status, 'linked');
  assert.equal(evidence.label, 'Linked to existing VO');
  assert.equal(evidence.text, source.report.message);
  assert.equal(evidence.photo, source.report.photo);
});

test('a linked original cannot request a new customer price approval', () => {
  const { project, source, target } = fixture();
  const linked = linkVOEvidence(project, source.id, target.id, 'Related evidence belongs to the existing review.').project;
  assert.equal(getVOConfirmationContext(linked, source.id).canCreate, false);
  const result = createVOConfirmationRequest(linked, source.id, { recipient: 'Demo customer', authority: 'Demo QS' });
  assert.equal(result.outcome, 'invalid');
  assert.equal(result.project, linked);
});
