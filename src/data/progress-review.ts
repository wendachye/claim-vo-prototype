import type { Project, WorkItem } from "../types/domain";
import { isReviewableProgressReport, needsProgressClarification } from './report-status.ts';

const completionValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  && value >= 0 && value <= 100 ? value : null;

const reportTime = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return -Infinity;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : -Infinity;
};

// One latest report drives the list status, filters and evidence opened for an item.
// A dated report takes priority over undated legacy evidence; the last saved row wins ties.
export function getItemProgressReview(project: Project | null | undefined, item: WorkItem | null | undefined) {
  const report = (Array.isArray(project?.reports) ? project.reports : [])
    .map((entry, index) => ({ entry, index, time: reportTime(entry.date) }))
    .filter(({ entry }) => entry.itemId === item?.id && !entry.vo
      && (!entry.projectId || entry.projectId === project?.id)
      && (!entry.projectCode || entry.projectCode === project?.code))
    .sort((a, b) => b.time - a.time || b.index - a.index)[0]?.entry;

  const result = (key: string, label: string, tone: string, actionLabel: string, checked = false) => ({
    report, key, label, tone, actionLabel, checked,
  });
  if (isReviewableProgressReport(report)) return result('review', 'To check', 'amber', 'Review update');
  if (needsProgressClarification(report)) return result('clarification', 'Needs clarification', 'amber', 'View clarification');
  if (report?.status === 'rejected') return result('rejected', 'Update rejected', 'slate', 'View evidence');

  const verified = completionValue(item?.verified);
  const reviewed = ['verified', 'approved'].includes(report?.status || '');
  if (verified !== null && verified > 0 || (reviewed && verified === 0)) {
    return result('verified', 'Checked progress', 'green', report ? 'View evidence' : 'View progress', true);
  }

  const reported = completionValue(item?.reported);
  if (reported === null) return result('unknown', 'Not recorded', 'slate', report ? 'View evidence' : 'View progress');
  if (!report && reported === 0) return result('no-update', 'No update yet', 'slate', 'View progress');
  return result('not-checked', 'Not checked', 'slate', report ? 'View evidence' : 'View progress');
}
