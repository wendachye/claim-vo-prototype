// Browser-local QS review records. Recording an approval here sends nothing externally.
export const VO_STATUS_LABELS = Object.freeze({
  flagged: 'Flagged',
  clarification: 'Needs information',
  pendingApproval: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
});

const clone = (value) => structuredClone(value);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const inProject = (project, entry) => record(entry)
  && (entry.projectId == null || entry.projectId === '' || entry.projectId === project?.id)
  && (entry.projectCode == null || entry.projectCode === '' || (typeof entry.projectCode === 'string'
    && text(entry.projectCode).toUpperCase() === text(project?.code).toUpperCase()));
const statuses = Object.keys(VO_STATUS_LABELS);
const editable = ['flagged', 'clarification'];
const open = [...editable, 'pendingApproval'];
const fields = ['title', 'scopeAssessment', 'instructionReference', 'proposedValue', 'approvedValue', 'approvalReference', 'approver', 'reviewNote', 'relatedItemId'];
const reviewFields = ['title', 'scopeAssessment', 'instructionReference', 'proposedValue', 'reviewNote', 'relatedItemId'];
const snapshot = (value) => Object.fromEntries(fields.map((field) => [field, value[field]]));

export function normalizeVOReviews(project) {
  const seen = new Set();
  return (Array.isArray(project?.voReviews) ? project.voReviews : []).filter((entry) => {
    if (!record(entry) || typeof entry.id !== 'string' || !entry.id
      || entry.projectId !== project.id || !inProject(project, entry) || entry.reportId !== entry.id || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).map((entry) => {
    const { report, ...review } = entry;
    return clone(review);
  });
}

function titleFor(report) {
  if (text(report.scopeLabel)) return text(report.scopeLabel);
  if (/extra access platform/i.test(report.message || '')) return 'Extra access platform';
  if (/loading.bay protection/i.test(report.message || '')) return 'Additional loading-bay protection';
  return `Possible extra work${report.area ? ` · ${report.area}` : ''}`;
}

export function getVOCases(project) {
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
      reviewNote: '', relatedItemId: (Array.isArray(project.items) ? project.items : []).some((item) => record(item) && item.id === report.itemId) ? report.itemId : null,
      history: [],
    };
    return {
      ...base, ...review,
      id: report.id, reportId: report.id, projectId: project.id,
      status: statuses.includes(review?.status) ? review.status : base.status,
      history: Array.isArray(review?.history) ? clone(review.history) : [],
      report,
    };
  });
}

function amount(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : NaN;
}

export function updateVOReview(project, caseId, action, values = {}) {
  const invalid = (error) => ({ project, outcome: 'invalid', error });
  const unchanged = () => ({ project, outcome: 'unchanged' });
  const current = getVOCases(project).find((entry) => entry.id === caseId);
  if (!current) return invalid('Choose a flagged report from the selected project.');
  if (!record(values)) return invalid('Review values must be an object.');
  if (!['save', 'clarify', 'submit', 'approve', 'reject', 'reopen'].includes(action)) return invalid('Choose a valid review action.');

  const next = { ...current };
  const changes = action === 'approve' ? ['approvedValue', 'approvalReference', 'approver', 'reviewNote']
    : action === 'reopen' || (['reject', 'clarify'].includes(action) && current.status === 'pendingApproval') ? ['reviewNote']
      : reviewFields;
  for (const field of changes) {
    if (!Object.hasOwn(values, field)) continue;
    if (field === 'proposedValue' || field === 'approvedValue') next[field] = amount(values[field]);
    else if (field === 'relatedItemId') next[field] = text(values[field]) || null;
    else next[field] = text(values[field]);
  }
  if (Number.isNaN(next.proposedValue) || Number.isNaN(next.approvedValue)) return invalid('Enter a non-negative amount, or leave the proposed value unknown.');
  if (next.relatedItemId && !project.items.some((item) => item.id === next.relatedItemId)) return invalid('Choose a related contract item from this project.');

  // Replaying the same decision must not append another history event.
  const destination = { clarify: 'clarification', submit: 'pendingApproval', approve: 'approved', reject: 'rejected' }[action];
  if (destination === current.status && JSON.stringify(snapshot(next)) === JSON.stringify(snapshot(current))) return unchanged();
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

  next.status = action === 'save' ? current.status : action === 'reopen' ? 'flagged' : destination;
  if (action === 'reopen') {
    next.approvedValue = null;
    next.approvalReference = '';
    next.approver = '';
  }
  if (action === 'save' && JSON.stringify(snapshot(next)) === JSON.stringify(snapshot(current))) return unchanged();
  const date = new Date().toISOString();
  const event = {
    id: crypto.randomUUID(), action, date, actor: 'Alex Tan · Demo QS reviewer',
    from: current.status, to: next.status, values: clone(snapshot(next)), previousValues: clone(snapshot(current)),
  };
  next.history = [...current.history, event];
  next.updatedAt = date;
  const { report, ...stored } = next;
  const reviews = normalizeVOReviews(project);
  const hasRecord = reviews.some((entry) => entry.id === caseId);
  const status = next.status === 'rejected' ? 'rejected' : next.status === 'approved' ? 'voApproved' : 'needsReview';
  return {
    outcome: 'updated',
    project: {
      ...project,
      voReviews: hasRecord ? reviews.map((entry) => entry.id === caseId ? clone(stored) : entry) : [...reviews, clone(stored)],
      reports: project.reports.map((entry) => entry.id === caseId ? { ...entry, status } : entry),
      history: [{
        id: event.id, action: `VO ${action === 'save' ? 'review saved' : action === 'submit' ? 'marked awaiting approval' : action === 'clarify' ? 'needs information' : action === 'reopen' ? 'review reopened' : action === 'approve' ? 'approval recorded' : 'rejected'}`,
        detail: `${current.reference} · ${next.title} · ${VO_STATUS_LABELS[next.status]}${next.reviewNote ? ` · ${next.reviewNote}` : ''}`,
        date, actor: event.actor,
      }, ...project.history],
    },
  };
}
