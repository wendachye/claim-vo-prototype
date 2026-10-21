import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMessageClarificationEligibility, saveMessageClarificationRequest, saveMockClarificationReply,
  getMessageClarification, normalizeMessageClarifications,
} from '../src/data/whatsapp-clarification.js';
import { processWhatsAppMessage } from '../src/data/whatsapp.js';
import { getDrawingMapping, installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { buildClaimPack } from '../src/data/claim-pack.js';
import { loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.js';

const requestDate = new Date('2026-10-21T10:00:00Z');
const replyDate = new Date('2026-10-21T11:00:00Z');
const question = { question: 'Which measured item and area is this, and what is the total completion to date?' };
const sourceId = 'UNCLEAR';
const replyId = `${sourceId}-CLARIFIED-001`;

function fixture({ mapped = true } = {}) {
  let project = {
    id: 'CLARIFY', code: 'CL01', name: 'Clarification demo', version: 1, locked: true,
    lockedAt: '2026-10-01T09:00:00Z', contract: { sourceKind: 'illustrative' },
    items: [
      { id: 'A', ref: 'A.1', description: 'Measured scaffold', pricingType: 'measured', location: 'Block A', reported: 10, verified: 10 },
      { id: 'B', ref: 'B.1', description: 'Measured platform', pricingType: 'measured', location: 'Block B', reported: 0, verified: 0 },
      { id: 'INCLUDED', pricingType: 'included', reported: 0, verified: 0 },
      { id: 'LABOUR', pricingType: 'rateOnly', reported: 0, verified: 0 },
    ],
    whatsappMessages: [{ id: sourceId, projectId: 'CLARIFY', projectCode: 'CL01', kind: 'clarification', status: 'new',
      sender: 'Worker 02 · demo', senderRole: 'Site worker · demo', date: '2026-10-20T09:00:00Z',
      text: 'Area A done 50%.', photo: '/assets/demo-scaffold.jpg', photoAlt: 'Generated demo image, not actual project evidence.',
      itemId: null, area: 'Area A', location: '', completion: 50, completionBasis: 'unclear' }],
    reports: [{ id: 'EARLIER', projectId: 'CLARIFY', projectCode: 'CL01', itemId: 'A', vo: false, status: 'verified',
      date: '2026-10-19T09:00:00Z', completion: 10 }],
    messageClarifications: [], history: [], seed: { original: 'Keep original seed' },
    baseline: { id: 'BASE-1', amount: 1000 }, voReviews: [{ id: 'VO-1', status: 'approved', approvedValue: 300 }],
    claimDrafts: [{ id: 'CLAIM-1', projectId: 'CLARIFY', snapshot: { immutable: 'saved assessment', amount: 500 } }],
    claimTracking: [{ projectId: 'CLARIFY', draftId: 'CLAIM-1', status: 'submitted' }],
  };
  if (mapped) {
    project = installDrawing(project, { inputKind: 'sample' }, new Date('2026-10-18T09:00:00Z')).project;
    const area = getDrawingMapping(project).areas[0];
    project = saveAreaMapping(project, { areaId: area.id, drawingId: area.drawingId, code: area.code,
      name: area.name, page: area.page, position: area.position, workItemIds: ['A'] }, new Date('2026-10-18T10:00:00Z')).project;
  }
  return project;
}

function replyFields(project, values = {}) {
  const area = getDrawingMapping(project).areas.find((entry) => entry.workItemIds.includes('A'));
  return { text: 'CL01 | Block A | A1 | A\nCOMPLETE=50% TOTAL. Scaffold work to date.',
    itemId: 'A', areaId: area?.id || '', area: area?.code || 'East access scaffold', completion: 50, ...values };
}

function request(project = fixture()) {
  const result = saveMessageClarificationRequest(project, sourceId, question, requestDate);
  assert.equal(result.outcome, 'updated', result.error);
  return result.project;
}

function reply(project = request(), fields = replyFields(project)) {
  const result = saveMockClarificationReply(project, sourceId, fields, replyDate);
  assert.equal(result.outcome, 'updated', result.error);
  return result.project;
}

const unaffected = (project) => Object.fromEntries(['items', 'reports', 'baseline', 'voReviews', 'claimDrafts', 'claimTracking', 'seed']
  .map((key) => [key, structuredClone(project[key])]));

test('clarification requests preserve original evidence and all progress and financial records', () => {
  const project = fixture();
  const before = structuredClone(project);
  const original = structuredClone(project.whatsappMessages[0]);
  assert.deepEqual(getMessageClarificationEligibility(project, sourceId), { eligible: true });
  const result = saveMessageClarificationRequest(project, sourceId, { question: `  ${question.question}  ` }, requestDate);
  assert.equal(result.outcome, 'updated', result.error);
  assert.deepEqual(project, before);
  assert.deepEqual(unaffected(result.project), unaffected(before));
  assert.deepEqual(result.thread.original, original);
  assert.deepEqual(result.thread.request, { question: question.question, date: requestDate.toISOString(), actor: 'Alex Tan · Demo reviewer' });
  const current = result.project.whatsappMessages[0];
  for (const field of ['text', 'photo', 'photoAlt', 'sender', 'date', 'itemId', 'area', 'completion']) assert.deepEqual(current[field], original[field]);
  assert.equal(current.status, 'clarification');
  assert.equal(getMessageClarification(result.project, sourceId).stage, 'requested');
  const replay = saveMessageClarificationRequest(result.project, sourceId, question, replyDate);
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.project, result.project);
  assert.equal(replay.project.history.length, result.project.history.length);
  assert.equal(saveMessageClarificationRequest(result.project, sourceId, { question: 'Replace the request' }, replyDate).outcome, 'invalid');
  result.thread.original.text = 'Changed caller copy';
  assert.equal(result.project.messageClarifications[0].original.text, original.text);
});

test('a separate immutable reply advances through actual ordinary processing and verification', () => {
  const requested = request();
  const before = structuredClone(requested);
  const fields = replyFields(requested);
  const result = saveMockClarificationReply(requested, sourceId, fields, replyDate);
  assert.equal(result.outcome, 'updated', result.error);
  let project = result.project;
  assert.deepEqual(requested, before);
  assert.deepEqual(unaffected(project), unaffected(before));
  assert.equal(project.whatsappMessages.length, requested.whatsappMessages.length + 1);
  const child = project.whatsappMessages.find((entry) => entry.id === replyId);
  assert.equal(child.replyToMessageId, sourceId);
  assert.equal(child.status, 'new');
  assert.equal(child.completionBasis, 'cumulative');
  assert.equal(child.photo, before.whatsappMessages[0].photo);
  assert.equal(child.sender, before.whatsappMessages[0].sender);
  assert.equal(child.areaMapping.areaId, fields.areaId);
  assert.equal(project.whatsappMessages[0].status, 'replied');
  assert.equal(project.whatsappMessages[0].clarificationReplyMessageId, replyId);
  assert.equal(getMessageClarification(project, sourceId).stage, 'reply-received');
  assert.deepEqual(getMessageClarification(project, replyId), getMessageClarification(project, sourceId));
  const replay = saveMockClarificationReply(project, sourceId, fields, new Date('2026-10-22'));
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.project, project);
  for (const changed of [{ text: 'Replacement text' }, { itemId: 'B' }, { completion: 51 }, { areaId: 'OTHER' }, { area: 'OTHER' }]) {
    assert.equal(saveMockClarificationReply(project, sourceId, { ...fields, ...changed }, replyDate).outcome, 'invalid');
  }
  const processed = processWhatsAppMessage(project, replyId);
  assert.equal(processed.outcome, 'processed');
  project = processed.project;
  assert.equal(getMessageClarification(project, sourceId).stage, 'verification');
  assert.equal(getMessageClarification(project, replyId).report.id, processed.reportId);
  assert.equal(project.items.find((entry) => entry.id === 'A').reported, 50);
  assert.equal(project.items.find((entry) => entry.id === 'A').verified, 10);
  assert.deepEqual(project.claimDrafts, before.claimDrafts);
  assert.deepEqual(project.messageClarifications[0].original, before.messageClarifications[0].original);
  assert.equal(processWhatsAppMessage(project, replyId).outcome, 'duplicate');
  assert.equal(saveMockClarificationReply(project, sourceId, fields, new Date('2026-10-22')).outcome, 'unchanged');
  project = { ...project, reports: project.reports.map((entry) => entry.id === processed.reportId ? { ...entry, status: 'verified' } : entry),
    items: project.items.map((entry) => entry.id === 'A' ? { ...entry, verified: 50 } : entry) };
  assert.equal(getMessageClarification(project, sourceId).stage, 'verified');
  for (const [status, stage] of [['approved', 'verified'], ['needsClarification', 'clarification'], ['rejected', 'rejected'], ['superseded', 'superseded']]) {
    const changed = { ...project, reports: project.reports.map((entry) => entry.id === processed.reportId ? { ...entry, status } : entry) };
    assert.equal(getMessageClarification(changed, sourceId).stage, stage);
  }
});

test('explicit zero and full completion remain valid, while unknown, strings and invalid types cannot create a reply', () => {
  for (const completion of [0, 100]) {
    const requested = request();
    const project = reply(requested, replyFields(requested, { completion }));
    assert.equal(getMessageClarification(project, sourceId).reply.completion, completion);
    assert.equal(project.items[0].reported, 10);
  }
  for (const completion of [null, undefined, '', '0', '50', NaN, Infinity, -1, 101, false, {}, []]) {
    const requested = request();
    const before = structuredClone(requested);
    const result = saveMockClarificationReply(requested, sourceId, replyFields(requested, { completion }), replyDate);
    assert.equal(result.outcome, 'invalid', `Expected invalid completion ${String(completion)}`);
    assert.equal(result.project, requested);
    assert.deepEqual(requested, before);
  }
  assert.equal(saveMockClarificationReply(fixture(), sourceId, { text: 'Reply', itemId: 'A', completion: 50 }, replyDate).outcome, 'invalid');
});

test('only local unclear inbox sources qualify and included scope cannot be reassigned into measured progress', () => {
  for (const patch of [{ projectId: 'FOREIGN' }, { projectCode: 'FOREIGN' }, { kind: 'vo' }, { vo: true },
    { kind: 'progress', status: 'new' }, { itemId: 'INCLUDED' }, { itemId: 'LABOUR' }, { itemId: 'MISSING' },
    { replyToMessageId: 'ANOTHER' }, { text: '' }, { date: 'not-a-date' }]) {
    const project = fixture();
    project.whatsappMessages[0] = { ...project.whatsappMessages[0], ...patch };
    assert.equal(getMessageClarificationEligibility(project, sourceId).eligible, false, JSON.stringify(patch));
    assert.equal(saveMessageClarificationRequest(project, sourceId, question, requestDate).outcome, 'invalid');
  }
  const duplicate = fixture();
  duplicate.whatsappMessages.push(structuredClone(duplicate.whatsappMessages[0]));
  assert.equal(saveMessageClarificationRequest(duplicate, sourceId, question, requestDate).outcome, 'invalid');
  const duplicateSourceItem = fixture();
  duplicateSourceItem.whatsappMessages[0].itemId = 'INCLUDED';
  duplicateSourceItem.items.push(structuredClone(duplicateSourceItem.items.find((entry) => entry.id === 'INCLUDED')));
  assert.equal(saveMessageClarificationRequest(duplicateSourceItem, sourceId, question, requestDate).outcome, 'invalid');
  const reported = fixture();
  reported.reports.push({ id: 'ALREADY', projectId: reported.id, projectCode: reported.code, sourceMessageId: sourceId, itemId: 'A', status: 'needsClarification' });
  assert.equal(getMessageClarificationEligibility(reported, sourceId).eligible, false);
  const unsupported = request();
  unsupported.whatsappMessages[0].itemId = 'INCLUDED';
  unsupported.messageClarifications[0].original.itemId = 'INCLUDED';
  assert.equal(saveMockClarificationReply(unsupported, sourceId, replyFields(unsupported), replyDate).outcome, 'invalid');
  const eligible = fixture();
  eligible.whatsappMessages[0] = { ...eligible.whatsappMessages[0], kind: 'progress', status: 'clarification' };
  assert.equal(getMessageClarificationEligibility(eligible, sourceId).eligible, true);
});

test('reply item and saved mapping must be explicit local measured matches', () => {
  const requested = request();
  const unlinked = getDrawingMapping(requested).areas[1];
  for (const patch of [{ itemId: 'FOREIGN' }, { itemId: 'INCLUDED' }, { itemId: 'LABOUR' }, { itemId: 'B' },
    { areaId: '' }, { areaId: 'FOREIGN' }, { areaId: unlinked.id }, { area: 'CONFLICTING' }, { text: ' ' }]) {
    assert.equal(saveMockClarificationReply(requested, sourceId, replyFields(requested, patch), replyDate).outcome, 'invalid', JSON.stringify(patch));
  }
  const foreignItem = structuredClone(requested);
  foreignItem.items[0].projectId = 'FOREIGN';
  assert.equal(saveMockClarificationReply(foreignItem, sourceId, replyFields(foreignItem), replyDate).outcome, 'invalid');
  const duplicateItem = structuredClone(requested);
  duplicateItem.items.push(structuredClone(duplicateItem.items[0]));
  assert.equal(saveMockClarificationReply(duplicateItem, sourceId, replyFields(duplicateItem), replyDate).outcome, 'invalid');
  const named = request(fixture({ mapped: false }));
  const saved = reply(named, replyFields(named, { area: 'East access scaffold' }));
  assert.equal(getMessageClarification(saved, sourceId).reply.area, 'East access scaffold');
  assert.equal(getMessageClarification(saved, sourceId).reply.areaMapping, null);
  for (const patch of [{ area: '' }, { areaId: 'FOREIGN' }]) {
    assert.equal(saveMockClarificationReply(named, sourceId, replyFields(named, patch), replyDate).outcome, 'invalid');
  }
});

test('stale dates and collisions cannot append or overwrite evidence, but rejected and superseded reports do not block', () => {
  for (const date of [null, 'bad date', false, '2026-10-19T10:00:00Z']) {
    assert.equal(saveMessageClarificationRequest(fixture(), sourceId, question, date).outcome, 'invalid');
  }
  const requested = request();
  for (const date of [null, 'bad date', false, '2026-10-21T09:59:00Z']) {
    assert.equal(saveMockClarificationReply(requested, sourceId, replyFields(requested), date).outcome, 'invalid');
  }
  const newer = { id: 'NEWER', itemId: 'A', projectId: requested.id, projectCode: requested.code,
    status: 'pending', date: '2026-10-21T12:00:00Z', vo: false };
  for (const status of ['pending', 'needsReview', 'verified', 'needsClarification']) {
    const project = { ...requested, reports: [...requested.reports, { ...newer, status }] };
    assert.equal(saveMockClarificationReply(project, sourceId, replyFields(project), replyDate).outcome, 'invalid');
  }
  for (const patch of [{ status: 'rejected' }, { status: 'superseded' }, { projectId: 'FOREIGN' }, { vo: true }]) {
    const project = { ...requested, reports: [...requested.reports, { ...newer, ...patch }] };
    assert.equal(saveMockClarificationReply(project, sourceId, replyFields(project), replyDate).outcome, 'updated');
  }
  const messageCollision = structuredClone(requested);
  messageCollision.whatsappMessages.push({ id: replyId, projectId: 'FOREIGN', projectCode: 'FOREIGN' });
  assert.equal(saveMockClarificationReply(messageCollision, sourceId, replyFields(messageCollision), replyDate).outcome, 'invalid');
  for (const extra of [{ id: `WA-REPORT-${replyId}` }, { id: 'OTHER', sourceMessageId: replyId }]) {
    const collision = { ...requested, reports: [...requested.reports, extra] };
    assert.equal(saveMockClarificationReply(collision, sourceId, replyFields(collision), replyDate).outcome, 'invalid');
  }
});

test('reload retains valid lineage and frozen area evidence without changing saved claims or seed', () => {
  const project = reply();
  const before = structuredClone(project);
  const reloaded = JSON.parse(JSON.stringify(project));
  reloaded.messageClarifications = normalizeMessageClarifications(reloaded);
  assert.deepEqual(reloaded.messageClarifications, project.messageClarifications);
  assert.equal(getMessageClarification(reloaded, replyId).stage, 'reply-received');
  const map = reloaded.drawingMapping;
  const priorArea = getMessageClarification(reloaded, sourceId).reply.areaMapping;
  reloaded.drawingMapping = { ...map, areas: map.areas.map((area) => area.id === priorArea.areaId
    ? { ...area, code: 'RENAMED', workItemIds: ['B'] } : area) };
  assert.equal(normalizeMessageClarifications(reloaded).length, 1);
  assert.deepEqual(getMessageClarification(reloaded, sourceId).reply.areaMapping, priorArea);
  assert.deepEqual(unaffected(project), unaffected(before));
  const context = getMessageClarification(project, sourceId);
  context.original.text = 'Caller mutation'; context.reply.text = 'Caller mutation'; context.thread.request.question = 'Caller mutation';
  assert.deepEqual(project, before);
  const storage = { getItem: (key) => key === WORKSPACE_STORE ? JSON.stringify({ schemaVersion: 2,
    activeProjectId: project.id, projects: [project] }) : null };
  const loaded = loadWorkspace(storage).projects.find((entry) => entry.id === project.id);
  assert.equal(getMessageClarification(loaded, sourceId).stage, 'reply-received');
  assert.deepEqual(loaded.messageClarifications[0].original, project.messageClarifications[0].original);
});

test('normalization rejects foreign, duplicate, corrupt or broken thread lineage rather than attaching unrelated records', () => {
  const project = reply();
  const corruptions = [
    (value) => { value.messageClarifications[0].projectId = 'FOREIGN'; },
    (value) => { value.messageClarifications[0].id = 'OTHER'; },
    (value) => { value.messageClarifications.push(structuredClone(value.messageClarifications[0])); },
    (value) => { value.messageClarifications[0].original.photo = '/changed-photo.jpg'; },
    (value) => { value.messageClarifications[0].request.date = '2026-10-19T00:00:00Z'; },
    (value) => { value.messageClarifications[0].replyMessageId = 'FOREIGN'; },
    (value) => { value.whatsappMessages[1].projectId = 'FOREIGN'; },
    (value) => { value.whatsappMessages[1].replyToMessageId = 'FOREIGN'; },
    (value) => { value.whatsappMessages[1].completion = null; },
    (value) => { value.whatsappMessages[1].date = '2026-10-20T10:00:00Z'; },
    (value) => { value.whatsappMessages[1].areaMapping.workItemIds = ['B']; },
    (value) => { value.whatsappMessages.push(structuredClone(value.whatsappMessages[1])); },
  ];
  for (const corrupt of corruptions) {
    const value = structuredClone(project); corrupt(value);
    const before = structuredClone(value);
    assert.deepEqual(normalizeMessageClarifications(value), []);
    assert.equal(getMessageClarification(value, sourceId), null);
    assert.deepEqual(value, before);
  }
  const foreignReport = processWhatsAppMessage(project, replyId).project;
  foreignReport.reports.at(-1).projectId = 'FOREIGN';
  assert.equal(getMessageClarification(foreignReport, sourceId).report, null);
  assert.equal(getMessageClarification(foreignReport, sourceId).stage, 'reply-received');
  assert.deepEqual(normalizeMessageClarifications({ id: 'EMPTY', code: 'EMPTY' }), []);
  assert.deepEqual(normalizeMessageClarifications(null), []);
  assert.equal(getMessageClarification(null, sourceId), null);
  assert.equal(getMessageClarificationEligibility(null, sourceId).eligible, false);
  assert.equal(saveMessageClarificationRequest(null, sourceId, question, requestDate).outcome, 'invalid');
  assert.equal(saveMockClarificationReply(null, sourceId, {}, replyDate).outcome, 'invalid');
});

test('a newer item report supersedes an unprocessed reply without pretending it is that reply’s report', () => {
  const project = reply();
  const newer = { id: 'NEWER-SITE-REPORT', projectId: project.id, projectCode: project.code, itemId: 'A',
    sourceMessageId: 'ANOTHER-MESSAGE', vo: false, status: 'pending', date: '2026-10-21T12:00:00Z', completion: 70 };
  const advanced = { ...project, reports: [...project.reports, newer],
    items: project.items.map((item) => item.id === 'A' ? { ...item, reported: 70 } : item) };
  const before = structuredClone(advanced);
  let context = getMessageClarification(advanced, sourceId);
  assert.equal(context.stage, 'superseded');
  assert.equal(context.report, null);
  assert.deepEqual(context.latestReport, newer);
  assert.deepEqual(advanced, before);
  const processed = processWhatsAppMessage(advanced, replyId);
  assert.equal(processed.outcome, 'clarification');
  context = getMessageClarification(processed.project, replyId);
  assert.equal(context.reply.status, 'clarification');
  assert.equal(context.stage, 'superseded');
  assert.equal(context.report, null);
  assert.equal(context.latestReport.id, newer.id);
  assert.deepEqual(unaffected(processed.project), unaffected(before));
  assert.deepEqual(processed.project.messageClarifications, before.messageClarifications);
  assert.deepEqual(processed.project.whatsappMessages[0], before.whatsappMessages[0]);
  context.latestReport.completion = 99;
  assert.equal(processed.project.reports.at(-1).completion, 70);
  for (const patch of [{ projectId: 'FOREIGN' }, { projectCode: 'FOREIGN' }, { status: 'rejected' },
    { status: 'superseded' }, { itemId: 'B' }, { vo: true }, { date: 'bad date' }]) {
    const excluded = { ...project, reports: [...project.reports, { ...newer, ...patch }] };
    assert.equal(getMessageClarification(excluded, sourceId).latestReport, null);
    assert.equal(getMessageClarification(excluded, sourceId).stage, 'reply-received');
  }
  const duplicate = { ...project, reports: [...project.reports, newer, structuredClone(newer)] };
  assert.equal(getMessageClarification(duplicate, sourceId).latestReport, null);
  const latest = { ...newer, id: 'LATEST-SITE-REPORT', date: '2026-10-21T13:00:00Z' };
  const multiple = { ...project, reports: [...project.reports, newer, latest] };
  assert.equal(getMessageClarification(multiple, sourceId).latestReport.id, latest.id);
});

test('a supervisor-flagged VO remains the actual paired reply outcome instead of returning to processing', () => {
  const project = processWhatsAppMessage(reply(), replyId).project;
  const report = project.reports.find((entry) => entry.sourceMessageId === replyId);
  const flagged = { ...project, reports: project.reports.map((entry) => entry.id === report.id
    ? { ...entry, vo: true, status: 'needsReview', reviewReason: 'QS needs to assess whether this is extra scope.' } : entry) };
  const before = structuredClone(flagged);
  const context = getMessageClarification(flagged, sourceId);
  assert.equal(context.stage, 'vo-review');
  assert.equal(context.report.id, report.id);
  assert.equal(context.report.vo, true);
  assert.equal(context.latestReport, null);
  assert.equal(context.reply.status, 'processed');
  assert.equal(getMessageClarification(flagged, replyId).stage, 'vo-review');
  assert.deepEqual(flagged, before);
  assert.deepEqual(unaffected(flagged), unaffected(before));
  assert.deepEqual(flagged.messageClarifications[0].original, project.messageClarifications[0].original);
});

test('requesting and replying in the original S.I.T. showcase preserve saved export and all contract state', () => {
  const project = createSITContractDemo({ name: 'S.I.T. clarification state demo', code: 'CLARIFY-SIT' }, requestDate);
  project.whatsappMessages.push({ ...fixture().whatsappMessages[0], projectId: project.id, projectCode: project.code });
  const before = structuredClone(project);
  const draftId = project.claimDrafts[0].id;
  const pack = buildClaimPack(project, draftId);
  assert.ok(pack);
  const requested = request(project);
  const area = getDrawingMapping(requested).areas.find((entry) => entry.workItemIds.includes('WI-001'));
  const result = saveMockClarificationReply(requested, sourceId, { text: 'Mock worker reply: WI-001, total 75%.',
    itemId: 'WI-001', areaId: area.id, area: area.code, completion: 75 }, new Date('2026-10-22T11:00:00Z'));
  assert.equal(result.outcome, 'updated', result.error);
  assert.deepEqual(project, before);
  assert.deepEqual(unaffected(result.project), unaffected(before));
  assert.deepEqual(buildClaimPack(result.project, draftId), pack);
});
