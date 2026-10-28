import type { Project, SiteReport, WhatsAppMessage } from '../types/domain';
import { getAreaAllocationSnapshot, getAreaItemProgress, getItemAreaAllocation, sameProgressScope } from './area-allocations.ts';
import { getAreaLinkStatus } from './drawing-mapping.ts';
import { getMessageMatchContext } from './message-match.ts';
import { getWhatsAppMessages } from './whatsapp.ts';
import { getMessageClarification } from './whatsapp-clarification.ts';
import { getMessageInboxDecision } from './message-dismissal.ts';

export interface MessageProgressCheck {
  kind: 'repeated' | 'older' | 'lower'; completion: number; reported: number | null; verified: number | null;
  basis: 'area' | 'whole-item'; itemId: string; areaId: string | null;
  latestReportId: string | null; latestReportDate: string | null; isBelowVerified: boolean;
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value === value.trim();
const percent = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const time = (value: unknown): number | null => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const local = (project: Project, value: { projectId?: unknown; projectCode?: unknown }) => (!value.projectId || value.projectId === project.id)
  && (!value.projectCode || value.projectCode === project.code);
const activeStatuses = new Set(['pending', 'needsReview', 'needsClarification', 'clarification', 'verified', 'approved']);

/** Explain an already trustworthy cumulative match; never process, deduplicate,
 * or infer an area percentage from the item's quantity-weighted rollup. */
export function getMessageProgressCheck(project: Project, messageId: string): MessageProgressCheck | null {
  const inboxDecision = getMessageInboxDecision(project, messageId);
  if (inboxDecision.dismissed || inboxDecision.blocked) return null;
  const messages = Array.isArray(project?.whatsappMessages) ? project.whatsappMessages : getWhatsAppMessages(project);
  const matches = messages.filter(entry => record(entry) && entry.id === messageId);
  const source = matches.length === 1 ? matches[0] : null;
  if (!source || !text(source.id) || source.projectId !== project.id || source.projectCode !== project.code
    || !['new', 'clarification'].includes(source.status) || source.kind !== 'progress' || source.vo
    || source.reportId || source.clarificationReplyMessageId) return null;
  const reports = Array.isArray(project.reports) ? project.reports : [];
  if (reports.some(report => record(report) && local(project, report) && report.sourceMessageId === source.id)) return null;

  // A chronology rejection changes inbox status only. Revalidate its exact
  // saved review against today's source/map without changing stored evidence.
  const reviewProject = source.status === 'clarification' ? { ...project,
    whatsappMessages: messages.map(message => message === source ? { ...message, status: 'new' } : message) } : { ...project, whatsappMessages: messages };
  let message: WhatsAppMessage = source;
  if (['matchSuggestion', 'audio', 'originalTranscript'].some(field => Object.hasOwn(source, field))) {
    const match = getMessageMatchContext(reviewProject, source.id);
    if (!match.eligible || !match.review || !match.effectiveMessage || match.requiresReview || match.clarificationRequired) return null;
    message = match.effectiveMessage;
  }
  if (message.kind !== 'progress' || message.vo || message.completionBasis !== 'cumulative'
    || percent(message.completion) === null || time(message.date) === null || typeof message.text !== 'string') return null;
  if (/\b(?:additional|another|extra)\s+\d+(?:\.\d+)?\s*%|\b(?:incremental|variation order)\b|\bpossible\s+VO\b|\+\s*\d+(?:\.\d+)?\s*%/i.test(message.text)
    || [...message.text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].some(value => Number(value[1]) !== message.completion)) return null;
  if (message.replyToMessageId || message.clarificationThreadId) {
    const clarification = getMessageClarification(project, message.id);
    if (!clarification || clarification.reply?.id !== message.id || clarification.stage === 'superseded') return null;
  }
  const items = project.items.filter(item => item.id === message.itemId);
  const item = items.length === 1 && local(project, items[0]) ? items[0] : null;
  if (!item || !text(item.id) || item.pricingType !== 'measured') return null;
  const linked = getAreaLinkStatus(project, message);
  if (linked.ambiguous || linked.blocked || linked.conflict
    || (message.areaId || message.areaMapping?.areaId || message.areaProgress?.areaId) && !linked.area) return null;
  const allocation = getItemAreaAllocation(project, item.id);
  if (!allocation.valid) return null;
  const areaProgress = allocation.split && linked.area ? getAreaAllocationSnapshot(project, linked.area.id, item.id) : null;
  if (allocation.split && !areaProgress || message.areaProgress && (!areaProgress
    || message.areaProgress.areaId !== areaProgress.areaId || message.areaProgress.itemId !== areaProgress.itemId
    || message.areaProgress.allocatedQuantity !== areaProgress.allocatedQuantity
    || message.areaProgress.contractQuantity !== areaProgress.contractQuantity)) return null;
  const scope = { itemId: item.id, ...(areaProgress ? { areaProgress } : {}) };
  const usableReports: SiteReport[] = reports.filter(report => record(report) && local(project, report) && text(report.id)
    && reports.filter(candidate => candidate?.id === report.id).length === 1 && !report.vo && report.kind !== 'vo'
    && activeStatuses.has(report.status) && report.completionBasis === 'cumulative' && percent(report.completion) !== null
    && time(report.date) !== null && sameProgressScope(report, scope)
    && (!areaProgress || report.areaProgress?.allocatedQuantity === areaProgress.allocatedQuantity
      && report.areaProgress.contractQuantity === areaProgress.contractQuantity));
  const latest = usableReports.map((report, index) => ({ report, index }))
    .sort((a, b) => time(b.report.date)! - time(a.report.date)! || b.index - a.index)[0]?.report || null;
  const safeProject = { ...project, reports: usableReports };
  const reported = areaProgress ? getAreaItemProgress(safeProject, areaProgress.areaId, item.id, 'reported').completion : percent(item.reported);
  const verified = areaProgress ? getAreaItemProgress(safeProject, areaProgress.areaId, item.id, 'verified').completion : percent(item.verified);
  const completion = message.completion!;
  const isBelowVerified = verified !== null && completion < verified;
  const kind = latest && time(message.date)! < time(latest.date)! ? 'older'
    : reported !== null && completion < reported || isBelowVerified ? 'lower'
      : completion === reported || reported === null && completion === verified ? 'repeated' : null;
  if (!kind || source.status === 'clarification' && kind !== 'older') return null;
  return { kind, completion, reported, verified, basis: areaProgress ? 'area' : 'whole-item', itemId: item.id,
    areaId: areaProgress?.areaId || null, latestReportId: latest?.id || null, latestReportDate: latest?.date || null, isBelowVerified };
}
