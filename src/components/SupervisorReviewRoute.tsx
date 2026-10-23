import { useState } from 'react';
import type { Project } from '../types/domain';
import { createSupervisorReviewSnapshot, type SupervisorReviewSnapshot } from '../data/supervisor-review';
import { SupervisorReview, type SupervisorDecision, type SupervisorDecisionValues } from './SupervisorReview';

interface SupervisorReviewRouteProps {
  project: Project;
  routeProjectId: string | null;
  reportId: string | null;
  onBack: () => void;
  onDecision: (snapshot: SupervisorReviewSnapshot, decision: SupervisorDecision, values: SupervisorDecisionValues) => { outcome: 'updated' | 'unchanged' | 'invalid'; error?: string };
}

// Capture the viewed version once. A later source change must not approve unseen evidence.
export function SupervisorReviewRoute({ project, routeProjectId, reportId, onBack, onDecision }: SupervisorReviewRouteProps) {
  const [snapshot] = useState(() => routeProjectId === project.id && reportId ? createSupervisorReviewSnapshot(project, reportId) : null);
  return <SupervisorReview project={project} routeProjectId={routeProjectId} reportId={reportId} onBack={onBack}
    onDecision={(decision, values) => snapshot ? onDecision(snapshot, decision, values) : { outcome: 'invalid', error: 'This report is no longer available for review. Return to site progress and open a pending update.' }} />;
}
