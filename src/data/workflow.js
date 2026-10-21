import { getWhatsAppMessages } from './whatsapp.js';
import { getVOCases } from './vo.js';
import { isReviewableProgressReport, needsProgressClarification } from './report-status.js';
import { getClaimTracking } from './claim-tracking.js';

const list = (value) => Array.isArray(value) ? value : [];
const timestamp = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const numberOf = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`;
}

// Navigation guidance only. Physical progress and recorded approvals do not
// determine claimable money, and no source or saved assessment is changed here.
export function getProjectWorkflow(project, period = currentMonth()) {
  const items = list(project.items);
  const itemIds = new Set(items.map((item) => item.id));
  const reports = list(project.reports).filter((report) => !report.projectId || report.projectId === project.id);
  const latestReports = new Map();
  for (const report of reports) {
    if (report.vo || !itemIds.has(report.itemId)) continue;
    const previous = latestReports.get(report.itemId);
    if (!previous || timestamp(report.date) >= timestamp(previous.date)) latestReports.set(report.itemId, report);
  }
  const pendingReports = [...latestReports.values()].filter(isReviewableProgressReport);
  const clarificationReports = [...latestReports.values()].filter(needsProgressClarification);
  const unresolvedReportSources = new Set([...pendingReports, ...clarificationReports].map((report) => report.sourceMessageId).filter(Boolean));
  const messages = getWhatsAppMessages(project).filter((message) => message.projectId === project.id);
  const clarificationMessages = messages.filter((message) => message.status === 'clarification'
    && (!reports.some((report) => report.sourceMessageId === message.id) || unresolvedReportSources.has(message.id)));
  const clarificationEvents = new Set([
    ...clarificationMessages.map((message) => `message:${message.id}`),
    ...clarificationReports.map((report) => report.sourceMessageId ? `message:${report.sourceMessageId}` : `report:${report.id}`),
  ]);
  const newMessages = messages.filter((message) => message.status === 'new'
    && message.projectId === project.id && !reports.some((report) => report.sourceMessageId === message.id))
    .sort((a, b) => timestamp(b.date) - timestamp(a.date));
  const cases = getVOCases({ ...project, items, reports });
  const openVOs = cases.filter((entry) => !['approved', 'rejected'].includes(entry.status));
  const currentDrafts = list(project.claimDrafts).filter((draft) => draft.projectId === project.id
    && draft.snapshot?.projectId === project.id && draft.period === period && draft.snapshot.period === period
    && ['draft', 'prepared'].includes(draft.status) && Number.isInteger(draft.revision))
    .sort((a, b) => b.revision - a.revision || timestamp(b.createdAt) - timestamp(a.createdAt));
  const latestDraft = currentDrafts[0];
  const claimTracking = latestDraft?.status === 'prepared' ? getClaimTracking(project, latestDraft.id) : null;
  const claimStatus = claimTracking?.status || 'prepared';
  const claimStatusLabels = { prepared: 'Prepared locally', submitted: 'Submitted · demo', certified: 'Certified · demo', paid: 'Paid · demo' };
  const claimGuidance = {
    prepared: `Record a mock submission for saved revision ${latestDraft?.revision}, then track certification and payment. Nothing is sent externally.`,
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
      status: counts.openVOs ? 'Needs review' : counts.approvedVOs ? 'Approvals recorded' : 'Optional',
      detail: counts.openVOs ? `${numberOf(counts.openVOs, 'extra work case')} to review. Verified work can still be assessed separately.`
        : counts.approvedVOs ? `${numberOf(counts.approvedVOs, 'approval')} recorded; assess values in the claim.` : 'Review extra scope when it is flagged.' },
    { id: 'claims', label: 'Claims', route: 'claims',
      status: latestDraft ? latestDraft.status === 'prepared' ? claimStatusLabels[claimStatus] : 'Draft saved' : 'Not started',
      detail: latestDraft ? `${period} · saved revision ${latestDraft.revision}. ${latestDraft.status === 'prepared' ? claimStatus === 'prepared' ? 'Ready for mock submission tracking.' : `${claimStatusLabels[claimStatus]}. Open Claims to review its tracking.` : 'Continue the saved assessment before preparing.'}`
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
    description: 'Check the flagged scope and instruction. You can still claim verified work separately in Claims.', caseId: openVOs[0].id };
  else if (latestDraft) next = latestDraft.status === 'prepared'
    ? { route: 'claim-status', label: 'Track claim status', description: claimGuidance[claimStatus], draftId: latestDraft.id }
    : { route: 'claims', label: 'Continue monthly claim', description: 'Review the saved assessment and its outstanding checks before preparing it.' };
  else if (items.some((item) => item.pricingType === 'measured' && typeof item.verified === 'number' && item.verified > 0) || counts.approvedVOs) next = {
    route: 'claims', label: 'Prepare monthly claim', description: 'Assess verified work and recorded approvals. Enter claim quantities and values separately from physical progress.',
  };
  else next = { route: 'completion', label: 'Add a site update', description: 'Add a site report for a contract item, then review its progress.' };
  return { period, steps, next, counts };
}
