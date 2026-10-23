import type { ClaimAssessment, ClaimAssessmentRow, ClaimRow, ClaimWorkRow, ClaimVORow, ClaimReview, ClaimDraft, ClaimTotals } from '../types/claims';
import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput } from '../types/domain';
import { getVOCases, getVOClaimEligibility } from './vo.ts';
import { captureClaimProjectDetails } from './claim-pack.ts';
import { normalizeClaimBasis, claimBasisNumber, claimBasisProduct, claimBasisSum, claimBasisDifference, applyClaimBasis } from './claim-basis.ts';

// Preparation only: these records never certify, submit or pay a claim.
const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const dateTime = (value: unknown) => typeof value === 'string' && value.trim() ? new Date(value).getTime() : NaN;
const validPeriod = (value: unknown): value is string => typeof value === 'string' && /^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/.test(value);

function optionalNumber(value: unknown, isMoney = false) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  if (!['number', 'string'].includes(typeof value)) return NaN;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 10000))) return NaN;
  return isMoney ? money(n) : n;
}

function periodEnd(period: string) {
  if (!validPeriod(period)) return { cutoff: null, end: NaN };
  const [year, month] = period.split('-').map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cutoff = `${period}-${String(day).padStart(2, '0')}`;
  // Singapore and Malaysia use UTC+08:00. Keep month-end independent of browser timezone.
  return { cutoff, end: dateTime(`${cutoff}T23:59:59.999+08:00`) };
}

function normalizeAssessment(project: Project, input: unknown): { assessment: ClaimAssessment; errors: string[] } {
  const errors: string[] = [];
  const raw: Record<string, unknown> = record(input) ? input : {};
  if (!record(input)) errors.push('Use a valid QS assessment.');
  if (raw.projectId && raw.projectId !== project.id) errors.push('Use assessment values from the selected project.');
  const hasBasis = Object.hasOwn(raw, 'claimBasis');
  const normalizeRows = (value: unknown, type: string, allowedIds: Set<string>): Record<string, ClaimAssessmentRow> => {
    if (value !== undefined && !record(value)) { errors.push(`Use valid ${type} assessment rows.`); return {}; }
    return Object.fromEntries(Object.entries(record(value) ? value : {}).flatMap(([id, entry]) => {
      if (!allowedIds.has(id) || !record(entry)) { errors.push(`Unknown ${type} row in this project: ${id}.`); return []; }
      const field = type === 'work' ? 'assessedQuantity' : 'assessedValue';
      const assessed = hasBasis ? claimBasisNumber(entry[field], type === 'work' ? 4 : 2) : optionalNumber(entry[field], type !== 'work');
      const prior = hasBasis ? claimBasisNumber(entry.previousValue, 2) : optionalNumber(entry.previousValue, true);
      if (Number.isNaN(assessed) || Number.isNaN(prior)) errors.push(`${id}: enter non-negative finite values, or leave them blank.`);
      return [[id, {
        include: entry.include === true,
        [field]: Number.isNaN(assessed) ? null : assessed,
        previousValue: Number.isNaN(prior) ? null : prior,
        ...(type === 'work' ? { evidenceDateConfirmed: entry.evidenceDateConfirmed === true } : {}),
      }]];
    }));
  };
  const assessment: ClaimAssessment = {
    work: normalizeRows(raw.work, 'work', new Set((project.items || []).map((entry) => entry.id))),
    vos: normalizeRows(raw.vos, 'VO', new Set(getVOCases(project).map((entry) => entry.id))),
    priorConfirmed: raw.priorConfirmed === true,
    adjustmentReason: text(raw.adjustmentReason),
    note: text(raw.note),
  };
  if (hasBasis) {
    const normalized = normalizeClaimBasis(raw.claimBasis, assessment.priorConfirmed);
    assessment.claimBasis = normalized.value;
    errors.push(...normalized.errors);
  }
  return { assessment, errors };
}

function verificationFor(project: Project, item: WorkItem, end: number) {
  const reports = (project.reports || []).filter((entry) => entry.itemId === item.id && !entry.vo
    && ['verified', 'approved'].includes(entry.status)
    && (!entry.projectId || entry.projectId === project.id));
  const candidates = reports.filter((entry) => Number.isFinite(dateTime(entry.verifiedAt))
    && dateTime(entry.verifiedAt) <= end).sort((a, b) => dateTime(b.verifiedAt) - dateTime(a.verifiedAt));
  const dated = candidates[0];
  if (dated) return {
    verified: Number(dated.approvedCompletion ?? dated.completion),
    verifiedAt: dated.verifiedAt, requiresDateConfirmation: false, evidence: clone(dated),
  };
  const undated = reports.filter((entry) => !Number.isFinite(dateTime(entry.verifiedAt))
    && (!Number.isFinite(dateTime(entry.date)) || dateTime(entry.date) <= end))
    .sort((a, b) => (dateTime(b.date) || 0) - (dateTime(a.date) || 0))[0];
  if (undated) return {
    verified: Number(undated.approvedCompletion ?? undated.completion),
    verifiedAt: null, requiresDateConfirmation: true, evidence: clone(undated),
  };
  // Undated seeded progress is visible, but needs an explicit QS as-of confirmation.
  if (!reports.length && finite(item.verified) && item.verified > 0) return {
    verified: item.verified, verifiedAt: null, requiresDateConfirmation: true, evidence: null,
  };
  return { verified: 0, verifiedAt: null, requiresDateConfirmation: false, evidence: null };
}

function approvedEvidence(entry: VOCase, end: number) {
  if (entry.status !== 'approved') return { eligible: false, exclusionReason: 'VO is not currently approved.', approval: null };
  const event = [...entry.history].reverse().find((value) => value.action === 'approve' && value.to === 'approved');
  if (!event || !Number.isFinite(dateTime(event.date))) return { eligible: false, exclusionReason: 'Approval date is not recorded.', approval: null };
  if (dateTime(event.date) > end) return { eligible: false, exclusionReason: 'Approval is after this month’s cutoff.', approval: clone(event) };
  if (!finite(entry.approvedValue) || entry.approvedValue < 0 || !entry.approvalReference || !entry.approver) {
    return { eligible: false, exclusionReason: 'Approval value, reference or approver is missing.', approval: clone(event) };
  }
  const readiness = getVOClaimEligibility(entry);
  if (!readiness.eligible) return {
    eligible: false,
    exclusionReason: readiness.status === 'excluded' ? 'QS excluded this extra work from claims.' : `Complete the VO claim eligibility review. ${readiness.issues.join(' ')}`,
    needsEligibilityReview: readiness.status !== 'excluded', approval: clone(event),
  };
  if (!Number.isFinite(dateTime(readiness.decisionAt)) || !Number.isFinite(dateTime(readiness.executionVerifiedAt))) {
    return { eligible: false, exclusionReason: 'Claim eligibility or work verification date is not recorded.', needsEligibilityReview: true, approval: clone(event) };
  }
  if (dateTime(readiness.decisionAt) > end || dateTime(readiness.executionVerifiedAt) > end) {
    return { eligible: false, exclusionReason: 'Claim eligibility or work verification is after this month’s cutoff.', approval: clone(event) };
  }
  return { eligible: true, exclusionReason: '', approval: clone(event) };
}

const total = (rows: ClaimRow[], field: 'previousValue' | 'cumulativeValue' | 'currentValue') => rows.some((row) => row[field] === null) ? null : money(rows.reduce((sum, row) => sum + row[field]!, 0));

export function countPendingClaimVOs(review: Pick<ClaimReview, 'voRows'>) {
  return (review.voRows || []).filter((row) => !row.eligible && !row.included
    && (['flagged', 'clarification', 'pendingApproval'].includes(row.status) || row.needsEligibilityReview === true)).length;
}

export function buildClaimReview(project: Project, period: string, input: unknown = {}): ClaimReview {
  const { assessment, errors } = normalizeAssessment(project, input);
  const { cutoff, end } = periodEnd(period);
  const hasBasis = Object.hasOwn(assessment, 'claimBasis');
  const issues = [...errors];
  if (!cutoff) issues.push('Choose a valid claim month.');
  if (!project.locked || (project.items || []).some((entry) => entry.needsReview)) issues.push('Confirm the reviewed contract baseline before preparing this claim.');
  if (project.lockedAt && dateTime(project.lockedAt) > end) issues.push('The current baseline was confirmed after this month’s cutoff.');

  const workRows: ClaimWorkRow[] = (project.items || []).map((item) => {
    const entered = assessment.work[item.id] || {};
    const verification = verificationFor(project, item, end);
    const verified = finite(verification.verified) && verification.verified >= 0 && verification.verified <= 100 ? verification.verified : 0;
    const sourceValid = item.pricingType === 'measured' && finite(item.quantity) && item.quantity >= 0
      && finite(item.rate) && item.rate >= 0 && finite(item.amount) && item.amount >= 0;
    const eligible = sourceValid && verified > 0;
    const exclusionReason = item.pricingType === 'included' ? 'Included scope: no separate claim amount.'
      : item.pricingType === 'rateOnly' ? 'Rate-only work needs separate authorisation and measured hours.'
        : !sourceValid ? 'Measured quantity, rate or amount is missing.'
          : verified <= 0 ? 'No verified completion is available by this cutoff.' : '';
    const previousValue = entered.previousValue ?? (assessment.priorConfirmed ? 0 : null);
    const included = entered.include === true || (entered.previousValue ?? 0) > 0;
    const assessedQuantity = entered.assessedQuantity ?? null;
    const cumulativeValue = assessedQuantity === null || !sourceValid ? null : hasBasis ? claimBasisProduct(assessedQuantity, item.rate) : money(assessedQuantity * (item.rate as number));
    const currentValue = cumulativeValue === null || previousValue === null ? null : hasBasis ? claimBasisDifference(cumulativeValue, previousValue) : money(cumulativeValue - previousValue);
    const rowIssues: string[] = [];
    if (included) {
      if (!eligible) rowIssues.push(exclusionReason);
      if (assessedQuantity === null) rowIssues.push('Enter the QS-assessed cumulative quantity.');
      if (hasBasis && assessedQuantity !== null && sourceValid && cumulativeValue === null) rowIssues.push('Quantity or rate exceeds the supported decimal precision or amount limit.');
      if (hasBasis && cumulativeValue !== null && previousValue !== null && currentValue === null) rowIssues.push('The calculation exceeds the supported amount limit.');
      if (assessedQuantity !== null && sourceValid && (assessedQuantity > (item.quantity as number) + 0.000001 || (cumulativeValue !== null && cumulativeValue > (item.amount as number) + 0.01))) rowIssues.push('Assessed work exceeds the baseline quantity or amount; review a variation.');
      if (previousValue === null) rowIssues.push('Confirm the previous claimed value.');
      if (verification.requiresDateConfirmation && !entered.evidenceDateConfirmed) rowIssues.push(`Confirm that the undated verified progress was valid as of ${cutoff || 'the cutoff'}.`);
      if (currentValue !== null && currentValue < 0 && !assessment.adjustmentReason) rowIssues.push('Explain the negative adjustment before preparing.');
    }
    return {
      id: item.id, itemId: item.id, ref: item.ref, description: item.description, unit: item.unit,
      rate: item.rate ?? null, contractQuantity: item.quantity ?? null, contractAmount: item.amount ?? null,
      verified, currentVerified: item.verified, reported: item.reported,
      verifiedAt: verification.verifiedAt, requiresDateConfirmation: verification.requiresDateConfirmation,
      evidenceDateConfirmed: entered.evidenceDateConfirmed === true,
      evidenceDateConfirmation: verification.requiresDateConfirmation && entered.evidenceDateConfirmed ? { asOf: cutoff, confirmed: true } : null,
      evidence: verification.evidence, sourcePage: item.sourcePage ?? null, included, eligible, exclusionReason,
      assessedQuantity, previousValue, cumulativeValue, currentValue, issues: rowIssues,
    };
  });

  const voRows: ClaimVORow[] = getVOCases(project).map((entry) => {
    const entered = assessment.vos[entry.id] || {};
    const approval = approvedEvidence(entry, end);
    const previousValue = entered.previousValue ?? (assessment.priorConfirmed ? 0 : null);
    const included = entered.include === true || (entered.previousValue ?? 0) > 0;
    const assessedValue = entered.assessedValue ?? null;
    const cumulativeValue = assessedValue;
    const currentValue = assessedValue === null || previousValue === null ? null : hasBasis ? claimBasisDifference(assessedValue, previousValue) : money(assessedValue - previousValue);
    const rowIssues: string[] = [];
    if (included) {
      if (!approval.eligible) rowIssues.push(`${approval.exclusionReason}${(entered.previousValue ?? 0) > 0 ? ' Reconcile the previously claimed value; this row cannot be omitted.' : ''}`);
      if (assessedValue === null) rowIssues.push('Enter the QS-assessed cumulative VO value.');
      if (assessedValue !== null && finite(entry.approvedValue) && assessedValue > entry.approvedValue + 0.001) rowIssues.push('Assessed VO value exceeds the recorded approval.');
      if (previousValue === null) rowIssues.push('Confirm the previous claimed value.');
      if (hasBasis && assessedValue !== null && previousValue !== null && currentValue === null) rowIssues.push('The calculation exceeds the supported amount limit.');
      if (currentValue !== null && currentValue < 0 && !assessment.adjustmentReason) rowIssues.push('Explain the negative adjustment before preparing.');
    }
    return {
      id: entry.id, caseId: entry.id, reference: entry.reference, title: entry.title, status: entry.status,
      approvedValue: entry.approvedValue, approvalReference: entry.approvalReference,
      approver: entry.approver, approvalDate: approval.approval?.date || null,
      approval: approval.approval, evidence: clone(entry.report),
      ...(entry.reviewChecksVersion === 1 ? { eligibilityReview: clone({
        scopeDisposition: entry.scopeDisposition, scopeAssessment: entry.scopeAssessment, relatedItemId: entry.relatedItemId,
        instructionStatus: entry.instructionStatus,
        instructionReference: entry.instructionReference, executionStatus: entry.executionStatus,
        executionReference: entry.executionReference, executionVerifiedAt: entry.executionVerifiedAt,
        claimEligibility: entry.claimEligibility, eligibilityNote: entry.eligibilityNote,
        eligibilityReviewedAt: entry.eligibilityReviewedAt,
      }) } : {}),
      ...(approval.needsEligibilityReview ? { needsEligibilityReview: true } : {}),
      included, eligible: approval.eligible, exclusionReason: approval.exclusionReason,
      assessedValue, previousValue, cumulativeValue, currentValue, issues: rowIssues,
    };
  });
  const selectedWork = workRows.filter((row) => row.included);
  const selectedVOs = voRows.filter((row) => row.included);
  const selected = [...selectedWork, ...selectedVOs];
  if (!selected.length) issues.push('Select at least one verified work item or approved VO for assessment.');
  if (selected.length && !assessment.priorConfirmed) issues.push('Confirm that previous claim values have been checked; blank prior values mean zero only after confirmation.');
  for (const row of selected) for (const issue of row.issues) issues.push(`${row.ref || row.reference || row.id}: ${issue}`);
  const sum = hasBasis ? (rows: ClaimRow[], field: 'previousValue' | 'cumulativeValue' | 'currentValue') => claimBasisSum(rows.map(row => row[field])) : total;
  const grossTotals: ClaimTotals = {
    previousValue: sum(selected, 'previousValue'), cumulativeValue: sum(selected, 'cumulativeValue'),
    currentValue: sum(selected, 'currentValue'), workCurrentValue: sum(selectedWork, 'currentValue'), voCurrentValue: sum(selectedVOs, 'currentValue'),
  };
  const currency = project.contract?.currency || 'SGD';
  const basisResult = hasBasis ? applyClaimBasis(assessment.claimBasis!, grossTotals, currency, assessment.adjustmentReason) : null;
  if (basisResult) {
    issues.push(...basisResult.issues);
    const aggregates: [ClaimRow[], 'previousValue' | 'cumulativeValue' | 'currentValue', (keyof ClaimTotals)?][] = [[selected, 'previousValue'], [selected, 'cumulativeValue'], [selected, 'currentValue'],
      [selectedWork, 'currentValue', 'workCurrentValue'], [selectedVOs, 'currentValue', 'voCurrentValue']];
    if (aggregates.some(([rows, field, totalField = field]) => rows.length && rows.every(row => row[field] !== null) && grossTotals[totalField] === null)) {
      issues.push('The calculation exceeds the supported amount limit.');
    }
  }
  return {
    period, cutoff, currency, projectId: project.id,
    baselineVersion: project.version, baselineLockedAt: project.lockedAt || null,
    assessment, workRows, voRows,
    ...(hasBasis ? { claimBasis: clone(assessment.claimBasis) } : {}),
    totals: basisResult ? basisResult.totals : grossTotals,
    issues, canPrepare: issues.length === 0, selectedCount: selected.length,
    excludedCount: [...workRows, ...voRows].filter((row) => !row.eligible).length,
    validationErrors: errors,
  };
}

export function normalizeClaimDrafts(project: Project): ClaimDraft[] {
  const seen = new Set();
  return (Array.isArray(project.claimDrafts) ? project.claimDrafts : []).filter((entry) => {
    if (!record(entry) || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id)
      || entry.projectId !== project.id || !validPeriod(entry.period)
      || !Number.isInteger(entry.revision) || entry.revision < 1
      || !['draft', 'prepared'].includes(entry.status) || !record(entry.assessment) || !record(entry.snapshot)
      || entry.snapshot.projectId !== project.id || entry.snapshot.period !== entry.period) return false;
    seen.add(entry.id); return true;
  }).map(clone);
}

export function saveClaimDraft(project: Project, period: string, assessment: unknown = {}) {
  const snapshot = buildClaimReview(project, period, assessment);
  if (!validPeriod(period)) return { project, outcome: 'invalid' as const, error: 'Choose a valid claim month.' };
  if (snapshot.validationErrors.length) return { project, outcome: 'invalid' as const, error: snapshot.validationErrors.join(' ') };
  const drafts = normalizeClaimDrafts(project);
  const projectDetails = captureClaimProjectDetails(project);
  const previous = drafts.filter((entry) => entry.period === period).sort((a, b) => b.revision - a.revision)[0];
  if (previous && JSON.stringify(previous.snapshot) === JSON.stringify(snapshot)
    && JSON.stringify(previous.projectDetails) === JSON.stringify(projectDetails)) return { project, outcome: 'unchanged' as const, draft: clone(previous) };
  const revision = (previous?.revision || 0) + 1;
  const date = new Date().toISOString();
  const draft = {
    id: `CLAIM-${project.id}-${period}-R${revision}`, projectId: project.id, period, revision,
    status: 'draft', createdAt: date, assessment: clone(snapshot.assessment), snapshot: clone(snapshot),
    projectDetails,
  };
  return { outcome: 'updated' as const, draft: clone(draft), project: {
    ...project, claimDrafts: [...drafts, draft],
    history: [{ id: crypto.randomUUID(), action: 'Monthly claim draft saved', detail: `${period} · revision ${revision} · local preparation only`, date, actor: 'Alex Tan · Demo QS reviewer' }, ...project.history],
  } };
}

export function markClaimPrepared(project: Project, draftId: string) {
  const drafts = normalizeClaimDrafts(project);
  const draft = drafts.find((entry) => entry.id === draftId);
  if (!draft) return { project, outcome: 'invalid' as const, error: 'Choose a saved claim draft from this project.' };
  if (draft.status === 'prepared') return { project, outcome: 'unchanged' as const, draft: clone(draft) };
  if (drafts.some((entry) => entry.period === draft.period && entry.revision > draft.revision)) return { project, outcome: 'invalid' as const, error: 'Prepare the latest saved revision for this month.' };
  const current = buildClaimReview(project, draft.period, draft.assessment);
  if (!current.canPrepare) return { project, outcome: 'invalid' as const, error: current.issues.join(' ') };
  if (JSON.stringify(current) !== JSON.stringify(draft.snapshot)) return { project, outcome: 'invalid' as const, error: 'Source records changed after this snapshot. Review and save a new revision before preparing.' };
  const date = new Date().toISOString();
  const prepared = { ...draft, status: 'prepared', preparedAt: date };
  return { outcome: 'updated' as const, draft: clone(prepared), project: {
    ...project, claimDrafts: drafts.map((entry) => entry.id === draftId ? prepared : entry),
    history: [{ id: crypto.randomUUID(), action: 'Monthly claim marked prepared', detail: `${draft.period} · revision ${draft.revision} · not submitted or certified`, date, actor: 'Alex Tan · Demo QS reviewer' }, ...project.history],
  } };
}
