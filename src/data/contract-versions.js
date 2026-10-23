import { getContractChecks } from './contract-checks.js';
import { getContractTotalReview, getContractVersionTotalReview } from './contract-total-review.js';

// Contract revisions are local review records. They never revise a saved claim.
const clone = value => structuredClone(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const validVersion = value => Number.isSafeInteger(value) && value > 0;
const actor = 'Alex Tan · Demo QS reviewer';

// Physical progress, extraction flags and review dates are not contract changes.
const fields = [
  ['ref', 'Contract reference'], ['description', 'Description'], ['quantity', 'Quantity'],
  ['unit', 'Unit'], ['rate', 'Unit rate'], ['amount', 'Amount'], ['pricingType', 'Pricing type'],
  ['location', 'Location'], ['section', 'Section'], ['subsection', 'Subsection'],
  ['startDate', 'Start month'], ['durationMonths', 'Duration (months)'], ['quantityBasis', 'Quantity basis'],
  ['sourcePage', 'Source page'], ['sourceRef', 'Source reference'], ['sourceReference', 'Source reference'],
  ['sourceNote', 'Source note'],
];
const scalar = value => value == null || ['string', 'boolean'].includes(typeof value)
  || (typeof value === 'number' && Number.isFinite(value));
const valueOf = (item, field) => item?.[field] === undefined ? null : item[field];

function timestamp(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  try { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; } catch { return null; }
}

function validItems(items, projectId) {
  return Array.isArray(items) && items.every(item => record(item) && text(item.id)
    && (item.projectId == null || item.projectId === projectId)
    && fields.every(([field]) => scalar(item[field])))
    && new Set(items.map(item => item.id)).size === items.length;
}

function validProject(project) {
  return record(project) && text(project.id) && text(project.code) && validVersion(project.version)
    && validItems(project.items, project.id) && Array.isArray(project.history)
    && project.history.every(record) && (project.baselines == null || Array.isArray(project.baselines));
}

function validScope(entry, projectId) {
  return record(entry) && (entry.projectId == null || entry.projectId === projectId)
    && (!entry.projectSnapshot || (record(entry.projectSnapshot) && entry.projectSnapshot.id === projectId));
}

function metadata(entry, version, projectId) {
  if (!validScope(entry, projectId) || entry.version !== version) return null;
  return {
    createdAt: timestamp(entry.createdAt) && typeof entry.createdAt === 'string' ? entry.createdAt : null,
    createdBy: text(entry.createdBy) || null,
    reason: text(entry.reason) || null,
    confirmedAt: timestamp(entry.confirmedAt || entry.date) && typeof (entry.confirmedAt || entry.date) === 'string' ? entry.confirmedAt || entry.date : null,
    confirmedBy: text(entry.confirmedBy) || null,
  };
}

function commercialKey(items) {
  return JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [item.id, ...fields.map(([field]) => valueOf(item, field))]));
}

function archiveIndex(project) {
  const groups = new Map();
  for (const entry of project.baselines || []) {
    if (!validScope(entry, project.id) || !validVersion(entry.version)
      || !validItems(entry.items, project.id)) continue;
    const group = groups.get(entry.version) || [];
    group.push(entry); groups.set(entry.version, group);
  }
  const entries = new Map();
  const ambiguous = new Set();
  for (const [version, group] of groups) {
    const keys = new Set(group.map(entry => JSON.stringify([commercialKey(entry.items), metadata(entry, version, project.id)])));
    if (keys.size === 1) entries.set(version, group[0]);
    else ambiguous.add(version);
  }
  return { entries, ambiguous };
}

function projectSnapshot(project) {
  return {
    id: project.id, code: project.code, name: project.name || null, country: project.country || null,
    contract: clone(project.contract || {}),
  };
}

function diffItems(previous, current) {
  const oldItems = new Map(previous.map(item => [item.id, item]));
  const newItems = new Map(current.map(item => [item.id, item]));
  const changes = [];
  for (const id of new Set([...previous.map(item => item.id), ...current.map(item => item.id)])) {
    const before = oldItems.get(id), after = newItems.get(id);
    const changed = fields.flatMap(([field, label]) => {
      const oldValue = valueOf(before, field), newValue = valueOf(after, field);
      return Object.is(oldValue, newValue) ? [] : [{ field, label, oldValue, newValue }];
    });
    if (!before || !after || changed.length) changes.push({
      itemId: id, itemRef: after?.ref || before?.ref || id,
      description: after?.description || before?.description || '',
      type: !before ? 'added' : !after ? 'removed' : 'changed', fields: changed,
    });
  }
  return changes;
}

/** Read-only history from this project's current work list and retained baselines. */
export function getContractVersions(project) {
  if (!validProject(project)) return [];
  const { entries } = archiveIndex(project);
  const versions = new Map([...entries].filter(([version]) => version < project.version));
  const currentMeta = metadata(project.contractVersion, project.version, project.id);
  versions.set(project.version, { version: project.version, items: project.items,
    ...(currentMeta || {}), confirmedAt: project.locked ? currentMeta?.confirmedAt || project.lockedAt || null : null });
  return [...versions].sort(([a], [b]) => b - a).map(([version, entry]) => {
    const current = version === project.version;
    const meta = current ? currentMeta : metadata(entry, version, project.id);
    const previous = versions.get(version - 1);
    return {
      version, current, locked: current ? project.locked === true : true,
      createdAt: meta?.createdAt || null, createdBy: meta?.createdBy || null, reason: meta?.reason || null,
      confirmedAt: current ? (project.locked ? meta?.confirmedAt || (timestamp(project.lockedAt) ? project.lockedAt : null) : null) : meta?.confirmedAt || null,
      confirmedBy: meta?.confirmedBy || null,
      legacy: !meta?.createdAt && !meta?.createdBy && !meta?.reason,
      totalReview: current ? getContractTotalReview(project).review
        : getContractVersionTotalReview(project, version, entry.items, entry.projectSnapshot?.contract || null),
      changesAvailable: !!previous,
      changes: previous ? diffItems(previous.items, entry.items) : [],
    };
  });
}

/** Open a new editable version, retaining an independent prior baseline. */
export function createContractRevision(project, reason, now = new Date()) {
  const invalid = (error, field) => ({ project, outcome: 'invalid', error, ...(field ? { field } : {}) });
  if (!validProject(project)) return invalid('Choose a valid project work list before editing the contract.');
  if (!project.locked || !project.items.length) return invalid('Confirm the current work list before creating another contract version.');
  if (typeof reason !== 'string' || !text(reason) || text(reason).length > 300 || /[\u0000-\u001f\u007f]/.test(reason)) {
    return invalid('Add a short change reason, up to 300 characters.', 'reason');
  }
  const date = timestamp(now);
  if (!date) return invalid('Use a valid revision date.');
  if (project.version === Number.MAX_SAFE_INTEGER) return invalid('This contract version cannot be incremented.');
  if (project.contractVersion != null && !metadata(project.contractVersion, project.version, project.id)) return invalid('The current contract version metadata does not belong to this work list.');
  const { entries, ambiguous } = archiveIndex(project);
  const existing = entries.get(project.version);
  if (ambiguous.has(project.version) || (existing && commercialKey(existing.items) !== commercialKey(project.items))) {
    return invalid('Conflicting snapshots exist for this contract version. Keep the current work list unchanged.');
  }
  if ([...(project.baselines || [])].some(entry => validScope(entry, project.id) && validVersion(entry.version) && entry.version > project.version)) {
    return invalid('A later contract version already exists. Open the current work list before editing.');
  }
  const version = project.version + 1;
  const priorMeta = metadata(project.contractVersion, project.version, project.id);
  const retained = existing || {
    projectId: project.id, version: project.version, items: clone(project.items), date: project.lockedAt || null,
    projectSnapshot: projectSnapshot(project),
    ...(priorMeta || {}),
  };
  return {
    outcome: 'updated', project: {
      ...project, version, locked: false,
      // Keep the existing historical record byte-for-byte when a seeded current snapshot already exists.
      baselines: existing ? [...(project.baselines || [])] : [...(project.baselines || []), retained],
      contractVersion: { projectId: project.id, version, createdAt: date, createdBy: actor,
        reason: text(reason), confirmedAt: null, confirmedBy: null },
      history: [{ id: `CONTRACT-REVISION-${project.id}-${version}`, action: 'Contract revision created',
        detail: `Version ${version} · ${text(reason)}`, date, actor }, ...project.history],
    },
  };
}

/** Confirm only the reviewed editable work list; saved claims retain their own snapshots. */
export function confirmContractBaseline(project, now = new Date()) {
  const invalid = error => ({ project, outcome: 'invalid', error });
  if (!validProject(project)) return invalid('Choose a valid project work list before confirming it.');
  if (project.locked) return { project, outcome: 'unchanged' };
  if (!project.items.length) return invalid('Add contract items before confirming the work list.');
  if (project.items.some(item => item.needsReview)) return invalid('Check the unresolved items before confirming the work list.');
  if (!getContractChecks(project).canConfirm) return invalid('Resolve missing values and item calculation differences before confirming the work list.');
  const totalReview = getContractTotalReview(project);
  if (totalReview.required && totalReview.status !== 'reviewed') return invalid('Review the total difference and record a reason before confirming the work list.');
  const date = timestamp(now);
  if (!date) return invalid('Use a valid confirmation date.');
  if (totalReview.review && date < totalReview.review.reviewedAt) return invalid('Confirm this version on or after the total-difference review date.');
  const meta = project.contractVersion == null ? null : metadata(project.contractVersion, project.version, project.id);
  if (project.contractVersion != null && !meta) return invalid('The current contract version metadata does not belong to this work list.');
  if (meta?.createdAt && new Date(date).getTime() < new Date(meta.createdAt).getTime()) return invalid('Confirm this version on or after its creation date.');
  const { entries, ambiguous } = archiveIndex(project);
  const existing = entries.get(project.version);
  if (ambiguous.has(project.version) || (existing && commercialKey(existing.items) !== commercialKey(project.items))) {
    return invalid('Conflicting snapshots exist for this contract version. Keep the current work list unchanged.');
  }
  return {
    outcome: 'updated', project: {
      ...project, locked: true, lockedAt: date,
      contractVersion: { projectId: project.id, version: project.version,
        createdAt: meta?.createdAt || null, createdBy: meta?.createdBy || null, reason: meta?.reason || null,
        confirmedAt: date, confirmedBy: actor },
      history: [{ id: `CONTRACT-CONFIRMED-${project.id}-${project.version}`, action: 'Baseline confirmed',
        detail: `Version ${project.version} · ${project.items.length} reviewed items`, date, actor }, ...project.history],
    },
  };
}
