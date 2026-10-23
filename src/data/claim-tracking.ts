import type { ClaimDraft, ClaimTracking, ClaimStageFields, ClaimStageEvent } from '../types/claims';
import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput } from '../types/domain';
import { normalizeClaimDrafts } from './claims.ts';

// Simulated lifecycle records are separate from the immutable QS claim revision.
const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const actions = ['submitted', 'query', 'certified', 'payment'];

function validDay(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function preparedDay(value: unknown) {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;
}

function amount(value: unknown) {
  if (!['string', 'number'].includes(typeof value) || typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? money(number) : null;
}

function preparedDraft(project: Project, draftId: unknown): ClaimDraft | null {
  if (!record(project) || !text(project.id) || !text(draftId)) return null;
  const matches = (Array.isArray(project.claimDrafts) ? project.claimDrafts : []).filter((entry) => entry?.id === draftId);
  if (matches.length !== 1) return null;
  return normalizeClaimDrafts(project).find((entry) => entry.id === draftId && entry.status === 'prepared') || null;
}

function baseline(project: Project, draft: ClaimDraft): ClaimTracking {
  return {
    projectId: project.id, draftId: draft.id, status: 'prepared',
    currency: text(draft.snapshot.currency) || null,
    claimedValue: finite(draft.snapshot.totals?.currentValue) ? draft.snapshot.totals.currentValue : null,
    preparedAt: draft.preparedAt || draft.createdAt || null,
    submittedAt: null, submissionReference: '', submissionNote: '',
    certifiedAt: null, certificationReference: '', certifiedValue: null, certificationNote: '',
    paidAt: null, paymentReference: '', paidValue: null, paymentNote: '', history: [],
  };
}

function cleanFields(action: string, input: unknown): ClaimStageFields {
  const fields = record(input) ? input : {};
  return { stage: action, date: text(fields.date), reference: text(fields.reference), note: text(fields.note),
    value: ['submitted', 'query'].includes(action) ? null : amount(fields.value),
    ...(action === 'query' ? { targetType: text(fields.targetType) || 'claim', targetId: text(fields.targetId) } : {}),
  };
}

function sameEvent(event: ClaimStageFields, next: ClaimStageFields) {
  return (['stage', 'date', 'reference', 'note', 'value', 'targetType', 'targetId'] as const).every((key) => event[key] === next[key]);
}

function queryTargetError(draft: ClaimDraft, fields: ClaimStageFields) {
  if (!['claim', 'work', 'vo'].includes(fields.targetType || '')) return 'Choose the claim, a saved work item or a saved VO for the query.';
  if (fields.targetType === 'claim') return fields.targetId ? 'A whole-claim query cannot name a separate work item.' : '';
  const rows = draft.snapshot[fields.targetType === 'work' ? 'workRows' : 'voRows'];
  return Array.isArray(rows) && rows.some((row) => row.included === true && row.id === fields.targetId)
    ? '' : 'Choose an included item from this saved claim revision.';
}

function transitionError(tracking: ClaimTracking, fields: ClaimStageFields, draft: ClaimDraft) {
  if (!actions.includes(fields.stage)) return 'Choose a valid claim status action.';
  if (!validDay(fields.date)) return 'Enter a valid date.';
  if (!fields.reference) return 'Enter the reference for this status.';
  const previousDay = tracking.history.at(-1)?.date || preparedDay(tracking.preparedAt);
  if (!previousDay) return 'The prepared date is missing. Review this claim revision before tracking it.';
  if (fields.date < previousDay) return 'Use a date on or after the previous claim stage.';
  if (fields.stage === 'submitted') {
    if (tracking.status !== 'prepared') return 'This revision has already been submitted in the demo.';
    if (!finite(tracking.claimedValue)) return 'The saved claim amount is unknown. Prepare a complete revision first.';
  } else if (fields.stage === 'query') {
    if (tracking.status !== 'submitted') return 'Queries can be recorded only for a submitted claim awaiting certification.';
    if (!fields.note) return 'Enter the query remarks so the QS knows what to revise.';
    const targetError = queryTargetError(draft, fields);
    if (targetError) return targetError;
  } else if (fields.stage === 'certified') {
    if (tracking.status === 'queried') return 'Respond to this query in a new revision before certification.';
    if (tracking.status !== 'submitted') return 'Record submission before certification.';
    if (fields.value === null) return 'Enter the certified amount, including zero if nothing was certified.';
    if (fields.value !== money(tracking.claimedValue!) && !fields.note) return 'Explain why the certified amount differs from the claimed amount.';
  } else {
    if (tracking.status !== 'certified') return tracking.status === 'paid' ? 'This revision is already paid in the demo.' : 'Record certification before payment.';
    if (fields.value === null) return 'Enter the total paid to date, including zero if no payment was received.';
    const certified = tracking.certifiedValue!;
    const lower = Math.min(0, certified);
    const upper = Math.max(0, certified);
    if (fields.value < lower || fields.value > upper) return 'The total paid must be between zero and the certified amount.';
    if (tracking.paidValue !== null && (Math.abs(fields.value) <= Math.abs(tracking.paidValue))) return 'Enter a higher total paid to date. Earlier payments are already recorded.';
  }
  return '';
}

function applyEvent(tracking: ClaimTracking, event: ClaimStageEvent): ClaimTracking {
  const next = { ...tracking, history: [...tracking.history, clone(event)] };
  if (event.stage === 'submitted') Object.assign(next, {
    status: 'submitted', submittedAt: event.date, submissionReference: event.reference, submissionNote: event.note,
  });
  else if (event.stage === 'query') Object.assign(next, {
    status: 'queried', query: { id: event.id, date: event.date, reference: event.reference, note: event.note,
      targetType: event.targetType, targetId: event.targetId },
  });
  else if (event.stage === 'certified') Object.assign(next, {
    status: 'certified', certifiedAt: event.date, certificationReference: event.reference,
    certifiedValue: event.value, certificationNote: event.note,
  });
  else Object.assign(next, {
    status: event.value === tracking.certifiedValue ? 'paid' : 'certified',
    paidAt: event.value === tracking.certifiedValue ? event.date : null,
    paymentReference: event.reference, paidValue: event.value, paymentNote: event.note,
  });
  return next;
}

function revisionSubmissionError(project: Project, draft: ClaimDraft | null, trackingRecords: ClaimTracking[], date: string | null, visiting = new Set<string>()): string {
  if (!draft) return 'Choose a saved prepared claim.';
  if (!draft.revisionOf && !draft.queryId && !draft.revisionResponse) return '';
  if (!text(draft.revisionOf) || !text(draft.queryId) || !text(draft.revisionResponse)) return 'Save a response linked to the original claim query before resubmitting.';
  if (visiting.has(draft.id)) return 'The revision link is invalid.';
  visiting.add(draft.id);
  const source = preparedDraft(project, draft.revisionOf);
  const originalTracking = trackingRecords.find((entry) => entry.draftId === source?.id);
  if (!source || source.period !== draft.period || source.revision >= draft.revision
    || originalTracking?.status !== 'queried' || originalTracking.query?.id !== draft.queryId) {
    return 'The original claim query is no longer available for this revision.';
  }
  if (date && date < originalTracking.query!.date) return 'Use a resubmission date on or after the original query.';
  return revisionSubmissionError(project, source, trackingRecords, originalTracking.submittedAt, visiting);
}

export function normalizeClaimTracking(project: Project): ClaimTracking[] {
  const seen = new Set();
  const trackingRecords = (Array.isArray(project?.claimTracking) ? project.claimTracking : []).flatMap((entry) => {
    if (!record(entry) || entry.projectId !== project.id || !text(entry.draftId) || seen.has(entry.draftId)
      || !Array.isArray(entry.history) || !entry.history.length) return [];
    const draft = preparedDraft(project, entry.draftId);
    if (!draft) return [];
    let tracking = baseline(project, draft);
    const eventIds = new Set();
    for (const event of entry.history) {
      if (!record(event) || !text(event.id) || eventIds.has(event.id)
        || typeof event.recordedAt !== 'string' || !Number.isFinite(Date.parse(event.recordedAt))) return [];
      const fields = cleanFields(event.stage, event);
      if (transitionError(tracking, fields, draft) || tracking.history.some((prior) => sameEvent(prior, fields))) return [];
      tracking = applyEvent(tracking, { ...fields, id: event.id, recordedAt: event.recordedAt });
      eventIds.add(event.id);
    }
    seen.add(entry.draftId);
    return [tracking];
  });
  return trackingRecords.filter((entry) => !revisionSubmissionError(project, preparedDraft(project, entry.draftId), trackingRecords, entry.submittedAt));
}

export function getClaimTracking(project: Project, draftId: unknown): ClaimTracking | null {
  const draft = preparedDraft(project, draftId);
  if (!draft) return null;
  return normalizeClaimTracking(project).find((entry) => entry.draftId === draftId) || baseline(project, draft);
}

export function recordClaimStage(project: Project, draftId: string, action: string, input: unknown = {}) {
  const tracking = getClaimTracking(project, draftId);
  const invalid = (error: string) => ({ project, outcome: 'invalid' as const, tracking, error });
  if (!tracking) return invalid('Choose a prepared claim from the selected project.');
  const fields = cleanFields(action, input);
  if (tracking.history.some((event) => sameEvent(event, fields))) return { project, outcome: 'unchanged' as const, tracking };
  const draft = preparedDraft(project, draftId);
  const error = transitionError(tracking, fields, draft!);
  if (error) return invalid(error);
  if (action === 'submitted' && normalizeClaimDrafts(project).some((entry) => entry.period === draft!.period && entry.revision > draft!.revision)) {
    return invalid('Submit the latest saved revision for this month.');
  }
  if (action === 'submitted') {
    const lineageError = revisionSubmissionError(project, draft, normalizeClaimTracking(project), fields.date);
    if (lineageError) return invalid(lineageError);
  }
  const recordedAt = new Date().toISOString();
  const event = { ...fields, id: crypto.randomUUID(), recordedAt };
  const next = applyEvent(tracking, event);
  const stage = action === 'query' ? 'queried' : action === 'payment' ? next.status === 'paid' ? 'paid' : 'part-payment recorded' : action;
  return { outcome: 'updated' as const, tracking: clone(next), project: {
    ...project,
    claimTracking: [...normalizeClaimTracking(project).filter((entry) => entry.draftId !== draftId), next],
    history: [{ id: crypto.randomUUID(), action: `Mock claim ${stage}`,
      detail: `${draft!.period} · revision ${draft!.revision} · ${fields.reference} · simulated only`,
      date: recordedAt, actor: 'Alex Tan · Demo QS reviewer' }, ...(project.history || [])],
  } };
}
