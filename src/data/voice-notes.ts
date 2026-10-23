import type { DateInput, MessageMatchSuggestion, Project, VoiceNoteAudio, VoiceNoteEvidence, VoiceTranscriptReview, WhatsAppMessage } from '../types/domain';
import { getDrawingMapping } from './drawing-mapping.ts';
import { getAreaAllocationSnapshot, getItemAreaAllocation } from './area-allocations.ts';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(value: T): T => structuredClone(value);
const actor = 'Alex Tan · Demo reviewer';
const dateFor = (value: DateInput) => { try { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; } catch { return null; } };
const validText = (value: unknown, limit: number) => typeof value === 'string' && Boolean(text(value)) && value === text(value) && value.length <= limit;

/** Only bundled recordings are playable demo sources. Stored URLs are never trusted. */
export function isVoiceNoteAudio(value: unknown): value is VoiceNoteAudio {
  return record(value) && value.version === 1 && value.demo === true && value.mimeType === 'audio/wav'
    && typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0 && value.durationSeconds <= 120
    && (value.asset === '/assets/demo-voice-clear.wav' && value.clarity === 'clear'
      || value.asset === '/assets/demo-voice-unclear.wav' && value.clarity === 'unclear'
      || value.asset === '/assets/demo-sit-voice-clear.wav' && value.clarity === 'clear'
      || value.asset === '/assets/demo-sit-voice-unclear.wav' && value.clarity === 'unclear');
}

export function isVoiceTranscriptReviewSnapshot(value: unknown): value is VoiceTranscriptReview {
  return record(value) && value.version === 1 && ['id', 'projectId', 'messageId', 'sourceKey', 'sourceFingerprint', 'originalTranscript', 'transcript', 'reviewedBy', 'reviewedAt'].every(key => validText(value[key], key === 'sourceKey' || key === 'sourceFingerprint' ? 100_000 : 4_000))
    && (value.previousReviewId === null || validText(value.previousReviewId, 1_000)) && isVoiceNoteAudio(value.audio)
    && typeof value.reason === 'string' && value.reason === text(value.reason) && value.reason.length <= 1_000
    && Boolean(dateFor(value.reviewedAt as string)) && (value.transcript === value.originalTranscript || Boolean(text(value.reason)));
}

/** Frozen claim/report evidence is checked structurally, never against today's map or transcript. */
export function isVoiceNoteEvidenceSnapshot(value: unknown): value is VoiceNoteEvidence {
  if (!record(value) || value.version !== 1 || !isVoiceNoteAudio(value.audio)
    || !['projectId', 'messageId', 'originalTranscript', 'sourceKey'].every(key => validText(value[key], key === 'sourceKey' ? 100_000 : 4_000))
    || typeof value.reason !== 'string' || value.reason !== text(value.reason) || value.reason.length > 1_000) return false;
  if (value.reviewId === null) return value.reviewedTranscript === null && value.reviewedBy === null && value.reviewedAt === null && value.reason === '';
  return ['reviewId', 'reviewedTranscript', 'reviewedBy', 'reviewedAt'].every(key => validText(value[key], 4_000))
    && Boolean(dateFor(value.reviewedAt as string)) && (value.reviewedTranscript === value.originalTranscript || Boolean(text(value.reason)));
}

function fingerprint(project: Project, source: WhatsAppMessage) {
  return JSON.stringify({ version: 1, projectId: project.id, projectCode: project.code,
    source: { id: source.id, projectId: source.projectId, projectCode: source.projectCode, kind: source.kind,
      text: source.text, originalTranscript: source.originalTranscript, audio: source.audio, sender: source.sender,
      senderRole: source.senderRole, date: source.date, itemId: source.itemId, area: source.area, areaId: source.areaId,
      areaMapping: source.areaMapping, areaProgress: source.areaProgress, location: source.location,
      completion: source.completion, completionBasis: source.completionBasis, photo: source.photo, photoAlt: source.photoAlt,
      demo: source.demo, origin: source.origin, channel: source.channel, matchSuggestion: source.matchSuggestion } });
}

const keyFor = (sourceFingerprint: string, previousReviewId: string | null) => JSON.stringify({ version: 1, sourceFingerprint, previousReviewId });

const wordNumbers: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, 'one hundred': 100,
};
for (const [tens, value] of Object.entries({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 })) {
  for (const [unit, digit] of Object.entries({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 })) wordNumbers[`${tens} ${unit}`] = value + digit;
}
const wordPattern = Object.keys(wordNumbers).sort((a, b) => b.length - a.length).join('|');

/** Deliberately small mock grammar; unsupported speech always takes the existing clarification path. */
function interpretedMessage(project: Project, source: WhatsAppMessage, transcript: string, sourceKey: string): { message: WhatsAppMessage | null; issue?: string } {
  const unclear = 'Ask the worker to clarify the work item, one site area and its cumulative completion.';
  if (source.audio?.clarity === 'unclear') return { message: null, issue: 'This demo recording is unclear. Ask the worker for a separate clarification reply.' };
  if (!/\b(?:in total|total|cumulative|overall)\b/i.test(transcript)
    || /\b(?:additional|another|extra|incremental|variation|maybe|around|about|inaudible|unclear|either|or|not)\b|\bVO\b|\?|\[|\+\s*\d/i.test(transcript)) return { message: null, issue: unclear };
  let numericText = transcript.toLowerCase().replace(/\bper cent\b/g, 'percent').replace(/([a-z])-([a-z])/g, '$1 $2');
  numericText = numericText.replace(new RegExp(`\\b(${wordPattern})\\s*(?:percent|%)`, 'g'), (_, word: string) => `${wordNumbers[word]}%`);
  const percentages = [...numericText.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(?:%|percent\b)/g)].map(match => Number(match[1]));
  if (!percentages.length || percentages.some(value => value !== percentages[0] || !Number.isFinite(value) || value < 0 || value > 100)) return { message: null, issue: unclear };
  if (!/\bis\s+[+-]?\d+(?:\.\d+)?\s*(?:%|percent\b)/i.test(numericText)) return { message: null, issue: unclear };
  const completion = percentages[0];
  // This source-related script requires an explicit current item and area code.
  // It does not extend the fictional cladding grammar to arbitrary stored audio.
  if (source.audio?.asset === '/assets/demo-sit-voice-clear.wav') {
    const explicitItems = [...new Set((transcript.match(/\bWI-\d+\b/gi) || []).map(value => value.toUpperCase()))];
    const explicitCodes = [...new Set((transcript.match(/\bBRACKET-[A-Z0-9_-]+\b/gi) || []).map(value => value.toUpperCase()))];
    const item = project.items.find(entry => entry.id === 'WI-016');
    if (project.contract.sourceKind !== 'provided' || project.contract.sourceProfile !== 'sit-loa-2021'
      || explicitItems.length !== 1 || explicitItems[0] !== 'WI-016' || explicitCodes.length !== 1
      || !/\bcantilever\s+brackets?\b/i.test(transcript) || !item || item.pricingType !== 'measured'
      || item.description !== 'Installation of cantilever wall bracket' || item.unit !== 'pc'
      || item.projectId && item.projectId !== project.id || item.projectCode && item.projectCode !== project.code) {
      return { message: null, issue: 'The mock S.I.T. transcript needs D.5 cantilever brackets, WI-016 and one saved BRACKET area code. Ask for clarification.' };
    }
    const areas = getDrawingMapping(project).areas.filter(area => area.code.toUpperCase() === explicitCodes[0] && area.workItemIds.includes(item.id));
    const area = areas.length === 1 ? areas[0] : null;
    const allocation = getItemAreaAllocation(project, item.id);
    if (!area || !allocation.valid || allocation.split && !getAreaAllocationSnapshot(project, area.id, item.id)) {
      return { message: null, issue: 'Review the saved S.I.T. bracket area and quantity allocation before adding progress.' };
    }
    const suggestion: MessageMatchSuggestion = { version: 1, origin: 'mock', baselineVersion: project.version,
      fields: { itemId: item.id, areaId: area.id, completion }, sourceExcerpt: transcript,
      reason: 'Deterministic mock transcript: explicit D.5 bracket item, saved area code and cumulative total require a match review.' };
    return { message: { ...clone(source), text: transcript, kind: 'progress', itemId: item.id, area: area.code,
      areaId: undefined, areaMapping: undefined, areaProgress: undefined, completion, completionBasis: 'cumulative',
      matchSuggestion: suggestion, voiceSourceKey: sourceKey } };
  }
  if (!/\bcladding\b/i.test(transcript)) return { message: null, issue: 'The mock transcript does not identify a supported contract item. Ask for clarification.' };
  const items = project.items.filter(item => item.pricingType === 'measured' && /\bcladding\b/i.test(item.description)
    && (!item.projectId || item.projectId === project.id) && (!item.projectCode || item.projectCode === project.code));
  const explicitItems = transcript.match(/\bWI-\d+\b/gi) || [];
  if (items.length !== 1 || explicitItems.some(id => id.toUpperCase() !== items[0].id.toUpperCase())) return { message: null, issue: unclear };
  const directions = ['WEST', 'EAST'].filter(direction => new RegExp(`\\b${direction}\\b`, 'i').test(transcript));
  const areas = getDrawingMapping(project).areas.filter(area => directions.length === 1 && area.code.toUpperCase() === directions[0] && area.workItemIds.includes(items[0].id));
  if (areas.length !== 1) return { message: null, issue: 'The mock transcript needs one clear WEST or EAST area. Ask for clarification.' };
  const area = areas[0], item = items[0], allocation = getItemAreaAllocation(project, item.id);
  if (!allocation.valid || allocation.split && !getAreaAllocationSnapshot(project, area.id, item.id)) return { message: null, issue: 'Review the saved area quantity allocation before adding this progress.' };
  const suggestion: MessageMatchSuggestion = { version: 1, origin: 'mock', baselineVersion: project.version,
    fields: { itemId: item.id, areaId: area.id, completion }, sourceExcerpt: transcript,
    reason: 'Deterministic mock transcript: the cladding item, WEST/EAST area and cumulative percentage require a match review.' };
  return { message: { ...clone(source), text: transcript, kind: 'progress', itemId: item.id, area: area.code,
    areaId: undefined, areaMapping: undefined, areaProgress: undefined, completion, completionBasis: 'cumulative',
    matchSuggestion: suggestion, voiceSourceKey: sourceKey } };
}

export interface VoiceNoteContext {
  source: WhatsAppMessage | null; audio: VoiceNoteAudio | null; originalTranscript: string; reviewedTranscript: string;
  review: VoiceTranscriptReview | null; reviews: VoiceTranscriptReview[];
  status: 'pending' | 'reviewed' | 'clarification' | 'processed' | 'unavailable';
  readOnly: boolean; eligible: boolean; needsClarification: boolean; effectiveMessage: WhatsAppMessage | null;
  sourceKey: string; issue?: string; evidence: VoiceNoteEvidence | null;
}

export function getVoiceNoteContext(project: Project, messageId: string): VoiceNoteContext {
  const empty: VoiceNoteContext = { source: null, audio: null, originalTranscript: '', reviewedTranscript: '', review: null, reviews: [],
    status: 'unavailable', readOnly: true, eligible: false, needsClarification: false, effectiveMessage: null, sourceKey: '', evidence: null };
  const messages = Array.isArray(project?.whatsappMessages) ? project.whatsappMessages.filter(source => record(source) && source.id === messageId) : [];
  if (messages.length !== 1) return { ...empty, issue: 'Choose one voice note from the selected project.' };
  const source = messages[0];
  if (!Object.hasOwn(source, 'audio')) return { ...empty, source };
  const base = { ...empty, source, originalTranscript: text(source.originalTranscript), reviewedTranscript: text(source.originalTranscript) };
  if (source.projectId !== project.id || source.projectCode !== project.code || !isVoiceNoteAudio(source.audio)
    || !validText(source.originalTranscript, 4_000) || source.originalTranscript !== source.text
    || !text(source.sender) || typeof source.date !== 'string' || !dateFor(source.date) || source.demo !== true || !['simulated', 'mock'].includes(String(source.origin))
    || source.vo || !['progress', 'clarification'].includes(source.kind) || source.replyToMessageId || source.clarificationThreadId) {
    return { ...base, needsClarification: true, issue: 'The original demo recording or transcript is unavailable. Ask for clarification.' };
  }
  const audio = clone(source.audio), sourceFingerprint = fingerprint(project, source);
  const rawHistory = Array.isArray(project.voiceTranscriptReviews) ? project.voiceTranscriptReviews.filter(review => record(review) && review.messageId === source.id) : [];
  const reviews: VoiceTranscriptReview[] = [];
  let historyValid = project.voiceTranscriptReviews == null || Array.isArray(project.voiceTranscriptReviews);
  for (const entry of rawHistory) {
    if (!isVoiceTranscriptReviewSnapshot(entry) || entry.projectId !== project.id || reviews.some(review => review.id === entry.id)
      || entry.previousReviewId !== (reviews.at(-1)?.id || null) || entry.sourceKey !== keyFor(entry.sourceFingerprint, entry.previousReviewId)
      || !same(entry.audio, audio) || entry.originalTranscript !== source.originalTranscript || Date.parse(entry.reviewedAt) < Date.parse(source.date)
      || reviews.length > 0 && Date.parse(entry.reviewedAt) < Date.parse(reviews.at(-1)!.reviewedAt)) { historyValid = false; break; }
    reviews.push(clone(entry));
  }
  const latest = reviews.at(-1) || null;
  const review = historyValid && latest?.sourceFingerprint === sourceFingerprint ? latest : null;
  const sourceKey = keyFor(sourceFingerprint, latest?.id || null);
  const readOnly = !historyValid || source.status !== 'new' || Boolean(source.processedAt || source.reportId || source.clarificationRequestedAt)
    || (project.reports || []).some(report => report.sourceMessageId === source.id)
    || (project.messageClarifications || []).some(thread => thread.sourceMessageId === source.id);
  const reviewedTranscript = review?.transcript || source.originalTranscript;
  const interpreted = interpretedMessage(project, source, reviewedTranscript, sourceKey);
  const evidence: VoiceNoteEvidence = { version: 1, projectId: project.id, messageId: source.id,
    audio, originalTranscript: source.originalTranscript, reviewedTranscript: review?.transcript || null, reason: review?.reason || '',
    reviewedBy: review?.reviewedBy || null, reviewedAt: review?.reviewedAt || null, reviewId: review?.id || null, sourceKey: review?.sourceKey || sourceKey };
  return { ...base, audio, originalTranscript: source.originalTranscript, reviewedTranscript, review, reviews, sourceKey,
    eligible: true, readOnly, needsClarification: !interpreted.message, effectiveMessage: review ? interpreted.message : null, evidence,
    status: readOnly && historyValid ? ['clarification', 'replied'].includes(source.status) ? 'clarification' : 'processed'
      : !historyValid ? 'unavailable' : !interpreted.message ? 'clarification' : review ? 'reviewed' : 'pending',
    ...(!historyValid ? { issue: 'The saved transcript review history is unavailable. Reopen the original message.' }
      : readOnly ? { issue: 'This voice note already has a processing or clarification record. Its transcript review is retained as evidence.' }
        : interpreted.issue ? { issue: interpreted.issue } : !review ? { issue: 'Review the mock transcript before reviewing its work-item and area match.' } : {}) };
}

export interface VoiceTranscriptMutation { project: Project; outcome: 'updated' | 'unchanged' | 'invalid'; error?: string; review?: VoiceTranscriptReview }

export function saveVoiceTranscriptReview(project: Project, messageId: string, values: unknown, now: DateInput = new Date()): VoiceTranscriptMutation {
  const invalid = (error: string): VoiceTranscriptMutation => ({ project, outcome: 'invalid', error });
  const context = getVoiceNoteContext(project, messageId);
  if (!context.eligible || context.readOnly || !context.source || !context.audio) return invalid(context.issue || 'This voice note is unavailable for transcript review.');
  if (!record(values) || !validText(values.transcript, 4_000) || typeof values.reason !== 'string' || values.reason.length > 1_000
    || values.sourceKey !== context.sourceKey) return invalid('Reopen the voice note and enter a transcript and a reason up to 1,000 characters.');
  const transcript = text(values.transcript), reason = text(values.reason);
  if ((transcript !== context.originalTranscript || context.review && transcript !== context.reviewedTranscript) && !reason) return invalid('Add a short reason for correcting the mock transcript.');
  const date = dateFor(now);
  if (!date || Date.parse(date) < Date.parse(context.source.date) || context.reviews.length > 0 && Date.parse(date) < Date.parse(context.reviews.at(-1)!.reviewedAt)) return invalid('Choose a valid review date on or after the original voice note and its previous review.');
  if (context.review?.transcript === transcript && context.review.reason === reason) return { project, outcome: 'unchanged', review: context.review };
  const history = Array.isArray(project.voiceTranscriptReviews) ? project.voiceTranscriptReviews : [];
  const base = `VOICE-${project.id}-${messageId}-${Date.parse(date)}`;
  let id = base, sequence = 1;
  while (history.some(review => review?.id === id)) id = `${base}-${sequence++}`;
  const review: VoiceTranscriptReview = { version: 1, id, projectId: project.id, messageId, sourceKey: context.sourceKey,
    sourceFingerprint: fingerprint(project, context.source), previousReviewId: context.reviews.at(-1)?.id || null,
    audio: clone(context.audio), originalTranscript: context.originalTranscript, transcript, reason, reviewedBy: actor, reviewedAt: date };
  return { outcome: 'updated', review, project: { ...project, voiceTranscriptReviews: [...history, review],
    history: [{ id, action: transcript === context.reviewedTranscript ? 'Voice transcript reviewed' : 'Voice transcript corrected',
      detail: `${messageId}${reason ? ` · ${reason}` : ''}`, date, actor }, ...(Array.isArray(project.history) ? project.history : [])] } };
}

export function getVoiceNoteEvidence(project: Project, messageId: string): VoiceNoteEvidence | null {
  const evidence = getVoiceNoteContext(project, messageId).evidence;
  return evidence ? clone(evidence) : null;
}
