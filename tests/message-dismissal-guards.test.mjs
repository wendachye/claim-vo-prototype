import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorkspace } from '../src/data/projects.ts';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { createVoiceNoteDemo } from '../src/data/voice-note-demo.ts';
import { getMessageDismissalEligibility, saveMessageInboxDecision } from '../src/data/message-dismissal.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { getVoiceNoteContext, saveVoiceTranscriptReview } from '../src/data/voice-notes.ts';
import { getMessageClarificationEligibility, saveMessageClarificationRequest } from '../src/data/whatsapp-clarification.ts';
import { getMessageProgressCheck } from '../src/data/message-progress-check.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getAreaEvidence } from '../src/data/drawing-evidence.ts';
import { getAreaVOFlags } from '../src/data/drawing-vo.ts';

const now = new Date('2026-10-28T10:00:00Z');
function decide(project, messageId, action = 'dismiss') {
  const eligibility = getMessageDismissalEligibility(project, messageId);
  const result = saveMessageInboxDecision(project, messageId, { action, reason: action === 'dismiss' ? 'Accidental demo update.' : 'Ready to review the original.',
    sourceKey: eligibility.sourceKey, expectedDecisionId: eligibility.expectedDecisionId }, now);
  assert.equal(result.outcome, 'updated', result.error);
  return result.project;
}

test('dismissed reviewed matches retain original area evidence and correction history while direct reviews are blocked', () => {
  let project = createMessageMatchDemo(seedWorkspace(), now).project;
  const message = project.whatsappMessages[1];
  const area = getDrawingMapping(project).areas.find(entry => entry.code === 'EAST');
  const values = { itemId: 'WI-001', areaId: area.id, reason: 'The original describes east-wall cladding.' };
  const saved = saveMessageMatchReview(project, message.id, values, now);
  assert.equal(saved.outcome, 'updated', saved.error);
  project = saved.project;
  const before = structuredClone(project);
  const dismissed = decide(project, message.id);
  const context = getMessageMatchContext(dismissed, message.id);
  assert.equal(context.eligible, false);
  assert.equal(context.requiresReview, false);
  assert.deepEqual(context.review, saved.review);
  assert.equal(context.effectiveMessage.areaId, area.id);
  assert.equal(saveMessageMatchReview(dismissed, message.id, values, now).outcome, 'invalid');
  assert.equal(getMessageProgressCheck(dismissed, message.id), null);
  const evidence = getAreaEvidence(dismissed, area.id).entries.find(entry => entry.messageId === message.id);
  assert.equal(evidence.status, 'dismissed');
  for (const key of ['text', 'photo', 'sender', 'date']) assert.equal(evidence[key], message[key]);
  for (const key of ['whatsappMessages', 'messageMatchReviews', 'reports', 'items', 'claimDrafts', 'seed']) assert.deepEqual(dismissed[key], before[key]);
  const reopened = decide(dismissed, message.id, 'reopen');
  assert.equal(getMessageMatchContext(reopened, message.id).eligible, true);
  assert.deepEqual(getMessageMatchContext(reopened, message.id).review, saved.review);
});

test('dismissed voice notes keep reviewed transcript/audio evidence but cannot save another transcript', () => {
  let project = createVoiceNoteDemo(seedWorkspace(), now).project;
  const message = project.whatsappMessages[0];
  const initial = getVoiceNoteContext(project, message.id);
  const values = { transcript: initial.originalTranscript.replace('wail', 'wall'), reason: 'Corrected the demo transcription.', sourceKey: initial.sourceKey };
  const saved = saveVoiceTranscriptReview(project, message.id, values, now);
  assert.equal(saved.outcome, 'updated', saved.error);
  project = saved.project;
  const evidence = getVoiceNoteContext(project, message.id).evidence;
  const dismissed = decide(project, message.id);
  const context = getVoiceNoteContext(dismissed, message.id);
  assert.equal(context.readOnly, true);
  assert.equal(context.status, 'unavailable');
  assert.deepEqual(context.evidence, evidence);
  assert.deepEqual(context.review, saved.review);
  assert.deepEqual(context.audio, initial.audio);
  const blocked = saveVoiceTranscriptReview(dismissed, message.id, { ...values, sourceKey: context.sourceKey }, now);
  assert.equal(blocked.outcome, 'invalid');
  assert.equal(blocked.project, dismissed);
  const reopened = decide(dismissed, message.id, 'reopen');
  assert.equal(getVoiceNoteContext(reopened, message.id).readOnly, false);
  assert.deepEqual(getVoiceNoteContext(reopened, message.id).evidence, evidence);
});

test('dismissed unclear messages cannot create a clarification thread, and reopening restores that action', () => {
  const project = createVoiceNoteDemo(seedWorkspace(), now).project;
  const message = project.whatsappMessages.at(-1);
  assert.equal(getMessageClarificationEligibility(project, message.id).eligible, true);
  const dismissed = decide(project, message.id);
  assert.equal(getMessageClarificationEligibility(dismissed, message.id).eligible, false);
  const result = saveMessageClarificationRequest(dismissed, message.id, { question: 'Which area do you mean?' }, now);
  assert.equal(result.outcome, 'invalid');
  assert.equal(result.project, dismissed);
  assert.deepEqual(dismissed.messageClarifications, project.messageClarifications);
  const reopened = decide(dismissed, message.id, 'reopen');
  assert.equal(getMessageClarificationEligibility(reopened, message.id).eligible, true);
});

test('dismissed possible-VO messages remain in drawing history without an active extra-work hint', () => {
  const project = createMessageMatchDemo(seedWorkspace(), now).project;
  const area = getDrawingMapping(project).areas.find(entry => entry.code === 'WEST');
  const { matchSuggestion, ...source } = project.whatsappMessages[0];
  const message = { ...source, id: `${project.code}-EXTRA-WORK-ACCIDENTAL`, kind: 'vo', vo: true, area: area.code,
    text: 'Possible extra access platform; photo attached.' };
  project.whatsappMessages = [message];
  assert.equal(getAreaVOFlags(project, area.id).newMessageCount, 1);
  const dismissed = decide(project, message.id);
  assert.equal(getAreaVOFlags(dismissed, area.id).newMessageCount, 0);
  const entries = getAreaEvidence(dismissed, area.id).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, 'dismissed');
  assert.equal(entries[0].text, message.text);
  assert.equal(getAreaVOFlags(decide(dismissed, message.id, 'reopen'), area.id).newMessageCount, 1);
});

test('an unavailable inbox decision fails closed across voice, match and drawing consumers without dropping saved evidence', () => {
  let project = createVoiceNoteDemo(seedWorkspace(), now).project;
  const message = project.whatsappMessages[0];
  const initial = getVoiceNoteContext(project, message.id);
  project = saveVoiceTranscriptReview(project, message.id, { transcript: initial.originalTranscript,
    reason: '', sourceKey: initial.sourceKey }, now).project;
  const area = getDrawingMapping(project).areas.find(entry => entry.code === 'WEST');
  const values = { itemId: 'WI-001', areaId: area.id, reason: '' };
  const matched = saveMessageMatchReview(project, message.id, values, now);
  assert.equal(matched.outcome, 'updated', matched.error);
  project = matched.project;
  const voiceEvidence = getVoiceNoteContext(project, message.id).evidence;
  const blocked = { ...project, messageInboxDecisionIssues: [message.id] };
  assert.equal(getVoiceNoteContext(blocked, message.id).readOnly, true);
  assert.deepEqual(getVoiceNoteContext(blocked, message.id).evidence, voiceEvidence);
  assert.equal(getMessageMatchContext(blocked, message.id).eligible, false);
  assert.deepEqual(getMessageMatchContext(blocked, message.id).review, matched.review);
  assert.equal(saveMessageMatchReview(blocked, message.id, values, now).outcome, 'invalid');
  assert.equal(getMessageProgressCheck(blocked, message.id), null);
  assert.equal(getMessageClarificationEligibility(blocked, message.id).eligible, false);
  const evidence = getAreaEvidence(blocked, area.id).entries.find(entry => entry.messageId === message.id);
  assert.equal(evidence.status, 'decision-unavailable');
  assert.equal(evidence.text, message.text);
  assert.equal(evidence.hasVoiceNote, true);
});
