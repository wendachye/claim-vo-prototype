import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, VOEvidenceLink, VORelatedEvidence, DrawingArea, DateInput } from '../types/domain';
// Browser-local QS review records. Recording an approval here sends nothing externally.
export const VO_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  flagged: 'Flagged',
  clarification: 'Needs information',
  pendingApproval: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  linked: 'Linked to existing VO',
});

export const VO_SCOPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  unassessed: 'Needs scope review', variation: 'Extra work', existingScope: 'Existing contract scope',
  clarification: 'Needs clarification', rectification: 'Rectification', duplicate: 'Duplicate',
});
export const VO_INSTRUCTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  notRecorded: 'Not recorded', reported: 'Reported only', documented: 'Documented', disputed: 'Disputed',
});
export const VO_EXECUTION_LABELS: Readonly<Record<string, string>> = Object.freeze({ notVerified: 'Not verified', verified: 'Verified work' });
export const VO_ELIGIBILITY_LABELS: Readonly<Record<string, string>> = Object.freeze({ needsReview: 'Needs QS assessment', eligible: 'Eligible for assessment', excluded: 'Excluded from claim' });

const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const inProject = (project: Project, entry: unknown) => record(entry)
  && (entry.projectId == null || entry.projectId === '' || entry.projectId === project?.id)
  && (entry.projectCode == null || entry.projectCode === '' || (typeof entry.projectCode === 'string'
    && text(entry.projectCode).toUpperCase() === text(project?.code).toUpperCase()));
const statuses = Object.keys(VO_STATUS_LABELS).filter(status => status !== 'linked');
const editable = ['flagged', 'clarification'];
const open = [...editable, 'pendingApproval'];
const checkFields = ['scopeDisposition', 'instructionStatus', 'executionStatus', 'executionReference', 'claimEligibility', 'eligibilityNote'];
const reviewFields = ['title', 'scopeAssessment', 'instructionReference', 'proposedValue', 'reviewNote', 'relatedItemId', 'scopeDisposition', 'instructionStatus', 'executionStatus', 'executionReference'];
const eligibilityFields = [...checkFields, 'scopeAssessment', 'instructionReference', 'reviewNote'];
const fields = [...new Set([...reviewFields, 'approvedValue', 'approvalReference', 'approver', 'claimEligibility', 'eligibilityNote', 'reviewChecksVersion'])];
const oneOf = (value: unknown, labels: Readonly<Record<string, string>>, fallback: string): string => typeof value === 'string' && Object.hasOwn(labels, value) ? value : fallback;
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const snapshot = (value: VOReview): Partial<VOReview> => Object.fromEntries(fields.filter(field => value[field] !== undefined).map((field) => [field, value[field]]));

export function normalizeVOReviews(project: Project): VOReview[] {
  const seen = new Set();
  return (Array.isArray(project?.voReviews) ? project.voReviews : []).filter((entry) => {
    if (!record(entry) || typeof entry.id !== 'string' || !entry.id
      || entry.projectId !== project.id || !inProject(project, entry) || entry.reportId !== entry.id || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).map((entry) => {
    const { report, linkedTo, evidenceLinkIssue, relatedEvidence, ...review } = entry;
    return clone(review);
  });
}

function titleFor(report: SiteReport) {
  if (text(report.scopeLabel)) return text(report.scopeLabel);
  if (/extra access platform/i.test(report.message || '')) return 'Extra access platform';
  if (/loading.bay protection/i.test(report.message || '')) return 'Additional loading-bay protection';
  return `Possible extra work${report.area ? ` · ${report.area}` : ''}`;
}

function getBaseVOCases(project: Project): VOCase[] {
  const saved = normalizeVOReviews(project);
  const seen = new Set();
  return (Array.isArray(project?.reports) ? project.reports : []).filter((report) => {
    if (!inProject(project, report) || !report.vo || typeof report.id !== 'string' || !report.id.trim() || seen.has(report.id)) return false;
    seen.add(report.id);
    return true;
  }).map((report, index) => {
    const review = saved.find((entry) => entry.id === report.id);
    const base = {
      id: report.id, reportId: report.id, projectId: project.id,
      reference: `${project.code}-VO-${String(index + 1).padStart(3, '0')}`,
      status: report.status === 'rejected' ? 'rejected' : 'flagged',
      title: titleFor(report), scopeAssessment: '', instructionReference: '',
      proposedValue: null, approvedValue: null, approvalReference: '', approver: '',
      scopeDisposition: 'unassessed', instructionStatus: 'notRecorded', executionStatus: 'notVerified', executionReference: '',
      claimEligibility: 'needsReview', eligibilityNote: '', eligibilityReviewedAt: null, executionVerifiedAt: null,
      reviewNote: '', relatedItemId: (Array.isArray(project.items) ? project.items : []).some((item) => record(item) && item.id === report.itemId) ? report.itemId! : null,
      history: [],
    };
    return {
      ...base, ...review,
      id: report.id, reportId: report.id, projectId: project.id,
      status: statuses.includes(review?.status || '') ? review!.status : base.status,
      scopeDisposition: oneOf(review?.scopeDisposition, VO_SCOPE_LABELS, 'unassessed'),
      instructionStatus: oneOf(review?.instructionStatus, VO_INSTRUCTION_LABELS, 'notRecorded'),
      executionStatus: oneOf(review?.executionStatus, VO_EXECUTION_LABELS, 'notVerified'),
      claimEligibility: oneOf(review?.claimEligibility, VO_ELIGIBILITY_LABELS, 'needsReview'),
      history: Array.isArray(review?.history) ? clone(review.history) : [],
      report,
    };
  });
}

const validLinkText = (value: unknown, limit = 300): value is string => typeof value === 'string'
  && value === value.trim() && !!value && value.length <= limit;
const linkActor = 'Alex Tan · Demo QS reviewer';
const linkableStatus = (entry: VOCase) => editable.includes(entry.status)
  && entry.report.status !== 'voApproved'
  && entry.approvedValue == null && !entry.approvalReference && !entry.approver
  && entry.history.every(event => record(event) && typeof event.action === 'string' && validDate(event.date))
  && !entry.history.some(event => record(event) && (event.action === 'approve' || event.to === 'approved'));

function includedInSavedClaim(project: Project, caseId: string) {
  return (Array.isArray(project.claimDrafts) ? project.claimDrafts : []).some(draft => record(draft)
    && (record(draft.assessment) && record(draft.assessment.vos) && record(draft.assessment.vos[caseId]) && draft.assessment.vos[caseId].include === true
      || record(draft.snapshot) && Array.isArray(draft.snapshot.voRows) && draft.snapshot.voRows.some(row => record(row)
        && (row.caseId === caseId || row.id === caseId) && row.included === true)));
}

function exactBaseCase(project: Project, caseId: unknown, cases = getBaseVOCases(project)): VOCase | null {
  if (!validLinkText(caseId)) return null;
  const reports = (Array.isArray(project.reports) ? project.reports : []).filter(value => record(value) && value.id === caseId);
  const reviews = (Array.isArray(project.voReviews) ? project.voReviews : []).filter(value => record(value) && value.id === caseId);
  if (reports.length !== 1 || reports[0].vo !== true || !inProject(project, reports[0]) || reviews.length > 1
    || reviews.some(value => value.projectId !== project.id || value.reportId !== caseId || !inProject(project, value))) return null;
  return cases.find(entry => entry.id === caseId) ?? null;
}

function validFrozenReport(value: unknown, project: Project, source: VOCase): value is SiteReport {
  return record(value) && value.id === source.report.id && value.vo === true && inProject(project, value)
    && typeof value.status === 'string' && value.sourceMessageId === source.report.sourceMessageId
    && ['message', 'text', 'sender', 'senderRole', 'channel', 'photoAlt'].every(field => value[field] == null || typeof value[field] === 'string')
    && ['itemId', 'area', 'location'].every(field => value[field] == null || typeof value[field] === 'string')
    && (value.date == null || validDate(value.date))
    && (value.photo == null || typeof value.photo === 'string' || record(value.photo) && typeof value.photo.url === 'string');
}

function linkValidation(project: Project) {
  const raw: unknown[] = Array.isArray(project?.voEvidenceLinks) ? project.voEvidenceLinks : [];
  const cases = getBaseVOCases(project);
  const issues = new Set<string>((Array.isArray(project.voEvidenceLinkIssues) ? project.voEvidenceLinkIssues : [])
    .filter(id => validLinkText(id) && exactBaseCase(project, id, cases)));
  const candidates: VOEvidenceLink[] = [];
  for (const value of raw) {
    if (record(value) && value.projectId !== project.id) continue;
    const source = record(value) ? exactBaseCase(project, value.sourceCaseId, cases) : null;
    const target = record(value) ? exactBaseCase(project, value.targetCaseId, cases) : null;
    const valid = record(value) && value.version === 1 && validLinkText(value.id) && value.projectId === project.id
      && source && target && source.id !== target.id && linkableStatus(source)
      && validLinkText(value.sourceReference) && validLinkText(value.targetReference)
      && value.sourceReference === source.reference && value.targetReference === target.reference
      && validLinkText(value.reason, 2000) && validDate(value.linkedAt) && value.linkedBy === linkActor
      && validFrozenReport(value.sourceReport, project, source)
      && !includedInSavedClaim(project, source.id);
    if (!valid) { if (source) issues.add(source.id); continue; }
    candidates.push(clone(value) as unknown as VOEvidenceLink);
  }
  // No arbitrary winner for duplicate IDs, competing destinations, chains or cycles.
  const links = candidates.filter(candidate => {
    const ambiguous = raw.filter(value => record(value) && value.projectId === project.id && value.id === candidate.id).length !== 1
      || raw.filter(value => record(value) && value.projectId === project.id && value.sourceCaseId === candidate.sourceCaseId).length !== 1
      || candidates.some(other => other.sourceCaseId === candidate.targetCaseId || other.targetCaseId === candidate.sourceCaseId);
    if (ambiguous) issues.add(candidate.sourceCaseId);
    return !ambiguous;
  }).filter(link => !issues.has(link.sourceCaseId));
  return { links, issues: [...issues] };
}

/** Validate append-only associations without rewriting their original reports or QS decisions. */
export function normalizeVOEvidenceLinks(project: Project): VOEvidenceLink[] { return linkValidation(project).links; }
export function getVOEvidenceLinkIssues(project: Project): string[] { return linkValidation(project).issues; }
export function getVOEvidenceLink(project: Project, caseId: string): VOEvidenceLink | null {
  return normalizeVOEvidenceLinks(project).find(link => link.sourceCaseId === caseId) ?? null;
}
export function getVORelatedEvidence(project: Project, caseId: string): VORelatedEvidence[] {
  return normalizeVOEvidenceLinks(project).filter(link => link.targetCaseId === caseId)
    .map(link => ({ link: clone(link), report: clone(link.sourceReport) }));
}
export function getVOCases(project: Project): VOCase[] {
  const { links, issues } = linkValidation(project);
  return getBaseVOCases(project).map(entry => {
    const linkedTo = links.find(link => link.sourceCaseId === entry.id);
    return linkedTo ? { ...entry, status: 'linked', linkedTo: clone(linkedTo) }
      : issues.includes(entry.id) ? { ...entry, status: 'linked', evidenceLinkIssue: true as const } : entry;
  });
}
export function getVOLinkTargets(project: Project, sourceCaseId: string): VOCase[] {
  const cases = getBaseVOCases(project), source = exactBaseCase(project, sourceCaseId, cases);
  const { links, issues } = linkValidation(project);
  if (!source || !linkableStatus(source) || includedInSavedClaim(project, sourceCaseId) || issues.includes(sourceCaseId)
    || links.some(link => link.sourceCaseId === sourceCaseId || link.targetCaseId === sourceCaseId)) return [];
  return cases.filter(entry => entry.id !== sourceCaseId && exactBaseCase(project, entry.id, cases)
    && linkableStatus(entry) && !includedInSavedClaim(project, entry.id) && !issues.includes(entry.id)
    && !links.some(link => link.sourceCaseId === entry.id));
}
export function linkVOEvidence(project: Project, sourceCaseId: string, targetCaseId: string, reason: string) {
  const invalid = (error: string) => ({ project, outcome: 'invalid' as const, error });
  const cleanReason = text(reason);
  if (!validLinkText(sourceCaseId) || !validLinkText(targetCaseId) || !cleanReason || cleanReason.length > 2000) return invalid('Choose an existing VO and add a reason of up to 2,000 characters.');
  const existing = getVOEvidenceLink(project, sourceCaseId);
  if (existing && existing.targetCaseId === targetCaseId && existing.reason === cleanReason) return { project, outcome: 'unchanged' as const, linkId: existing.id };
  const source = exactBaseCase(project, sourceCaseId);
  const target = getVOLinkTargets(project, sourceCaseId).find(entry => entry.id === targetCaseId);
  if (!source || !target) return invalid('Link two open VOs that have no price approval or saved claim. Awaiting approval must be returned for information first.');
  const link: VOEvidenceLink = {
    version: 1, id: crypto.randomUUID(), projectId: project.id, sourceCaseId, targetCaseId,
    sourceReference: source.reference, targetReference: target.reference, reason: cleanReason,
    linkedAt: new Date().toISOString(), linkedBy: linkActor, sourceReport: clone(source.report),
  };
  return { outcome: 'updated' as const, linkId: link.id, project: { ...project,
    voEvidenceLinks: [...normalizeVOEvidenceLinks(project), link],
    history: [{ id: link.id, action: 'VO evidence linked', detail: `${source.reference} → ${target.reference} · ${cleanReason}`, date: link.linkedAt, actor: link.linkedBy }, ...project.history],
  } };
}

function amount(value: unknown) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : NaN;
}

// Price approval and physical-work verification are separate from this explicit
// QS eligibility decision. Legacy approvals retain unknown review checks.
export function getVOClaimEligibility(entry: Partial<VOReview> | null | undefined) {
  const issues = [];
  const structured = entry?.reviewChecksVersion === 1;
  const decision = oneOf(entry?.claimEligibility, VO_ELIGIBILITY_LABELS, 'needsReview');
  const approval = (Array.isArray(entry?.history) ? entry.history : []).findLast(event => event.action === 'approve' && event.to === 'approved');
  const price = amount(entry?.approvedValue);
  if (entry?.status !== 'approved') issues.push('Record the price approval first.');
  else if (price === null || Number.isNaN(price) || !text(entry.approvalReference) || !text(entry.approver) || !validDate(approval?.date)) issues.push('Complete the approved value, reference, approver and approval date.');
  if (entry?.scopeDisposition !== 'variation' || !text(entry?.scopeAssessment)) issues.push('Confirm the changed scope and why it is extra work.');
  if (entry?.instructionStatus !== 'documented' || !text(entry?.instructionReference)) issues.push('Record the supporting documented instruction.');
  if (entry?.executionStatus !== 'verified' || !text(entry?.executionReference) || !validDate(entry?.executionVerifiedAt)) issues.push('Record the verified work and its evidence reference.');
  if (decision !== 'eligible') issues.push(decision === 'excluded' ? 'The QS excluded this work from the claim.' : 'The QS has not confirmed claim eligibility.');
  if (decision === 'eligible' && (!text(entry?.eligibilityNote) || !validDate(entry?.eligibilityReviewedAt))) issues.push('Record the claim eligibility reason and review date.');
  const eligible = issues.length === 0;
  return {
    status: decision === 'excluded' ? 'excluded' : eligible ? 'eligible' : 'needsReview', eligible, ready: eligible, issues, structured,
    decisionAt: validDate(entry?.eligibilityReviewedAt) ? entry.eligibilityReviewedAt : null,
    executionVerifiedAt: validDate(entry?.executionVerifiedAt) ? entry.executionVerifiedAt : null,
  };
}

export function updateVOReview(project: Project, caseId: string, action: string, values: unknown = {}) {
  const invalid = (error: string) => ({ project, outcome: 'invalid' as const, error });
  const unchanged = () => ({ project, outcome: 'unchanged' as const });
  const current = getVOCases(project).find((entry) => entry.id === caseId);
  if (!current) return invalid('Choose a flagged report from the selected project.');
  if (current.status === 'linked') return invalid('This evidence is linked to an existing VO. Review that VO instead.');
  if (!record(values)) return invalid('Review values must be an object.');
  if (!['save', 'clarify', 'submit', 'approve', 'reject', 'reopen', 'assessEligibility'].includes(action)) return invalid('Choose a valid review action.');

  const next = { ...current };
  const changes = action === 'assessEligibility' ? eligibilityFields : action === 'approve' ? ['approvedValue', 'approvalReference', 'approver', 'reviewNote']
    : action === 'reopen' || (['reject', 'clarify'].includes(action) && current.status === 'pendingApproval') ? ['reviewNote']
      : reviewFields;
  for (const field of changes) {
    if (!Object.hasOwn(values, field)) continue;
    if (field === 'proposedValue' || field === 'approvedValue') next[field] = amount(values[field]);
    else if (field === 'relatedItemId') next[field] = text(values[field]) || null;
    else next[field] = text(values[field]);
  }
  for (const [field, labels] of ([['scopeDisposition', VO_SCOPE_LABELS], ['instructionStatus', VO_INSTRUCTION_LABELS], ['executionStatus', VO_EXECUTION_LABELS], ['claimEligibility', VO_ELIGIBILITY_LABELS]] as const)) {
    if (!Object.hasOwn(labels, next[field])) return invalid('Choose a valid scope, instruction, work verification and claim eligibility status.');
  }
  if (checkFields.some(field => changes.includes(field) && Object.hasOwn(values, field)) || action === 'assessEligibility') next.reviewChecksVersion = 1;
  if (Number.isNaN(next.proposedValue) || Number.isNaN(next.approvedValue)) return invalid('Enter a non-negative amount, or leave the proposed value unknown.');
  if (next.relatedItemId && !project.items.some((item) => item.id === next.relatedItemId)) return invalid('Choose a related contract item from this project.');

  // Replaying the same decision must not append another history event.
  const destination = ({ clarify: 'clarification', submit: 'pendingApproval', approve: 'approved', reject: 'rejected' } as Record<string, string>)[action];
  if (destination === current.status && JSON.stringify(snapshot(next)) === JSON.stringify(snapshot(current))) return unchanged();
  if (action === 'assessEligibility' && current.status !== 'approved') return invalid('Record the price approval before assessing claim eligibility.');
  if (action === 'save' && !editable.includes(current.status)) return invalid('Reopen the review before editing a decided or submitted variation.');
  if (action === 'clarify' && !open.includes(current.status)) return invalid('Reopen a final decision before requesting more information.');
  if (action === 'submit' && !editable.includes(current.status)) return invalid('This review must be flagged or need information for that action.');
  if (action === 'approve' && current.status !== 'pendingApproval') return invalid('Complete QS review and mark the variation awaiting approval first.');
  if (action === 'reject' && !open.includes(current.status)) return invalid('Reopen the review before changing a final decision.');
  if (action === 'reopen' && current.status === 'flagged' && current.history.at(-1)?.action === 'reopen'
    && next.reviewNote === current.reviewNote) return unchanged();
  if (action === 'reopen' && !['approved', 'rejected'].includes(current.status)) return invalid('Only a final decision can be reopened.');
  if (['clarify', 'reject', 'reopen'].includes(action) && !next.reviewNote) return invalid('Add a review note explaining this decision.');
  if (action === 'submit' && (!next.title || !next.scopeAssessment || !next.instructionReference)) return invalid('Add a title, scope assessment and instruction reference before marking awaiting approval.');
  if (action === 'approve' && (next.approvedValue === null || !next.approvalReference || !next.approver)) return invalid('Record an approved value, approval reference and approver. Zero is a valid approved value.');
  if (action === 'save' && !next.title) return invalid('Add a variation title before saving.');

  next.status = ['save', 'assessEligibility'].includes(action) ? current.status : action === 'reopen' ? 'flagged' : destination;
  if (action === 'reject') {
    next.claimEligibility = 'excluded';
    next.eligibilityNote = next.reviewNote;
  }
  if (action === 'reopen') {
    next.claimEligibility = 'needsReview';
    next.eligibilityReviewedAt = null;
    next.eligibilityNote = '';
    next.approvedValue = null;
    next.approvalReference = '';
    next.approver = '';
  }
  if (action === 'assessEligibility') {
    const sourceChanged = ['scopeDisposition', 'scopeAssessment', 'instructionStatus', 'instructionReference'].some(field => next[field] !== current[field]);
    if (sourceChanged && !text(values.reviewNote)) return invalid('Add a review note explaining the scope or instruction evidence added after price approval.');
    if (next.executionStatus === 'verified' && !next.executionReference) return invalid('Add the evidence reference for the verified work.');
    if (['eligible', 'excluded'].includes(next.claimEligibility) && !next.eligibilityNote) return invalid('Explain the claim eligibility decision.');
    const at = new Date().toISOString();
    next.eligibilityReviewedAt = at;
    next.executionVerifiedAt = next.executionStatus === 'verified'
      ? current.executionStatus === 'verified' && next.executionReference === current.executionReference && validDate(current.executionVerifiedAt) ? current.executionVerifiedAt : at
      : null;
    if (next.claimEligibility === 'eligible') {
      const eligibility = getVOClaimEligibility(next);
      if (!eligibility.eligible) return invalid(eligibility.issues[0]);
    }
  }
  if (['save', 'assessEligibility'].includes(action) && JSON.stringify(snapshot(next)) === JSON.stringify(snapshot(current))
    && (action !== 'assessEligibility' || validDate(current.eligibilityReviewedAt) && next.executionVerifiedAt === current.executionVerifiedAt)) return unchanged();
  const date = new Date().toISOString();
  const event = {
    id: crypto.randomUUID(), action, date, actor: 'Alex Tan · Demo QS reviewer',
    from: current.status, to: next.status, values: clone({ ...snapshot(next), eligibilityReviewedAt: next.eligibilityReviewedAt, executionVerifiedAt: next.executionVerifiedAt }), previousValues: clone({ ...snapshot(current), eligibilityReviewedAt: current.eligibilityReviewedAt, executionVerifiedAt: current.executionVerifiedAt }),
  };
  next.history = [...current.history, event];
  next.updatedAt = date;
  const { report, ...stored } = next;
  const reviews = normalizeVOReviews(project);
  const hasRecord = reviews.some((entry) => entry.id === caseId);
  const status = next.status === 'rejected' ? 'rejected' : next.status === 'approved' ? 'voApproved' : 'needsReview';
  return {
    outcome: 'updated' as const,
    project: {
      ...project,
      voReviews: hasRecord ? reviews.map((entry) => entry.id === caseId ? clone(stored) : entry) : [...reviews, clone(stored)],
      reports: project.reports.map((entry) => entry.id === caseId ? { ...entry, status } : entry),
      history: [{
        id: event.id, action: `VO ${action === 'assessEligibility' ? 'claim eligibility reviewed' : action === 'save' ? 'review saved' : action === 'submit' ? 'marked awaiting approval' : action === 'clarify' ? 'needs information' : action === 'reopen' ? 'review reopened' : action === 'approve' ? 'approval recorded' : 'rejected'}`,
        detail: `${current.reference} · ${next.title} · ${VO_STATUS_LABELS[next.status]}${next.reviewNote ? ` · ${next.reviewNote}` : ''}`,
        date, actor: event.actor,
      }, ...project.history],
    },
  };
}
