import type { DateInput, MessageInboxDecision, Project, WhatsAppMessage } from '../types/domain';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value === value.trim();
const dateFor = (value: DateInput) => { try { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; } catch { return null; } };
const actor = 'Alex Tan · Demo reviewer';
const clone = <T>(value: T): T => structuredClone(value);
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : record(value)
  ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;

function sourceFor(project: Project, messageId: string): WhatsAppMessage | null {
  const messages = Array.isArray(project.whatsappMessages) ? project.whatsappMessages.filter(entry => record(entry) && entry.id === messageId) : [];
  return messages.length === 1 && messages[0].projectId === project.id && messages[0].projectCode === project.code ? messages[0] : null;
}

// Bind decisions to immutable input, independent of drawing/baseline edits and
// later processing. Canonical demo photo refreshes are presentation metadata;
// uploaded/non-demo attachments remain part of the source identity.
function keyFor(project: Project, source: WhatsAppMessage) {
  const original = { ...source } as Record<string, unknown>;
  for (const key of ['status', 'processingNote', 'processedAt', 'reportId', 'demoPhotoHistory',
    'clarificationRequestedAt', 'clarificationRequestedBy', 'clarificationReplyMessageId']) delete original[key];
  if (source.demo === true && typeof source.photo === 'string' && source.photo.startsWith('/assets/')) {
    delete original.photo; delete original.photoAlt;
  }
  return JSON.stringify(canonical({ version: 1, projectId: project.id, projectCode: project.code, source: original }));
}

export interface InboxDecisionContext {
  dismissed: boolean; blocked: boolean; latest: MessageInboxDecision | null;
  history: MessageInboxDecision[]; sourceKey: string; issue?: string;
}

function inspect(project: Project) {
  const decisions: MessageInboxDecision[] = [], issues = new Set<string>();
  if (project.messageInboxDecisionIssues != null) {
    if (!Array.isArray(project.messageInboxDecisionIssues) || !project.messageInboxDecisionIssues.every(text)) issues.add('*');
    else project.messageInboxDecisionIssues.forEach(id => issues.add(id));
  }
  if (project.messageInboxDecisions != null && !Array.isArray(project.messageInboxDecisions)) issues.add('*');
  const raw: unknown[] = Array.isArray(project.messageInboxDecisions) ? project.messageInboxDecisions : [];
  const ids = new Map<string, number>();
  for (const value of raw) if (record(value) && text(value.id)) ids.set(value.id, (ids.get(value.id) || 0) + 1);
  const latest = new Map<string, MessageInboxDecision>();
  for (const value of raw) {
    const messageId = record(value) && text(value.messageId) ? value.messageId : '*';
    const source = sourceFor(project, messageId);
    const previous = latest.get(messageId);
    if (!record(value) || value.version !== 1 || !text(value.id) || ids.get(value.id) !== 1 || value.projectId !== project.id
      || !source || !text(source.text) || !text(source.sender) || !dateFor(source.date)
      || value.sourceKey !== keyFor(project, source) || !['dismiss', 'reopen'].includes(String(value.action))
      || !text(value.reason) || value.reason.length > 1000 || !text(value.reviewedBy) || typeof value.reviewedAt !== 'string' || !dateFor(value.reviewedAt)
      || Date.parse(value.reviewedAt) < Date.parse(source.date) || previous && Date.parse(value.reviewedAt) < Date.parse(previous.reviewedAt)
      || value.previousDecisionId !== (previous?.id || null) || value.action !== (previous?.action === 'dismiss' ? 'reopen' : 'dismiss')) {
      issues.add(messageId); continue;
    }
    const entry = clone(value as unknown as MessageInboxDecision);
    decisions.push(entry); latest.set(messageId, entry);
  }
  for (const entry of latest.values()) {
    if (entry.action !== 'dismiss') continue;
    const source = sourceFor(project, entry.messageId);
    if (!source || source.status !== 'new' || source.processedAt || source.reportId
      || source.replyToMessageId || source.clarificationThreadId || source.clarificationRequestedAt || source.clarificationReplyMessageId
      || (project.reports || []).some(report => report?.sourceMessageId === entry.messageId)
      || (project.voReviews || []).some(review => review?.reportId === `WA-REPORT-${entry.messageId}`)
      || project.messageClarifications != null && !Array.isArray(project.messageClarifications)
      || (project.messageClarifications || []).some(thread => thread?.sourceMessageId === entry.messageId || thread?.replyMessageId === entry.messageId)) issues.add(entry.messageId);
  }
  return { decisions, issues: [...issues] };
}

/** Preserve an explicit issue marker instead of reviving an older valid decision. */
export function normalizeMessageInboxDecisions(project: Project) {
  const result = inspect(project);
  return { messageInboxDecisions: result.decisions, messageInboxDecisionIssues: result.issues };
}

export function getMessageInboxDecision(project: Project, messageId: string): InboxDecisionContext {
  const source = sourceFor(project, messageId), state = inspect(project);
  const history = state.decisions.filter(entry => entry.messageId === messageId);
  const latest = history.at(-1) || null;
  const blocked = state.issues.includes('*') || state.issues.includes(messageId);
  return { dismissed: latest?.action === 'dismiss', blocked, latest, history, sourceKey: source ? keyFor(project, source) : '',
    ...(blocked ? { issue: 'The saved message decision needs review. The original is retained and cannot be processed.' } : {}) };
}

export interface MessageDismissalEligibility {
  eligible: boolean; canReopen: boolean; sourceKey: string; expectedDecisionId: string | null;
  context: InboxDecisionContext; error?: string;
}
export function getMessageDismissalEligibility(project: Project, messageId: string): MessageDismissalEligibility {
  const context = getMessageInboxDecision(project, messageId), source = sourceFor(project, messageId);
  const base = { eligible: false, canReopen: false, sourceKey: context.sourceKey, expectedDecisionId: context.latest?.id || null, context };
  if (context.blocked) return { ...base, error: context.issue };
  if (!source || !text(source.text) || !text(source.sender) || !dateFor(source.date)) return { ...base, error: 'Choose one original message from the selected project.' };
  if (!Array.isArray(project.whatsappMessages) || project.whatsappMessages.some(entry => !record(entry)
    || !text(entry.id) || entry.projectId !== project.id || entry.projectCode !== project.code)
    || new Set(project.whatsappMessages.map(entry => entry.id)).size !== project.whatsappMessages.length) {
    return { ...base, error: 'The saved inbox is unavailable. Reopen the project before recording a decision.' };
  }
  if (source.status !== 'new' || source.processedAt || source.reportId
    || (project.reports || []).some(report => report?.sourceMessageId === source.id || report?.id === source.reportId)
    || (project.voReviews || []).some(review => review?.reportId === `WA-REPORT-${source.id}`)) {
    return { ...base, error: 'This message already has a processing result. Review its existing report or extra work instead.' };
  }
  if (source.replyToMessageId || source.clarificationThreadId || source.clarificationReplyMessageId || source.clarificationRequestedAt
    || project.messageClarifications != null && !Array.isArray(project.messageClarifications)
    || (project.messageClarifications || []).some(thread => thread?.sourceMessageId === source.id || thread?.replyMessageId === source.id)) {
    return { ...base, error: 'Keep the existing clarification thread. Review its request or reply instead.' };
  }
  return { ...base, eligible: !context.dismissed, canReopen: context.dismissed };
}

export interface InboxDecisionInput { action: 'dismiss' | 'reopen'; reason: string; sourceKey: string; expectedDecisionId: string | null }
export interface InboxDecisionMutation { project: Project; outcome: 'updated' | 'unchanged' | 'invalid'; error?: string; decision?: MessageInboxDecision }

export function saveMessageInboxDecision(project: Project, messageId: string, values: unknown, now: DateInput = new Date()): InboxDecisionMutation {
  const invalid = (error: string): InboxDecisionMutation => ({ project, outcome: 'invalid', error });
  const eligibility = getMessageDismissalEligibility(project, messageId), context = eligibility.context;
  if (!record(values) || !['dismiss', 'reopen'].includes(String(values.action)) || !text(values.reason) || values.reason.length > 1000) {
    return invalid('Add a short reason, up to 1,000 characters.');
  }
  if (context.blocked || !eligibility.eligible && !eligibility.canReopen) return invalid(eligibility.error || 'This message is unavailable for this action.');
  if (values.sourceKey !== context.sourceKey) return invalid('The original message changed. Reopen it before recording this decision.');
  // A repeated callback for exactly the saved action is safe; a stale form may
  // never undo a later decision or append a second event.
  if (context.latest && context.latest.action === values.action && context.latest.reason === values.reason
    && values.expectedDecisionId === context.latest.previousDecisionId) return { project, outcome: 'unchanged', decision: context.latest };
  if (values.expectedDecisionId !== (context.latest?.id || null)) return invalid('The message decision changed. Reopen it before saving.');
  if (values.action === 'dismiss' ? !eligibility.eligible : !eligibility.canReopen) return invalid(values.action === 'dismiss' ? 'This message is already dismissed.' : 'Only a dismissed message can be reopened.');
  const date = dateFor(now), source = sourceFor(project, messageId)!;
  if (!date || Date.parse(date) < Date.parse(source.date) || context.latest && Date.parse(date) < Date.parse(context.latest.reviewedAt)) return invalid('Choose a valid decision date on or after the original message and previous decision.');
  const history = Array.isArray(project.messageInboxDecisions) ? project.messageInboxDecisions : [];
  const idBase = `INBOX-${project.id}-${messageId}-${Date.parse(date)}`;
  let id = idBase, sequence = 1;
  while (history.some(entry => entry.id === id)) id = `${idBase}-${sequence++}`;
  const decision: MessageInboxDecision = { version: 1, id, projectId: project.id, messageId, sourceKey: context.sourceKey,
    action: values.action as 'dismiss' | 'reopen', reason: values.reason, reviewedBy: actor, reviewedAt: date, previousDecisionId: context.latest?.id || null };
  return { outcome: 'updated', decision, project: { ...project, messageInboxDecisions: [...history, decision],
    history: [{ id, action: decision.action === 'dismiss' ? 'WhatsApp message dismissed' : 'WhatsApp message reopened',
      detail: `${messageId} · ${decision.reason}`, date, actor }, ...project.history] } };
}
