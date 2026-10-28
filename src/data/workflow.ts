import type { Project, SiteReport, AttentionTask, ClaimDraft, WorkItem, WhatsAppMessage } from "../types/domain";
import { getWhatsAppMessages } from './whatsapp.ts';
import { getMessageInboxDecision } from './message-dismissal.ts';
import { getVOCases, getVOClaimEligibility } from './vo.ts';
import { isReviewableProgressReport, needsProgressClarification } from './report-status.ts';
import { getClaimTracking } from './claim-tracking.ts';
import { getClaimRevisionContext } from './claim-revisions.ts';
import { getLatestProgressReports } from './progress-review.ts';
import { getItemAreaAllocation, getItemAreaRollup } from './area-allocations.ts';
import { getMessageClarification } from './whatsapp-clarification.ts';

const list = <T,>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const numberOf = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`;
}

// Navigation guidance only. Physical progress and recorded approvals do not
// determine claimable money, and no source or saved assessment is changed here.
export function getProjectWorkflow(project: Project, period = currentMonth()) {
  const items = list(project.items).map(item=>getItemAreaAllocation(project,item.id).split?{...item,reported:getItemAreaRollup(project,item.id,'reported').completion,verified:getItemAreaRollup(project,item.id,'verified').completion}:item);
  const itemIds = new Set(items.map((item) => item.id));
  const reports = list(project.reports).filter((report) => !report.projectId || report.projectId === project.id);
  const latestReports = getLatestProgressReports(project).filter(report=>itemIds.has(report.itemId || ''));
  const pendingReports = latestReports.filter(isReviewableProgressReport);
  const clarificationReports = latestReports.filter(needsProgressClarification);
  const unresolvedReportSources = new Set([...pendingReports, ...clarificationReports].map((report) => report.sourceMessageId).filter(Boolean));
  const messages = getWhatsAppMessages(project).filter((message) => message.projectId === project.id);
  const actionableMessages = messages.filter(message => {
    const decision = getMessageInboxDecision(project, message.id);
    if (decision.dismissed || decision.blocked) return false;
    const context = getMessageClarification(project, message.id);
    return !(context?.reply?.id === message.id && context!.stage === 'superseded');
  });
  const clarificationMessages = actionableMessages.filter((message) => message.status === 'clarification'
    && (!reports.some((report) => report.sourceMessageId === message.id) || unresolvedReportSources.has(message.id)));
  const clarificationEvents = new Set([
    ...clarificationMessages.map((message) => `message:${message.id}`),
    ...clarificationReports.map((report) => report.sourceMessageId ? `message:${report.sourceMessageId}` : `report:${report.id}`),
  ]);
  const newMessages = actionableMessages.filter((message) => message.status === 'new'
    && message.projectId === project.id && !reports.some((report) => report.sourceMessageId === message.id))
    .sort((a, b) => timestamp(b.date) - timestamp(a.date));
  const cases = getVOCases({ ...project, items, reports });
  const openVOs = cases.filter((entry) => !['approved', 'rejected', 'linked'].includes(entry.status) || entry.status === 'approved' && entry.claimEligibility !== 'excluded' && !getVOClaimEligibility(entry).eligible);
  const currentDrafts = list(project.claimDrafts).filter((draft) => draft.projectId === project.id
    && draft.snapshot?.projectId === project.id && draft.period === period && draft.snapshot.period === period
    && ['draft', 'prepared'].includes(draft.status) && Number.isInteger(draft.revision))
    .sort((a, b) => b.revision - a.revision || timestamp(b.createdAt) - timestamp(a.createdAt));
  const latestDraft = currentDrafts[0];
  const claimTracking = latestDraft?.status === 'prepared' ? getClaimTracking(project, latestDraft.id) : null;
  const claimStatus = claimTracking?.status || 'prepared';
  const revisionContext = latestDraft?.revisionOf ? getClaimRevisionContext(project, latestDraft.revisionOf) : null;
  const isRevision = !!revisionContext && revisionContext.query?.id === latestDraft?.queryId && revisionContext.revision?.id === latestDraft?.id;
  const claimStatusLabels: Record<string, string> = { prepared: 'Prepared locally', submitted: isRevision ? 'Resubmitted · demo' : 'Submitted · demo', queried: 'Needs revision · demo', certified: 'Certified · demo', paid: 'Paid · demo' };
  const claimGuidance: Record<string, string> = {
    prepared: isRevision ? `Record a mock resubmission for saved revision ${latestDraft.revision}, responding to query ${revisionContext.query.reference}. The original claim stays unchanged.` : `Record a mock submission for saved revision ${latestDraft?.revision}, then track certification and payment. Nothing is sent externally.`,
    queried: `Review the query on saved revision ${latestDraft?.revision}, then prepare a separate revised claim. The original claim stays unchanged.`,
    submitted: `Record the mock certification for saved revision ${latestDraft?.revision}, including the certified amount.`,
    certified: `Record payment against the certified amount for saved revision ${latestDraft?.revision}. Partial payments stay in progress.`,
    paid: `Review the completed mock payment history for saved revision ${latestDraft?.revision}.`,
  };
  const counts = {
    items: items.length,
    contractReview: items.filter((item) => item.needsReview).length,
    newMessages: newMessages.length,
    pendingReports: pendingReports.length,
    clarifications: clarificationEvents.size,
    verifiedItems: items.filter((item) => typeof item.verified === 'number' && item.verified > 0).length,
    openVOs: openVOs.length,
    approvedVOs: cases.filter((entry) => entry.status === 'approved').length,
    eligibleVOs: cases.filter((entry) => getVOClaimEligibility(entry).eligible).length,
    savedClaims: currentDrafts.length,
  };
  const confirmed = items.length > 0 && project.locked === true && counts.contractReview === 0;
  const steps = [
    { id: 'contract', label: 'Contract', route: 'contract',
      status: !items.length ? 'Not started' : confirmed ? 'Confirmed' : 'Needs review',
      detail: !items.length ? 'Upload a PDF and review the simulated demo work list.'
        : counts.contractReview ? `${numberOf(counts.contractReview, 'item')} to check against the contract.`
          : !confirmed ? 'Confirm the checked contract before verifying progress.' : `Contract version ${project.version || 1} confirmed.` },
    { id: 'site', label: 'Site updates', route: counts.newMessages ? 'whatsapp' : counts.pendingReports ? 'completion' : clarificationMessages.length ? 'whatsapp' : 'completion',
      status: counts.newMessages ? 'New updates' : counts.pendingReports ? 'Needs verification' : counts.clarifications ? 'Needs clarification' : counts.verifiedItems ? 'Up to date' : 'Not started',
      detail: counts.newMessages ? `${numberOf(counts.newMessages, 'new message')} to review.`
        : counts.pendingReports ? `${numberOf(counts.pendingReports, 'site report')} to review and verify.`
          : counts.clarifications ? `${numberOf(counts.clarifications, 'site update')} waiting for clearer information.`
          : counts.verifiedItems ? `${numberOf(counts.verifiedItems, 'item')} with verified progress.` : 'Receive a site update, then verify its progress.' },
    { id: 'vo', label: 'Extra work', route: 'vo',
      status: counts.openVOs ? 'Needs review' : counts.approvedVOs ? 'Price approved' : 'Optional',
      detail: counts.openVOs ? `${numberOf(counts.openVOs, 'extra work case')} to review. Verified work can still be assessed separately.`
        : counts.approvedVOs ? counts.eligibleVOs ? `${numberOf(counts.eligibleVOs, 'variation')} eligible for QS claim assessment.` : 'Price approval recorded; no extra work is currently eligible for a new claim.' : 'Review extra scope when it is flagged.' },
    { id: 'claims', label: 'Claims', route: 'claims',
      status: latestDraft ? latestDraft.status === 'prepared' ? claimStatusLabels[claimStatus] : isRevision ? 'Revision saved' : 'Draft saved' : 'Not started',
      detail: latestDraft ? `${period} · saved revision ${latestDraft.revision}. ${latestDraft.status === 'prepared' ? claimStatus === 'prepared' ? 'Ready for mock submission tracking.' : `${claimStatusLabels[claimStatus]}. Open Claims to review its tracking.` : isRevision ? `Revises version ${revisionContext.source.revision}. Continue the query response before preparing.` : 'Continue the saved assessment before preparing.'}`
        : 'Enter QS quantities and previous claim values for the month.' },
  ];

  let next;
  if (!items.length) next = { route: 'contract', label: 'Add a contract', description: 'Choose a PDF or use the demo contract, then review a simulated work list. The selected PDF is not read.' };
  else if (!confirmed) next = { route: 'contract', label: counts.contractReview ? 'Review contract items' : 'Confirm contract',
    description: counts.contractReview ? 'Check the highlighted items against the source, then confirm the contract.' : 'Confirm the reviewed work list before verifying site progress.' };
  else if (counts.newMessages) next = { route: 'whatsapp', label: 'Review site messages',
    description: 'Check the latest message and photo before updating reported progress.', messageId: newMessages[0].id };
  else if (counts.pendingReports) next = { route: 'completion', label: 'Verify site progress',
    description: 'Review the latest report for each work item and confirm the observed completion.' };
  else if (counts.openVOs) next = { route: 'vo', label: 'Review extra work',
    description: 'Review the scope, instruction, price approval and claim checks. Verified contract work can still be assessed separately.', caseId: openVOs[0].id };
  else if (latestDraft) next = latestDraft.status === 'prepared'
    ? { route: 'claim-status', label: claimStatus === 'queried' ? 'Review claim query' : 'Track claim status', description: claimGuidance[claimStatus], draftId: latestDraft.id }
    : isRevision ? { route: 'claims', revisionSourceId: revisionContext.source.id, label: 'Continue claim revision', description: `Review the response to ${revisionContext.query.reference} and the revised assessment before preparing version ${latestDraft.revision}.` }
      : { route: 'claims', label: 'Continue monthly claim', description: 'Review the saved assessment and its outstanding checks before preparing it.' };
  else if (items.some((item) => item.pricingType === 'measured' && typeof item.verified === 'number' && item.verified > 0) || counts.eligibleVOs) next = {
    route: 'claims', label: 'Prepare monthly claim', description: 'Assess verified work and recorded approvals. Enter claim quantities and values separately from physical progress.',
  };
  else next = { route: 'completion', label: 'Add a site update', description: 'Add a site report for a contract item, then review its progress.' };
  return { period, steps, next, counts };
}
