import { normalizeClaimDrafts, saveClaimDraft } from './claims.js';
import { getClaimTracking } from './claim-tracking.js';

const clone = (value) => structuredClone(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';

// A response edits a separate draft. The submitted assessment and query event
// remain the original evidence even after the replacement has been resubmitted.
export function getClaimRevisionContext(project, sourceDraftId) {
  const tracking = getClaimTracking(project, sourceDraftId);
  if (tracking?.status !== 'queried' || !tracking.query) return null;
  const drafts = normalizeClaimDrafts(project);
  const source = drafts.find((draft) => draft.id === sourceDraftId);
  if (!source) return null;
  const revision = drafts.filter((draft) => draft.revisionOf === source.id && draft.queryId === tracking.query.id
    && draft.period === source.period && draft.revision > source.revision && text(draft.revisionResponse))
    .sort((a, b) => b.revision - a.revision)[0] || null;
  const latest = drafts.filter((draft) => draft.period === source.period).sort((a, b) => b.revision - a.revision)[0];
  const error = latest.id !== (revision?.id || source.id)
    ? 'Another saved version exists for this month. Review it before creating a query response.'
    : revision?.status === 'prepared' ? 'The revised claim is already prepared. Open its status to resubmit it.' : '';
  return { source, query: clone(tracking.query), revision, canRevise: !error, ...(error ? { error } : {}) };
}

export function saveClaimRevision(project, sourceDraftId, assessment, response) {
  const invalid = (error) => ({ project, outcome: 'invalid', error });
  const context = getClaimRevisionContext(project, sourceDraftId);
  if (!context) return invalid('Choose a submitted claim query from the selected project.');
  if (!context.canRevise) return invalid(context.error);
  const revisionResponse = text(response);
  if (!revisionResponse) return invalid('Enter the QS response to this query before saving the revised claim.');

  // Reuse ordinary claim validation and source capture. If only the query
  // response changed, force a new revision instead of reusing the source ID.
  const result = saveClaimDraft(project, context.source.period, assessment);
  if (result.outcome === 'invalid') return result;
  const lineage = { revisionOf: context.source.id, queryId: context.query.id, revisionResponse };
  if (result.outcome === 'unchanged' && result.draft.revisionOf === lineage.revisionOf
    && result.draft.queryId === lineage.queryId && result.draft.revisionResponse === lineage.revisionResponse) return result;
  const latestRevision = Math.max(...normalizeClaimDrafts(project).filter((draft) => draft.period === context.source.period).map((draft) => draft.revision));
  const date = new Date().toISOString();
  const draft = result.outcome === 'unchanged' ? {
    ...clone(result.draft), ...lineage, id: `CLAIM-${project.id}-${context.source.period}-R${latestRevision + 1}`,
    revision: latestRevision + 1, status: 'draft', createdAt: date,
  } : { ...result.draft, ...lineage };
  delete draft.preparedAt;
  const drafts = result.outcome === 'unchanged' ? [...normalizeClaimDrafts(project), draft]
    : result.project.claimDrafts.map((entry) => entry.id === draft.id ? draft : entry);
  return { outcome: 'updated', draft: clone(draft), project: {
    ...result.project, claimDrafts: drafts,
    history: [{ id: crypto.randomUUID(), action: 'Claim query response saved',
      detail: `${context.source.period} · revision ${draft.revision} responds to revision ${context.source.revision} · ${context.query.reference} · local demo`,
      date, actor: 'Alex Tan · Demo QS reviewer' }, ...(project.history || [])],
  } };
}
