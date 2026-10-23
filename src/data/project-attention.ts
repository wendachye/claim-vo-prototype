import type { Project, SiteReport, AttentionTask, ClaimDraft, WorkItem, WhatsAppMessage } from "../types/domain";
import { getWhatsAppMessages, getMessageReport } from './whatsapp.ts';
import { getItemProgressReview } from './progress-review.ts';
import { getVOCases, getVOClaimEligibility } from './vo.ts';
import { normalizeClaimDrafts } from './claims.ts';
import { getClaimTracking } from './claim-tracking.ts';
import { getClaimRevisionContext } from './claim-revisions.ts';
import { getMessageClarification } from './whatsapp-clarification.ts';

const list = <T,>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const inProject = (project: Project, entry: { projectId?: string; projectCode?: string } | null | undefined) => entry && typeof entry === 'object'
  && (!entry.projectId || entry.projectId === project.id)
  && (!entry.projectCode || text(entry.projectCode).toUpperCase() === text(project.code).toUpperCase());
const uniqueIds = <T extends { id: string },>(entries: T[]): T[] => {
  const counts = new Map<string, number>();
  for (const entry of entries) if (text(entry?.id)) counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
  return entries.filter((entry) => text(entry?.id) && counts.get(entry.id) === 1);
};
const timestamp = (value: unknown) => typeof value === 'string' && typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity;
const claimDetail = (draft: ClaimDraft) => `${draft.period} · version ${draft.revision}`;

// The queue is derived from saved project records on each render. Opening a task
// does not complete it; the source workflow's explicit action changes the queue.
export function getProjectAttention(project: Project): AttentionTask[] {
  if (!text(project?.id)) return [];
  const tasks: AttentionTask[] = [];
  const add = (task: Omit<AttentionTask, "projectId" | "date"> & { date?: string | null }) => tasks.push({ projectId: project.id, ...task, date: text(task.date) || null });
  const reports = uniqueIds(list(project.reports)).filter((entry) => inProject(project, entry));
  const items = uniqueIds(list(project.items)).filter((entry) => inProject(project, entry));
  const scoped = { ...project, reports };
  const rawMessages = Array.isArray(project.whatsappMessages) ? project.whatsappMessages : getWhatsAppMessages(project);
  const messages = uniqueIds(rawMessages).filter((entry) => entry.projectId === project.id && entry.projectCode === project.code);

  for (const item of items) {
    const review = getItemProgressReview(scoped, item);
    const report = review.report;
    if (!report || !['review', 'clarification'].includes(review.key)) continue;
    const clarification = review.key === 'clarification';
    add({ id: `progress:${report.id}`, category: 'site', kind: clarification ? 'clarification' : 'progress',
      title: clarification ? 'Clarify a site update' : 'Verify site progress',
      detail: `${item.ref || item.id} · ${item.description || 'Contract work'}`,
      reference: report.id, statusLabel: clarification ? 'Needs clarification' : 'Awaiting verification',
      actionLabel: clarification ? 'View clarification' : 'Review update', date: report.date,
      priority: clarification ? 35 : 20, target: { route: 'completion', itemId: item.id, reportId: report.id } });
  }

  for (const message of messages) {
    // Paired inbox messages are represented by their latest progress review or
    // VO case, including when the inbox status was left stale by an old demo.
    if (getMessageReport(scoped, message) || !['new', 'clarification'].includes(message.status)) continue;
    const clarification = message.status === 'clarification';
    const context = getMessageClarification(scoped, message.id);
    if (context?.reply?.id === message.id && context!.stage === 'superseded') continue;
    const isReply = context?.reply?.id === message.id;
    add({ id: `message:${message.id}`, category: 'site', kind: clarification ? 'clarification' : 'message',
      title: clarification ? 'Clarify a site message' : isReply ? 'Review a clarification reply' : 'Review a site message',
      detail: [message.sender, message.area || message.location].filter(Boolean).join(' · ') || 'Mock site update',
      reference: message.id, statusLabel: clarification ? 'Needs clarification' : isReply ? 'Reply received' : 'New message',
      actionLabel: clarification ? 'View message' : isReply ? 'Review reply' : 'Review message', date: message.date,
      priority: clarification ? 55 : 60, target: { route: 'whatsapp', messageId: message.id } });
  }

  for (const entry of getVOCases(scoped)) {
    const claimCheck = entry.status === 'approved' && entry.claimEligibility !== 'excluded' && !getVOClaimEligibility(entry).eligible;
    if (!claimCheck && !['flagged', 'clarification', 'pendingApproval'].includes(entry.status)) continue;
    add({ id: `vo:${entry.id}`, category: 'vo', kind: claimCheck ? 'vo-eligibility' : 'vo', title: claimCheck ? 'Check VO claim eligibility' : entry.title || 'Review extra work',
      detail: [entry.report.location, entry.report.area].filter(Boolean).join(' · ') || 'Extra work flagged for QS review',
      reference: entry.reference, statusLabel: claimCheck ? 'Claim checks pending' : entry.status === 'pendingApproval' ? 'Awaiting approval' : entry.status === 'clarification' ? 'Needs information' : 'Needs review',
      actionLabel: claimCheck ? 'Review claim eligibility' : entry.status === 'pendingApproval' ? 'Review approval' : 'Review extra work',
      date: entry.history.at(-1)?.date || entry.report.date, priority: claimCheck ? 28 : entry.status === 'pendingApproval' ? 25 : 30,
      target: { route: 'vo', caseId: entry.id } });
  }

  const rawDrafts = uniqueIds(list(project.claimDrafts));
  const allowedDraftIds = new Set(rawDrafts.map((draft) => draft.id));
  const drafts = normalizeClaimDrafts(project).filter((draft) => allowedDraftIds.has(draft.id)
    && inProject(project, draft) && inProject(project, draft.snapshot))
    .sort((a, b) => b.revision - a.revision || timestamp(b.createdAt) - timestamp(a.createdAt) || a.id.localeCompare(b.id));
  const latest = new Map<string, ClaimDraft>();
  for (const draft of drafts) if (!latest.has(draft.period)) latest.set(draft.period, draft);
  const handled = new Set();
  const tracking = new Map(drafts.filter((draft) => draft.status === 'prepared').map((draft) => [draft.id, getClaimTracking(project, draft.id)]));

  for (const source of drafts) {
    if (tracking.get(source.id)?.status !== 'queried') continue;
    handled.add(source.id);
    const context = getClaimRevisionContext(project, source.id);
    const child = context?.revision;
    const childTracking = child ? tracking.get(child.id) : null;
    if (childTracking && childTracking.status !== 'prepared') continue;
    if (child && latest.get(child.period)?.id === child.id && (child.status === 'prepared' || context.canRevise)) {
      handled.add(child.id);
      const prepared = child.status === 'prepared';
      add({ id: prepared ? `claim-submit:${child.id}` : `claim-query:${source.id}`, category: 'claims', kind: prepared ? 'claim-submit' : 'claim-query',
        title: prepared ? 'Resubmit the revised claim' : 'Continue claim revision',
        detail: `${claimDetail(child)} · responds to ${context.query.reference}`, reference: child.id,
        statusLabel: prepared ? 'Ready to resubmit' : 'Needs revision', actionLabel: prepared ? 'Open revised claim' : 'Continue revision',
        date: context.query.date, priority: 10,
        target: prepared ? { route: 'claim-status', draftId: child.id } : { route: 'claims', revisionSourceId: source.id, draftId: child.id } });
      continue;
    }
    add({ id: `claim-query:${source.id}`, category: 'claims', kind: 'claim-query',
      title: context?.canRevise ? 'Respond to a claim query' : 'Review a claim query',
      detail: `${claimDetail(source)} · ${context?.query.reference || 'Recorded query'}`, reference: source.id,
      statusLabel: 'Needs revision', actionLabel: 'Review query', date: context?.query.date, priority: 10,
      target: { route: 'claim-status', draftId: source.id } });
  }

  for (const draft of drafts) {
    if (handled.has(draft.id)) continue;
    const stage = tracking.get(draft.id);
    if (draft.status === 'draft') {
      if (latest.get(draft.period)?.id !== draft.id) continue;
      add({ id: `claim-prepare:${draft.id}`, category: 'claims', kind: 'claim-prepare',
        title: draft.revisionOf ? 'Continue claim revision' : 'Finish preparing a claim',
        detail: claimDetail(draft), reference: draft.id, statusLabel: 'Draft saved',
        actionLabel: draft.revisionOf ? 'Continue revision' : 'Continue claim', date: draft.createdAt, priority: 40,
        target: { route: 'claims', draftId: draft.id, ...(draft.revisionOf ? { revisionSourceId: draft.revisionOf } : {}) } });
    } else if (stage?.status === 'prepared') {
      if (latest.get(draft.period)?.id !== draft.id) continue;
      add({ id: `claim-submit:${draft.id}`, category: 'claims', kind: 'claim-submit',
        title: draft.revisionOf ? 'Resubmit the revised claim' : 'Record claim submission',
        detail: claimDetail(draft), reference: draft.id, statusLabel: draft.revisionOf ? 'Ready to resubmit' : 'Prepared',
        actionLabel: 'Open claim status', date: stage.preparedAt, priority: 40, target: { route: 'claim-status', draftId: draft.id } });
    } else if (stage?.status === 'submitted') {
      add({ id: `claim-certify:${draft.id}`, category: 'claims', kind: 'claim-certify', title: 'Record claim certification',
        detail: claimDetail(draft), reference: draft.id, statusLabel: 'Awaiting certification', actionLabel: 'Open claim status',
        date: stage.submittedAt, priority: 45, target: { route: 'claim-status', draftId: draft.id } });
    } else if (stage?.status === 'certified') {
      add({ id: `claim-payment:${draft.id}`, category: 'claims', kind: 'claim-payment', title: 'Record claim payment',
        detail: claimDetail(draft), reference: draft.id, statusLabel: stage.paidValue === null || stage.paidValue === 0 ? 'Awaiting payment' : 'Part paid',
        actionLabel: 'Open claim status', date: stage.history.at(-1)?.date || stage.certifiedAt,
        priority: 50, target: { route: 'claim-status', draftId: draft.id } });
    }
  }

  return tasks.sort((a, b) => a.priority - b.priority || timestamp(a.date) - timestamp(b.date) || a.id.localeCompare(b.id));
}
