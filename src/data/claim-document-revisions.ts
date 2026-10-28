import type { ClaimDocumentDetails, ClaimDraft } from '../types/claims';
import type { Project } from '../types/domain';
import { normalizeClaimDrafts } from './claims.ts';
import { buildClaimPack } from './claim-pack.ts';
import { getClaimPeriodLock } from './claim-actions.ts';
import { normalizeClaimTracking } from './claim-tracking.ts';
import { getClaimDocumentDetails, isClaimDocumentDetails, validateClaimDocumentDetails } from './claim-document-details.ts';

const clone = <T>(value: T): T => structuredClone(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function sourceState(project: Project, draftId: string) {
  if (!record(project) || typeof project.id !== 'string' || typeof draftId !== 'string') return null;
  const raw = Array.isArray(project.claimDrafts) ? project.claimDrafts : [];
  const matches = raw.filter(draft => draft?.id === draftId);
  if (matches.length !== 1) return null;
  const source = normalizeClaimDrafts(project).find(draft => draft.id === draftId);
  if (!source) return null;
  const month = raw.filter(draft => draft?.period === source.period);
  const ids = new Set<string>(), revisions = new Set<number>();
  for (const draft of month) {
    if (!normalizeClaimDrafts({ ...project, claimDrafts: [draft] }).length
      || ids.has(draft.id) || revisions.has(draft.revision)) return null;
    ids.add(draft.id); revisions.add(draft.revision);
  }
  if (project.claimTracking !== undefined && !Array.isArray(project.claimTracking)) return null;
  const monthTracking = (project.claimTracking || []).filter(entry => ids.has(entry?.draftId));
  const normalizedTracking = normalizeClaimTracking(project);
  const trackedIds = new Set<string>();
  for (const entry of monthTracking) {
    if (entry.projectId !== project.id || trackedIds.has(entry.draftId)
      || !normalizedTracking.some(tracking => tracking.draftId === entry.draftId)) return null;
    trackedIds.add(entry.draftId);
  }
  const tracking = monthTracking.filter(entry => entry.draftId === source.id);
  // The source snapshot and its lifecycle form the stale-edit token. Latest
  // revision and the whole month's issued state are checked separately.
  const sourceKey = JSON.stringify({ source, tracking });
  return { source, month, sourceKey, latest: [...month].sort((a, b) => b.revision - a.revision)[0] };
}

export function getClaimDocumentEditContext(project: Project, draftId: string): {
  eligible: boolean; details: ClaimDocumentDetails | null; sourceKey: string; error?: string;
} {
  const state = sourceState(project, draftId);
  if (!state) return { eligible: false, details: null, sourceKey: '', error: 'Choose a unique saved claim from the selected project.' };
  const result = buildClaimPack(project, draftId);
  if (result.outcome !== 'ready') return { eligible: false, details: null, sourceKey: '', error: result.error };
  const details = getClaimDocumentDetails(result.pack);
  if (getClaimPeriodLock(project, state.source.period)) return {
    eligible: false, details, sourceKey: '', error: 'This claim month has already been submitted. Use the existing query and revision flow for changes.',
  };
  if (state.latest.id !== draftId) return {
    eligible: false, details, sourceKey: '', error: 'Edit the latest saved version for this month.',
  };
  return { eligible: true, details, sourceKey: state.sourceKey };
}

export function saveClaimDocumentDetails(project: Project, draftId: string,
  input: { details: unknown; sourceKey: string }, now = new Date().toISOString()):
  { project: Project; outcome: 'updated' | 'unchanged'; draft: ClaimDraft }
  | { project: Project; outcome: 'invalid'; error: string } {
  const invalid = (error: string) => ({ project, outcome: 'invalid' as const, error });
  if (!record(input) || typeof input.sourceKey !== 'string' || !input.sourceKey) return invalid('Reopen Edit claim details before saving.');
  const checked = validateClaimDocumentDetails(input.details);
  if (!checked.details) return invalid(checked.error || 'Check the claim details.');
  const state = sourceState(project, draftId);
  if (!state || state.sourceKey !== input.sourceKey) return invalid('This saved claim changed. Reopen Edit claim details before saving.');
  if (getClaimPeriodLock(project, state.source.period)) return invalid('This claim month has already been submitted. Use the existing query and revision flow for changes.');
  const context = getClaimDocumentEditContext(project, draftId);

  // A repeated click against the same source returns its unchanged, unissued
  // child. It cannot append another revision or resurrect an older version.
  const child = state.latest;
  if (!context.eligible && child?.documentRevisionOf === state.source.id
    && child.revision === state.source.revision + 1 && child.status === 'draft'
    && isClaimDocumentDetails(child.documentDetails) && same(child.documentDetails, checked.details)
    && same(child.snapshot, state.source.snapshot) && same(child.assessment, state.source.assessment)
    && same(child.projectDetails, state.source.projectDetails)) {
    return { project, outcome: 'unchanged', draft: clone(child) };
  }
  if (!context.eligible || !context.details) return invalid(context.error || 'Edit the latest saved claim.');
  if (same(context.details, checked.details)) return { project, outcome: 'unchanged', draft: clone(state.source) };
  if (typeof now !== 'string' || !Number.isFinite(Date.parse(now))) return invalid('Use a valid saved date.');
  const revision = state.source.revision + 1;
  const id = `CLAIM-${project.id}-${state.source.period}-R${revision}`;
  if ((project.claimDrafts || []).some(draft => draft?.id === id)) return invalid('A saved version with this reference already exists. Reopen the latest claim.');
  const draft: ClaimDraft = {
    ...clone(state.source), id, revision, status: 'draft', createdAt: now,
    documentDetails: clone(checked.details), documentRevisionOf: state.source.id,
  };
  delete draft.preparedAt;
  // Header revisions are independent of query-response lineage.
  delete draft.revisionOf; delete draft.queryId; delete draft.revisionResponse;
  return { outcome: 'updated', draft: clone(draft), project: {
    ...project, claimDrafts: [...project.claimDrafts, draft],
    history: [{ id: crypto.randomUUID(), action: 'Claim document details saved',
      detail: `${draft.period} · revision ${revision} · printed details only; saved amounts and evidence unchanged`,
      date: now, actor: 'Alex Tan · Demo QS reviewer' }, ...(project.history || [])],
  } };
}
