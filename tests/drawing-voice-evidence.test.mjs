import assert from 'node:assert/strict';
import test from 'node:test';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { enrichSITShowcaseFeatures, getSITShowcaseFeatureTargets } from '../src/data/sit-showcase-features.ts';
import { getAreaEvidence, resolveAreaEvidenceSource } from '../src/data/drawing-evidence.ts';
import { getDrawingMapping, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { getVoiceNoteContext, saveVoiceTranscriptReview } from '../src/data/voice-notes.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { getMessageClarification, saveMessageClarificationRequest, saveMockClarificationReply } from '../src/data/whatsapp-clarification.ts';

const now = new Date('2026-10-24T10:00:00Z');
const later = new Date('2026-10-24T10:01:00Z');
const latest = new Date('2026-10-24T10:02:00Z');
const fixture = () => enrichSITShowcaseFeatures(createSITContractDemo({ code: 'VOICE-MAP', name: 'Voice map audit' }, now), now).project;
const updated = result => { assert.equal(result.outcome, 'updated', result.error); return result.project; };
const entries = (project, areaId, messageId) => getAreaEvidence(project, areaId).entries.filter(entry => entry.messageId === messageId);
const protectedRecords = project => structuredClone({ items: project.items, baselines: project.baselines, reports: project.reports,
  claimDrafts: project.claimDrafts, claimTracking: project.claimTracking, whatsappMessages: project.whatsappMessages });

test('voice drawing links require the current confirmed match while retaining the original transcript', () => {
  let project = fixture();
  const target = getSITShowcaseFeatureTargets(project), messageId = target.voiceMessageId;
  const source = structuredClone(project.whatsappMessages.find(message => message.id === messageId));
  const before = protectedRecords(project);
  const [a, b] = target.areaIds;
  // Raw proposed routing and an unconfirmed transcription are not assignments.
  assert.equal(entries(project, a, messageId).length, 0);
  assert.equal(entries(project, b, messageId).length, 0);
  project = updated(saveVoiceTranscriptReview(project, messageId, {
    transcript: source.text.replace('itam', 'item').replace('BRACKET-A', 'BRACKET-B'),
    reason: 'Corrected the area after listening to the demo recording.',
    sourceKey: getVoiceNoteContext(project, messageId).sourceKey,
  }, later));
  assert.equal(entries(project, a, messageId).length, 0);
  assert.equal(entries(project, b, messageId).length, 0);
  const match = getMessageMatchContext(project, messageId);
  project = updated(saveMessageMatchReview(project, messageId, { ...match.fields, reason: '' }, later));
  const entry = entries(project, b, messageId)[0];
  assert.equal(entries(project, a, messageId).length, 0);
  assert.equal(entries(project, b, messageId).length, 1);
  assert.equal(entry.text, source.originalTranscript);
  assert.equal(entry.itemId, 'WI-016');
  assert.equal(entry.hasVoiceNote, true);
  assert.equal(entry.sourceLabel, 'WhatsApp voice note');
  assert.equal(entry.matchKind, 'saved-area');
  assert.deepEqual(resolveAreaEvidenceSource(project, b, entry.id), { kind: 'message', messageId, reportId: null });
  assert.deepEqual(protectedRecords(project), before);
  const readOnly = structuredClone(project);
  getAreaEvidence(project, b);
  assert.deepEqual(project, readOnly);

  // A new transcript review invalidates the previous area assignment until
  // its replacement match is confirmed, even if the same area remains named.
  project = updated(saveVoiceTranscriptReview(project, messageId, {
    transcript: source.text.replace('itam', 'item').replace('50%', '55%').replace('BRACKET-A', 'BRACKET-B'),
    reason: 'Corrected the total after replaying the recording.',
    sourceKey: getVoiceNoteContext(project, messageId).sourceKey,
  }, latest));
  assert.equal(getMessageMatchContext(project, messageId).review, null);
  assert.equal(entries(project, a, messageId).length, 0);
  assert.equal(entries(project, b, messageId).length, 0);
  assert.deepEqual(protectedRecords(project), before);
});

test('processed voice reports route once by their saved area and keep their frozen original evidence', () => {
  let project = fixture();
  const target = getSITShowcaseFeatureTargets(project), messageId = target.voiceMessageId;
  const source = structuredClone(project.whatsappMessages.find(message => message.id === messageId));
  const savedClaims = structuredClone(project.claimDrafts), [a, b] = target.areaIds;
  project = updated(saveVoiceTranscriptReview(project, messageId, {
    transcript: source.text.replace('itam', 'item').replace('BRACKET-A', 'BRACKET-B'),
    reason: 'Corrected the area after listening.', sourceKey: getVoiceNoteContext(project, messageId).sourceKey,
  }, later));
  const match = getMessageMatchContext(project, messageId);
  project = updated(saveMessageMatchReview(project, messageId, { ...match.fields, reason: '' }, later));
  const result = processWhatsAppMessage(project, messageId);
  assert.equal(result.outcome, 'processed', result.error); project = result.project;
  const report = project.reports.find(report => report.id === result.reportId);
  const bArea = getDrawingMapping(project).areas.find(area => area.id === b);
  project = updated(saveAreaMapping(project, { ...bArea, areaId: b, code: 'BRACKET-RENAMED' }, latest));
  const entry = entries(project, b, messageId)[0];
  assert.equal(entries(project, a, messageId).length, 0);
  assert.equal(entries(project, b, messageId).length, 1);
  assert.equal(entry.id, `report:${report.id}`);
  assert.equal(entry.reportId, report.id);
  assert.equal(entry.text, source.originalTranscript);
  assert.equal(entry.label, 'Needs verification');
  assert.equal(entry.hasVoiceNote, true);
  assert.equal(entry.sourceLabel, 'WhatsApp voice note');
  assert.equal(report.areaProgress.areaId, b);
  assert.equal(report.areaMapping.code, 'BRACKET-B');
  assert.equal(report.voiceNote.originalTranscript, source.originalTranscript);
  assert.equal(report.voiceNote.audio.asset, source.audio.asset);
  assert.equal(project.items.find(item => item.id === 'WI-016').verified, null);
  assert.deepEqual(project.claimDrafts, savedClaims);
  assert.deepEqual(resolveAreaEvidenceSource(project, b, entry.id), { kind: 'message', messageId, reportId: report.id });
  // Reading a saved report's recording never depends on today's inbox audio.
  project.whatsappMessages = project.whatsappMessages.filter(message => message.id !== messageId);
  assert.equal(getAreaEvidence(project, b).entries.find(entry => entry.reportId === report.id).hasVoiceNote, true);
  assert.equal(getAreaEvidence(project, b).entries.find(entry => entry.reportId === report.id).sourceLabel, 'WhatsApp voice note');
  for (const voiceNote of [undefined, { ...report.voiceNote, projectId: 'OTHER' },
    { ...report.voiceNote, audio: { ...report.voiceNote.audio, asset: 'https://untrusted.invalid/audio.wav' } }]) {
    const changed = { ...project, whatsappMessages: [...project.whatsappMessages, source],
      reports: project.reports.map(saved => saved.id === report.id ? { ...saved, voiceNote } : saved) };
    const frozenEntry = getAreaEvidence(changed, b).entries.find(entry => entry.reportId === report.id);
    assert.equal(frozenEntry.hasVoiceNote, undefined);
    assert.equal(frozenEntry.sourceLabel, 'WhatsApp message');
  }
});

test('clarification replies identify their retained original recording before and after processing', () => {
  let project = fixture();
  const target = getSITShowcaseFeatureTargets(project), messageId = target.unclearVoiceMessageId, b = target.areaIds[1];
  project = updated(saveMessageClarificationRequest(project, messageId, { question: 'Which bracket area and cumulative total?' }, later));
  project = updated(saveMockClarificationReply(project, messageId, {
    text: 'BRACKET-B cantilever brackets are 25% complete in total.', itemId: 'WI-016', areaId: b, completion: 25,
  }, latest));
  const reply = getMessageClarification(project, messageId).reply;
  const original = structuredClone(project);
  let entry = entries(project, b, reply.id)[0];
  assert.equal(entry.text, reply.text);
  assert.equal(entry.hasVoiceNote, true);
  assert.equal(entry.sourceLabel, 'WhatsApp reply · original voice note retained');
  assert.deepEqual(project, original);
  const result = processWhatsAppMessage(project, reply.id);
  assert.equal(result.outcome, 'processed', result.error); project = result.project;
  entry = entries(project, b, reply.id)[0];
  assert.equal(entry.text, reply.text);
  assert.equal(entry.hasVoiceNote, true);
  assert.equal(entry.sourceLabel, 'WhatsApp reply · original voice note retained');
});
