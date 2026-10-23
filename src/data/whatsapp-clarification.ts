import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput, MessageClarification } from '../types/domain';
// A clarification keeps the worker's original evidence and adds one separate
// mock reply. Progress changes only when the ordinary inbox action processes it.
import { getMessageReport, getWhatsAppMessages } from './whatsapp.ts';
import { getDrawingMapping, snapshotMappedArea } from './drawing-mapping.ts';
import { getAreaAllocationSnapshot, getItemAreaAllocation, sameProgressScope } from './area-allocations.ts';
import { getVoiceNoteContext, isVoiceNoteAudio, isVoiceNoteEvidenceSnapshot } from './voice-notes.ts';

export interface ClarificationMutation { project: Project; outcome: string; error?: string; thread?: MessageClarification }
export interface ClarificationContext { thread: MessageClarification; original: WhatsAppMessage; request: MessageClarification['request']; reply: WhatsAppMessage | null; report: SiteReport | null; latestReport: SiteReport | null; stage: string; sourceMessageId: string; replyMessageId: string | null }

const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = <T,>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const validId = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const completionValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const actor = 'Alex Tan · Demo reviewer';
const threadIdFor = (messageId: string) => `CLARIFICATION-${messageId}`;
const replyIdFor = (messageId: string) => `${messageId}-CLARIFIED-001`;
const time = (value: unknown) => typeof value === 'string' && text(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const local = (project: Project, entry: unknown) => record(entry) && entry.projectId === project.id && entry.projectCode === project.code;
const optionalLocal = (project: Project, entry: unknown) => record(entry) && (!entry.projectId || entry.projectId === project.id)
  && (!entry.projectCode || entry.projectCode === project.code);
const originalFields = ['id', 'projectId', 'projectCode', 'kind', 'text', 'photo', 'photoAlt', 'sender', 'senderRole', 'date',
  'itemId', 'area', 'areaId', 'location', 'completion', 'completionBasis', 'replyToMessageId'] as const;

function atDate(now: DateInput) {
  if (now === null || !['string', 'number', 'object'].includes(typeof now) || (typeof now === 'object' && !(now instanceof Date))) return null;
  try { const date = new Date(now); return Number.isFinite(date.getTime()) ? date.toISOString() : null; } catch { return null; }
}

function messagesFor(project: Project) {
  return Array.isArray(project?.whatsappMessages) ? project.whatsappMessages : getWhatsAppMessages(project);
}

function oneById<T extends { id?: string }>(entries: T[] | null | undefined, id: unknown): T | null {
  const matches = list(entries).filter((entry) => record(entry) && entry.id === id);
  return matches.length === 1 ? matches[0] : null;
}

function sourceFor(project: Project, messageId: string): WhatsAppMessage | null {
  if (!record(project) || !validId(project.id) || !text(project.code) || !validId(messageId)) return null;
  const source = oneById(messagesFor(project), messageId);
  return local(project, source) ? source : null;
}

function sourceEvidenceValid(project: Project, source: WhatsAppMessage | null): source is WhatsAppMessage {
  return Boolean(source && local(project, source) && validId(source.id) && text(source.text) && text(source.sender) && time(source.date) !== null
    && !source.vo && source.kind !== 'vo' && !source.replyToMessageId
    && (source.kind === 'clarification' || source.status === 'clarification' || isVoiceNoteAudio(source.audio) && source.originalTranscript === source.text)
    && (source.photo == null || typeof source.photo === 'string')
    && (source.photoAlt == null || typeof source.photoAlt === 'string'));
}

function originalMatches(original: WhatsAppMessage, source: WhatsAppMessage) {
  return originalFields.every((field) => original[field] === source[field])
    && original.originalTranscript === source.originalTranscript
    && JSON.stringify(original.audio ?? null) === JSON.stringify(source.audio ?? null);
}

function childReport(project: Project, reply: WhatsAppMessage) {
  const reports = list(project.reports).filter((entry) => optionalLocal(project, entry)
    && validId(entry.id) && entry.sourceMessageId === reply.id);
  if (reports.length !== 1 || list(project.reports).filter((entry) => entry?.id === reports[0].id).length !== 1) return null;
  const report = getMessageReport({ ...project, reports }, reply);
  return report && report.sourceMessageId === reply.id && report.itemId === reply.itemId ? report : null;
}

function newerItemReport(project: Project, reply: WhatsAppMessage) {
  const reports = list(project.reports);
  return reports.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => optionalLocal(project, entry) && validId(entry.id) && !entry.vo && sameProgressScope(entry, reply)
      && !['rejected', 'superseded'].includes(entry.status) && time(entry.date) !== null && time(entry.date)! > time(reply.date)!
      && reports.filter((candidate) => candidate?.id === entry.id).length === 1)
    .sort((a, b) => time(b.entry.date)! - time(a.entry.date)! || b.index - a.index)[0]?.entry || null;
}

function savedReplyValid(project: Project, thread: MessageClarification, reply: WhatsAppMessage | null) {
  if (!reply || !local(project, reply) || reply.id !== replyIdFor(thread.sourceMessageId) || reply.replyToMessageId !== thread.sourceMessageId
    || reply.clarificationThreadId !== thread.id || reply.kind !== 'progress' || reply.completionBasis !== 'cumulative'
    || !['new', 'clarification', 'processed'].includes(reply.status) || !text(reply.text) || !text(reply.area)
    || !completionValue(reply.completion) || time(reply.date) === null || time(reply.date)! < time(thread.request.date)!
    || reply.sender !== thread.original.sender || reply.photo !== thread.original.photo || reply.photoAlt !== thread.original.photoAlt) return false;
  if (thread.original.audio && !reply.originalVoiceNote) return false;
  if (reply.originalVoiceNote !== undefined && (!isVoiceNoteEvidenceSnapshot(reply.originalVoiceNote)
    || reply.originalVoiceNote.projectId !== project.id || reply.originalVoiceNote.messageId !== thread.sourceMessageId
    || JSON.stringify(reply.originalVoiceNote.audio) !== JSON.stringify(thread.original.audio)
    || reply.originalVoiceNote.originalTranscript !== thread.original.originalTranscript)) return false;
  const item = oneById(project.items, reply.itemId);
  if (!item || !optionalLocal(project, item)) return false;
  if (reply.areaId) {
    const area = reply.areaMapping;
    if (!record(area) || area.areaId !== reply.areaId || !validId(area.drawingId) || area.code !== reply.area
      || !Array.isArray(area.workItemIds) || !area.workItemIds.includes(reply.itemId || '')) return false;
  } else if (reply.areaMapping != null) return false;
  return true;
}

// Validate saved lineage without rebuilding evidence from today's drawing links.
// A renamed or remapped area must not rewrite an earlier worker reply.
export function normalizeMessageClarifications(project: Project): MessageClarification[] {
  if (!record(project) || !validId(project.id) || !text(project.code)) return [];
  const threads = list(project.messageClarifications);
  const unique = (field: keyof MessageClarification, value: unknown) => threads.filter((entry) => record(entry) && entry[field] === value).length === 1;
  return threads.flatMap((entry) => {
    if (!record(entry) || entry.projectId !== project.id || !validId(entry.sourceMessageId)
      || entry.id !== threadIdFor(entry.sourceMessageId) || !unique('id', entry.id) || !unique('sourceMessageId', entry.sourceMessageId)
      || !sourceEvidenceValid(project, entry.original) || entry.original.id !== entry.sourceMessageId
      || !record(entry.request) || !text(entry.request.question) || entry.request.question !== text(entry.request.question)
      || entry.request.actor !== actor || time(entry.request.date) === null || time(entry.request.date)! < time(entry.original.date)!) return [];
    const source = sourceFor(project, entry.sourceMessageId);
    if (!source || !originalMatches(entry.original, source) || getMessageReport(project, source)) return [];
    if (entry.replyMessageId != null) {
      const reply = oneById(messagesFor(project), entry.replyMessageId);
      if (entry.replyMessageId !== replyIdFor(entry.sourceMessageId) || !unique('replyMessageId', entry.replyMessageId)
        || source.status !== 'replied' || source.clarificationReplyMessageId !== entry.replyMessageId
        || !savedReplyValid(project, entry, reply)) return [];
    } else if (source.status !== 'clarification' || source.clarificationReplyMessageId) return [];
    return [clone(entry)];
  });
}

export function getMessageClarificationEligibility(project: Project, messageId: string): { eligible: boolean; error?: string } {
  const source = sourceFor(project, messageId);
  const invalid = (error: string) => ({ eligible: false, error });
  if (!source) return invalid('Choose an original message from the selected project.');
  if (source.replyToMessageId) return invalid('Open the original clarification to review this reply.');
  if (source.vo || source.kind === 'vo') return invalid('Review possible extra work in VO review.');
  const voice = getVoiceNoteContext(project,messageId);
  if ((source.audio || source.originalTranscript) && !(voice.eligible && voice.needsClarification)) return invalid('This voice note has a clear cumulative update. Review its transcript and suggested match instead.');
  if (!sourceEvidenceValid(project, source) && !(voice.eligible && voice.needsClarification)) return invalid('Only an unclear site message can request clarification.');
  const item = source.itemId ? oneById(project.items, source.itemId) : null;
  if (source.itemId && !item) return invalid('The original work-item reference is missing or duplicated in this project.');
  if (item && (!optionalLocal(project, item) || ['included', 'rateOnly'].includes(item.pricingType))) {
    return invalid('Included and rate-only work cannot become percentage progress through a clarification.');
  }
  if (getMessageReport(project, source)) return invalid('Review the existing site report instead of creating another inbox clarification.');
  if (!['new', 'clarification'].includes(source.status)) return invalid('This message already has a saved reply or processing result.');
  return { eligible: true };
}

function existingThread(project: Project, messageId: string) {
  return normalizeMessageClarifications(project).find((entry) => entry.sourceMessageId === messageId) || null;
}

function invalidThreadState(project: Project, messageId: string, thread: MessageClarification | null) {
  return record(project) && (project.messageClarifications != null && !Array.isArray(project.messageClarifications)
    || list(project.messageClarifications).some((entry) => entry?.sourceMessageId === messageId) && !thread);
}

export function saveMessageClarificationRequest(project: Project, messageId: string, values: unknown, now: DateInput = new Date()): ClarificationMutation {
  const invalid = (error: string) => ({ project, outcome: 'invalid', error });
  if (!record(values) || !text(values.question)) return invalid('Enter what the worker needs to clarify.');
  const question = text(values.question);
  const thread = existingThread(project, messageId);
  if (invalidThreadState(project, messageId, thread)) return invalid('The saved clarification is unavailable. Reopen the original message.');
  if (thread) return thread.request.question === question ? { project, outcome: 'unchanged', thread: clone(thread) }
    : invalid('The saved request is retained with the original message and cannot be replaced.');
  const eligibility = getMessageClarificationEligibility(project, messageId);
  if (!eligibility.eligible) return invalid(eligibility.error || 'This message is unavailable for clarification.');
  const source = sourceFor(project, messageId);
  const date = atDate(now);
  if (!source || !date || time(date)! < time(source.date)!) return invalid('The request date cannot be earlier than the original message.');
  const id = threadIdFor(messageId);
  if (list(project.messageClarifications).some((entry) => entry?.id === id)
    || list(project.history).some((entry) => entry?.id === `${id}-REQUEST`)) return invalid('This clarification reference is already in use.');
  const saved = { id, projectId: project.id, sourceMessageId: messageId, original: clone(source), request: { question, date, actor } };
  return { outcome: 'updated', thread: clone(saved), project: {
    ...project,
    messageClarifications: [...list(project.messageClarifications), saved],
    whatsappMessages: messagesFor(project).map((entry) => entry === source ? { ...entry, status: 'clarification',
      clarificationRequestedAt: date, clarificationRequestedBy: actor } : entry),
    history: [{ id: `${id}-REQUEST`, action: 'Mock clarification requested', detail: `${messageId} · ${question}`, date, actor }, ...list(project.history)],
  } };
}

function replyMatches(reply: WhatsAppMessage | null, values: unknown) {
  return Boolean(reply && record(values) && text(values.text) === reply.text && values.itemId === reply.itemId
    && completionValue(values.completion) && values.completion === reply.completion
    && (text(values.areaId) || null) === (reply.areaId || null)
    && (reply.areaId ? !text(values.area) || text(values.area) === reply.area : text(values.area) === reply.area));
}

export function saveMockClarificationReply(project: Project, messageId: string, values: unknown, now: DateInput = new Date()): ClarificationMutation {
  const invalid = (error: string) => ({ project, outcome: 'invalid', error });
  const thread = existingThread(project, messageId);
  if (!thread || invalidThreadState(project, messageId, thread)) return invalid('Save a clarification request for the original message first.');
  if (thread.replyMessageId) {
    const reply = sourceFor(project, thread.replyMessageId);
    return replyMatches(reply, values) ? { project, outcome: 'unchanged', thread: clone(thread) }
      : invalid('The mock reply is already saved. Its original evidence cannot be replaced.');
  }
  const eligibility = getMessageClarificationEligibility(project, messageId);
  if (!eligibility.eligible) return invalid(eligibility.error || 'This message is unavailable for clarification.');
  if (!record(values) || !text(values.text)) return invalid('Enter the worker’s mock reply.');
  const item = oneById(project.items, values.itemId);
  if (!item || !optionalLocal(project, item) || item.pricingType !== 'measured') return invalid('Choose a measured contract item from the selected project.');
  if (!completionValue(values.completion)) return invalid('Enter an explicit total completion from 0 to 100%.');
  const mapping = getDrawingMapping(project);
  const areaId = text(values.areaId);
  const mappedArea = areaId ? mapping.areas.find((entry) => entry.id === areaId) : null;
  if (mapping.areas.length && (!mappedArea || !mappedArea.workItemIds.includes(item.id))) {
    return invalid('Choose a saved site area linked to this contract item.');
  }
  if (mappedArea && text(values.area) && text(values.area) !== mappedArea.code) return invalid('The reply area must match the selected saved site area.');
  if (!mapping.areas.length && (areaId || !text(values.area))) return invalid('Enter the site area for this reply.');
  const allocation = getItemAreaAllocation(project, item.id);
  const areaProgress = allocation.split && mappedArea ? getAreaAllocationSnapshot(project, mappedArea.id, item.id) : null;
  if (allocation.split && !areaProgress) return invalid('Choose an area with a saved quantity allocation for this contract item.');
  const date = atDate(now);
  if (!date || time(date)! < time(thread.request.date)!) return invalid('The reply date cannot be earlier than the clarification request.');
  if (list(project.reports).some((entry) => optionalLocal(project, entry) && !entry.vo
    && sameProgressScope(entry, { itemId: item.id, areaProgress: areaProgress || undefined })
    && !['rejected', 'superseded'].includes(entry.status) && time(entry.date) !== null && time(entry.date)! > time(date)!)) {
    return invalid('A newer site report already exists. Review the chronology before saving this cumulative reply.');
  }
  const replyId = replyIdFor(messageId);
  if (messagesFor(project).some((entry) => entry?.id === replyId)
    || list(project.reports).some((entry) => entry?.id === `WA-REPORT-${replyId}` || entry?.sourceMessageId === replyId)
    || list(project.history).some((entry) => entry?.id === `${thread.id}-REPLY`)) return invalid('This reply reference is already in use.');
  const original = thread.original;
  const reply = { id: replyId, projectId: project.id, projectCode: project.code, kind: 'progress', status: 'new',
    replyToMessageId: messageId, clarificationThreadId: thread.id, sender: original.sender,
    senderRole: original.senderRole || 'Site worker · demo', date, text: text(values.text),
    photo: original.photo, photoAlt: original.photoAlt, itemId: item.id,
    ...(getVoiceNoteContext(project,messageId).evidence ? {originalVoiceNote:clone(getVoiceNoteContext(project,messageId).evidence!)} : {}),
    area: mappedArea?.code || text(values.area), areaId: mappedArea?.id || null,
    areaMapping: snapshotMappedArea(mappedArea), location: item.location || mappedArea?.name || '',
    ...(areaProgress ? { areaProgress: clone(areaProgress) } : {}),
    completion: values.completion, completionBasis: 'cumulative', demo: true, origin: 'simulated', channel: 'whatsapp-mock',
    processingNote: 'Saved mock clarification reply. Review and process it before supervisor verification; no AI or WhatsApp service is connected.' };
  const saved = { ...thread, replyMessageId: replyId };
  return { outcome: 'updated', thread: clone(saved), project: {
    ...project,
    messageClarifications: list(project.messageClarifications).map((entry) => entry.id === thread.id ? saved : entry),
    whatsappMessages: [...messagesFor(project).map((entry) => entry.id === messageId ? { ...entry,
      status: 'replied', clarificationReplyMessageId: replyId } : entry), reply],
    history: [{ id: `${thread.id}-REPLY`, action: 'Mock clarification reply saved',
      detail: `${messageId} · ${replyId} · ${item.id} · ${reply.completion}% total; progress unchanged until processing.`, date, actor }, ...list(project.history)],
  } };
}

export function getMessageClarification(project: Project, messageId: string): ClarificationContext | null {
  if (!validId(messageId)) return null;
  const thread = normalizeMessageClarifications(project).find((entry) => entry.sourceMessageId === messageId || entry.replyMessageId === messageId);
  if (!thread) return null;
  const reply = thread.replyMessageId ? sourceFor(project, thread.replyMessageId) : null;
  const report = reply ? childReport(project, reply) : null;
  const latestReport = reply && !report ? newerItemReport(project, reply) : null;
  let stage = reply ? 'reply-received' : 'requested';
  if (reply?.status === 'clarification') stage = 'clarification';
  if (report) stage = report.vo ? 'vo-review' : ['verified', 'approved'].includes(report.status) ? 'verified'
    : ['rejected', 'superseded'].includes(report.status) ? report.status
      : ['pending', 'needsReview'].includes(report.status) ? 'verification' : 'clarification';
  if (latestReport) stage = 'superseded';
  return { thread, original: clone(thread.original), request: clone(thread.request), reply: reply ? clone(reply) : null,
    report: report ? clone(report) : null, latestReport: latestReport ? clone(latestReport) : null,
    stage, sourceMessageId: thread.sourceMessageId, replyMessageId: thread.replyMessageId || null };
}
