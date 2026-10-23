import type { DateInput, Project, SiteReport, WorkItem } from '../types/domain';
import { getAreaAllocationSnapshot, getAreaItemProgress, getItemAreaAllocation, sameProgressScope } from './area-allocations.ts';
import { getDrawingMapping } from './drawing-mapping.ts';
import { getLatestProgressReports, verifyProgressReport } from './progress-review.ts';
import type { ProgressMutation } from './progress-review.ts';
import { isReviewableProgressReport, needsProgressClarification, requestProgressClarification } from './report-status.ts';

export type SupervisorReviewDecision = 'confirm' | 'correct' | 'cant-verify';
export interface SupervisorReviewSnapshot { projectId: string; reportId: string; key: string }
export interface SupervisorReviewContext {
  report: SiteReport | null; item: WorkItem | null; snapshot: SupervisorReviewSnapshot | null;
  reportedCompletion: number | null; verifiedCompletion: number | null;
  canReview: boolean; state: 'pending' | 'reviewed' | 'clarification' | 'unavailable'; error?: string;
}

const completion = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value)
  && value >= 0 && value <= 100 ? value : null;
const local = (project: Project, value: { projectId?: string; projectCode?: string }) => (!value.projectId || value.projectId === project.id)
  && (!value.projectCode || value.projectCode === project.code);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const reviewed = (report: SiteReport) => ['verified', 'approved', 'rejected'].includes(report.status) || needsProgressClarification(report);

// Decision fields change after review; the original observation must not. Keeping
// these separate lets a repeated submission be harmless without accepting a
// changed photo/message, contract scope or area allocation as the same review.
function sourceReport(report: SiteReport) {
  const { status: _status, approvedCompletion: _approved, reviewReason: _reason, verifiedBy: _by, verifiedAt: _at,
    clarificationRequestedAt: _requestedAt, clarificationRequestedBy: _requestedBy,
    supersededByReportId: _superseded, supersededAt: _supersededAt, supersededBy: _supersededBy,
    supersededReason: _supersededReason, ...source } = report;
  return source;
}

function sourceKey(project: Project, report: SiteReport, item: WorkItem) {
  const { reported: _reported, verified: _verified, ...scope } = item;
  const mapping = getDrawingMapping(project);
  const areaId = report.areaProgress?.areaId || report.areaMapping?.areaId;
  const area = areaId ? mapping.areas.find(entry => entry.id === areaId) || null : null;
  const baseline = (project.baselines || []).filter(entry => entry.version === project.version)
    .map(entry => ({ ...entry, items: entry.items.filter(value => value.id === item.id) }));
  const allocation = getItemAreaAllocation(project, item.id);
  return JSON.stringify({ project: { id: project.id, code: project.code, version: project.version, locked: project.locked,
    lockedAt: project.lockedAt, contractVersion: project.contractVersion }, contract: project.contract, baseline, item: scope,
    report: sourceReport(report), drawing: area ? mapping.drawing : null, area,
    allocation: { ...allocation, areas: allocation.areas.map(({ areaId: id, quantity }) => ({ areaId: id, quantity })) } });
}

function keyFor(project: Project, report: SiteReport, item: WorkItem) {
  const peers = project.reports.filter(entry => local(project, entry) && !entry.vo && sameProgressScope(entry, report));
  const verified = report.areaProgress ? getAreaItemProgress(project, report.areaProgress.areaId, item.id, 'verified').completion : item.verified;
  return JSON.stringify({ source: sourceKey(project, report, item), state: { verified, reports: peers } });
}

function savedSource(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(key);
    return parsed !== null && typeof parsed === 'object' && 'source' in parsed && typeof parsed.source === 'string'
      && 'state' in parsed ? parsed.source : null;
  } catch { return null; }
}

/** A scoped browser-local preview; this is not a share token or access check. */
export function getSupervisorReview(project: Project, projectId: string, reportId: string): SupervisorReviewContext {
  const unavailable = (error: string, report: SiteReport | null = null, item: WorkItem | null = null): SupervisorReviewContext => ({
    report, item, snapshot: null, reportedCompletion: completion(report?.completion), verifiedCompletion: null,
    canReview: false, state: 'unavailable', error,
  });
  if (!project || project.id !== projectId || !text(reportId)) return unavailable('Open a report from the selected project’s Site progress screen.');
  const matches = (project.reports || []).filter(entry => entry.id === reportId);
  const report = matches.length === 1 && local(project, matches[0]) ? matches[0] : null;
  if (!report) return unavailable('This report is unavailable in the selected project.');
  const items = (project.items || []).filter(entry => entry.id === report.itemId && local(project, entry));
  const item = items.length === 1 ? items[0] : null;
  if (!item || item.pricingType !== 'measured' || report.vo || report.completionBasis !== 'cumulative' || completion(report.completion) === null) {
    return unavailable('Resolve the work item and cumulative completion in Site progress first.', report, item);
  }
  if (!project.locked) return unavailable('Confirm the contract baseline before supervisor review.', report, item);
  const allocation = getItemAreaAllocation(project, item.id);
  if (allocation.split) {
    const saved = report.areaProgress;
    const current = saved ? getAreaAllocationSnapshot(project, saved.areaId, item.id) : null;
    if (!current || !saved || saved.itemId !== item.id || current.allocatedQuantity !== saved.allocatedQuantity
      || current.contractQuantity !== saved.contractQuantity) return unavailable('Review the saved area quantities before supervisor review.', report, item);
  } else if (report.areaProgress) return unavailable('The saved area quantity is unavailable. Review the area links first.', report, item);
  const latest = getLatestProgressReports(project, item.id, report.areaProgress?.areaId).find(entry => sameProgressScope(entry, report));
  if (latest?.id !== report.id || report.status === 'superseded') return unavailable('A newer update exists. Open the latest report from Site progress.', report, item);
  const verifiedCompletion = report.areaProgress ? getAreaItemProgress(project, report.areaProgress.areaId, item.id, 'verified').completion : completion(item.verified);
  const canReview = isReviewableProgressReport(report);
  const state = canReview ? 'pending' : needsProgressClarification(report) ? 'clarification' : reviewed(report) ? 'reviewed' : 'unavailable';
  return { report, item, reportedCompletion: completion(report.completion), verifiedCompletion, canReview, state,
    snapshot: canReview ? { projectId: project.id, reportId: report.id, key: keyFor(project, report, item) } : null,
    ...(state === 'unavailable' ? { error: 'This report is no longer awaiting supervisor review.' } : {}) };
}

export function createSupervisorReviewSnapshot(project: Project, reportId: string): SupervisorReviewSnapshot | null {
  return getSupervisorReview(project, project.id, reportId).snapshot;
}

/** Reuse the desktop verification transitions; no claim or source is rewritten. */
export function applySupervisorReview(project: Project, snapshot: SupervisorReviewSnapshot | null | undefined,
  decision: SupervisorReviewDecision, values: { completion?: string; reason?: string } = {}, now: DateInput = new Date()): ProgressMutation {
  const invalid = (error: string): ProgressMutation => ({ project, outcome: 'invalid', error });
  if (!snapshot || snapshot.projectId !== project.id || !savedSource(snapshot.key)) return invalid('Reopen this report from Site progress before reviewing it.');
  const context = getSupervisorReview(project, snapshot.projectId, snapshot.reportId);
  if (!context.report || !context.item || context.state === 'unavailable') return invalid(context.error || 'This report is unavailable.');
  if (savedSource(snapshot.key) !== sourceKey(project, context.report, context.item)) return invalid('The report or its contract/area details changed. Reopen the latest report before reviewing.');
  if (reviewed(context.report)) return { project, outcome: 'unchanged', reportId: snapshot.reportId,
    note: 'This report has already been reviewed. Progress is unchanged.' };
  if (context.snapshot?.key !== snapshot.key) return invalid('Progress changed while this review was open. Reopen the latest report before reviewing.');
  if (!['confirm', 'correct', 'cant-verify'].includes(decision)) return invalid('Choose Confirm, Correct or Can’t verify.');
  let date: Date;
  try { date = new Date(now); } catch { return invalid('Choose a valid review date.'); }
  if (!Number.isFinite(date.getTime())) return invalid('Choose a valid review date.');
  const reason = text(values.reason);
  if (decision === 'cant-verify') {
    if (!reason) return invalid('Add a reason explaining what needs clarification.');
    return requestProgressClarification(project, snapshot.reportId, reason, date);
  }
  if (decision === 'correct' && !reason) return invalid('Add a reason for the correction.');
  const percentage = decision === 'confirm' ? context.reportedCompletion! : values.completion ?? '';
  return verifyProgressReport(project, snapshot.reportId, percentage, reason, date);
}
