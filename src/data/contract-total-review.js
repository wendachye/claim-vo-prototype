import { getContractChecks } from './contract-checks.js';

// These are local QS notes about a known difference, never an adjustment to money.
const actor = 'Alex Tan · Demo QS reviewer';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const validVersion = value => Number.isSafeInteger(value) && value > 0;
const clone = value => structuredClone(value);
const itemFields = ['ref', 'description', 'quantity', 'unit', 'rate', 'amount', 'pricingType',
  'location', 'section', 'subsection', 'startDate', 'durationMonths', 'quantityBasis',
  'sourcePage', 'sourceRef', 'sourceReference', 'sourceNote'];
const contractFields = ['reference', 'currency', 'totalAmount', 'representativeSubset', 'scope',
  'sourceKind', 'sourceFilename', 'sourcePageCount', 'quantityBasis'];
const scalar = value => value == null || ['string', 'boolean'].includes(typeof value)
  || (typeof value === 'number' && Number.isFinite(value));
const valueOf = (value, field) => value?.[field] === undefined ? null : value[field];

function timestamp(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  try { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; } catch { return null; }
}

function itemSnapshot(items, projectId) {
  if (!Array.isArray(items) || !items.length || items.some(item => !record(item) || !text(item.id)
    || (item.projectId != null && item.projectId !== projectId)
    || itemFields.some(field => !scalar(item[field])))
    || new Set(items.map(item => item.id)).size !== items.length) return null;
  return [...items].sort((a, b) => a.id.localeCompare(b.id)).map(item => ({ id: item.id,
    ...Object.fromEntries(itemFields.map(field => [field, valueOf(item, field)])) }));
}

function contractSnapshot(contract) {
  if (!record(contract) || contractFields.some(field => !scalar(contract[field]))) return null;
  return Object.fromEntries(contractFields.map(field => [field, valueOf(contract, field)]));
}

function comparisonBasis(projectId, baselineVersion, items, contract) {
  if (!text(projectId) || !validVersion(baselineVersion)) return null;
  const savedItems = itemSnapshot(items, projectId), savedContract = contractSnapshot(contract);
  if (!savedItems || !savedContract) return null;
  const checks = getContractChecks({ id: projectId, items, contract });
  const { recordedTotal, calculatedTotal, declaredTotal, difference, currency, comparison } = checks.totals;
  if (comparison !== 'difference') return null;
  const basis = { projectId, baselineVersion, contractSnapshot: savedContract, itemSnapshot: savedItems,
    recordedTotal, calculatedTotal, declaredTotal, difference, currency };
  return { ...basis, scopeKey: JSON.stringify(basis) };
}

function validReason(value) {
  return typeof value === 'string' && text(value).length > 0 && text(value).length <= 500
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validReview(review, projectId, version) {
  if (!record(review) || review.version !== 1 || review.projectId !== projectId
    || review.baselineVersion !== version || !validReason(review.reason)
    || review.reason !== text(review.reason) || review.reviewedBy !== actor
    || !timestamp(review.reviewedAt) || timestamp(review.reviewedAt) !== review.reviewedAt) return null;
  const basis = comparisonBasis(projectId, version, review.itemSnapshot, review.contractSnapshot);
  if (!basis || !text(basis.currency) || basis.scopeKey !== review.scopeKey
    || ['recordedTotal', 'calculatedTotal', 'declaredTotal', 'difference', 'currency']
      .some(field => !Object.is(review[field], basis[field]))) return null;
  // Independent, whitelisted return values keep readers from mutating retained notes.
  return { version: 1, ...basis, reason: review.reason, reviewedBy: actor, reviewedAt: review.reviewedAt };
}

/** Current comparison status. Reverting to an identical commercial basis may reuse its recorded note. */
export function getContractTotalReview(project) {
  const checks = getContractChecks(project);
  const required = checks.totals.comparison === 'difference';
  const basis = comparisonBasis(project?.id, project?.version, project?.items, project?.contract);
  if (!required || !basis) return { required, status: required ? 'required' : 'notRequired', review: null, scopeKey: '' };
  const reviews = (Array.isArray(project.contractTotalReviews) ? project.contractTotalReviews : [])
    .map(review => validReview(review, project.id, project.version)).filter(Boolean);
  const match = reviews.findLast(review => review.scopeKey === basis.scopeKey);
  return { required: true, status: match ? 'reviewed' : reviews.length ? 'stale' : 'required',
    review: match ? clone(match) : null, scopeKey: basis.scopeKey };
}

/** Append a mock QS reason for this exact version, scope and commercial row snapshot. */
export function saveContractTotalReview(project, reason, now = new Date()) {
  const invalid = (error, field) => ({ project, outcome: 'invalid', error, ...(field ? { field } : {}) });
  if (!record(project) || !text(project.id) || !validVersion(project.version)
    || !Array.isArray(project.history) || !project.history.every(record)
    || (project.contractTotalReviews != null && !Array.isArray(project.contractTotalReviews))) {
    return invalid('Choose a valid contract work list before reviewing its total.');
  }
  if (project.locked) return invalid('Create an editable contract version before recording a new total-difference reason.');
  if (!validReason(reason)) return invalid('Add a short reason, up to 500 characters, without control characters.', 'reason');
  if (!getContractChecks(project).canConfirm) return invalid('Resolve the item checks before reviewing the total difference.');
  const basis = comparisonBasis(project.id, project.version, project.items, project.contract);
  if (!basis) return invalid('A total-difference reason applies only to a complete schedule with known, different totals.');
  if (!text(basis.currency)) return invalid('Record the contract currency before reviewing the total difference.');
  const date = timestamp(now);
  if (!date) return invalid('Use a valid review date.');
  if (project.contractVersion != null && (!record(project.contractVersion)
    || project.contractVersion.projectId !== project.id || project.contractVersion.version !== project.version)) {
    return invalid('The contract version metadata does not belong to this work list.');
  }
  const createdAt = timestamp(project.contractVersion?.createdAt);
  if (createdAt && date < createdAt) return invalid('Review this version on or after its creation date.');
  const current = getContractTotalReview(project);
  if (current.review?.reason === text(reason)) return { project, outcome: 'unchanged' };
  const review = { version: 1, ...basis, reason: text(reason), reviewedBy: actor, reviewedAt: date };
  return { outcome: 'updated', project: { ...project,
    contractTotalReviews: [...(project.contractTotalReviews || []), review],
    history: [{ id: `CONTRACT-TOTAL-REVIEW-${project.id}-${project.version}-${(project.contractTotalReviews || []).length + 1}`,
      action: 'Contract total difference reviewed', detail: `Version ${project.version} · ${text(reason)}`,
      date, actor }, ...project.history],
  } };
}

/** Read a retained version without borrowing the current contract's financial metadata. */
export function getContractVersionTotalReview(project, version, items, contract = null) {
  if (!record(project) || !text(project.id) || !validVersion(version)
    || !validVersion(project.version) || version > project.version) return null;
  const snapshot = itemSnapshot(items, project.id);
  if (!snapshot) return null;
  const itemKey = JSON.stringify(snapshot);
  const knownItems = version === project.version ? [itemSnapshot(project.items, project.id)]
    : (Array.isArray(project.baselines) ? project.baselines : [])
      .filter(entry => record(entry) && entry.version === version
        && (entry.projectId == null || entry.projectId === project.id)
        && (entry.projectSnapshot == null || (record(entry.projectSnapshot) && entry.projectSnapshot.id === project.id)))
      .map(entry => itemSnapshot(entry.items, project.id)).filter(Boolean);
  if (!knownItems.length || new Set(knownItems.map(value => JSON.stringify(value))).size !== 1
    || JSON.stringify(knownItems[0]) !== itemKey) return null;
  const matches = (Array.isArray(project.contractTotalReviews) ? project.contractTotalReviews : [])
    .map(review => validReview(review, project.id, version)).filter(Boolean)
    .filter(review => JSON.stringify(review.itemSnapshot) === itemKey);
  if (contract != null) {
    const basis = comparisonBasis(project.id, version, items, contract);
    if (!basis) return null;
    const match = matches.findLast(review => review.scopeKey === basis.scopeKey);
    return match ? clone(match) : null;
  }
  // Legacy baselines may lack contract metadata. Only a single unambiguous saved
  // commercial basis can supply their note; otherwise acknowledge missing history.
  if (new Set(matches.map(review => review.scopeKey)).size !== 1) return null;
  return matches.length ? clone(matches.at(-1)) : null;
}
