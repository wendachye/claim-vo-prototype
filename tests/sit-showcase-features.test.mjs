import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSITContractDemo, createProvidedContractDemo } from '../src/data/provided-contract-demo.ts';
import { enrichSITShowcaseFeatures, getSITShowcaseFeatureTargets } from '../src/data/sit-showcase-features.ts';
import { getItemAreaAllocation, getItemAreaRollup } from '../src/data/area-allocations.ts';
import { getDrawingMapping, getAreaMatchForMessage, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { getVoiceNoteContext, saveVoiceTranscriptReview, isVoiceNoteAudio } from '../src/data/voice-notes.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { getMessageClarificationEligibility, saveMessageClarificationRequest, saveMockClarificationReply, getMessageClarification } from '../src/data/whatsapp-clarification.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

const now = new Date('2026-10-24T10:00:00Z');
const next = new Date('2026-10-24T10:01:00Z');
const later = new Date('2026-10-24T10:02:00Z');
const fresh = () => createSITContractDemo({ code: 'SIT-PACK', name: 'Original S.I.T.' }, now);
const enriched = () => enrichSITShowcaseFeatures(fresh(), now).project;
const updated = result => { assert.equal(result.outcome, 'updated', result.error); return result.project; };
const protectedFields = project => structuredClone({ contract: project.contract, items: project.items, sourceItems: project.sourceItems,
  baselines: project.baselines, reports: project.reports, voReviews: project.voReviews, claimDrafts: project.claimDrafts,
  claimTracking: project.claimTracking, clarifications: project.messageClarifications, voiceReviews: project.voiceTranscriptReviews,
  matchReviews: project.messageMatchReviews, seed: project.seed });

test('one-time S.I.T. pack appends source-related examples without changing any previous record or financial snapshot', () => {
  const project = fresh(), before = structuredClone(project), result = enrichSITShowcaseFeatures(project, now);
  assert.equal(result.changed, true); assert.equal(result.added, true); assert.deepEqual(project, before);
  const next = result.project;
  assert.deepEqual(protectedFields(next), protectedFields(project));
  assert.deepEqual(next.whatsappMessages.slice(0, project.whatsappMessages.length), project.whatsappMessages);
  assert.equal(next.whatsappMessages.length, project.whatsappMessages.length + 4);
  assert.deepEqual(next.drawingMapping.areas.slice(0, project.drawingMapping.areas.length), project.drawingMapping.areas);
  assert.deepEqual(next.drawingMapping.history.slice(0, project.drawingMapping.history.length), project.drawingMapping.history);
  assert.deepEqual(next.history.slice(1), project.history);
  assert.equal(toClaimCSV(buildClaimPack(next, next.claimDrafts[0].id).pack), toClaimCSV(buildClaimPack(project, project.claimDrafts[0].id).pack));
  const again = enrichSITShowcaseFeatures(next, later); assert.equal(again.changed, false); assert.equal(again.project, next);
  const reload = JSON.parse(JSON.stringify(next)); assert.equal(enrichSITShowcaseFeatures(reload, later).changed, false);
});

test('bracket zones split the unchanged source quantity and remain honestly unplaced with shared alternate names', () => {
  const project = enriched(), targets = getSITShowcaseFeatureTargets(project), allocation = getItemAreaAllocation(project, 'WI-016');
  assert.equal(targets.available, true); assert.equal(targets.areaIds.length, 2); assert.ok(targets.voiceMessageId); assert.ok(targets.matchMessageId);
  assert.equal(allocation.valid, true); assert.equal(allocation.contractQuantity, 180); assert.equal(allocation.allocatedQuantity, 180); assert.equal(allocation.remainingQuantity, 0);
  const areas = getDrawingMapping(project).areas.filter(area => targets.areaIds.includes(area.id));
  for (const area of areas) { assert.equal(area.position, null); assert.deepEqual(area.workItemQuantities, { 'WI-016': 90 }); assert.match(area.name, /demo.*unplaced/); }
  assert.equal(getAreaMatchForMessage(project, { projectId: project.id, area: 'Bracket zone B' }).area.code, 'BRACKET-B');
  assert.equal(getAreaMatchForMessage(project, { projectId: project.id, area: 'Bracket zone' }).status, 'ambiguous');
  assert.equal(getItemAreaRollup(project, 'WI-016').completion, null);
});

test('the two S.I.T. audio scripts are distinct playable local PCM recordings matching their declared duration', () => {
  const project = enriched(), messages = project.whatsappMessages.filter(message => message.audio);
  assert.equal(messages.length, 2); assert.notEqual(messages[0].audio.asset, messages[1].audio.asset);
  for (const message of messages) {
    assert.equal(isVoiceNoteAudio(message.audio), true); assert.match(message.originalTranscript, /Cantilever brackets/);
    const file = readFileSync(new URL(`../public${message.audio.asset}`, import.meta.url));
    assert.equal(file.toString('ascii', 0, 4), 'RIFF'); assert.equal(file.toString('ascii', 8, 12), 'WAVE');
    let offset = 12, byteRate = 0, bytes = 0;
    while (offset + 8 <= file.length) { const type = file.toString('ascii', offset, offset + 4), length = file.readUInt32LE(offset + 4);
      if (type === 'fmt ') byteRate = file.readUInt32LE(offset + 16); if (type === 'data') bytes = length; offset += 8 + length + length % 2; }
    assert.ok(bytes > 1_000); assert.ok(Math.abs(bytes / byteRate - message.audio.durationSeconds) < 0.02);
    assert.equal(isVoiceNoteAudio({ ...message.audio, clarity: message.audio.clarity === 'clear' ? 'unclear' : 'clear' }), false);
  }
});

test('S.I.T. transcript correction and independent A/B verification lead to one weighted contract item and immutable original claim', () => {
  let project = enriched(); const targets = getSITShowcaseFeatureTargets(project), originalClaims = structuredClone(project.claimDrafts);
  const voice = project.whatsappMessages.find(message => message.id === targets.voiceMessageId), originalVoice = structuredClone(voice);
  let context = getVoiceNoteContext(project, voice.id); assert.equal(context.status, 'pending'); assert.equal(context.needsClarification, false);
  assert.equal(processWhatsAppMessage(project, voice.id).outcome, 'invalid');
  project = updated(saveVoiceTranscriptReview(project, voice.id, { transcript: voice.text.replace('itam', 'item'), reason: 'Corrected the simulated transcript spelling.', sourceKey: context.sourceKey }, next));
  let match = getMessageMatchContext(project, voice.id); assert.equal(match.eligible, true, match.issue);
  project = updated(saveMessageMatchReview(project, voice.id, { ...match.fields, reason: '' }, next));
  let processed = processWhatsAppMessage(project, voice.id); assert.equal(processed.outcome, 'processed', processed.error);
  project = updated(verifyProgressReport(processed.project, processed.reportId, 50, '', later));
  const report = project.reports.find(report => report.id === processed.reportId);
  assert.equal(report.areaProgress.allocatedQuantity, 90); assert.equal(report.areaProgress.contractQuantity, 180);
  assert.equal(report.voiceNote.originalTranscript, originalVoice.text); assert.equal(report.message, originalVoice.text);
  assert.equal(getItemAreaRollup(project, 'WI-016').completion, 25);
  match = getMessageMatchContext(project, targets.matchMessageId); assert.equal(match.eligible, true, match.issue);
  const b = getDrawingMapping(project).areas.find(area => area.code === 'BRACKET-B');
  assert.equal(saveMessageMatchReview(project, targets.matchMessageId, { itemId: 'WI-016', areaId: b.id, reason: '' }, next).outcome, 'invalid');
  project = updated(saveMessageMatchReview(project, targets.matchMessageId, { itemId: 'WI-016', areaId: b.id, reason: 'Worker explicitly named bracket zone B.' }, next));
  processed = processWhatsAppMessage(project, targets.matchMessageId); assert.equal(processed.outcome, 'processed', processed.error);
  project = updated(verifyProgressReport(processed.project, processed.reportId, 25, '', later));
  assert.equal(getItemAreaRollup(project, 'WI-016').completion, 37.5);
  const saved = saveClaimDraft(project, '2026-10', { priorConfirmed: true, work: { 'WI-016': { include: true, assessedQuantity: 67.5, previousValue: 0 } }, note: 'Separately assessed simulated D.5 quantities, not automatically priced from progress.' });
  project = updated(saved); assert.deepEqual(project.claimDrafts.slice(0, originalClaims.length), originalClaims);
  const pack = buildClaimPack(project, saved.draft.id).pack;
  assert.equal(pack.totals.currentValue, 6075); assert.match(toClaimCSV(pack), /demo-sit-voice-clear/); assert.match(toClaimCSV(pack), /Corrected the simulated transcript spelling/);
});

test('unclear recording and shared-name update use worker clarification without inventing totals or losing the audio', () => {
  let project = enriched(); const targets = getSITShowcaseFeatureTargets(project), original = structuredClone(project.whatsappMessages.find(message => message.id === targets.unclearVoiceMessageId));
  assert.equal(getVoiceNoteContext(project, original.id).needsClarification, true);
  assert.equal(getMessageMatchContext(project, targets.aliasMessageId).clarificationRequired, true);
  assert.equal(getMessageClarificationEligibility(project, original.id).eligible, true);
  project = updated(saveMessageClarificationRequest(project, original.id, { question: 'Which area and what is the cumulative total?' }, next));
  const b = getDrawingMapping(project).areas.find(area => area.code === 'BRACKET-B');
  project = updated(saveMockClarificationReply(project, original.id, { text: 'BRACKET-B cantilever brackets WI-016 are 25% complete in total. Simulated reply.', itemId: 'WI-016', areaId: b.id, completion: 25 }, later));
  const thread = getMessageClarification(project, original.id);
  assert.equal(thread.reply.originalVoiceNote.audio.asset, original.audio.asset); assert.equal(thread.reply.originalVoiceNote.originalTranscript, original.text);
  assert.equal(project.items.find(item => item.id === 'WI-016').reported, 0); assert.equal(thread.stage, 'reply-received');
  const processed = processWhatsAppMessage(project, thread.reply.id); assert.equal(processed.outcome, 'processed');
  assert.equal(processed.project.reports.at(-1).voiceNote.originalTranscript, original.text);
});

test('changed source scope, existing work, custom drawing and manual D.5 links are never retrofitted with quantities', () => {
  for (const edit of [
    project => project.items.find(item => item.id === 'WI-016').quantity = 200,
    project => project.items.find(item => item.id === 'WI-016').reported = 10,
    project => project.sourceItems.find(item => item.id === 'WI-016').rate = 95,
    project => project.reports.push({ id: 'USER-REPORT', itemId: 'WI-016', status: 'pending', completion: 10 }),
    project => project.whatsappMessages.push({ ...project.whatsappMessages[0], id: 'USER-MESSAGE', itemId: 'WI-016' }),
    project => project.drawingMapping.drawing.inputKind = 'upload',
    project => project.drawingMapping.areas[0].workItemIds.push('WI-016'),
  ]) {
    const project = fresh(); edit(project); const before = structuredClone(project), result = enrichSITShowcaseFeatures(project, now);
    assert.equal(result.added, false); assert.ok(result.reason); assert.equal(result.project.sitShowcaseFeatures.status, 'not-applied');
    const { sitShowcaseFeatures, ...actual } = result.project; assert.deepEqual(actual, before); assert.deepEqual(project, before);
    assert.equal(enrichSITShowcaseFeatures(result.project, later).changed, false);
  }
  const foreign = createProvidedContractDemo({ code: 'FICTIONAL', name: 'Fictional sample' }, now); assert.equal(enrichSITShowcaseFeatures(foreign, now).project, foreign);
});

test('repeat loads retain processed evidence, saved claims, renamed areas and deleted examples without resurrection', () => {
  let project = enriched(); const targets = getSITShowcaseFeatureTargets(project);
  const area = getDrawingMapping(project).areas.find(area => area.id === targets.areaIds[0]);
  project = updated(saveAreaMapping(project, { ...area, areaId: area.id, name: 'My edited bracket work face', aliases: ['My own name'] }, later));
  project.whatsappMessages = project.whatsappMessages.filter(message => message.id !== targets.voiceMessageId);
  const before = structuredClone(project), result = enrichSITShowcaseFeatures(project, later);
  assert.equal(result.project, project); assert.equal(result.changed, false); assert.deepEqual(result.project, before);
  assert.equal(getSITShowcaseFeatureTargets(project).voiceMessageId, null);
});

test('S.I.T. voice grammar rejects unsupported source, item, area, uncertainty and invented clear totals', () => {
  for (const transcript of [
    'Cantilever brackets WI-016 BRACKET-A is another 50% complete in total.',
    'Cantilever brackets WI-016 BRACKET-A and BRACKET-B is 50% complete in total.',
    'Cantilever brackets WI-001 BRACKET-A is 50% complete in total.',
    'Cantilever brackets WI-016 is 50% complete in total.',
    'Cantilever brackets WI-016 BRACKET-C is 50% complete in total.',
    'Cantilever brackets WI-016 BRACKET-A is 120% complete in total.',
    'Cantilever brackets WI-016 BRACKET-A is maybe 50% complete in total.',
  ]) {
    const project = enriched(), id = getSITShowcaseFeatureTargets(project).voiceMessageId;
    const reviewed = saveVoiceTranscriptReview(project, id, { transcript, reason: 'Simulated unclear transcription.', sourceKey: getVoiceNoteContext(project, id).sourceKey }, next);
    assert.equal(reviewed.outcome, 'updated'); assert.equal(getVoiceNoteContext(reviewed.project, id).needsClarification, true, transcript);
  }
  const project = enriched(), id = getSITShowcaseFeatureTargets(project).unclearVoiceMessageId;
  const reviewed = saveVoiceTranscriptReview(project, id, { transcript: 'Cantilever brackets WI-016 BRACKET-A is 50% complete in total.', reason: 'Tried to invent a missing total.', sourceKey: getVoiceNoteContext(project, id).sourceKey }, next);
  assert.equal(getVoiceNoteContext(reviewed.project, id).needsClarification, true);
});
