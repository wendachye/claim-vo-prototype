import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { seedWorkspace } from '../src/data/projects.ts';
import { getVoiceNoteContext, getVoiceNoteEvidence, isVoiceNoteAudio, isVoiceNoteEvidenceSnapshot, isVoiceTranscriptReviewSnapshot, saveVoiceTranscriptReview } from '../src/data/voice-notes.ts';
import { getDrawingMapping, saveAreaMapping } from '../src/data/drawing-mapping.ts';

const now = new Date('2026-10-24T10:00:00Z');
const clearAudio = { version: 1, asset: '/assets/demo-voice-clear.wav', mimeType: 'audio/wav', durationSeconds: 7, demo: true, clarity: 'clear' };
const unclearAudio = { ...clearAudio, asset: '/assets/demo-voice-unclear.wav', clarity: 'unclear' };
const original = 'Block A west wail cladding is fifty percent complete in total.';
const corrected = 'Block A west wall cladding is fifty percent complete in total.';

function fixture() {
  const project = createMessageMatchDemo(seedWorkspace(), now).project;
  const first = project.whatsappMessages[0];
  project.whatsappMessages = [{ ...first, id: `${project.code}-VOICE-1`, audio: clearAudio, originalTranscript: original, text: original }];
  return project;
}
const voiceId = project => project.whatsappMessages[0].id;
const context = project => getVoiceNoteContext(project, voiceId(project));
const save = (project, transcript = corrected, reason = 'Corrected wall spelling.') => saveVoiceTranscriptReview(project, voiceId(project), { transcript, reason, sourceKey: context(project).sourceKey }, now);
const protectedFields = project => structuredClone({ messages: project.whatsappMessages, items: project.items, reports: project.reports, claimDrafts: project.claimDrafts, claimTracking: project.claimTracking, contract: project.contract, baselines: project.baselines, mapping: project.drawingMapping, sourceItems: project.sourceItems, voReviews: project.voReviews, matches: project.messageMatchReviews, clarifications: project.messageClarifications });

test('voice transcript review is explicit and leaves original audio, text, progress and frozen claims unchanged', () => {
  const project = fixture(), before = structuredClone(project), initial = context(project);
  assert.equal(initial.eligible, true); assert.equal(initial.readOnly, false); assert.equal(initial.status, 'pending');
  assert.equal(initial.review, null); assert.equal(initial.effectiveMessage, null);
  assert.equal(initial.originalTranscript, original); assert.equal(initial.evidence.reviewedTranscript, null);
  assert.equal(isVoiceNoteEvidenceSnapshot(initial.evidence), true);
  const result = save(project); assert.equal(result.outcome, 'updated', result.error);
  assert.deepEqual(protectedFields(result.project), protectedFields(project)); assert.deepEqual(project, before);
  const reviewed = context(result.project);
  assert.equal(reviewed.reviewedTranscript, corrected); assert.equal(reviewed.status, 'reviewed'); assert.equal(reviewed.effectiveMessage.text, corrected);
  assert.equal(reviewed.effectiveMessage.completion, 50); assert.equal(reviewed.effectiveMessage.area, 'WEST');
  assert.equal(reviewed.effectiveMessage.matchSuggestion.fields.itemId, 'WI-001');
  assert.equal(reviewed.evidence.originalTranscript, original); assert.equal(reviewed.evidence.reviewedTranscript, corrected);
  assert.equal(isVoiceTranscriptReviewSnapshot(result.review), true); assert.equal(isVoiceNoteEvidenceSnapshot(reviewed.evidence), true);
});

test('an unchanged first transcript can be confirmed without a reason; corrections and restoration require reasons', () => {
  let project = fixture();
  const confirmed = save(project, original, ''); assert.equal(confirmed.outcome, 'updated');
  assert.equal(save(confirmed.project, original, '').outcome, 'unchanged');
  assert.equal(save(confirmed.project, corrected, '').outcome, 'invalid');
  project = save(confirmed.project).project;
  assert.equal(save(project, original, '').outcome, 'invalid');
  const restored = save(project, original, 'Restored the exact original transcription.');
  assert.equal(restored.outcome, 'updated'); assert.equal(restored.project.voiceTranscriptReviews.length, 3);
  assert.equal(restored.project.voiceTranscriptReviews.at(-1).previousReviewId, project.voiceTranscriptReviews.at(-1).id);
});

test('review history appends immutable entries and the same timestamp receives distinct IDs', () => {
  const first = save(fixture()), frozen = structuredClone(first.review);
  const second = save(first.project, 'Block A east wall cladding is fifteen percent complete in total.', 'Heard EAST and fifteen.');
  assert.equal(second.outcome, 'updated'); assert.notEqual(first.review.id, second.review.id);
  assert.deepEqual(second.project.voiceTranscriptReviews[0], frozen);
  const current = context(second.project); assert.equal(current.effectiveMessage.completion, 15); assert.equal(current.effectiveMessage.area, 'EAST');
  assert.notEqual(context(first.project).sourceKey, current.sourceKey);
  assert.equal(current.effectiveMessage.voiceSourceKey, current.sourceKey);
});

test('explicit 0 and 100 are supported without converting missing completion into zero', () => {
  for (const [value, expected] of [['0%', 0], ['zero percent', 0], ['100%', 100], ['one hundred percent', 100], ['fifteen percent', 15], ['50 percent', 50], ['fifty percent', 50], ['twenty five percent', 25], ['ninety-nine percent', 99]]) {
    const result = save(fixture(), `Block A west wall cladding is ${value} complete in total.`, `Heard ${value}.`);
    assert.equal(result.outcome, 'updated'); assert.equal(context(result.project).effectiveMessage.completion, expected, value);
  }
  const absent = save(fixture(), 'Block A west wall cladding is complete in total.', 'No percentage heard.');
  assert.equal(absent.outcome, 'updated'); assert.equal(context(absent.project).effectiveMessage, null); assert.equal(context(absent.project).needsClarification, true);
});

test('unsupported, uncertain, conflicting, incremental and extra-work transcripts require clarification rather than retained percentages', () => {
  for (const transcript of [
    'Block A west wall cladding is 50% done today.',
    'Block A west wall cladding is another 50% complete in total.',
    'Block A west wall cladding is 50% and 15% complete in total.',
    'Block A west wall cladding is -1% complete in total.',
    'Block A west wall cladding is 101% complete in total.',
    'Block A west wall cladding is one hundred and fifty percent complete in total.',
    'Block A west wall cladding is one hundred twenty five percent complete in total.',
    'Block A west wall cladding is maybe 50% complete in total.',
    'Block A west or east wall cladding is 50% complete in total.',
    'Block A south wall cladding is 50% complete in total.',
    'Block A west wall roofing is 50% complete in total.',
    'Block A west wall cladding WI-002 is 50% complete in total.',
    'Block A west wall cladding is 50% complete in total. Extra access requested.',
  ]) {
    const result = save(fixture(), transcript, 'Reviewed an unclear transcription.');
    assert.equal(result.outcome, 'updated', transcript);
    const current = context(result.project); assert.equal(current.effectiveMessage, null, transcript); assert.equal(current.needsClarification, true, transcript);
    assert.equal(current.evidence.reviewedTranscript, transcript);
  }
});

test('intrinsically unclear audio cannot be made eligible by inventing a clear transcript', () => {
  const project = fixture(); project.whatsappMessages[0] = { ...project.whatsappMessages[0], audio: unclearAudio, kind: 'clarification', completion: null, completionBasis: 'incremental', text: '[Inaudible] extra platform, maybe half?', originalTranscript: '[Inaudible] extra platform, maybe half?' };
  assert.equal(context(project).needsClarification, true); assert.equal(isVoiceNoteEvidenceSnapshot(context(project).evidence), true);
  const result = save(project, corrected, 'Tried to clarify the words.'); assert.equal(result.outcome, 'updated');
  assert.equal(context(result.project).needsClarification, true); assert.equal(context(result.project).effectiveMessage, null);
});

test('stale transcript forms are rejected after another review or source edit', () => {
  const project = fixture(), sourceKey = context(project).sourceKey;
  const values = { transcript: corrected, reason: 'Correct spelling.', sourceKey };
  const reviewed = save(project).project;
  assert.equal(saveVoiceTranscriptReview(reviewed, voiceId(project), values, now).outcome, 'invalid');
  for (const change of [p => p.whatsappMessages[0].photo = '/assets/other.jpg', p => p.whatsappMessages[0].audio.durationSeconds += 1]) {
    const changed = structuredClone(project); change(changed);
    const result = saveVoiceTranscriptReview(changed, voiceId(project), values, now); assert.equal(result.outcome, 'invalid'); assert.equal(result.project, changed);
  }
});

test('map geometry and baseline revisions preserve transcript review while regenerating the current match suggestion', () => {
  const reviewed = save(fixture()).project, evidence = getVoiceNoteEvidence(reviewed, voiceId(reviewed)), before = structuredClone(evidence);
  const area = getDrawingMapping(reviewed).areas[0];
  const moved = saveAreaMapping(reviewed, { ...area, areaId: area.id, name: 'Renamed west wall' }, new Date(now.getTime() + 1_000)).project;
  assert.equal(context(moved).review.id, context(reviewed).review.id); assert.equal(context(moved).readOnly, false);
  assert.equal(context(moved).sourceKey, context(reviewed).sourceKey);
  const baseline = { ...moved, version: moved.version + 1 };
  assert.equal(context(baseline).review.id, context(reviewed).review.id);
  assert.equal(context(baseline).effectiveMessage.matchSuggestion.baselineVersion, baseline.version);
  assert.deepEqual(evidence, before);
});

test('processing, report creation, requests and reply linkage make transcript reviews read-only', () => {
  const reviewed = save(fixture()).project;
  for (const change of [
    p => p.whatsappMessages[0].status = 'processed',
    p => p.whatsappMessages[0].processedAt = now.toISOString(),
    p => p.whatsappMessages[0].reportId = 'REPORT-1',
    p => p.whatsappMessages[0].status = 'clarification',
    p => p.whatsappMessages[0].clarificationRequestedAt = now.toISOString(),
    p => p.reports.push({ id: 'REPORT-1', sourceMessageId: voiceId(p), status: 'pending' }),
    p => p.messageClarifications.push({ sourceMessageId: voiceId(p) }),
  ]) {
    const project = structuredClone(reviewed); change(project); const before = structuredClone(project);
    assert.equal(context(project).readOnly, true);
    assert.equal(save(project).outcome, 'invalid'); assert.deepEqual(project, before);
  }
});

test('duplicate, foreign and malformed source records never expose a playable recording', () => {
  for (const change of [
    p => p.whatsappMessages.push({ ...p.whatsappMessages[0] }),
    p => p.whatsappMessages[0].projectId = 'OTHER',
    p => p.whatsappMessages[0].projectCode = 'OTHER',
    p => p.whatsappMessages[0].text = 'Rewritten original',
    p => p.whatsappMessages[0].audio.asset = 'https://example.com/recording.wav',
    p => p.whatsappMessages[0].audio.clarity = 'unclear',
    p => p.whatsappMessages[0].date = null,
    p => p.whatsappMessages[0].replyToMessageId = 'OTHER',
  ]) {
    const project = structuredClone(fixture()); change(project);
    const current = context(project); assert.equal(current.eligible, false); assert.equal(current.audio, null); assert.equal(current.effectiveMessage, null);
    assert.equal(save(project).outcome, 'invalid');
  }
});

test('invalid latest transcript history never resurrects an earlier review', () => {
  let project = save(fixture()).project; project = save(project, 'Block A east wall cladding is 15% complete in total.', 'Heard EAST.').project;
  for (const change of [
    p => p.voiceTranscriptReviews.at(-1).reason = '',
    p => p.voiceTranscriptReviews.at(-1).projectId = 'OTHER',
    p => p.voiceTranscriptReviews.at(-1).sourceKey = 'stale',
    p => p.voiceTranscriptReviews.at(-1).previousReviewId = null,
    p => p.voiceTranscriptReviews.at(-1).reviewedAt = 'not-a-date',
    p => p.voiceTranscriptReviews.at(-1).id = p.voiceTranscriptReviews[0].id,
    p => p.voiceTranscriptReviews = {},
  ]) {
    const broken = structuredClone(project); change(broken);
    assert.equal(context(broken).review, null); assert.equal(context(broken).readOnly, true); assert.equal(context(broken).effectiveMessage, null);
    assert.equal(save(broken).outcome, 'invalid');
  }
});

test('blank, oversized, stale, malformed and backdated review values are rejected without mutation', () => {
  const project = fixture(), sourceKey = context(project).sourceKey, valid = { transcript: corrected, reason: 'Corrected spelling.', sourceKey };
  for (const values of [null, {}, { ...valid, transcript: '' }, { ...valid, transcript: 'x'.repeat(4_001) }, { ...valid, reason: 'x'.repeat(1_001) }, { ...valid, reason: 42 }, { ...valid, sourceKey: 'stale' }, { ...valid, transcript: ` ${corrected}` }]) {
    const result = saveVoiceTranscriptReview(project, voiceId(project), values, now); assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project);
  }
  for (const date of ['not-a-date', '2026-10-01T10:00:00Z']) assert.equal(saveVoiceTranscriptReview(project, voiceId(project), valid, date).outcome, 'invalid');
});

test('a returned evidence snapshot is detached from reviews and saved evidence survives future transcript edits', () => {
  const reviewed = save(fixture()).project, evidence = getVoiceNoteEvidence(reviewed, voiceId(reviewed));
  reviewed.claimDrafts = [{ id: 'SAVED', snapshot: { voiceNote: structuredClone(evidence) } }];
  const before = structuredClone(reviewed.claimDrafts);
  const changed = save(reviewed, 'Block A east wall cladding is 15% complete in total.', 'Heard east and fifteen.');
  assert.equal(changed.outcome, 'updated'); assert.deepEqual(changed.project.claimDrafts, before);
  evidence.reviewedTranscript = 'Only changed in detached object';
  assert.equal(context(reviewed).reviewedTranscript, corrected); assert.deepEqual(reviewed.claimDrafts, before);
});

test('frozen audio/evidence validators reject arbitrary source URLs and incomplete review metadata', () => {
  assert.equal(isVoiceNoteAudio(clearAudio), true); assert.equal(isVoiceNoteAudio(unclearAudio), true);
  for (const invalid of [{ ...clearAudio, asset: '//example.com/audio.wav' }, { ...clearAudio, mimeType: 'audio/mpeg' }, { ...clearAudio, durationSeconds: 0 }, { ...clearAudio, durationSeconds: Infinity }, { ...clearAudio, clarity: 'unclear' }, { ...clearAudio, demo: false }]) assert.equal(isVoiceNoteAudio(invalid), false);
  const evidence = getVoiceNoteEvidence(save(fixture()).project, voiceId(fixture()));
  for (const invalid of [{ ...evidence, reviewedAt: null }, { ...evidence, reason: '' }, { ...evidence, reviewId: null }, { ...evidence, sourceKey: '' }]) assert.equal(isVoiceNoteEvidenceSnapshot(invalid), false);
});
