import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput } from '../types/domain';
import { getClaimTracking } from './claim-tracking.ts';

const issuedStatuses = new Set(['submitted', 'queried', 'certified', 'paid']);

// Issued assessments continue through tracking or their explicit query revision.
export function getClaimPeriodLock(project: Project, period: unknown) {
  if (!project || !Array.isArray(project.claimDrafts) || typeof period !== 'string') return null;
  const drafts = project.claimDrafts.filter((draft) => draft?.period === period)
    .sort((a, b) => b.revision - a.revision);
  for (const draft of drafts) {
    const tracking = getClaimTracking(project, draft.id);
    if (tracking && issuedStatuses.has(tracking.status)) return { draft, status: tracking.status };
  }
  return null;
}
