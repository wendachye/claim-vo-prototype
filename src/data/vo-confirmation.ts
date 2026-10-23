import type { DateInput, Project, VOCase, VOConfirmationReply, VOConfirmationReplyKind, VOConfirmationRequest, VOConfirmationSnapshot } from '../types/domain';
import { claimBasisNumber } from './claim-basis.ts';
import { getVOCases } from './vo.ts';

export type { VOConfirmationReplyKind, VOConfirmationRequest, VOConfirmationSnapshot } from '../types/domain';
export interface VOConfirmationContext {
  entry: VOCase | null; snapshot: VOConfirmationSnapshot | null; requests: VOConfirmationRequest[];
  currentRequest: VOConfirmationRequest | null; latestRequest: VOConfirmationRequest | null;
  key: string; canCreate: boolean; error?: string;
}
export interface VOConfirmationMutation {
  project: Project; outcome: 'updated' | 'unchanged' | 'invalid'; error?: string; requestId?: string;
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const validText = (value: unknown, limit = 20000) => typeof value === 'string' && !!value.trim() && value === value.trim() && value.length <= limit;
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const kinds: readonly VOConfirmationReplyKind[] = ['scopeAcknowledged', 'priceApproved', 'changesRequested'];
const inProject = (project: Project, value: Record<string, unknown>) => (value.projectId == null || value.projectId === '' || value.projectId === project.id)
  && (value.projectCode == null || value.projectCode === '' || text(value.projectCode).toUpperCase() === text(project.code).toUpperCase());
const clone = <T>(value: T): T => structuredClone(value);
const dateInput = (value: DateInput): Date | null => { try { const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; } catch { return null; } };
const sourceKey = (snapshot: VOConfirmationSnapshot) => JSON.stringify({ version: 1, ...snapshot });
const requestReference = (snapshot: VOConfirmationSnapshot, version: number) => `${snapshot.reference}-REQUEST-V${version}`;
const reviewCycle = (entry: VOCase) => JSON.stringify(entry.history.flatMap((event, index) => record(event)
  && ['submit', 'clarify', 'reopen', 'reject'].includes(String(event.action))
  ? [[index, event.id ?? null, event.action, event.from ?? null, event.to ?? null, event.date ?? null]] : []));

function exactCase(project: Project, caseId: string): VOCase | null {
  if (!validText(caseId, 300) || !validText(project?.id, 300)) return null;
  const reports = (Array.isArray(project.reports) ? project.reports : []).filter(value => record(value) && value.id === caseId);
  const reviews = (Array.isArray(project.voReviews) ? project.voReviews : []).filter(value => record(value) && value.id === caseId);
  if (reports.length !== 1 || reports[0].vo !== true || !inProject(project, reports[0]) || reviews.length > 1
    || reviews.some(value => value.projectId !== project.id || value.reportId !== caseId || !inProject(project, value))) return null;
  return getVOCases(project).find(entry => entry.id === caseId) ?? null;
}

function snapshotFor(project: Project, entry: VOCase): VOConfirmationSnapshot | null {
  const proposedValue = claimBasisNumber(entry.proposedValue, 2);
  const currency = text(project.contract?.currency).toUpperCase();
  if (Number.isNaN(proposedValue) || !/^[A-Z]{3}$/.test(currency)) return null;
  return {
    projectId: project.id, projectCode: text(project.code), projectName: text(project.name), caseId: entry.id,
    reference: text(entry.reference), title: text(entry.title), scopeAssessment: text(entry.scopeAssessment),
    instructionReference: text(entry.instructionReference), proposedValue, currency, reviewCycle: reviewCycle(entry),
    scopeDisposition: entry.scopeDisposition, instructionStatus: entry.instructionStatus,
    relatedItemId: entry.relatedItemId, baselineVersion: project.version,
  };
}

function normalizeSnapshot(value: unknown, project: Project, caseId: string): VOConfirmationSnapshot | null {
  if (!record(value) || value.projectId !== project.id || value.caseId !== caseId
    || !['projectId', 'projectCode', 'projectName', 'caseId', 'reference', 'title', 'scopeAssessment', 'instructionReference'].every(field => validText(value[field]))
    || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)
    || typeof value.reviewCycle !== 'string' || value.reviewCycle.length > 100000
    || !validText(value.scopeDisposition, 80) || !validText(value.instructionStatus, 80)
    || !(value.relatedItemId === null || validText(value.relatedItemId, 300))
    || !Number.isSafeInteger(value.baselineVersion) || Number(value.baselineVersion) < 1
    || !(value.proposedValue === null || typeof value.proposedValue === 'number')) return null;
  const amount = claimBasisNumber(value.proposedValue, 2);
  if (Number.isNaN(amount)) return null;
  try {
    const cycle: unknown = JSON.parse(value.reviewCycle);
    if (!Array.isArray(cycle) || cycle.some(event => !Array.isArray(event) || event.length !== 6)) return null;
  } catch { return null; }
  return {
    projectId: value.projectId, projectCode: value.projectCode as string, projectName: value.projectName as string,
    caseId, reference: value.reference as string, title: value.title as string, scopeAssessment: value.scopeAssessment as string,
    instructionReference: value.instructionReference as string, proposedValue: amount, currency: value.currency, reviewCycle: value.reviewCycle,
    scopeDisposition: value.scopeDisposition as string, instructionStatus: value.instructionStatus as string,
    relatedItemId: value.relatedItemId as string | null, baselineVersion: Number(value.baselineVersion),
  };
}

/** Validate stored mock evidence without altering its source or turning it into a QS decision. */
export function normalizeVOConfirmationRequests(project: Project): VOConfirmationRequest[] {
  const raw: unknown[] = Array.isArray(project?.voConfirmationRequests) ? project.voConfirmationRequests : [];
  const candidates: VOConfirmationRequest[] = [];
  for (const value of raw) {
    if (!record(value) || !validText(value.id, 300) || value.projectId !== project.id || !validText(value.caseId, 300)
      || !Number.isSafeInteger(value.version) || Number(value.version) < 1 || !validDate(value.requestedAt)
      || value.channel !== 'demo' || value.requestedBy !== 'Alex Tan · Demo QS reviewer'
      || !validText(value.recipient, 160) || !validText(value.authority, 160)) continue;
    const snapshot = normalizeSnapshot(value.snapshot, project, value.caseId as string);
    if (!snapshot || value.sourceKey !== sourceKey(snapshot) || value.reference !== requestReference(snapshot, Number(value.version))) continue;
    let reply: VOConfirmationReply | undefined;
    if (value.reply !== undefined) {
      if (!record(value.reply) || !kinds.includes(value.reply.kind as VOConfirmationReplyKind) || value.reply.channel !== 'demo'
        || !validText(value.reply.message, 2000) || !validDate(value.reply.repliedAt)
        || Date.parse(value.reply.repliedAt) < Date.parse(value.requestedAt)
        || value.reply.respondent !== value.recipient || value.reply.kind === 'priceApproved' && snapshot.proposedValue === null) continue;
      reply = { kind: value.reply.kind as VOConfirmationReplyKind, message: value.reply.message as string,
        repliedAt: value.reply.repliedAt, respondent: value.reply.respondent as string, channel: 'demo' };
    }
    candidates.push({ id: value.id as string, projectId: project.id, caseId: value.caseId as string,
      reference: value.reference as string, version: Number(value.version), sourceKey: value.sourceKey as string,
      requestedAt: value.requestedAt, requestedBy: value.requestedBy, recipient: value.recipient as string,
      authority: value.authority as string, channel: 'demo', snapshot, ...(reply ? { reply } : {}), ...(value.historyInvalid === true ? { historyInvalid: true as const } : {}) });
  }
  // A duplicate ID or version is ambiguous evidence; never pick an arbitrary first record.
  const valid = candidates.filter(candidate => raw.filter(value => record(value) && value.id === candidate.id).length === 1
    && raw.filter(value => record(value) && value.projectId === project.id && value.caseId === candidate.caseId && value.version === candidate.version).length === 1)
    .sort((a, b) => a.caseId.localeCompare(b.caseId) || a.version - b.version);
  return valid.map(candidate => {
    const caseRaw = raw.filter(value => record(value) && value.caseId === candidate.caseId);
    const caseValid = valid.filter(value => value.caseId === candidate.caseId);
    const historyInvalid = caseRaw.length !== caseValid.length || caseValid.some(value => value.historyInvalid === true);
    return clone({ ...candidate, ...(historyInvalid ? { historyInvalid: true as const } : {}) });
  });
}

export function getVOConfirmationContext(project: Project, caseId: string): VOConfirmationContext {
  const entry = exactCase(project, caseId);
  const requests = normalizeVOConfirmationRequests(project).filter(value => value.caseId === caseId);
  const caseRaw = (Array.isArray(project.voConfirmationRequests) ? project.voConfirmationRequests : []).filter(value => record(value) && value.caseId === caseId);
  const malformedHistory = caseRaw.length !== requests.length || requests.some(value => value.historyInvalid === true);
  const latestRequest = requests.at(-1) ?? null;
  const snapshot = entry ? snapshotFor(project, entry) : null;
  const key = snapshot ? sourceKey(snapshot) : '';
  const currentRequest = !malformedHistory && latestRequest?.sourceKey === key ? latestRequest : null;
  let error: string | undefined;
  if (!entry) error = 'Choose an extra-work record from the selected project.';
  else if (entry.status === 'approved') error = 'Price approval is already recorded. Customer request history is read-only.';
  else if (entry.status === 'rejected') error = 'This VO review is closed. Customer request history is read-only.';
  else if (entry.status !== 'pendingApproval') error = 'Complete QS review and mark the extra work awaiting approval first.';
  else if (entry.scopeDisposition !== 'variation') error = 'Confirm this is extra work in the QS scope review first.';
  else if (!snapshot) error = 'Record a currency and a proposed value with at most two decimal places, or leave the value unknown.';
  else if (!['title', 'scopeAssessment', 'instructionReference', 'projectCode', 'projectName'].every(field => validText(snapshot[field as keyof VOConfirmationSnapshot]))
    || !Number.isSafeInteger(snapshot.baselineVersion) || snapshot.baselineVersion < 1 || snapshot.reviewCycle.length > 100000) error = 'Complete the saved title, scope assessment and instruction reference first.';
  else if (malformedHistory) error = 'The saved request history needs review before another request can be used.';
  return { entry, snapshot, requests, currentRequest, latestRequest, key, canCreate: !error, ...(error ? { error } : {}) };
}

export function createVOConfirmationRequest(project: Project, caseId: string, values: unknown, now: DateInput = new Date()): VOConfirmationMutation {
  const invalid = (error: string): VOConfirmationMutation => ({ project, outcome: 'invalid', error });
  if (!record(values)) return invalid('Use valid confirmation request details.');
  const context = getVOConfirmationContext(project, caseId);
  if (!context.entry || !context.snapshot || values.sourceKey !== context.key) return invalid('The saved extra-work details changed. Preview the current request again.');
  const recipient = text(values.recipient), authority = text(values.authority);
  if (!recipient || recipient.length > 160 || !authority || authority.length > 160) return invalid('Add a recipient and their role, using at most 160 characters each.');
  const existing = context.currentRequest;
  if (existing && !existing.reply && recipient === existing.recipient && authority === existing.authority
    && context.entry.status === 'pendingApproval' && context.entry.scopeDisposition === 'variation') return { project, outcome: 'unchanged', requestId: existing.id };
  if (!context.canCreate) return invalid(context.error || 'This request is not available.');
  if (existing && !existing.reply) return invalid('Simulate a reply to the current request before creating another version.');
  const date = dateInput(now);
  if (!date) return invalid('Use a valid request date.');
  const previousDate = context.latestRequest?.reply?.repliedAt ?? context.latestRequest?.requestedAt;
  if (previousDate && date.getTime() < Date.parse(previousDate)) return invalid('Use a request date on or after the previous request and reply.');
  const normalized = normalizeVOConfirmationRequests(project);
  const caseRaw = (Array.isArray(project.voConfirmationRequests) ? project.voConfirmationRequests : []).filter(value => record(value) && value.caseId === caseId);
  if (caseRaw.length !== context.requests.length) return invalid('The saved request history needs review before another request can be created.');
  const version = (context.latestRequest?.version ?? 0) + 1;
  if (!Number.isSafeInteger(version)) return invalid('The request version cannot be increased.');
  const request: VOConfirmationRequest = {
    id: crypto.randomUUID(), projectId: project.id, caseId, reference: requestReference(context.snapshot, version), version,
    sourceKey: context.key, requestedAt: date.toISOString(), requestedBy: 'Alex Tan · Demo QS reviewer', recipient, authority,
    channel: 'demo', snapshot: clone(context.snapshot),
  };
  return { project: { ...project, voConfirmationRequests: [...normalized, request], history: [{ id: request.id,
    action: 'VO confirmation request saved', detail: `${context.entry.reference} · Request version ${version} · ${recipient} · Mock request only`,
    date: request.requestedAt, actor: request.requestedBy }, ...project.history] }, outcome: 'updated', requestId: request.id };
}

export function recordVOConfirmationReply(project: Project, caseId: string, requestId: string, values: unknown, now: DateInput = new Date()): VOConfirmationMutation {
  const invalid = (error: string): VOConfirmationMutation => ({ project, outcome: 'invalid', error });
  if (!record(values) || !kinds.includes(values.kind as VOConfirmationReplyKind) || !text(values.message) || text(values.message).length > 2000) return invalid('Choose a simulated reply and add its message (up to 2,000 characters).');
  const context = getVOConfirmationContext(project, caseId);
  const request = context.currentRequest;
  if (!context.entry || !request || request.id !== requestId) return invalid('This request no longer matches the saved extra-work details. Preview a new request version.');
  const kind = values.kind as VOConfirmationReplyKind, message = text(values.message);
  if (kind === 'priceApproved' && request.snapshot.proposedValue === null) return invalid('The proposed price is unknown. Record a price and create a new request before simulating price approval.');
  if (request.reply) return request.reply.kind === kind && request.reply.message === message
    ? { project, outcome: 'unchanged', requestId } : invalid('This request already has a saved reply. Create a new request version for another response.');
  if (context.entry.status !== 'pendingApproval' || context.entry.scopeDisposition !== 'variation') return invalid('Only extra work awaiting approval can receive a simulated reply.');
  const date = dateInput(now);
  if (!date || date.getTime() < Date.parse(request.requestedAt)) return invalid('Use a reply date on or after the request date.');
  const reply: VOConfirmationReply = { kind, message, repliedAt: date.toISOString(), respondent: request.recipient, channel: 'demo' };
  const requests = normalizeVOConfirmationRequests(project).map(value => value.id === requestId ? { ...value, reply } : value);
  return { project: { ...project, voConfirmationRequests: requests, history: [{ id: crypto.randomUUID(), action: 'VO customer reply simulated',
    detail: `${context.entry.reference} · Request version ${request.version} · ${kind === 'priceApproved' ? 'Price approved' : kind === 'scopeAcknowledged' ? 'Scope acknowledged' : 'Changes requested'} · QS review remains separate`,
    date: reply.repliedAt, actor: `${request.recipient} · Simulated reply` }, ...project.history] }, outcome: 'updated', requestId };
}

/** Explicit UI copying only: this never calls or replaces the existing QS approval action. */
export function getVOConfirmationApprovalValues(project: Project, caseId: string, requestId: string) {
  const context = getVOConfirmationContext(project, caseId);
  const request = context.currentRequest;
  if (!context.entry || context.entry.status !== 'pendingApproval' || context.entry.scopeDisposition !== 'variation'
    || !request || request.id !== requestId || request.reply?.kind !== 'priceApproved' || request.snapshot.proposedValue === null) return null;
  return { approvedValue: request.snapshot.proposedValue, approvalReference: `${request.reference} · Simulated price approval`, approver: `${request.reply.respondent} · Demo reply` };
}
