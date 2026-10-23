import assert from 'node:assert/strict';
import test from 'node:test';
import { createContractRevision, confirmContractBaseline, getContractVersions } from '../src/data/contract-versions.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { resetProject } from '../src/data/projects.js';

const at = '2026-10-23T02:00:00.000Z';
const later = '2026-10-23T03:00:00.000Z';
const item = (values = {}) => ({ id: 'WORK-01', ref: 'A.1', description: 'Mock access scaffold',
  quantity: 100, rate: 10, amount: 1000, unit: 'm²', location: 'W3', section: 'A', subsection: 'Access',
  pricingType: 'measured', sourcePage: 1, startDate: '2026-01', durationMonths: 6,
  reported: 60, verified: 40, needsReview: false, reviewedAt: '2026-10-20T00:00:00Z', ...values });
const project = (values = {}) => ({ id: 'CHANGE-01', code: 'CHANGE-01', name: 'Contract changes (Demo)',
  contract: { reference: 'DEMO-CHANGE', currency: 'SGD', sourceKind: 'illustrative' },
  items: [item()], sourceItems: [item({ quantity: 90, amount: 900 })],
  version: 1, locked: true, lockedAt: '2026-10-20T00:00:00Z', baselines: [], history: [],
  reports: [{ id: 'REPORT-01', itemId: 'WORK-01', completion: 60 }],
  voReviews: [{ id: 'VO-01', approvedValue: 50 }],
  claimDrafts: [{ id: 'CLAIM-01', status: 'prepared', snapshot: { baselineVersion: 1, totals: { currentValue: 100 } } }],
  claimTracking: [{ draftId: 'CLAIM-01', stage: 'submitted' }], ...values });

test('a required reason opens one editable version and independently retains the previous work list', () => {
  const before = project();
  const original = structuredClone(before);
  const result = createContractRevision(before, '  Correct the agreed measured quantity  ', at);
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(before, original);
  assert.equal(result.project.version, 2);
  assert.equal(result.project.locked, false);
  assert.equal(result.project.contractVersion.reason, 'Correct the agreed measured quantity');
  assert.equal(result.project.contractVersion.createdAt, at);
  assert.equal(result.project.contractVersion.createdBy, 'Alex Tan · Demo QS reviewer');
  assert.equal(result.project.contractVersion.confirmedAt, null);
  const archived = result.project.baselines[0];
  assert.equal(archived.projectId, before.id);
  assert.equal(archived.projectSnapshot.id, before.id);
  assert.equal(archived.projectSnapshot.contract.reference, before.contract.reference);
  assert.deepEqual(archived.items, before.items);
  assert.notEqual(archived.items, before.items);
  assert.notEqual(archived.items[0], before.items[0]);
  for (const field of ['items', 'sourceItems', 'reports', 'voReviews', 'claimDrafts', 'claimTracking', 'contract']) {
    assert.equal(result.project[field], before[field], `${field} stays unchanged`);
  }
  assert.equal(result.project.history[0].action, 'Contract revision created');
  assert.match(result.project.history[0].detail, /Correct the agreed measured quantity/);
  assert.equal(createContractRevision(result.project, 'Duplicate request', later).outcome, 'invalid');
});

test('normal seeded current snapshots are reused without duplicates or invented legacy author/reason', () => {
  const before = project();
  before.baselines = [{ version: 1, date: before.lockedAt, items: [item({ reported: 0, verified: 0, reviewedAt: null })], demo: true }];
  const result = createContractRevision(before, 'Correction for demo review', at);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.project.baselines.length, 1);
  assert.equal(result.project.baselines[0], before.baselines[0]);
  const original = getContractVersions(result.project).find(row => row.version === 1);
  assert.equal(original.createdAt, null);
  assert.equal(original.createdBy, null);
  assert.equal(original.reason, null);
  assert.equal(original.confirmedBy, null);
  assert.equal(original.confirmedAt, before.lockedAt);
  assert.equal(original.changesAvailable, false);
});

test('the actual original S.I.T. fixture can create and confirm a revision without rechecking unchanged rows', () => {
  const before = createSITContractDemo({ name: 'Contract history demo', code: 'SIT-HISTORY' }, at);
  const result = createContractRevision(before, 'Mock correction to item description', later);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.project.baselines.length, before.baselines.length);
  assert.deepEqual(result.project.items, before.items);
  assert.equal(result.project.items.some(row => row.needsReview), false);
  assert.equal(confirmContractBaseline(result.project, later).outcome, 'updated');
  assert.deepEqual(result.project.claimDrafts, before.claimDrafts);
});

test('confirmation records reviewer and date once without changing old versions or saved claims', () => {
  const before = project();
  const opened = createContractRevision(before, 'Correct quantity and value', at).project;
  const edited = { ...opened, items: [item({ quantity: 120, amount: 1200, reviewedAt: later })] };
  const confirmed = confirmContractBaseline(edited, later);
  assert.equal(confirmed.outcome, 'updated');
  assert.equal(confirmed.project.locked, true);
  assert.equal(confirmed.project.lockedAt, later);
  assert.equal(confirmed.project.contractVersion.confirmedAt, later);
  assert.equal(confirmed.project.contractVersion.confirmedBy, 'Alex Tan · Demo QS reviewer');
  assert.equal(confirmed.project.contractVersion.reason, 'Correct quantity and value');
  assert.equal(confirmed.project.baselines, edited.baselines);
  assert.equal(confirmed.project.claimDrafts, before.claimDrafts);
  assert.equal(confirmed.project.claimDrafts[0].snapshot.baselineVersion, 1);
  const retry = confirmContractBaseline(confirmed.project, '2026-10-24T02:00:00Z');
  assert.equal(retry.outcome, 'unchanged');
  assert.equal(retry.project, confirmed.project);
  assert.deepEqual(getContractVersions(confirmed.project)[0].changes.map(row => row.fields.map(field => field.field)), [['quantity', 'amount']]);
});

test('confirmation rejects missing values and calculation differences even without extraction flags', () => {
  const before = createContractRevision(project(), 'Check saved contract values', at).project;
  const original = structuredClone(before);
  const missing = { ...before, items: [item({ quantity: null, amount: null, needsReview: false })] };
  assert.equal(confirmContractBaseline(missing, later).outcome, 'invalid');
  const mismatch = { ...before, items: [item({ amount: 999, needsReview: false })] };
  assert.equal(confirmContractBaseline(mismatch, later).outcome, 'invalid');
  assert.equal(confirmContractBaseline(before, later).outcome, 'updated');
  assert.deepEqual(before, original);
  // Existing confirmed versions remain intact; checks do not retroactively unlock them.
  const historical = project({ items: missing.items });
  assert.equal(confirmContractBaseline(historical, later).outcome, 'unchanged');
});

test('only stable item IDs and whitelisted contract fields are compared', () => {
  const opened = createContractRevision(project(), 'Mock commercial correction', at).project;
  const edited = { ...opened, items: [item({ quantity: 120, amount: 1200, reported: 100, verified: 80,
    needsReview: true, reviewedAt: later, rawExtractedQuantity: 700, extractionNote: 'Changed OCR note', arbitraryNewField: 'Ignored' })] };
  const row = getContractVersions(edited)[0];
  assert.equal(row.current, true);
  assert.equal(row.locked, false);
  assert.equal(row.confirmedAt, null);
  assert.equal(row.changesAvailable, true);
  assert.deepEqual(row.changes, [{ itemId: 'WORK-01', itemRef: 'A.1', description: 'Mock access scaffold', type: 'changed', fields: [
    { field: 'quantity', label: 'Quantity', oldValue: 100, newValue: 120 },
    { field: 'amount', label: 'Amount', oldValue: 1000, newValue: 1200 },
  ] }]);
  assert.equal(confirmContractBaseline(edited, later).outcome, 'invalid');
});

test('unknown, blank and zero remain distinct while Included and Rate Only are explicit changes', () => {
  const before = project({ items: [item({ amount: null, rate: null, pricingType: 'included', location: '' })] });
  const opened = createContractRevision(before, 'Review the payment basis', at).project;
  const edited = { ...opened, items: [item({ amount: 0, rate: 0, pricingType: 'rateOnly', location: null })] };
  const fields = getContractVersions(edited)[0].changes[0].fields;
  assert.deepEqual(fields.find(row => row.field === 'rate'), { field: 'rate', label: 'Unit rate', oldValue: null, newValue: 0 });
  assert.deepEqual(fields.find(row => row.field === 'location'), { field: 'location', label: 'Location', oldValue: '', newValue: null });
  assert.deepEqual(fields.find(row => row.field === 'pricingType'), { field: 'pricingType', label: 'Pricing type', oldValue: 'included', newValue: 'rateOnly' });
  assert.equal(getContractVersions(project({ sourceItems: [item({ quantity: 1 })] }))[0].changesAvailable, false);
});

test('added and removed rows retain their own IDs rather than matching by reference or description', () => {
  const before = project({ items: [item(), item({ id: 'WORK-02', ref: 'A.2', quantity: 50 })] });
  const opened = createContractRevision(before, 'Replace a separately listed scope', at).project;
  const edited = { ...opened, items: [item({ id: 'WORK-03' }), item({ id: 'WORK-02', ref: 'A.2', quantity: 50 })] };
  const changes = getContractVersions(edited)[0].changes;
  assert.equal(changes.find(row => row.itemId === 'WORK-01').type, 'removed');
  assert.equal(changes.find(row => row.itemId === 'WORK-03').type, 'added');
  assert.equal(changes.some(row => row.itemId === 'WORK-02'), false);
});

test('foreign snapshots and ambiguous duplicate versions are never chosen for comparison', () => {
  const before = project({ version: 3, baselines: [
    { version: 1, items: [item()], date: at },
    { version: 2, projectId: 'OTHER', items: [item({ quantity: 999 })], date: at },
    { version: 2, items: [item({ quantity: 110 })], date: at },
    { version: 2, items: [item({ quantity: 120 })], date: at },
    { version: 5, projectId: 'OTHER', items: [item()], date: at },
  ] });
  const rows = getContractVersions(before);
  assert.deepEqual(rows.map(row => row.version), [3, 1]);
  assert.equal(rows[0].changesAvailable, false);
  assert.deepEqual(rows[0].changes, []);
  const safe = project({ version: 2, baselines: [{ version: 1, projectSnapshot: { id: 'OTHER' }, items: [item()], date: at }] });
  assert.deepEqual(getContractVersions(safe).map(row => row.version), [2]);
  assert.equal(getContractVersions(safe)[0].changesAvailable, false);
});

test('identical legacy duplicate snapshots collapse while conflicting current snapshots block editing', () => {
  const baseline = { version: 1, date: at, items: [item()] };
  const duplicate = project({ baselines: [baseline, structuredClone(baseline)] });
  assert.equal(getContractVersions(duplicate).length, 1);
  assert.equal(createContractRevision(duplicate, 'Review a mock correction', later).outcome, 'updated');
  const conflict = project({ baselines: [baseline, { ...baseline, items: [item({ quantity: 999 })] }] });
  assert.equal(createContractRevision(conflict, 'Correct quantity', later).outcome, 'invalid');
  const priorMismatch = project({ baselines: [{ ...baseline, items: [item({ quantity: 999 })] }] });
  assert.equal(createContractRevision(priorMismatch, 'Correct quantity', later).outcome, 'invalid');
});

test('invalid reasons, scope, version counters, and dates leave the project unchanged', () => {
  const before = project();
  for (const reason of ['', '  ', 'x'.repeat(301), 'Two\nlines', 123, null, {}]) {
    const result = createContractRevision(before, reason, at);
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.field, 'reason');
    assert.equal(result.project, before);
  }
  for (const bad of [null, {}, project({ items: [item(), item()] }), project({ items: [item({ projectId: 'OTHER' })] }),
    project({ version: 0 }), project({ version: Number.MAX_SAFE_INTEGER }),
    project({ locked: false }), project({ items: [] }),
    project({ contractVersion: { projectId: 'OTHER', version: 1 } }),
    project({ baselines: [{ version: 2, items: [item()], date: at }] })]) {
    const result = createContractRevision(bad, 'A valid mock change reason', at);
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.project, bad);
  }
  for (const invalid of ['not-a-date', null, false, Infinity]) assert.equal(createContractRevision(before, 'Mock revision', invalid).outcome, 'invalid');
});

test('legacy first confirmation records only known confirmation metadata and rejects unresolved or invalid states', () => {
  const before = project({ locked: false });
  const result = confirmContractBaseline(before, at);
  assert.equal(result.outcome, 'updated');
  const row = getContractVersions(result.project)[0];
  assert.equal(row.createdAt, null);
  assert.equal(row.createdBy, null);
  assert.equal(row.reason, null);
  assert.equal(row.confirmedAt, at);
  assert.equal(row.confirmedBy, 'Alex Tan · Demo QS reviewer');
  assert.equal(row.changesAvailable, false);
  for (const value of [null, {}, project({ locked: false, items: [] }), project({ locked: false, items: [item({ needsReview: true })] }),
    project({ locked: false, contractVersion: { projectId: 'OTHER', version: 1 } })]) {
    assert.equal(confirmContractBaseline(value, at).outcome, 'invalid');
  }
  const opened = createContractRevision(project(), 'Mock correction', at).project;
  assert.equal(confirmContractBaseline(opened, '2026-10-22T00:00:00Z').outcome, 'invalid');
  assert.equal(confirmContractBaseline(opened, 'invalid').outcome, 'invalid');
});

test('confirmed versions retain their original metadata through a later revision and cannot be mutated by reading history', () => {
  const opened = createContractRevision(project(), 'First mock correction', at).project;
  const confirmed = confirmContractBaseline({ ...opened, items: [item({ quantity: 120, amount: 1200 })] }, later).project;
  const next = createContractRevision(confirmed, 'Second mock correction', '2026-10-24T02:00:00Z').project;
  const frozen = structuredClone(next);
  const rows = getContractVersions(next);
  assert.deepEqual(rows.map(row => row.version), [3, 2, 1]);
  assert.equal(rows[1].reason, 'First mock correction');
  assert.equal(rows[1].createdAt, at);
  assert.equal(rows[1].confirmedAt, later);
  assert.equal(rows[1].confirmedBy, 'Alex Tan · Demo QS reviewer');
  assert.deepEqual(rows[1].changes[0].fields.find(field => field.field === 'quantity'), { field: 'quantity', label: 'Quantity', oldValue: 100, newValue: 120 });
  assert.equal(rows[0].changesAvailable, true);
  assert.deepEqual(rows[0].changes, []);
  rows[1].changes[0].fields[0].newValue = 800;
  assert.deepEqual(next, frozen);
});

test('reset clears revision metadata so the restored demo can begin a new independent version', () => {
  const original = createSITContractDemo({ name: 'Reset contract changes', code: 'VERSION-RESET' }, new Date(at));
  const opened = createContractRevision(original, 'Mock correction before resetting', later);
  assert.equal(opened.outcome, 'updated');
  const beforeReset = structuredClone(opened.project);
  const restored = resetProject(opened.project);
  assert.equal(restored.version, original.version);
  assert.equal(Object.hasOwn(restored, 'contractVersion'), false);
  assert.deepEqual(restored.baselines, original.seed.baselines);
  assert.equal(getContractVersions(restored)[0].reason, null);
  assert.equal(createContractRevision(restored, 'Independent mock correction after reset', later).outcome, 'updated');
  assert.deepEqual(opened.project, beforeReset);
});
