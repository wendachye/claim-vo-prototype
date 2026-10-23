import type { Project, SiteReport, WhatsAppMessage } from "../types/domain";
// Progress review states stay separate from recorded physical totals and VO review.
export const isReviewableProgressReport = (report: SiteReport | null | undefined) => Boolean(report && !report.vo
  && ['pending', 'needsReview'].includes(report.status));

export const needsProgressClarification = (report: SiteReport | null | undefined) => Boolean(report && !report.vo
  && ['needsClarification', 'clarification'].includes(report.status));

export const isUnresolvedProgressReport = (report: SiteReport | null | undefined) => isReviewableProgressReport(report)
  || needsProgressClarification(report);

export const needsMessageClarification = (message: WhatsAppMessage | null | undefined, report: SiteReport | null | undefined) => report
  ? needsProgressClarification(report)
  : message?.kind === 'clarification' || message?.status === 'clarification';

export function requestProgressClarification(project: Project, reportId: string, reason: string, now = new Date()) {
  const invalid = (error: string) => ({ project, outcome: 'invalid' as const, error });
  const report = (project.reports || []).find((entry) => entry.id === reportId
    && (!entry.projectId || entry.projectId === project.id)
    && (!entry.projectCode || entry.projectCode === project.code));
  if (!report || report.vo) return invalid('Choose a progress report from this project.');
  const note = typeof reason === 'string' ? reason.trim() : '';
  if (!note) return invalid('Add a note explaining what the worker needs to clarify.');
  if (needsProgressClarification(report) && report.reviewReason === note) return { project, outcome: 'unchanged' as const };
  if (!isReviewableProgressReport(report)) return invalid('Only a progress report awaiting review can be marked for clarification.');
  const date = new Date(now).toISOString();
  const actor = 'Alex Tan · Demo reviewer';
  return { outcome: 'updated' as const, project: {
    ...project,
    reports: project.reports.map((entry) => entry === report ? {
      ...entry, status: 'needsClarification', reviewReason: note,
      clarificationRequestedAt: date, clarificationRequestedBy: actor,
    } : entry),
    history: [{ id: crypto.randomUUID(), action: 'Progress clarification needed',
      detail: `${report.id} · ${note}`, date, actor }, ...(project.history || [])],
  } };
}
