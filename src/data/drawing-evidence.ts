import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput } from '../types/domain';
// Read-only links to original site evidence. A drawing never changes a report.
import { getDrawingMapping } from './drawing-mapping.ts';
import { getWhatsAppMessages } from './whatsapp.ts';
import { needsProgressClarification } from './report-status.ts';
import { getMessageClarification } from './whatsapp-clarification.ts';
import { getMessageReviewStatus } from './message-inbox.ts';

type EvidenceSource = SiteReport | WhatsAppMessage;
export interface DrawingEvidenceEntry { id: string; messageId: string | null; reportId: string | null; sourceLabel: string; kind: string; status: string; label: string; tone: string; sender: string; date: string; text: string; photo: string | null; photoAlt: string; itemId: string | null; matchKind: 'saved-area' | 'area-code' | 'work-item'; matchLabel: string }

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const originalText = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const areaCode = (value: unknown) => text(value).replace(/^area\s+/i, '').toUpperCase();
const identifier = (value: unknown) => text(value) || null;
const hasArea = (entry: EvidenceSource) => entry.area != null && (typeof entry.area !== 'string' || Boolean(entry.area.trim()));

function inProject(project: Project, entry: unknown) {
  return record(entry)
    && (entry.projectId == null || entry.projectId === '' || entry.projectId === project.id)
    && (entry.projectCode == null || entry.projectCode === '' || (typeof entry.projectCode === 'string' && entry.projectCode.trim().toUpperCase() === text(project.code).toUpperCase()));
}

function collection<T extends EvidenceSource>(project: Project, values: T[] | undefined): T[] {
  const ids = new Set();
  return (Array.isArray(values) ? values : []).filter((entry) => {
    if (!inProject(project, entry) || !identifier(entry.id) || ids.has(entry.id)) return false;
    ids.add(entry.id);
    return true;
  });
}

function safePhoto(value: unknown) {
  const source = text(record(value) ? value.url : value);
  if (!source || /[\u0000-\u001f\u007f\\]/.test(source)) return null;
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/]+={0,2}$/i.test(source)) return source;
  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? source : null;
    } catch { return null; }
  }
  if (/^(?:\/(?!\/)|\.{1,2}\/|[a-z0-9_-]+\/)/i.test(source)
    || /^[a-z0-9_. -]+\.(?:png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(source)) return source;
  return null;
}

function matchArea(area: DrawingArea, entry: EvidenceSource, message: WhatsAppMessage | null = null) {
  if (record(entry.areaMapping) && Object.hasOwn(entry.areaMapping, 'areaId')) {
    return entry.areaMapping.areaId === area.id ? 'saved-area' : null;
  }
  const explicit = hasArea(entry) ? entry : message && hasArea(message) ? message : null;
  if (explicit) return areaCode(explicit.area) === area.code ? 'area-code' : null;
  return area.workItemIds.includes(entry.itemId || '') ? 'work-item' : null;
}

const reportStates: Record<string, { label: string; tone: string }> = {
  verified: { label: 'Verified', tone: 'green' },
  pending: { label: 'Needs verification', tone: 'amber' },
  needsReview: { label: 'Needs review', tone: 'amber' },
  needsClarification: { label: 'Needs clarification', tone: 'amber' },
  superseded: { label: 'Superseded', tone: 'slate' },
  rejected: { label: 'Dismissed', tone: 'slate' },
  clarification: { label: 'Needs clarification', tone: 'amber' },
};
const voStates: Record<string, { label: string; tone: string }> = {
  flagged: { label: 'Needs extra-work review', tone: 'amber' },
  clarification: { label: 'Needs information', tone: 'amber' },
  pendingApproval: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'slate' },
};
const matchLabels = {
  'saved-area': 'Saved area reference',
  'area-code': 'Matching area code',
  'work-item': 'Linked work item; area not stated',
};

function stateFor(project: Project, report: SiteReport | null, message: WhatsAppMessage | null | undefined, kind: string) {
  const clarification = message && getMessageClarification(project, message.id);
  if (!report && clarification?.reply && clarification.thread.sourceMessageId === message?.id) {
    return { status: `clarification-${clarification.stage}`, ...getMessageReviewStatus(message, null, null, clarification) };
  }
  if (report) {
    if (kind === 'vo') {
      const review = (Array.isArray(project.voReviews) ? project.voReviews : []).find((entry) => inProject(project, entry)
        && entry.projectId === project.id && entry.id === report.id && entry.reportId === report.id
        && typeof entry.status === 'string' && Object.hasOwn(voStates, entry.status));
      const status = review?.status || (report.status === 'rejected' ? 'rejected' : 'flagged');
      return { status, ...voStates[status] };
    }
    const status = identifier(report.status) || 'saved';
    return { status, ...(Object.hasOwn(reportStates, status) ? reportStates[status] : { label: 'Saved update', tone: 'slate' }) };
  }
  const status = identifier(message?.status) || 'new';
  if (kind === 'clarification' || status === 'clarification') return { status, label: 'Needs clarification', tone: 'amber' };
  if (status === 'new') return { status, label: kind === 'vo' ? 'Extra work · new' : 'New', tone: 'blue' };
  return { status, label: kind === 'vo' ? 'Needs extra-work review' : 'Saved message', tone: kind === 'vo' ? 'amber' : 'slate' };
}

function evidenceEntry(project: Project, area: DrawingArea, report: SiteReport | null, message: WhatsAppMessage | null | undefined): DrawingEvidenceEntry | null {
  const source = report || message;
  if (!source) return null;
  const matchKind = matchArea(area, source, report ? message || null : null);
  if (!matchKind) return null;
  const kind = report ? report.vo || report.kind === 'vo' ? 'vo'
    : report.kind === 'clarification' || needsProgressClarification(report) ? 'clarification' : 'progress'
    : message?.kind === 'vo' ? 'vo' : message?.kind === 'clarification' || message?.status === 'clarification' ? 'clarification' : 'progress';
  return {
    id: `${report ? 'report' : 'message'}:${source.id}`, messageId: message?.id || null, reportId: report?.id || null,
    sourceLabel: report?.channel === 'manual-vo-mock' ? 'Manual entry' : message || report?.channel === 'whatsapp-mock' ? 'WhatsApp message' : 'Site update',
    kind, ...stateFor(project, report, message, kind),
    sender: originalText(source.sender, 'Site worker'), date: originalText(source.date),
    text: originalText(report ? report.message : message?.text), photo: safePhoto(source.photo),
    photoAlt: originalText(source.photoAlt, 'Site photo attached to this update'), itemId: identifier(source.itemId),
    matchKind, matchLabel: matchLabels[matchKind],
  };
}

function compareEntries(first: DrawingEvidenceEntry, second: DrawingEvidenceEntry) {
  const firstDate = Date.parse(first.date), secondDate = Date.parse(second.date);
  const firstValid = Number.isFinite(firstDate), secondValid = Number.isFinite(secondDate);
  if (firstValid !== secondValid) return firstValid ? -1 : 1;
  if (firstValid && firstDate !== secondDate) return secondDate - firstDate;
  return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
}

export function getAreaEvidence(project: Project, areaId: string) {
  const area = getDrawingMapping(project).areas.find((entry) => entry.id === areaId);
  if (!area) return null;
  const messages = collection(project, project.whatsappMessages).filter((entry) => ['progress', 'vo', 'clarification'].includes(entry.kind));
  const reports = collection(project, project.reports);
  const consumed = new Set();
  const entries: DrawingEvidenceEntry[] = [];
  for (const report of reports) {
    const message = messages.find((entry) => entry.id === report.sourceMessageId)
      || messages.find((entry) => entry.reportId === report.id);
    // Consume the inbox copy even when its report belongs to a different area.
    // The saved report's area reference and evidence remain authoritative.
    for (const entry of messages) if (entry.id === report.sourceMessageId || entry.reportId === report.id) consumed.add(entry.id);
    const entry = evidenceEntry(project, area, report, message);
    if (entry) entries.push(entry);
  }
  for (const message of messages) {
    if (consumed.has(message.id)) continue;
    const entry = evidenceEntry(project, area, null, message);
    if (entry) entries.push(entry);
  }
  entries.sort(compareEntries);
  return { areaId: area.id, entries, messageCount: entries.length, photoCount: entries.filter((entry) => entry.photo).length };
}

export function resolveAreaEvidenceSource(project: Project, areaId: string, entryId: string) {
  const entry = getAreaEvidence(project, areaId)?.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return null;
  const message = collection(project, project.whatsappMessages).find((candidate) => candidate.id === entry.messageId);
  const report = collection(project, project.reports).find((candidate) => candidate.id === entry.reportId);
  // Object identity distinguishes the saved inbox from a generated fallback
  // containing a reused message ID. Compare originals before leaving the card.
  const sameOriginal = !report || (originalText(message?.text) === entry.text
    && safePhoto(message?.photo) === entry.photo
    && originalText(message?.photoAlt, 'Site photo attached to this update') === entry.photoAlt
    && originalText(message?.sender, 'Site worker') === entry.sender
    && originalText(message?.date) === entry.date);
  if (message && getWhatsAppMessages(project).includes(message) && sameOriginal) {
    return { kind: 'message', messageId: message.id, reportId: report?.id || null };
  }
  return report ? { kind: 'report', reportId: report.id } : { kind: 'unavailable' };
}
