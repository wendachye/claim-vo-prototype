import { normalizeClaimDrafts } from './claims.js';

// Simulated lifecycle records are separate from the immutable QS claim revision.
const clone = (value) => structuredClone(value);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const actions = ['submitted', 'certified', 'payment'];

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function preparedDay(value) {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;
}

function amount(value) {
  if (!['string', 'number'].includes(typeof value) || typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? money(number) : null;
}

function preparedDraft(project, draftId) {
  if (!record(project) || !text(project.id) || !text(draftId)) return null;
  const matches = (Array.isArray(project.claimDrafts) ? project.claimDrafts : []).filter((entry) => entry?.id === draftId);
  if (matches.length !== 1) return null;
  return normalizeClaimDrafts(project).find((entry) => entry.id === draftId && entry.status === 'prepared') || null;
}

function baseline(project, draft) {
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

function cleanFields(action, input) {
  const fields = record(input) ? input : {};
  return { stage: action, date: text(fields.date), reference: text(fields.reference), note: text(fields.note),
    value: action === 'submitted' ? null : amount(fields.value) };
}

function sameEvent(event, next) {
  return ['stage', 'date', 'reference', 'note', 'value'].every((key) => event[key] === next[key]);
}

function transitionError(tracking, fields) {
  if (!actions.includes(fields.stage)) return 'Choose a valid claim status action.';
  if (!validDay(fields.date)) return 'Enter a valid date.';
  if (!fields.reference) return 'Enter the reference for this status.';
  const previousDay = tracking.history.at(-1)?.date || preparedDay(tracking.preparedAt);
  if (!previousDay) return 'The prepared date is missing. Review this claim revision before tracking it.';
  if (fields.date < previousDay) return 'Use a date on or after the previous claim stage.';
  if (fields.stage === 'submitted') {
    if (tracking.status !== 'prepared') return 'This revision has already been submitted in the demo.';
    if (!finite(tracking.claimedValue)) return 'The saved claim amount is unknown. Prepare a complete revision first.';
  } else if (fields.stage === 'certified') {
    if (tracking.status !== 'submitted') return 'Record submission before certification.';
    if (fields.value === null) return 'Enter the certified amount, including zero if nothing was certified.';
    if (fields.value !== money(tracking.claimedValue) && !fields.note) return 'Explain why the certified amount differs from the claimed amount.';
  } else {
    if (tracking.status !== 'certified') return tracking.status === 'paid' ? 'This revision is already paid in the demo.' : 'Record certification before payment.';
    if (fields.value === null) return 'Enter the total paid to date, including zero if no payment was received.';
    const certified = tracking.certifiedValue;
    const lower = Math.min(0, certified);
    const upper = Math.max(0, certified);
    if (fields.value < lower || fields.value > upper) return 'The total paid must be between zero and the certified amount.';
    if (tracking.paidValue !== null && (Math.abs(fields.value) <= Math.abs(tracking.paidValue))) return 'Enter a higher total paid to date. Earlier payments are already recorded.';
  }
  return '';
}

function applyEvent(tracking, event) {
  const next = { ...tracking, history: [...tracking.history, clone(event)] };
  if (event.stage === 'submitted') Object.assign(next, {
    status: 'submitted', submittedAt: event.date, submissionReference: event.reference, submissionNote: event.note,
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

export function normalizeClaimTracking(project) {
  const seen = new Set();
  return (Array.isArray(project?.claimTracking) ? project.claimTracking : []).flatMap((entry) => {
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
      if (transitionError(tracking, fields) || tracking.history.some((prior) => sameEvent(prior, fields))) return [];
      tracking = applyEvent(tracking, { ...fields, id: event.id, recordedAt: event.recordedAt });
      eventIds.add(event.id);
    }
    seen.add(entry.draftId);
    return [tracking];
  });
}

export function getClaimTracking(project, draftId) {
  const draft = preparedDraft(project, draftId);
  if (!draft) return null;
  return normalizeClaimTracking(project).find((entry) => entry.draftId === draftId) || baseline(project, draft);
}

export function recordClaimStage(project, draftId, action, input = {}) {
  const tracking = getClaimTracking(project, draftId);
  const invalid = (error) => ({ project, outcome: 'invalid', tracking, error });
  if (!tracking) return invalid('Choose a prepared claim from the selected project.');
  const fields = cleanFields(action, input);
  if (tracking.history.some((event) => sameEvent(event, fields))) return { project, outcome: 'unchanged', tracking };
  const error = transitionError(tracking, fields);
  if (error) return invalid(error);
  const draft = preparedDraft(project, draftId);
  if (action === 'submitted' && normalizeClaimDrafts(project).some((entry) => entry.period === draft.period && entry.revision > draft.revision)) {
    return invalid('Submit the latest saved revision for this month.');
  }
  const recordedAt = new Date().toISOString();
  const event = { ...fields, id: crypto.randomUUID(), recordedAt };
  const next = applyEvent(tracking, event);
  const stage = action === 'payment' ? next.status === 'paid' ? 'paid' : 'part-payment recorded' : action;
  return { outcome: 'updated', tracking: clone(next), project: {
    ...project,
    claimTracking: [...normalizeClaimTracking(project).filter((entry) => entry.draftId !== draftId), next],
    history: [{ id: crypto.randomUUID(), action: `Mock claim ${stage}`,
      detail: `${draft.period} · revision ${draft.revision} · ${fields.reference} · simulated only`,
      date: recordedAt, actor: 'Alex Tan · Demo QS reviewer' }, ...(project.history || [])],
  } };
}
