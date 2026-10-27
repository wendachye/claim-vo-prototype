import type { AttentionTarget, ClaimDraft, Project, SiteReport, VOCase } from '../types/domain';
import { getItemAreaAllocation, getItemAreaRollup } from './area-allocations.ts';
import { claimBasisDifference, claimBasisSum } from './claim-basis.ts';
import { getClaimTracking } from './claim-tracking.ts';
import { normalizeClaimDrafts } from './claims.ts';
import { getProjectAttention } from './project-attention.ts';
import { getVOCases, getVOClaimEligibility, VO_STATUS_LABELS } from './vo.ts';

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const time = (value: unknown): number => typeof value === 'string' && text(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
const money = (value: unknown): number | null => claimBasisSum([value]);
const savedMoney = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? money(value) : null;
const local = (project: Project, entry: { projectId?: string; projectCode?: string }) =>
  (!entry.projectId || entry.projectId === project.id) && (!entry.projectCode || text(entry.projectCode).toUpperCase() === text(project.code).toUpperCase());
const progress = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
function unique<T extends object>(entries: T[] | null | undefined, key: keyof T = 'id' as keyof T): T[] {
  const list = Array.isArray(entries) ? entries : [];
  const counts = new Map<unknown, number>();
  for (const entry of list) if (entry && text(entry[key])) counts.set(entry[key], (counts.get(entry[key]) || 0) + 1);
  return list.filter(entry => entry && text(entry[key]) && counts.get(entry[key]) === 1);
}
const labels: Record<string, string> = { draft: 'Draft', prepared: 'Prepared', submitted: 'Submitted', queried: 'Needs revision', certified: 'Certified', paid: 'Paid' };

export interface DashboardClaim {
  id: string; period: string; revision: number; currency: string | null; amount: number | null; netAmount: boolean;
  status: string; statusLabel: string; certifiedValue: number | null; paidValue: number | null; balanceValue: number | null;
  target: AttentionTarget;
}
export interface DashboardVO {
  id: string; title: string; status: string; label: string; amount: number | null; target: AttentionTarget;
}
function claimSummary(project: Project, draft: ClaimDraft): DashboardClaim {
  const tracking = draft.status === 'prepared' ? getClaimTracking(project, draft.id) : null;
  const status = tracking?.status || draft.status;
  const certifiedValue = ['certified', 'paid'].includes(status) ? savedMoney(tracking?.certifiedValue) : null;
  const paidValue = ['certified', 'paid'].includes(status) ? savedMoney(tracking?.paidValue) : null;
  // A missing payment total is not an implicit zero; a claim is not a certificate.
  const balanceValue = certifiedValue !== null && paidValue !== null ? claimBasisDifference(certifiedValue, paidValue) : null;
  return { id: draft.id, period: draft.period, revision: draft.revision,
    currency: text(draft.snapshot.currency) || text(draft.projectDetails?.contract.currency) || null,
    amount: savedMoney(draft.snapshot.totals?.currentValue), netAmount: draft.snapshot.claimBasis?.version === 1, status,
    statusLabel: status === 'certified' && paidValue !== null && paidValue !== 0 ? 'Part paid' : labels[status] || 'Needs review',
    certifiedValue, paidValue, balanceValue,
    target: { route: draft.status === 'prepared' ? 'claim-status' : 'claim-preview', draftId: draft.id },
  };
}
function approvedPrice(entry: VOCase): number | null {
  const value = savedMoney(entry.approvedValue);
  return value !== null && value >= 0 ? value : null;
}

/** Current work counts and saved QS values, without valuing physical progress. */
export function getProjectDashboard(project: Project) {
  const current = project;
  const items = unique(current.items).filter(entry => local(current, entry));
  const reports: SiteReport[] = unique(current.reports).filter(entry => local(current, entry));
  const scoped: Project = { ...current, items, reports,
    whatsappMessages: unique(current.whatsappMessages).filter(entry => entry.projectId === current.id && entry.projectCode === current.code),
    voReviews: unique(current.voReviews).filter(entry => entry.projectId === current.id && local(current, entry)),
    claimDrafts: unique(current.claimDrafts).filter(entry => entry.projectId === current.id && entry.snapshot?.projectId === current.id
      && (!entry.projectDetails || entry.projectDetails.id === current.id)),
    claimTracking: unique(current.claimTracking, 'draftId').filter(entry => entry.projectId === current.id),
  };
  const attentionTasks = getProjectAttention(scoped).filter(entry => entry.projectId === current.id);
  const measured = items.filter(entry => entry.pricingType === 'measured');
  const site = { total: measured.length, completed: 0, inProgress: 0, notStarted: 0, unknown: 0,
    excluded: items.length - measured.length,
    pending: attentionTasks.filter(entry => entry.category === 'site' && entry.kind === 'progress').length,
    target: { route: 'completion' } as AttentionTarget };
  for (const item of measured) {
    const allocation = getItemAreaAllocation(scoped, item.id);
    const rollup = allocation.split ? getItemAreaRollup(scoped, item.id, 'verified') : null;
    const completion = allocation.split ? rollup?.completion ?? null : progress(item.verified);
    if (completion === null || !allocation.valid || completion === 0 && rollup && (rollup.unknownCount > 0 || (allocation.remainingQuantity ?? 0) > 0)) site.unknown++;
    else if (completion === 100) site.completed++;
    else if (completion === 0) site.notStarted++;
    else site.inProgress++;
  }
  const cases = getVOCases(scoped);
  const approved = cases.filter(entry => entry.status === 'approved');
  const eligible = approved.filter(entry => getVOClaimEligibility(entry).eligible);
  const approvedAmounts = approved.map(approvedPrice);
  const knownApproved = approvedAmounts.filter((value): value is number => value !== null);
  const reviewCases = cases.filter(entry => ['flagged', 'clarification', 'pendingApproval'].includes(entry.status)
    || entry.status === 'approved' && getVOClaimEligibility(entry).status === 'needsReview');
  const priority = (entry: VOCase) => reviewCases.includes(entry) ? 0 : entry.status === 'approved' ? 1 : 2;
  const vo = { total: cases.length, reviewCount: reviewCases.length, approvedCount: approved.length,
    eligibleCount: eligible.length, rejectedCount: cases.filter(entry => entry.status === 'rejected').length,
    approvedValue: !approved.length ? 0 : knownApproved.length ? claimBasisSum(knownApproved) : null,
    approvedUnknownCount: approvedAmounts.length - knownApproved.length,
    eligibleValue: claimBasisSum(eligible.map(approvedPrice)),
    items: [...cases].sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id)).slice(0, 3).map((entry): DashboardVO => ({
      id: entry.id, title: entry.title, status: entry.status,
      label: getVOClaimEligibility(entry).eligible ? 'Eligible for assessment' : entry.status === 'approved' ? 'Price approved' : VO_STATUS_LABELS[entry.status],
      amount: entry.status === 'approved' ? approvedPrice(entry) : null,
      target: { route: 'vo', caseId: entry.id },
    })), target: { route: 'vo' } as AttentionTarget,
  };
  const byMonth = new Map<string, ClaimDraft[]>();
  for (const draft of normalizeClaimDrafts(scoped)) byMonth.set(draft.period, [...(byMonth.get(draft.period) || []), draft]);
  const latest = [...byMonth.values()].flatMap(drafts => {
    const highest = Math.max(...drafts.map(entry => entry.revision));
    const matches = drafts.filter(entry => entry.revision === highest);
    return matches.length === 1 ? matches : [];
  });
  const latestSaved = [...latest].sort((a, b) => time(b.createdAt) - time(a.createdAt)
    || b.period.localeCompare(a.period) || b.revision - a.revision || a.id.localeCompare(b.id))[0];
  const claimSummaries = [...latest].sort((a, b) => b.period.localeCompare(a.period)).map(draft => claimSummary(scoped, draft));
  const claims = claimSummaries.slice(0, 3);
  const claimStatuses = { draft: 0, prepared: 0, submitted: 0, queried: 0, certified: 0, paid: 0 };
  for (const claim of claimSummaries) if (Object.hasOwn(claimStatuses, claim.status)) claimStatuses[claim.status as keyof typeof claimStatuses]++;
  const voStatuses = { flagged: 0, clarification: 0, pendingApproval: 0, approved: 0, rejected: 0 };
  for (const entry of cases) if (Object.hasOwn(voStatuses, entry.status)) voStatuses[entry.status as keyof typeof voStatuses]++;
  const financialAttention = attentionTasks.filter(entry => entry.category === 'claims' || entry.category === 'vo');
  // Counts describe one saved revision per month. History is a comparison of
  // separate assessments, never a cumulative claim ledger or payment forecast.
  const analytics = { claimStatuses, claimCount: claimSummaries.length, voStatuses,
    attention: financialAttention.slice(0, 4), attentionTotal: financialAttention.length,
    claimHistory: claimSummaries.slice(0, 6).reverse(),
  };
  return {
    contract: { currency: text(current.contract?.currency) || null, declaredValue: (money(current.contract?.totalAmount) ?? -1) >= 0 ? money(current.contract?.totalAmount) : null,
      partialSchedule: current.contract?.representativeSubset === true, itemCount: items.length,
      target: { route: 'contract' } as AttentionTarget },
    site, vo, claims, latestClaim: latestSaved ? claimSummary(scoped, latestSaved) : null, analytics,
  };
}
