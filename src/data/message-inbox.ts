import type { ClarificationContext } from './whatsapp-clarification';
import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput } from '../types/domain';
import { VO_STATUS_LABELS } from './vo.ts';
import { isReviewableProgressReport, needsMessageClarification, needsProgressClarification } from './report-status.ts';

// Report evidence takes priority over a legacy inbox status. Viewing never processes it.
export const isNewInboxMessage = (message?: WhatsAppMessage | null, report?: SiteReport | null, clarification?: ClarificationContext | null) => Boolean(message?.status === 'new' && !report
  && !(clarification?.reply?.id === message.id && clarification.stage === 'superseded'));

export function getMessageReviewStatus(message?: WhatsAppMessage | null, report?: SiteReport | null, voCase?: VOCase | null, clarification?: ClarificationContext | null) {
  if (!report && clarification && clarification.reply?.id === message?.id && clarification.stage === 'superseded') return { label: 'Reply superseded', tone: 'slate' };
  if (clarification?.reply && clarification.thread.sourceMessageId === message?.id) {
    const statuses: Record<string, { label: string; tone: string }> = {
      'reply-received': { label: 'Reply received', tone: 'blue' },
      verification: { label: 'Awaiting verification', tone: 'amber' },
      verified: { label: 'Clarification resolved', tone: 'green' },
      rejected: { label: 'Reply dismissed', tone: 'slate' },
      superseded: { label: 'Reply superseded', tone: 'slate' },
      clarification: { label: 'Further clarification needed', tone: 'amber' },
      'vo-review': { label: 'Extra-work review', tone: 'slate' },
    };
    return statuses[clarification.stage] || { label: 'Reply saved', tone: 'slate' };
  }
  if (report?.vo) {
    const status = voCase?.status || (report.status === 'rejected' ? 'rejected' : 'flagged');
    return {
      label: status === 'flagged' ? 'Needs extra-work review' : (VO_STATUS_LABELS as Readonly<Record<string, string>>)[status] || 'Needs extra-work review',
      tone: status === 'approved' ? 'green' : ['rejected', 'linked'].includes(status) ? 'slate' : 'amber',
    };
  }
  if (report?.status === 'rejected') return { label: 'Dismissed', tone: 'slate' };
  if (['verified', 'approved'].includes(report?.status || '')) return { label: 'Checked progress', tone: 'green' };
  if (report?.status === 'superseded') return { label: 'Superseded', tone: 'slate' };
  if (needsProgressClarification(report)) return { label: 'Needs clarification', tone: 'amber' };
  if (isReviewableProgressReport(report)) return { label: 'To check', tone: 'amber' };
  if (report) return { label: 'Update added', tone: 'slate' };
  if (needsMessageClarification(message, report)) return { label: 'Needs clarification', tone: 'amber' };
  if (isNewInboxMessage(message, report)) return { label: 'New', tone: 'blue' };
  return { label: 'Update added', tone: 'slate' };
}

export function matchesInboxFilter(filter: string, message?: WhatsAppMessage | null, report?: SiteReport | null, clarification?: ClarificationContext | null) {
  if (!message) return false;
  if (filter === 'all') return true;
  // Keep the original in history; the separate reply/report owns the next task.
  if (clarification?.reply && clarification.thread.sourceMessageId === message.id) return filter === 'processed';
  if (!report && clarification?.reply?.id === message.id && clarification.stage === 'superseded') return filter === 'processed';
  if (filter === 'new') return isNewInboxMessage(message, report);
  if (filter === 'review') return isReviewableProgressReport(report);
  if (filter === 'processed') return Boolean(report) || message.status === 'processed';
  if (filter === 'vo') return message.kind === 'vo' || Boolean(report?.vo);
  if (filter === 'clarification') return needsMessageClarification(message, report);
  return false;
}
