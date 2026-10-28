import assert from 'node:assert/strict';
import test from 'node:test';
import { getMessageDismissalEligibility, getMessageInboxDecision, normalizeMessageInboxDecisions, saveMessageInboxDecision } from '../src/data/message-dismissal.ts';
import { getMessageReviewStatus, isNewInboxMessage, matchesInboxFilter } from '../src/data/message-inbox.ts';
import { seedWorkspace, loadWorkspace, resetProject, updateProjectState, WORKSPACE_STORE } from '../src/data/projects.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { getProjectWorkflow } from '../src/data/workflow.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { saveMessageClarificationRequest, saveMockClarificationReply } from '../src/data/whatsapp-clarification.ts';

const now = '2026-10-28T08:00:00.000Z';
const project = () => seedWorkspace().projects[0];
const messageId = 'SIT01-WA-001';
const input = (value, id = messageId, action = 'dismiss', reason = 'Sent to this project by mistake.') => {
  const context = getMessageInboxDecision(value, id);
  return { action, reason, sourceKey: context.sourceKey, expectedDecisionId: context.latest?.id || null };
};
const save = (value, action = 'dismiss', reason, id = messageId) => saveMessageInboxDecision(value, id, input(value, id, action, reason), now);
const storage = value => {
  const entries = new Map([[WORKSPACE_STORE, JSON.stringify(value)]]);
  return { getItem: key => entries.get(key) ?? null, setItem: (key, entry) => entries.set(key, entry) };
};

test('dismiss and reopen append reasons without altering any original or workflow data', () => {
  const before = project(), frozen = structuredClone(before);
  const result = save(before);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.decision.action, 'dismiss');
  assert.ok(result.decision.reason && result.decision.reviewedBy && result.decision.reviewedAt);
  const { messageInboxDecisions, history, ...rest } = result.project;
  assert.deepEqual(rest, Object.fromEntries(Object.entries(before).filter(([key]) => key !== 'history')));
  assert.deepEqual(history.slice(1), before.history);
  assert.deepEqual(before, frozen);
  assert.equal(messageInboxDecisions.length, 1);
  assert.equal(result.project.whatsappMessages[0].status, 'new');
  assert.equal(processWhatsAppMessage(result.project, messageId).outcome, 'invalid');
  const reopened = save(result.project, 'reopen', 'Relevant update; returned for normal review.');
  assert.equal(reopened.outcome, 'updated');
  assert.equal(getMessageInboxDecision(reopened.project, messageId).dismissed, false);
  assert.deepEqual(reopened.project.whatsappMessages, before.whatsappMessages);
  assert.deepEqual(reopened.project.reports, before.reports);
  assert.equal(reopened.project.messageInboxDecisions.length, 2);
  assert.equal(reopened.decision.previousDecisionId, result.decision.id);
  assert.equal(processWhatsAppMessage(reopened.project, messageId).outcome, 'processed');
});

test('required reasons, action ordering, source, date and prior decision guard every mutation', () => {
  const base = project(), values = input(base);
  for (const reason of ['', '  ', 'x'.repeat(1001), null]) assert.equal(saveMessageInboxDecision(base, messageId, { ...values, reason }, now).outcome, 'invalid');
  assert.equal(saveMessageInboxDecision(base, messageId, { ...values, action: 'delete' }, now).outcome, 'invalid');
  assert.equal(save(base, 'reopen', 'Wrong action.').outcome, 'invalid');
  assert.equal(saveMessageInboxDecision(base, messageId, values, 'invalid').outcome, 'invalid');
  assert.equal(saveMessageInboxDecision(base, messageId, values, '2020-01-01').outcome, 'invalid');
  assert.equal(saveMessageInboxDecision(base, messageId, { ...values, sourceKey: 'stale' }, now).outcome, 'invalid');
  assert.equal(saveMessageInboxDecision(base, messageId, { ...values, expectedDecisionId: 'foreign' }, now).outcome, 'invalid');
  const dismissed = saveMessageInboxDecision(base, messageId, values, now);
  assert.equal(saveMessageInboxDecision(dismissed.project, messageId, values, now).outcome, 'unchanged');
  const reopened = save(dismissed.project, 'reopen', 'Review again.');
  assert.equal(saveMessageInboxDecision(reopened.project, messageId, values, now).outcome, 'invalid');
  assert.equal(saveMessageInboxDecision(dismissed.project, messageId, input(dismissed.project, messageId, 'reopen', 'Review again.'), '2026-10-27').outcome, 'invalid');
});

test('dismissal refuses processed records, VO reviews and clarification threads or replies', () => {
  const base = project();
  const processed = processWhatsAppMessage(base, messageId).project;
  assert.equal(save(processed).outcome, 'invalid');
  for (const patch of [
    { status: 'clarification' }, { processedAt: now }, { reportId: 'missing-report' },
    { replyToMessageId: 'original' }, { clarificationThreadId: 'thread' },
    { clarificationReplyMessageId: 'reply' }, { clarificationRequestedAt: now },
  ]) {
    const value = structuredClone(base); Object.assign(value.whatsappMessages[0], patch);
    assert.equal(save(value).outcome, 'invalid');
  }
  for (const patch of [
    { reports: [...base.reports, { id: 'R', projectId: 'FOREIGN', sourceMessageId: messageId }] },
    { voReviews: [...base.voReviews, { reportId: `WA-REPORT-${messageId}` }] },
    { messageClarifications: [{ sourceMessageId: messageId }] },
    { messageClarifications: [{ replyMessageId: messageId }] },
    { messageClarifications: {} },
  ]) assert.equal(save({ ...base, ...patch }).outcome, 'invalid');
});

test('foreign and duplicate inbox identities cannot receive a decision', () => {
  const base = project();
  assert.equal(save(base, 'dismiss', 'Reason', 'WH02-WA-001').outcome, 'invalid');
  const foreign = structuredClone(base); foreign.whatsappMessages[0].projectId = 'FOREIGN';
  assert.equal(save(foreign).outcome, 'invalid');
  const duplicate = structuredClone(base); duplicate.whatsappMessages.push(structuredClone(duplicate.whatsappMessages[0]));
  assert.equal(save(duplicate).outcome, 'invalid');
});

test('reopened messages retain a valid decision history as ordinary clarification and processing continue', () => {
  const base = project(), id = 'SIT01-WA-004';
  const dismissed = save(base, 'dismiss', 'Review whether this was unrelated.', id).project;
  const reopened = save(dismissed, 'reopen', 'Worker confirmed it belongs to this project.', id).project;
  const requested = saveMessageClarificationRequest(reopened, id, { question: 'Which item and cumulative total?' }, now);
  assert.equal(requested.outcome, 'updated');
  assert.equal(getMessageInboxDecision(requested.project, id).blocked, false);
  const reply = saveMockClarificationReply(requested.project, id, { itemId: 'WI-001', area: 'W3-ST31', completion: 65, text: 'WI-001 W3-ST31 complete 65% total.' }, now);
  assert.equal(reply.outcome, 'updated');
  assert.equal(getMessageInboxDecision(reply.project, id).blocked, false);
  assert.equal(getMessageDismissalEligibility(reply.project, id).eligible, false);
  const processed = processWhatsAppMessage(save(save(base).project, 'reopen', 'Review again.').project, messageId);
  assert.equal(processed.outcome, 'processed');
  assert.equal(getMessageInboxDecision(processed.project, messageId).blocked, false);
});

test('inbox filters, Needs attention and workflow counts remove dismissed tasks and restore one on reopen', () => {
  const base = project(), message = base.whatsappMessages[0];
  const attention = getProjectAttention(base), counts = getProjectWorkflow(base).counts;
  assert.equal(attention.filter(task => task.target.messageId === messageId).length, 1);
  const dismissed = save(base).project, context = getMessageInboxDecision(dismissed, messageId);
  assert.deepEqual(getMessageReviewStatus(message, null, null, null, context), { label: 'Dismissed', tone: 'slate' });
  assert.equal(isNewInboxMessage(message, null, null, context), false);
  assert.equal(matchesInboxFilter('all', message, null, null, context), true);
  assert.equal(matchesInboxFilter('dismissed', message, null, null, context), true);
  for (const filter of ['new', 'processed', 'review', 'vo', 'clarification']) assert.equal(matchesInboxFilter(filter, message, null, null, context), false);
  assert.equal(getProjectAttention(dismissed).some(task => task.target.messageId === messageId), false);
  assert.equal(getProjectWorkflow(dismissed).counts.newMessages, counts.newMessages - 1);
  const reopened = save(dismissed, 'reopen', 'Relevant after review.').project;
  assert.equal(getProjectAttention(reopened).filter(task => task.target.messageId === messageId).length, 1);
  assert.equal(getProjectWorkflow(reopened).counts.newMessages, counts.newMessages);
});

test('decision history survives reload, project isolation and selected-project reset', () => {
  const workspace = seedWorkspace(), other = structuredClone(workspace.projects[1]);
  const next = updateProjectState(workspace, 'SIT01', value => save(value).project);
  assert.deepEqual(next.projects[1], other);
  const loaded = loadWorkspace(storage(next));
  const first = loaded.projects.find(value => value.id === 'SIT01');
  assert.equal(getMessageInboxDecision(first, messageId).dismissed, true);
  assert.equal(getMessageDismissalEligibility(first, messageId).canReopen, true);
  assert.deepEqual(first.whatsappMessages, workspace.projects[0].whatsappMessages);
  const reset = resetProject(first);
  assert.equal(getMessageInboxDecision(reset, messageId).dismissed, false);
  assert.equal(reset.messageInboxDecisions, undefined);
  assert.deepEqual(loaded.projects[1].whatsappMessages, other.whatsappMessages);
});

test('malformed latest history stays blocked across normalization and reload, never reviving an earlier state', () => {
  const dismissed = save(project()).project;
  const reopened = save(dismissed, 'reopen', 'Return for review.').project;
  for (const corrupted of [
    { ...reopened, messageInboxDecisions: [...reopened.messageInboxDecisions.slice(0, 1), { ...reopened.messageInboxDecisions[1], reason: '' }] },
    { ...reopened, messageInboxDecisions: [...reopened.messageInboxDecisions, reopened.messageInboxDecisions[1]] },
    { ...dismissed, messageInboxDecisions: {} },
    { ...dismissed, messageInboxDecisionIssues: {} },
  ]) {
    assert.equal(getMessageInboxDecision(corrupted, messageId).blocked, true);
    const normalized = { ...corrupted, ...normalizeMessageInboxDecisions(corrupted) };
    assert.equal(getMessageInboxDecision(normalized, messageId).blocked, true);
    assert.equal(processWhatsAppMessage(normalized, messageId).outcome, 'invalid');
    assert.equal(save(normalized, 'reopen', 'Unsafe').outcome, 'invalid');
    const workspace = seedWorkspace(); workspace.projects[0] = normalized;
    const loaded = loadWorkspace(storage(workspace)).projects[0];
    assert.equal(getMessageInboxDecision(loaded, messageId).blocked, true);
    assert.equal(getProjectAttention(loaded).filter(task => task.target.messageId === messageId).length, 1);
    assert.equal(getProjectAttention(loaded).find(task => task.target.messageId === messageId).statusLabel, 'Decision needs review');
  }
});

test('a contradictory stored dismissal cannot hide an existing processing or clarification record', () => {
  const dismissed = save(project()).project;
  for (const patch of [
    { reports: [...dismissed.reports, { id: 'R', sourceMessageId: messageId }] },
    { messageClarifications: [{ sourceMessageId: messageId }] },
    { voReviews: [...dismissed.voReviews, { reportId: `WA-REPORT-${messageId}` }] },
    { whatsappMessages: dismissed.whatsappMessages.map(message => message.id === messageId ? { ...message, status: 'processed' } : message) },
  ]) {
    const value = { ...dismissed, ...patch };
    assert.equal(getMessageInboxDecision(value, messageId).blocked, true);
    assert.equal(save(value, 'reopen', 'Unsafe stale state.').outcome, 'invalid');
    const normalized = { ...value, ...normalizeMessageInboxDecisions(value) };
    assert.equal(getMessageInboxDecision(normalized, messageId).blocked, true);
  }
});

test('mapping and known demo-photo updates do not resurrect a dismissal; changed original text blocks it', () => {
  const dismissed = save(project()).project;
  const updated = structuredClone(dismissed);
  updated.version += 1; updated.drawingMapping = { drawing: null, areas: [], history: [] };
  updated.whatsappMessages[0].demo = true;
  // The source fixture is not marked demo by default; add the marker before a
  // separate dismissal to model the automatically refreshed S.I.T. fixtures.
  const demo = project(); demo.whatsappMessages[0].demo = true;
  const demoDismissed = save(demo).project;
  demoDismissed.whatsappMessages[0].photo = '/assets/different-demo.jpg';
  demoDismissed.whatsappMessages[0].photoAlt = 'Updated demonstration image';
  assert.equal(getMessageInboxDecision(demoDismissed, messageId).dismissed, true);
  assert.equal(getMessageInboxDecision(demoDismissed, messageId).blocked, false);
  delete updated.whatsappMessages[0].demo;
  assert.equal(getMessageInboxDecision(updated, messageId).dismissed, true);
  updated.whatsappMessages[0].text = 'Changed original';
  assert.equal(getMessageInboxDecision(updated, messageId).blocked, true);
});

test('all saved S.I.T. claim snapshots and CSV export remain byte-identical through inbox decisions', () => {
  const base = createSITContractDemo({ name: 'S.I.T. example', code: 'DISMISS-CLAIM' }, now);
  const message = base.whatsappMessages.find(entry => getMessageDismissalEligibility(base, entry.id).eligible);
  assert.ok(message);
  const pack = buildClaimPack(base, base.claimDrafts[0].id);
  assert.equal(pack.outcome, 'ready');
  const snapshot = JSON.stringify(base.claimDrafts), beforeCSV = toClaimCSV(pack.pack);
  const dismissed = save(base, 'dismiss', 'Demonstration of an accidental inbox entry.', message.id).project;
  const reopened = save(dismissed, 'reopen', 'Returned for normal review.', message.id).project;
  assert.equal(JSON.stringify(reopened.claimDrafts), snapshot);
  assert.deepEqual(buildClaimPack(reopened, base.claimDrafts[0].id), pack);
  assert.equal(toClaimCSV(buildClaimPack(reopened, base.claimDrafts[0].id).pack), beforeCSV);
});
