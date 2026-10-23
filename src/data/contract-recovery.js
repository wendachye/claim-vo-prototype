import { seedWorkspace } from './projects.js';

const clone = (value) => structuredClone(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const FAILED_IDS = ['WI-002', 'WI-004'];
const SOURCE_FILENAME = 'warehouse-contract-demo.pdf';
const invalid = (error = 'This demo recovery is no longer valid. Start the extraction again.') => ({ outcome: 'invalid', error });

function sourceFor(selection) {
  if (!record(selection) || !['sample', 'upload'].includes(selection.inputKind)) return null;
  const fileName = selection.inputKind === 'sample' ? SOURCE_FILENAME : text(selection.fileName).replaceAll('\\', '/').split('/').at(-1);
  const fileSize = selection.fileSize == null ? null : Number(selection.fileSize);
  if (!fileName || fileName.length > 255 || /[\u0000-\u001f\u007f]/.test(fileName) || !/\.pdf$/i.test(fileName)
    || (fileSize !== null && (!Number.isSafeInteger(fileSize) || fileSize < 0 || fileSize > 30_000_000))
    || (selection.inputKind === 'upload' && !(fileSize > 0))) return null;
  return { inputKind: selection.inputKind, fileName, fileSize };
}

function fixtureItems() {
  return clone(seedWorkspace().projects.find((project) => project.id === 'WH02').sourceItems)
    .map((item) => item.id === 'WI-001'
      ? { ...item, reported: 0, verified: 0, needsReview: true, rawExtractedQuantity: 1320 }
      : { ...item, reported: 0, verified: 0 });
}

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((entry, index) => equal(entry, b[index]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

const validDate = (value) => typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
  && new Date(value).toISOString() === value;

// Empty numeric fields remain unknown. Explicit zero remains a valid value.
function number(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return NaN;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(raw)) return NaN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000_000 ? parsed : NaN;
}

function manualValues(entries, capturedAt) {
  if (!Array.isArray(entries) || entries.length !== FAILED_IDS.length || !validDate(capturedAt)) return null;
  const values = [];
  for (const id of FAILED_IDS) {
    const matches = entries.filter((entry) => record(entry) && entry.id === id);
    if (matches.length !== 1) return null;
    const entry = matches[0];
    const description = text(entry.description);
    const unit = text(entry.unit);
    const location = text(entry.location);
    const quantity = number(entry.quantity);
    const rate = number(entry.rate);
    if (!description || description.length > 2000 || !unit || unit.length > 30 || !location || location.length > 200
      || Number.isNaN(quantity) || Number.isNaN(rate)
      || (quantity !== null && rate !== null && quantity * rate > Number.MAX_SAFE_INTEGER / 100)) return null;
    values.push({ id, description, unit, quantity, rate, location, capturedAt });
  }
  return values;
}

function manualItem(item, entry) {
  const { capturedAt, ...values } = entry;
  return {
    ...item, ...values,
    amount: entry.quantity === null || entry.rate === null ? null : Math.round((entry.quantity * entry.rate + Number.EPSILON) * 100) / 100,
    needsReview: true,
    rawExtractedQuantity: entry.quantity,
    extractionRecovery: { version: 1, method: 'manual', page: 1, capturedAt },
  };
}

function validate(recovery) {
  if (!record(recovery) || recovery.version !== 1 || !text(recovery.projectId)
    || !sourceFor(recovery.source) || !equal(recovery.source, sourceFor(recovery.source)) || recovery.pageCount !== 1
    || !Array.isArray(recovery.pages) || recovery.pages.length !== 1
    || !Array.isArray(recovery.manualEntries) || !Array.isArray(recovery.items)) return false;
  const page = recovery.pages[0];
  const expectedPage = { page: 1, status: 'failed', failedItemIds: FAILED_IDS, resolution: null, retryCount: 0 };
  const fixture = fixtureItems();
  let expectedItems;
  if (equal(page, expectedPage)) {
    if (recovery.manualEntries.length) return false;
    expectedItems = fixture.filter((item) => !FAILED_IDS.includes(item.id));
  } else if (equal(page, { ...expectedPage, status: 'recovered', resolution: 'retry', retryCount: 1 })) {
    if (recovery.manualEntries.length) return false;
    expectedItems = fixture;
  } else if (equal(page, { ...expectedPage, status: 'recovered', resolution: 'manual' })) {
    const capturedAt = recovery.manualEntries[0]?.capturedAt;
    const entries = manualValues(recovery.manualEntries, capturedAt);
    if (!entries || !equal(entries, recovery.manualEntries)) return false;
    expectedItems = fixture.map((item) => {
      const entry = entries.find((entry) => entry.id === item.id);
      return entry ? manualItem(item, entry) : item;
    });
  } else return false;
  return equal(recovery, {
    version: 1, projectId: recovery.projectId, source: recovery.source, pageCount: 1,
    pages: [page], items: expectedItems, manualEntries: recovery.manualEntries,
  });
}

// A deterministic partial failure on the existing one-page fictional PDF.
// This never reads the selected PDF or creates a second source page.
export function createContractRecovery(projectId, selection) {
  const source = sourceFor(selection);
  if (!text(projectId) || !source) return null;
  return {
    version: 1, projectId, source, pageCount: 1,
    pages: [{ page: 1, status: 'failed', failedItemIds: [...FAILED_IDS], resolution: null, retryCount: 0 }],
    items: fixtureItems().filter((item) => !FAILED_IDS.includes(item.id)), manualEntries: [],
  };
}

export function contractRecoveryMissingRows(recovery) {
  if (!validate(recovery) || recovery.pages[0].status !== 'failed') return [];
  return fixtureItems().filter((item) => FAILED_IDS.includes(item.id));
}

export function retryContractPage(recovery, page = 1) {
  if (!validate(recovery) || page !== 1 || recovery.pages[0].resolution === 'manual') return invalid();
  if (recovery.pages[0].resolution === 'retry') return { outcome: 'recovered', recovery: clone(recovery) };
  const next = clone(recovery);
  next.pages[0] = { ...next.pages[0], status: 'recovered', resolution: 'retry', retryCount: 1 };
  next.items = fixtureItems().map((item) => next.items.find((existing) => existing.id === item.id) || item);
  return { outcome: 'recovered', recovery: next };
}

export function saveManualContractPage(recovery, page, entries, now = new Date()) {
  if (!validate(recovery) || page !== 1 || recovery.pages[0].status !== 'failed') return invalid();
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) return invalid('Choose a valid date for this demo entry.');
  const values = manualValues(entries, date.toISOString());
  if (!values) return invalid('Enter a description, unit and location for both items. Quantity and rate may stay blank; otherwise enter a non-negative number with up to four decimal places.');
  const next = clone(recovery);
  next.pages[0] = { ...next.pages[0], status: 'recovered', resolution: 'manual' };
  next.manualEntries = values;
  next.items = fixtureItems().map((item) => {
    const entry = values.find((entry) => entry.id === item.id);
    return entry ? manualItem(item, entry) : next.items.find((existing) => existing.id === item.id);
  });
  return { outcome: 'recovered', recovery: next };
}

export function inspectContractRecovery(recovery, projectId, selection) {
  if (!validate(recovery) || recovery.projectId !== projectId || !equal(recovery.source, sourceFor(selection))) return invalid();
  const resolved = recovery.pages[0].status === 'recovered';
  return {
    outcome: resolved ? 'ready' : 'unresolved',
    ...(resolved ? {} : { error: 'Retry page 1 or enter its missing items before opening the work list.' }),
    items: clone(recovery.items),
    summary: { successfulItems: 4, recoveredItems: resolved ? FAILED_IDS.length : 0, totalItems: 6,
      needsReview: recovery.items.filter((item) => item.needsReview).length,
      unresolvedPages: resolved ? 0 : 1, resolution: recovery.pages[0].resolution },
    ...(resolved ? { provenance: {
      version: 1, simulated: true, pageCount: 1, page: 1, recoveredItemIds: [...FAILED_IDS],
      method: recovery.pages[0].resolution, retryCount: recovery.pages[0].retryCount,
      manualEntries: clone(recovery.manualEntries),
    } } : {}),
  };
}
