// Area markers summarize local VO review records; viewing a flag changes nothing.
import { getAreaEvidence } from './drawing-evidence.js';
import { getDrawingMapping } from './drawing-mapping.js';
import { getVOCases, VO_STATUS_LABELS } from './vo.js';

const openStatuses = ['flagged', 'clarification', 'pendingApproval'];
const text = (value) => typeof value === 'string' ? value.trim() : '';
const originalText = (value) => typeof value === 'string' ? value : '';

export function getAreaVOFlags(project, areaId) {
  const evidence = getAreaEvidence(project, areaId);
  if (!evidence) return null;
  const reviews = new Map(getVOCases(project).map((entry) => [entry.id, entry]));
  const seenCases = new Set(), seenMessages = new Set();
  const cases = [], newMessages = [];
  for (const entry of evidence.entries) {
    if (entry.kind !== 'vo') continue;
    const review = entry.reportId ? reviews.get(entry.reportId) : null;
    if (review && !seenCases.has(review.id)) {
      seenCases.add(review.id);
      cases.push({
        id: review.id, reportId: review.reportId,
        title: text(review.title) || 'Possible extra work', status: review.status,
        label: VO_STATUS_LABELS[review.status], tone: review.status === 'approved' ? 'green' : review.status === 'rejected' ? 'slate' : 'amber',
        date: originalText(entry.date), matchKind: entry.matchKind, matchLabel: entry.matchLabel,
      });
    } else if (!entry.reportId && entry.messageId && entry.status === 'new' && !seenMessages.has(entry.messageId)) {
      seenMessages.add(entry.messageId);
      newMessages.push({ id: entry.messageId, title: text(entry.text) || 'New extra-work message', date: originalText(entry.date), label: 'New extra-work message' });
    }
  }
  const openCount = cases.filter((entry) => openStatuses.includes(entry.status)).length;
  const approvedCount = cases.filter((entry) => entry.status === 'approved').length;
  const rejectedCount = cases.filter((entry) => entry.status === 'rejected').length;
  const newMessageCount = newMessages.length;
  const markerLabel = openCount ? `${openCount} VO to review`
    : newMessageCount ? `${newMessageCount} new extra-work message${newMessageCount === 1 ? '' : 's'}`
      : approvedCount ? `${approvedCount} approved VO${approvedCount === 1 ? '' : 's'}` : '';
  return {
    areaId: evidence.areaId, cases, openCount, approvedCount, rejectedCount, totalCount: cases.length,
    newMessageCount, newMessages, markerLabel, markerTone: openCount || newMessageCount ? 'amber' : approvedCount ? 'green' : 'slate',
  };
}

export function getDrawingVOFlags(project) {
  return getDrawingMapping(project).areas.map((area) => getAreaVOFlags(project, area.id));
}
