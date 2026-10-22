import { getClaimTracking } from './claim-tracking.js';

const issuedStatuses = new Set(['submitted', 'queried', 'certified', 'paid']);

// Issued assessments continue through tracking or their explicit query revision.
export function getClaimPeriodLock(project, period) {
  if (!project || !Array.isArray(project.claimDrafts) || typeof period !== 'string') return null;
  const drafts = project.claimDrafts.filter((draft) => draft?.period === period)
    .sort((a, b) => b.revision - a.revision);
  for (const draft of drafts) {
    const tracking = getClaimTracking(project, draft.id);
    if (issuedStatuses.has(tracking?.status)) return { draft, status: tracking.status };
  }
  return null;
}
