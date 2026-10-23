import assert from 'node:assert/strict';
import test from 'node:test';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getDrawingMapping, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { getAreaEvidence } from '../src/data/drawing-evidence.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { getProjectWorkflow } from '../src/data/workflow.ts';
import { getMessageReviewStatus, matchesInboxFilter } from '../src/data/message-inbox.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { getMessageClarification, saveMessageClarificationRequest, saveMockClarificationReply } from '../src/data/whatsapp-clarification.ts';
import { WORKSPACE_STORE, loadWorkspace, resetProject, updateProjectState } from '../src/data/projects.ts';

const now = new Date('2026-10-21T10:00:00Z');
const storageFor = workspace => {
  const values = new Map([[WORKSPACE_STORE, JSON.stringify(workspace)]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const updated = result => { assert.equal(result.outcome, 'updated', result.error); return result.project; };

function fixture() {
  let project = createSITContractDemo({ name: 'Clarification workspace', code: 'CLARIFY-SIT' }, now);
  const other = createSITContractDemo({ name: 'Other workspace', code: 'CLARIFY-OTHER' }, now);
  const item = project.items.find(entry => entry.id === 'WI-004');
  const area = getDrawingMapping(project).areas.find(entry => entry.workItemIds.includes(item.id));
  const message = project.whatsappMessages.find(entry => entry.kind === 'clarification' && !entry.itemId);
  // A known area but unclear item/total, so both the original and reply remain
  // inspectable in that area's evidence history after supervisor verification.
  project = { ...project, whatsappMessages: project.whatsappMessages.map(entry => entry.id === message.id ? { ...entry, area: `Area ${area.code}` } : entry) };
  const original = structuredClone(project.whatsappMessages.find(entry => entry.id === message.id));
  project = updated(saveMessageClarificationRequest(project, message.id, { question: 'Confirm the work item and total completed so far.' }, now));
  project = updated(saveMockClarificationReply(project, message.id, {
    text: 'Mock reply: WI-004 is 60% complete in total.', itemId: item.id, areaId: area.id, completion: 60,
  }, new Date(now.getTime() + 1000)));
  return { project, other, original, item, area };
}

test('clarification evidence, task handoff and claims survive workspace reload; reset affects only the selected project', () => {
  const { project, other, original } = fixture();
  const storage = storageFor({ schemaVersion: 2, activeProjectId: project.id, projects: [project, other] });
  const loaded = loadWorkspace(storage);
  const restored = loaded.projects.find(entry => entry.id === project.id);
  const context = getMessageClarification(restored, original.id);
  assert.equal(context.stage, 'reply-received');
  assert.equal(context.original.text, original.text);
  assert.equal(context.original.photo, original.photo);
  assert.deepEqual(restored.messageClarifications, project.messageClarifications);
  assert.deepEqual(restored.claimDrafts, project.claimDrafts);
  assert.equal(getProjectAttention(restored).filter(task => [original.id, context.reply.id].includes(task.target.messageId)).length, 1);
  assert.equal(getMessageReviewStatus(restored.whatsappMessages.find(entry => entry.id === original.id), null, null, context).label, 'Reply received');
  assert.equal(matchesInboxFilter('clarification', original, null, context), false);
  assert.equal(matchesInboxFilter('processed', original, null, context), true);
  const otherBefore = structuredClone(loaded.projects.find(entry => entry.id === other.id));
  const reset = updateProjectState(loaded, project.id, resetProject);
  assert.deepEqual(reset.projects.find(entry => entry.id === other.id), otherBefore);
  const selected = reset.projects.find(entry => entry.id === project.id);
  assert.deepEqual(selected.messageClarifications, []);
  assert.equal(getMessageClarification(selected, original.id), null);
  assert.equal(selected.whatsappMessages.some(entry => entry.id === context.reply.id), false);
});

test('verification clears the reply task and original clarification label while retaining both source photos and saved claims', () => {
  const { project, original, area, item } = fixture();
  const context = getMessageClarification(project, original.id);
  const processed = processWhatsAppMessage(project, context.reply.id);
  assert.equal(processed.outcome, 'processed');
  assert.equal(getMessageClarification(processed.project, original.id).stage, 'verification');
  assert.equal(getProjectAttention(processed.project).some(task => task.target.reportId === processed.reportId), true);
  assert.equal(getProjectAttention(processed.project).some(task => [original.id, context.reply.id].includes(task.target.messageId)), false);
  assert.equal(getProjectWorkflow(processed.project).counts.clarifications, getProjectWorkflow(project).counts.clarifications);
  const verified = { ...processed.project,
    reports: processed.project.reports.map(entry => entry.id === processed.reportId ? { ...entry, status: 'verified', approvedCompletion: 60, verifiedAt: now.toISOString() } : entry),
    items: processed.project.items.map(entry => entry.id === item.id ? { ...entry, verified: 60 } : entry),
  };
  const final = getMessageClarification(verified, original.id);
  assert.equal(final.stage, 'verified');
  assert.equal(getProjectAttention(verified).some(task => task.target.reportId === processed.reportId), false);
  const evidence = getAreaEvidence(verified, area.id).entries;
  const source = evidence.find(entry => entry.messageId === original.id);
  const reply = evidence.find(entry => entry.reportId === processed.reportId);
  assert.equal(source.text, original.text);
  assert.equal(source.photo, original.photo);
  assert.equal(source.label, 'Clarification resolved');
  assert.equal(reply.photo, original.photo);
  assert.equal(reply.text, context.reply.text);
  assert.deepEqual(verified.claimDrafts, project.claimDrafts);
  assert.deepEqual(verified.voReviews, project.voReviews);
});

test('a clarification reply retains its saved area when a later mapping reuses the original code', () => {
  const { project, original, area, item } = fixture();
  const reply = getMessageClarification(project, original.id).reply;
  const renamed = updated(saveAreaMapping(project, { ...area, areaId: area.id, code: 'W5-RENAMED' }, now));
  const reused = updated(saveAreaMapping(renamed, { code: area.code, name: 'Different area with reused code',
    drawingId: area.drawingId, page: area.page, position: null, workItemIds: [item.id] }, new Date(now.getTime() + 2000)));
  const processed = processWhatsAppMessage(reused, reply.id);
  assert.equal(processed.outcome, 'processed');
  const report = processed.project.reports.find(entry => entry.id === processed.reportId);
  assert.equal(report.areaMapping.areaId, area.id);
  assert.deepEqual(report.areaMapping, reply.areaMapping);
  assert.equal(getAreaEvidence(processed.project, area.id).entries.some(entry => entry.reportId === report.id), true);
  const otherArea = getDrawingMapping(reused).areas.find(entry => entry.code === area.code);
  assert.notEqual(otherArea.id, area.id);
  assert.equal(getAreaEvidence(processed.project, otherArea.id).entries.some(entry => entry.reportId === report.id), false);
});

test('an older unprocessed clarification reply hands attention to the actual newer report', () => {
  const { project, original, item } = fixture();
  const reply = getMessageClarification(project, original.id).reply;
  const newer = { id: 'CLARIFY-NEWER-REPORT', projectId: project.id, projectCode: project.code, itemId: item.id,
    completion: 75, completionBasis: 'cumulative', status: 'pending', vo: false,
    date: new Date(now.getTime() + 2000).toISOString(), message: 'Newer cumulative site update' };
  const advanced = { ...project, reports: [...project.reports, newer] };
  const context = getMessageClarification(advanced, reply.id);
  assert.equal(context.stage, 'superseded');
  assert.equal(getProjectAttention(advanced).some(task => task.target.messageId === reply.id), false);
  assert.equal(getProjectAttention(advanced).some(task => task.target.reportId === newer.id), true);
  assert.equal(getProjectWorkflow(advanced).counts.newMessages, getProjectWorkflow(project).counts.newMessages - 1);
  assert.equal(getMessageReviewStatus(reply, null, null, context).label, 'Reply superseded');
  assert.equal(matchesInboxFilter('new', reply, null, context), false);
  assert.equal(matchesInboxFilter('processed', reply, null, context), true);
});
