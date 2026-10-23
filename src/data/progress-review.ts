import type { DateInput, Project, SiteReport, WorkItem } from '../types/domain';
import { isReviewableProgressReport, isUnresolvedProgressReport, needsProgressClarification } from './report-status.ts';
import { getAreaLinkStatus, snapshotMappedArea } from './drawing-mapping.ts';
import { getAreaAllocationSnapshot, getAreaItemProgress, getItemAreaAllocation, sameProgressScope, syncAreaItemProgress } from './area-allocations.ts';

const completionValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  && value >= 0 && value <= 100 ? value : null;
const reportTime = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
const inProject = (project: Project, report: SiteReport) => (!report.projectId || report.projectId === project.id)
  && (!report.projectCode || report.projectCode === project.code);
const reviewer = 'Alex Tan · Demo reviewer';
const supervisor = 'Alex Tan · Demo supervisor';
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const audit = (action: string, detail: string, date: string, actor = reviewer) => ({ id: crypto.randomUUID(), action, detail, date, actor });
const dateFor = (now: DateInput) => { try { const date = new Date(now); return Number.isFinite(date.getTime()) ? date.toISOString() : null; } catch { return null; } };

/** Latest observation for every independent area/item scope, unresolved first.
 * Existing whole-item observations stay in history after explicit allocations.
 */
export function getLatestProgressReports(project: Project | null | undefined, itemId?: string, areaId?: string): SiteReport[] {
  if (!project) return [];
  const items = (Array.isArray(project.items) ? project.items : []).filter(item => !itemId || item.id === itemId);
  const allocation = new Map(items.map(item => [item.id, getItemAreaAllocation(project, item.id)]));
  const latest: SiteReport[] = [];
  for (const { entry } of (Array.isArray(project.reports) ? project.reports : [])
    .map((entry, index) => ({ entry, index, time: reportTime(entry.date) }))
    .filter(({ entry }) => !entry.vo && inProject(project, entry) && (!itemId || entry.itemId === itemId)
      && (!areaId || entry.areaProgress?.areaId === areaId)
      && (!allocation.get(entry.itemId || '')?.split || Boolean(entry.areaProgress)))
    .sort((a, b) => b.time - a.time || b.index - a.index)) {
    if (!latest.some(report => sameProgressScope(report, entry))) latest.push(entry);
  }
  return latest.sort((a, b) => Number(isUnresolvedProgressReport(b)) - Number(isUnresolvedProgressReport(a)));
}

// Prefer an unresolved area so another area's verified update cannot hide it.
export function getItemProgressReview(project: Project | null | undefined, item: WorkItem | null | undefined, areaId?: string) {
  const latest = item ? getLatestProgressReports(project, item.id, areaId) : [];
  const report = latest.find(isUnresolvedProgressReport) || latest[0];
  const result = (key: string, label: string, tone: string, actionLabel: string, checked = false) => ({ report, key, label, tone, actionLabel, checked });
  if (isReviewableProgressReport(report)) return result('review', 'To check', 'amber', 'Review update');
  if (needsProgressClarification(report)) return result('clarification', 'Needs clarification', 'amber', 'View clarification');
  if (report?.status === 'rejected') return result('rejected', 'Update rejected', 'slate', 'View evidence');
  const areaScoped = Boolean(project && item && areaId && getItemAreaAllocation(project, item.id).split);
  const verified = completionValue(areaScoped ? getAreaItemProgress(project!, areaId!, item!.id, 'verified').completion : item?.verified);
  const reviewed = ['verified', 'approved'].includes(report?.status || '');
  if (verified !== null && verified > 0 || (reviewed && verified === 0)) return result('verified', 'Checked progress', 'green', report ? 'View evidence' : 'View progress', true);
  const reported = completionValue(areaScoped ? getAreaItemProgress(project!, areaId!, item!.id, 'reported').completion : item?.reported);
  if (reported === null) return result('unknown', 'Not recorded', 'slate', report ? 'View evidence' : 'View progress');
  if (!report && reported === 0) return result('no-update', 'No update yet', 'slate', 'View progress');
  return result('not-checked', 'Not checked', 'slate', report ? 'View evidence' : 'View progress');
}

export interface ProgressMutation { project: Project; outcome: 'updated' | 'unchanged' | 'invalid'; error?: string; reportId?: string; note?: string }

function supersedeScope(project: Project, replacement: SiteReport, date: string, reason: string) {
  const ids: string[] = [];
  const reports = project.reports.map(report => {
    if (report.id === replacement.id || !inProject(project, report) || !sameProgressScope(report, replacement) || !isUnresolvedProgressReport(report)) return report;
    ids.push(report.id);
    return { ...report, status: 'superseded', supersededByReportId: replacement.id, supersededAt: date, supersededBy: reviewer, supersededReason: reason };
  });
  return { ids, reports };
}

function currentAreaSnapshot(project: Project, report: SiteReport) {
  const saved = report.areaProgress;
  if (!saved || !report.itemId) return null;
  const current = getAreaAllocationSnapshot(project, saved.areaId, report.itemId);
  return current && current.areaId === saved.areaId && current.itemId === saved.itemId
    && current.allocatedQuantity === saved.allocatedQuantity && current.contractQuantity === saved.contractQuantity ? current : null;
}

/** Supervisor verification changes the selected scope; claims remain independent. */
export function verifyProgressReport(project: Project, reportId: string, percentage: string | number, reason: string, now: DateInput = new Date()): ProgressMutation {
  const invalid = (error: string): ProgressMutation => ({ project, outcome: 'invalid', error });
  const matches = (project.reports || []).filter(report => report.id === reportId && inProject(project, report));
  const report = matches.length === 1 ? matches[0] : null;
  const item = project.items.find(item => item.id === report?.itemId);
  const pct = typeof percentage === 'number' ? percentage : percentage.trim() === '' ? NaN : Number(percentage);
  if (!project.locked) return invalid('Confirm the contract baseline first.');
  if (!report || !item || report.vo || report.completionBasis !== 'cumulative') return invalid('Resolve the item and completion basis before verification.');
  if (needsProgressClarification(report)) return invalid('This report needs clarification. Add a clearer cumulative update before verifying progress.');
  if (!isReviewableProgressReport(report)) return { project, outcome: 'unchanged', reportId, note: 'This report is already reviewed. Completion is unchanged.' };
  if (completionValue(pct) === null) return invalid('Enter a completion between 0 and 100%.');
  const allocation = getItemAreaAllocation(project, item.id);
  if (allocation.split && !currentAreaSnapshot(project, report)) return invalid('This item now uses area quantities. Add an update for a saved allocated area; the original whole-item report stays in history.');
  if (!allocation.split && report.areaProgress) return invalid('The saved area allocation is unavailable. Review the area links before verification.');
  const previousAreaReport = report.areaProgress ? project.reports
    .filter(entry => entry.id !== report.id && !entry.vo && inProject(project, entry) && sameProgressScope(entry, report)
      && ['verified', 'approved'].includes(entry.status))
    .sort((a, b) => reportTime(b.verifiedAt || b.date) - reportTime(a.verifiedAt || a.date))[0] : null;
  const previous = report.areaProgress ? completionValue(previousAreaReport?.approvedCompletion ?? previousAreaReport?.completion) : completionValue(item.verified);
  if ((pct !== report.completion || previous !== null && pct < previous) && !text(reason)) return invalid('Add a reason when correcting or reducing progress.');
  if (project.reports.some(entry => entry.id !== report.id && !entry.vo && inProject(project, entry) && sameProgressScope(entry, report)
    && reportTime(entry.date) > reportTime(report.date))) return invalid('A newer report exists for this area. Review the latest report first.');
  const date = dateFor(now);
  if (!date) return invalid('Choose a valid verification date.');
  const prior = supersedeScope(project, report, date, 'A newer cumulative report was verified. Original observations are retained.');
  const scoped = report.areaProgress ? `${report.areaMapping?.code || report.areaProgress.areaId} · ${item.id}` : item.id;
  const updated = syncAreaItemProgress({ ...project,
    items: project.items.map(entry => !report.areaProgress && entry.id === item.id ? { ...entry, verified: pct } : entry),
    reports: prior.reports.map(entry => entry.id === report.id ? { ...entry, status: 'verified', approvedCompletion: pct,
      reviewReason: text(reason), verifiedBy: supervisor, verifiedAt: date } : entry),
    history: [audit('Progress verified', `${scoped} · ${previous ?? 'Not recorded'}% → ${pct}% total${text(reason) ? ` · ${text(reason)}` : ''}`, date),
      ...(prior.ids.length ? [audit('Earlier progress reports superseded', `${prior.ids.join(', ')} · replaced by verified report ${report.id}`, date)] : []), ...project.history],
  }, item.id);
  return { project: updated, outcome: 'updated', reportId, note: `${scoped} verified at ${pct}% of ${report.areaProgress ? 'its allocated quantity' : 'the work item'}. No claim amount was created.` };
}

/** Manual mock reports use the same allocation and supersession rules as inbox updates. */
export function addProgressReport(project: Project, values: unknown, now: DateInput = new Date()): ProgressMutation {
  const invalid = (error: string): ProgressMutation => ({ project, outcome: 'invalid', error });
  if (!record(values)) return invalid('Select an item, enter 0–100% and include the source message.');
  const item = project.items.find(item => item.id === values.itemId);
  const pct = typeof values.completion === 'number' ? values.completion : text(values.completion) ? Number(values.completion) : NaN;
  if (!item || completionValue(pct) === null || !text(values.message)) return invalid('Select an item, enter 0–100% and include the source message.');
  const area = text(values.area) || item.demoArea || item.location;
  const areaLink = getAreaLinkStatus(project, { projectId: project.id, itemId: item.id, area, kind: 'progress' });
  if (areaLink.conflict) return invalid(`Area ${areaLink.area?.code} is linked to ${areaLink.area?.workItemIds.join(', ')}, not ${item.id}. Check the area or work item before adding this report.`);
  const allocation = getItemAreaAllocation(project, item.id);
  const areaProgress = allocation.split && areaLink.area ? getAreaAllocationSnapshot(project, areaLink.area.id, item.id) : null;
  if (allocation.split && (!areaProgress || values.areaId && values.areaId !== areaProgress.areaId)) return invalid('Choose an area with a saved quantity allocation for this contract item.');
  const date = dateFor(now);
  if (!date) return invalid('Choose a valid report date.');
  const baseId = `DEMO-${Date.parse(date)}`;
  let reportId = baseId, sequence = 1;
  while (project.reports.some(report => report.id === reportId)) reportId = `${baseId}-${sequence++}`;
  const report: SiteReport = { id: reportId, itemId: item.id, projectId: project.id, projectCode: project.code,
    area, areaMapping: snapshotMappedArea(areaLink.area), ...(areaProgress ? { areaProgress } : {}), location: item.location,
    sender: 'Demo worker', date, completion: pct, completionBasis: 'cumulative', status: 'pending',
    message: text(values.message), origin: 'simulated', demo: true, vo: false, ...(typeof values.photo === 'string' && values.photo ? { photo: values.photo } : {}) };
  if (project.reports.some(entry => !entry.vo && inProject(project, entry) && sameProgressScope(entry, report)
    && !['rejected', 'superseded'].includes(entry.status) && reportTime(entry.date) > reportTime(date))) return invalid('A newer report exists for this area. Review the chronology before adding a cumulative update.');
  const prior = supersedeScope(project, report, date, 'Replaced by a newer cumulative report. Original observations are retained.');
  const next = syncAreaItemProgress({ ...project,
    items: project.items.map(entry => !areaProgress && entry.id === item.id ? { ...entry, reported: pct } : entry),
    reports: [...prior.reports, report],
    history: [audit('Demo site report received', `${item.id}${areaProgress ? ` · ${areaLink.area?.code}` : ''} · ${pct}% total`, date),
      ...(prior.ids.length ? [audit('Earlier progress reports superseded', `${prior.ids.join(', ')} · replaced by ${reportId}`, date)] : []), ...project.history],
  }, item.id);
  return { project: next, outcome: 'updated', reportId, note: 'Demo report added. Verified progress is unchanged.' };
}
