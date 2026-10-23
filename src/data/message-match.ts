import type { DateInput, DrawingArea, MessageMatchFields, MessageMatchLabels, MessageMatchReview, MessageMatchSuggestion, Project, WhatsAppMessage } from '../types/domain';
import { getAreaLinkStatus, getDrawingMapping, snapshotMappedArea } from './drawing-mapping.ts';
import { getAreaAllocationSnapshot, getItemAreaAllocation } from './area-allocations.ts';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const clone = <T>(value: T): T => structuredClone(value);
const pct = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const dateFor = (now: DateInput) => { try { const date = new Date(now); return Number.isFinite(date.getTime()) ? date.toISOString() : null; } catch { return null; } };
const fieldsValid = (value: unknown): value is MessageMatchFields => record(value) && Boolean(text(value.itemId)) && Boolean(text(value.areaId)) && pct(value.completion);
const labelsValid = (value: unknown): value is MessageMatchLabels => record(value) && ['itemId', 'itemRef', 'itemDescription', 'areaId', 'areaCode', 'areaName'].every(key => typeof value[key] === 'string');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tokenIn = (source: string, token: string) => Boolean(token) && new RegExp(`(^|[^A-Za-z0-9_-])${escapePattern(token)}(?=$|[^A-Za-z0-9_-])`, 'i').test(source);

// Frozen evidence is checked structurally, never against today's project map.
export function isMessageMatchReviewSnapshot(value: unknown): value is MessageMatchReview {
  return record(value) && ['id', 'projectId', 'messageId', 'sourceKey', 'reason', 'reviewedBy', 'reviewedAt'].every(key => typeof value[key] === 'string')
    && labelsValid(value.suggested) && labelsValid(value.confirmed) && fieldsValid(value.fields)
    && record(value.originalSuggestion) && fieldsValid(value.originalSuggestion.fields)
    && record(value.areaMapping) && typeof value.areaMapping.areaId === 'string';
}

export interface MessageMatchContext {
  eligible: boolean; requiresReview: boolean; issue?: string; clarificationRequired?: boolean;
  original: WhatsAppMessage | null; suggestion: MessageMatchSuggestion | null; review: MessageMatchReview | null;
  fields: MessageMatchFields | null; effectiveMessage: WhatsAppMessage | null;
}

function suggestionFor(value: unknown, source: WhatsAppMessage): MessageMatchSuggestion | null {
  if (!record(value) || value.version !== 1 || value.origin !== 'mock' || !Number.isSafeInteger(value.baselineVersion)
    || Number(value.baselineVersion) < 1 || !fieldsValid(value.fields) || !text(value.sourceExcerpt)
    || typeof value.sourceExcerpt !== 'string' || !source.text.includes(value.sourceExcerpt)
    || !text(value.reason) || text(value.reason).length > 1000 || value.fields.completion !== source.completion) return null;
  return clone(value as unknown as MessageMatchSuggestion);
}

function frozenLabels(project: Project, fields: MessageMatchFields): MessageMatchLabels {
  const item = project.items.find(entry => entry.id === fields.itemId);
  const area = getDrawingMapping(project).areas.find(entry => entry.id === fields.areaId);
  return { itemId: fields.itemId, itemRef: item?.ref || '', itemDescription: item?.description || 'Suggested item unavailable',
    areaId: fields.areaId, areaCode: area?.code || '', areaName: area?.name || 'Suggested area unavailable' };
}

// A review is tied to these exact source fields and current mapping revision.
// Processing metadata and reports are excluded so saving/processing cannot alter originals.
function sourceKey(project: Project, source: WhatsAppMessage, suggestion: MessageMatchSuggestion) {
  const mapping = getDrawingMapping(project);
  return JSON.stringify({ version: 1, projectId: project.id, projectCode: project.code, baselineVersion: project.version,
    source: { id: source.id, projectId: source.projectId, projectCode: source.projectCode, kind: source.kind, text: source.text,
      sender: source.sender, senderRole: source.senderRole, date: source.date, itemId: source.itemId, area: source.area,
      areaId: source.areaId, areaMapping: source.areaMapping, areaProgress: source.areaProgress, location: source.location,
      completion: source.completion, completionBasis: source.completionBasis, photo: source.photo, photoAlt: source.photoAlt,
      demo: source.demo, origin: source.origin, channel: source.channel, suggestion },
    drawing: mapping.drawing, areas: mapping.areas, mappingHistory: mapping.history,
    items: project.items.map(({ id, ref, description, pricingType, quantity }) => ({ id, ref, description, pricingType, quantity })) });
}

function selection(project: Project, source: WhatsAppMessage, suggestion: MessageMatchSuggestion, fields: MessageMatchFields): { area?: DrawingArea; error?: string } {
  const item = project.items.filter(entry => entry.id === fields.itemId);
  const areas = getDrawingMapping(project).areas.filter(entry => entry.id === fields.areaId);
  if (item.length !== 1 || item[0].pricingType !== 'measured' || item[0].projectId && item[0].projectId !== project.id
    || item[0].projectCode && item[0].projectCode !== project.code) return { error: 'Choose one measured contract item from this project.' };
  if (areas.length !== 1 || !areas[0].workItemIds.includes(fields.itemId)) return { error: 'Choose a site area linked to this contract item.' };
  const area = areas[0];
  const explicitItems = [...new Set([...project.items.filter(entry => tokenIn(source.text, entry.id)).map(entry => entry.id), ...(source.text.match(/\bWI-\d+\b/gi) || []).map(id => id.toUpperCase())])];
  if (explicitItems.some(id => id.toUpperCase() !== fields.itemId.toUpperCase())) return { error: 'The original message names a different work item. Ask for clarification instead of changing that reference.' };
  const explicitAreas = getDrawingMapping(project).areas.filter(entry => tokenIn(source.text, entry.code) || text(source.area).toUpperCase() === entry.code);
  if (explicitAreas.some(entry => entry.id !== area.id) || source.areaId && source.areaId !== area.id
    || source.areaMapping?.areaId && source.areaMapping.areaId !== area.id || source.areaProgress?.areaId && source.areaProgress.areaId !== area.id) {
    return { error: 'The original message names a different area code. Ask for clarification instead of changing that reference.' };
  }
  if (source.areaProgress && source.areaProgress.itemId !== fields.itemId) return { error: 'The original area quantity belongs to another work item. Ask for clarification before changing its scope.' };
  if (fields.completion !== suggestion.fields.completion) return { error: 'Keep the original cumulative percentage. Ask for clarification to change completion.' };
  const allocation = getItemAreaAllocation(project, fields.itemId);
  if (!allocation.valid || allocation.split && !getAreaAllocationSnapshot(project, area.id, fields.itemId)) return { error: 'Review the saved area quantity allocation before confirming this match.' };
  return { area };
}

/** Only newly seeded mock suggestions opt in. Legacy inbox records are unchanged. */
export function getMessageMatchContext(project: Project, messageId: string): MessageMatchContext {
  const empty: MessageMatchContext = { eligible: false, requiresReview: false, original: null, suggestion: null, review: null, fields: null, effectiveMessage: null };
  const messages = Array.isArray(project?.whatsappMessages) ? project.whatsappMessages.filter(entry => record(entry) && entry.id === messageId) : [];
  if (messages.length !== 1) return { ...empty, issue: 'Choose a message from the selected project.' };
  const original = messages[0];
  if (!Object.hasOwn(original, 'matchSuggestion')) return { ...empty, original };
  const base = { ...empty, original, requiresReview: true };
  const unsafe = (issue: string): MessageMatchContext => ({ ...base, issue, clarificationRequired: true });
  if (original.projectId !== project.id || original.projectCode !== project.code) return unsafe('This message belongs to another project.');
  if (original.status !== 'new' || (project.reports || []).some(report => report.sourceMessageId === original.id)) return { ...base, requiresReview: false, issue: 'This message has already been processed. Its original review is retained with the report.' };
  if (original.kind !== 'progress' || original.vo || original.completionBasis !== 'cumulative' || !pct(original.completion)
    || typeof original.date !== 'string' || !dateFor(original.date) || typeof original.text !== 'string' || !text(original.sender)
    || original.demo !== true || !['simulated', 'mock'].includes(String(original.origin)) || original.replyToMessageId || original.clarificationThreadId) {
    return unsafe('Confirm the work item, site area and 0–100% cumulative completion through clarification before adding progress.');
  }
  if (original.areaProgress) {
    const expected = getAreaAllocationSnapshot(project, original.areaProgress.areaId, original.areaProgress.itemId);
    if (!expected || !same(expected, original.areaProgress)) return unsafe('The original area quantity is unavailable or changed. Ask for clarification before adding progress.');
  }
  const sourcePercentages = [...original.text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map(match => Number(match[1]));
  if (sourcePercentages.some(value => value !== original.completion)
    || /\b(?:additional|another|extra)\s+\d+(?:\.\d+)?\s*%|\b(?:incremental|variation order)\b|\bpossible\s+VO\b|\+\s*\d+(?:\.\d+)?\s*%/i.test(original.text)) {
    return unsafe('The original completion or work scope needs clarification. Match review cannot change percentages or turn extra work into progress.');
  }
  const suggestion = suggestionFor(original.matchSuggestion, original);
  if (!suggestion) return unsafe('The mock suggestion is incomplete. Ask for clarification before adding progress.');
  const areaLink = getAreaLinkStatus(project, original);
  if (areaLink.ambiguous) return unsafe(`The area name matches ${areaLink.candidates.map(area => area.code).join(' and ')}. Ask the worker to confirm one area code.`);
  if (areaLink.blocked || (original.areaId || original.areaMapping?.areaId || original.areaProgress?.areaId) && !areaLink.area) return unsafe('The original area reference is unavailable. Ask for clarification before adding progress.');
  const explicitAreaIds = getDrawingMapping(project).areas.filter(area => tokenIn(original.text, area.code)
    || text(original.area).toUpperCase() === area.code).map(area => area.id);
  if (explicitAreaIds.length > 1 || areaLink.area && explicitAreaIds.some(id => id !== areaLink.area!.id)) {
    return unsafe('The original message names conflicting area codes. Ask the worker to confirm one area.');
  }
  // Explicit worker codes are provenance, not editable model suggestions.
  const explicitItems = [...new Set([...project.items.filter(entry => tokenIn(original.text, entry.id)).map(entry => entry.id), ...(original.text.match(/\bWI-\d+\b/gi) || []).map(id => id.toUpperCase())])];
  if (explicitItems.some(id => id.toUpperCase() !== suggestion.fields.itemId.toUpperCase())) return unsafe('The suggestion conflicts with the work item code in the original message. Ask for clarification.');
  if (suggestion.baselineVersion !== project.version) return { ...base, clarificationRequired: true, suggestion, fields: clone(suggestion.fields), issue: 'The contract version changed. Ask for clarification using the current contract item.' };
  const key = sourceKey(project, original, suggestion);
  const latest = (Array.isArray(project.messageMatchReviews) ? project.messageMatchReviews : []).filter(value => record(value) && value.projectId === project.id && value.messageId === original.id).at(-1);
  const reviews = (latest ? [latest] : []).filter((value): value is MessageMatchReview => record(value)
    && value.projectId === project.id && value.messageId === original.id && value.baselineVersion === project.version && value.sourceKey === key
    && text(value.id) !== '' && fieldsValid(value.fields) && typeof value.reason === 'string' && value.reason.length <= 1000
    && Boolean(text(value.reviewedBy)) && typeof value.reviewedAt === 'string' && Boolean(dateFor(value.reviewedAt)) && Date.parse(value.reviewedAt) >= Date.parse(original.date)
    && same(value.originalSuggestion, suggestion) && labelsValid(value.suggested) && labelsValid(value.confirmed)
    && !selection(project, original, suggestion, value.fields).error
    && (!(value.fields.itemId !== suggestion.fields.itemId || value.fields.areaId !== suggestion.fields.areaId) || Boolean(text(value.reason))));
  const review = [...reviews].reverse().find(value => {
    const selected = selection(project, original, suggestion, value.fields);
    const areaProgress = getAreaAllocationSnapshot(project, value.fields.areaId, value.fields.itemId);
    return same(value.areaMapping, snapshotMappedArea(selected.area)) && same(value.areaProgress ?? null, areaProgress)
      && same(value.suggested, frozenLabels(project, suggestion.fields)) && same(value.confirmed, frozenLabels(project, value.fields));
  }) || null;
  return { eligible: true, requiresReview: !review, original, suggestion, review, fields: clone(review?.fields || suggestion.fields),
    ...(review ? {} : { issue: 'Review the suggested work item and site area before adding progress.' }),
    effectiveMessage: review ? { ...clone(original), areaProgress: undefined, itemId: review.fields.itemId, areaId: review.fields.areaId,
      area: review.areaMapping.code, areaMapping: clone(review.areaMapping), ...(review.areaProgress ? { areaProgress: clone(review.areaProgress) } : {}) } : null };
}

export interface MessageMatchMutation { project: Project; outcome: 'updated' | 'unchanged' | 'invalid'; error?: string; review?: MessageMatchReview }

export function saveMessageMatchReview(project: Project, messageId: string, values: unknown, now: DateInput = new Date()): MessageMatchMutation {
  const invalid = (error: string): MessageMatchMutation => ({ project, outcome: 'invalid', error });
  if (project.messageMatchReviews != null && !Array.isArray(project.messageMatchReviews)) return invalid('The saved match review history is unavailable. Reopen the project before recording another review.');
  const context = getMessageMatchContext(project, messageId);
  if (!context.eligible || !context.original || !context.suggestion) return invalid(context.issue || 'This message does not need a match review.');
  if (!record(values) || !text(values.itemId) || !text(values.areaId) || typeof values.reason !== 'string' || values.reason.length > 1000) return invalid('Choose a work item and area, with a correction reason up to 1,000 characters.');
  const fields = { itemId: text(values.itemId), areaId: text(values.areaId), completion: context.suggestion.fields.completion };
  const reason = text(values.reason);
  const correction = fields.itemId !== context.suggestion.fields.itemId || fields.areaId !== context.suggestion.fields.areaId;
  if (correction && !reason) return invalid('Add a short reason for changing the suggested item or area.');
  const selected = selection(project, context.original, context.suggestion, fields);
  if (selected.error || !selected.area) return invalid(selected.error || 'Choose a mapped site area.');
  const date = dateFor(now);
  if (!date || Date.parse(date) < Date.parse(context.original.date)) return invalid('Choose a valid match review date on or after the original message.');
  if (context.review && same(context.review.fields, fields) && context.review.reason === reason) return { project, outcome: 'unchanged', review: context.review };
  const reviews = Array.isArray(project.messageMatchReviews) ? project.messageMatchReviews : [];
  const idBase = `MATCH-${project.id}-${messageId}-${Date.parse(date)}`;
  let id = idBase, sequence = 1;
  while (reviews.some(review => review?.id === id)) id = `${idBase}-${sequence++}`;
  const areaProgress = getAreaAllocationSnapshot(project, selected.area.id, fields.itemId);
  const review: MessageMatchReview = { id, projectId: project.id, messageId, baselineVersion: project.version,
    sourceKey: sourceKey(project, context.original, context.suggestion), originalSuggestion: clone(context.suggestion), fields,
    reason, reviewedBy: 'Alex Tan · Demo reviewer', reviewedAt: date, areaMapping: snapshotMappedArea(selected.area)!,
    ...(areaProgress ? { areaProgress: clone(areaProgress) } : {}),
    suggested: frozenLabels(project, context.suggestion.fields), confirmed: frozenLabels(project, fields) };
  return { outcome: 'updated', review, project: { ...project, messageMatchReviews: [...reviews, review],
    history: [{ id: review.id, action: correction ? 'WhatsApp match corrected' : 'WhatsApp match reviewed',
      detail: `${messageId} · ${review.confirmed.itemRef || fields.itemId} · ${review.confirmed.areaCode}${reason ? ` · ${reason}` : ''}`, date, actor: review.reviewedBy }, ...project.history] } };
}
