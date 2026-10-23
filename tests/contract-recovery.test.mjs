import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMockContract, DEMO_CONTRACT_PDF } from '../src/data/contract-import.ts';
import { contractRecoveryMissingRows, createContractRecovery, inspectContractRecovery, retryContractPage, saveManualContractPage } from '../src/data/contract-recovery.ts';
import { createProject, loadWorkspace, resetProject, seedWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';

const now = new Date('2026-10-23T04:30:00.000Z');
const input = { inputKind: 'sample', fileName: 'warehouse-contract-demo.pdf', fileSize: 0 };
const blank = () => createProject({ name: 'Recovery showcase', code: 'RECOVERY01', country: 'Singapore' });
const workspaceWith = (project) => ({ ...seedWorkspace(), activeProjectId: project.id, projects: [...seedWorkspace().projects, project] });
const entries = () => [
  { id: 'WI-002', description: 'Block A — roof sheeting', quantity: '900', unit: 'm²', rate: '42', location: 'Block A' },
  { id: 'WI-004', description: 'Block B — loading-bay door installation', quantity: '4', unit: 'set', rate: '3200', location: 'Block B' },
];
const makeJob = () => createContractRecovery('RECOVERY01', input);
const resolved = () => retryContractPage(makeJob()).recovery;

test('partial recovery refers only to the existing Page 1 and retains all four successful results', () => {
  const job = makeJob();
  assert.equal(job.pageCount, 1);
  assert.deepEqual(job.pages, [{ page: 1, status: 'failed', failedItemIds: ['WI-002', 'WI-004'], resolution: null, retryCount: 0 }]);
  assert.deepEqual(job.items.map((item) => item.id), ['WI-001', 'WI-003', 'WI-005', 'WI-006']);
  assert.equal(job.items[0].rawExtractedQuantity, 1320);
  assert.equal(job.items[0].quantity, 1200);
  assert.equal(job.items[0].needsReview, true);
  assert.ok(job.items.every((item) => item.sourcePage === 1 && item.reported === 0 && item.verified === 0));
  assert.deepEqual(contractRecoveryMissingRows(job).map((item) => [item.id, item.quantity, item.rate]), [['WI-002', 900, 42], ['WI-004', 4, 3200]]);
  const inspected = inspectContractRecovery(job, 'RECOVERY01', input);
  assert.equal(inspected.outcome, 'unresolved');
  assert.equal(inspected.summary.unresolvedPages, 1);
  assert.equal(inspected.summary.successfulItems, 4);
  assert.equal(inspected.summary.needsReview, 1);
});

test('retry fills only the missing items, is idempotent and never marks the original mismatch reviewed', () => {
  const job = makeJob();
  const before = structuredClone(job);
  const result = retryContractPage(job, 1);
  assert.equal(result.outcome, 'recovered');
  assert.deepEqual(job, before);
  assert.equal(result.recovery.items.length, 6);
  for (const item of job.items) assert.deepEqual(result.recovery.items.find((next) => next.id === item.id), item);
  assert.deepEqual(result.recovery.items.filter((item) => item.needsReview).map((item) => item.id), ['WI-001']);
  assert.deepEqual(contractRecoveryMissingRows(result.recovery), []);
  assert.deepEqual(retryContractPage(result.recovery).recovery, result.recovery);
  const inspected = inspectContractRecovery(result.recovery, 'RECOVERY01', input);
  assert.equal(inspected.outcome, 'ready');
  assert.equal(inspected.summary.needsReview, 1);
  assert.equal(inspected.summary.recoveredItems, 2);
  assert.equal(inspected.provenance.method, 'retry');
  assert.equal(inspected.provenance.retryCount, 1);
});

test('manual recovery retains source anchors and successful rows while requiring separate item review', () => {
  const job = makeJob();
  const before = structuredClone(job);
  const result = saveManualContractPage(job, 1, entries(), now);
  assert.equal(result.outcome, 'recovered');
  assert.deepEqual(job, before);
  const ready = inspectContractRecovery(result.recovery, 'RECOVERY01', input);
  assert.equal(ready.outcome, 'ready');
  assert.equal(ready.summary.needsReview, 3);
  assert.equal(ready.provenance.method, 'manual');
  for (const item of job.items) assert.deepEqual(ready.items.find((next) => next.id === item.id), item);
  for (const id of ['WI-002', 'WI-004']) {
    const row = ready.items.find((item) => item.id === id);
    assert.equal(row.needsReview, true);
    assert.equal(row.sourcePage, 1);
    assert.equal(row.reported, 0);
    assert.equal(row.verified, 0);
    assert.deepEqual(row.extractionRecovery, { version: 1, method: 'manual', page: 1, capturedAt: now.toISOString() });
    assert.equal(row.reviewedAt, undefined);
  }
  assert.equal(ready.items.find((item) => item.id === 'WI-004').amount, 12800);
  assert.equal(retryContractPage(result.recovery).outcome, 'invalid');
});

test('blank manual quantities remain unknown and explicit zero remains zero', () => {
  const values = entries();
  values[0].quantity = '';
  values[0].rate = '0';
  values[1].quantity = '0';
  values[1].rate = '';
  const result = saveManualContractPage(makeJob(), 1, values, now);
  assert.equal(result.outcome, 'recovered');
  const roof = result.recovery.items.find((item) => item.id === 'WI-002');
  const door = result.recovery.items.find((item) => item.id === 'WI-004');
  assert.equal(roof.quantity, null);
  assert.equal(roof.rate, 0);
  assert.equal(roof.amount, null);
  assert.equal(door.quantity, 0);
  assert.equal(door.rate, null);
  assert.equal(door.amount, null);
  assert.ok(roof.needsReview && door.needsReview);
  const zeroValues = entries();
  zeroValues[0].quantity = '0';
  assert.equal(saveManualContractPage(makeJob(), 1, zeroValues, now).recovery.items.find((item) => item.id === 'WI-002').amount, 0);
});

test('manual validation rejects malformed numbers and missing identities without changing the job', () => {
  const job = makeJob();
  const before = structuredClone(job);
  for (const value of ['-1', 'NaN', 'Infinity', '1,000', '12m', '1.00001', '1e3', false, [], 1_000_000_001]) {
    const bad = entries();
    bad[0].quantity = value;
    assert.equal(saveManualContractPage(job, 1, bad, now).outcome, 'invalid', String(value));
  }
  for (const field of ['description', 'unit', 'location']) {
    const bad = entries();
    bad[0][field] = ' ';
    assert.equal(saveManualContractPage(job, 1, bad, now).outcome, 'invalid', field);
  }
  assert.equal(saveManualContractPage(job, 2, entries(), now).outcome, 'invalid');
  assert.equal(saveManualContractPage(job, 1, entries().slice(0, 1), now).outcome, 'invalid');
  assert.equal(saveManualContractPage(job, 1, [entries()[0], entries()[0]], now).outcome, 'invalid');
  assert.equal(saveManualContractPage(job, 1, entries(), new Date('invalid')).outcome, 'invalid');
  assert.deepEqual(job, before);
});

test('apply refuses unresolved, foreign and malformed recovery payloads at the data boundary', () => {
  const project = blank();
  const workspace = workspaceWith(project);
  const before = structuredClone(workspace);
  assert.equal(applyMockContract(workspace, project.id, { ...input, recovery: makeJob() }, now).outcome, 'invalid');
  for (const change of [
    (job) => { job.projectId = 'OTHER'; },
    (job) => { job.version = 2; },
    (job) => { job.pageCount = 2; },
    (job) => { job.pages[0].page = 2; },
    (job) => { job.source.fileName = 'foreign.pdf'; job.source.inputKind = 'upload'; job.source.fileSize = 100; },
    (job) => { job.items[0].quantity = 999; },
    (job) => { job.items[0].needsReview = false; },
    (job) => { job.items[1].sourcePage = 2; },
    (job) => { job.items[1].verified = 100; },
    (job) => { job.items.push(job.items[0]); },
    (job) => { job.pages[0].failedItemIds.reverse(); },
    (job) => { job.extra = 'unrecognized payload'; },
  ]) {
    const bad = resolved();
    change(bad);
    assert.equal(applyMockContract(workspace, project.id, { ...input, recovery: bad }, now).outcome, 'invalid');
  }
  for (const recovery of [null, {}, [], 'ready']) assert.equal(applyMockContract(workspace, project.id, { ...input, recovery }, now).outcome, 'invalid');
  assert.deepEqual(workspace, before);
});

test('applied recovery retains the bundled source, immutable source rows and unreviewed reset seed', () => {
  const project = blank();
  const values = entries();
  values[0].quantity = '875';
  values[0].rate = '';
  const recovery = saveManualContractPage(makeJob(), 1, values, now).recovery;
  const result = applyMockContract(workspaceWith(project), project.id, { ...input, recovery }, now);
  assert.equal(result.outcome, 'applied');
  assert.equal(result.createdNew, false);
  assert.equal(result.project.contract.sourceFile, DEMO_CONTRACT_PDF);
  assert.equal(result.project.contract.sourcePageCount, 1);
  assert.equal(result.project.sourceItems.find((item) => item.id === 'WI-002').quantity, 900);
  assert.equal(result.project.sourceItems.find((item) => item.id === 'WI-002').rate, 42);
  assert.equal(result.project.items.find((item) => item.id === 'WI-002').quantity, 875);
  assert.equal(result.project.items.find((item) => item.id === 'WI-002').rate, null);
  assert.deepEqual(result.project.seed.items, result.project.items);
  assert.equal(result.project.locked, false);
  assert.deepEqual(result.project.claimDrafts, []);
  assert.equal(result.project.contract.demoImport.recovery.method, 'manual');
  result.project.items[1].quantity = 1;
  const reset = resetProject(result.project);
  assert.equal(reset.items[1].quantity, 875);
  assert.equal(reset.items[1].needsReview, true);
  assert.equal(reset.sourceItems[1].quantity, 900);
  assert.deepEqual(reset.contract.demoImport, result.project.contract.demoImport);
  const storage = new Map([[WORKSPACE_STORE, JSON.stringify(result.workspace)]]);
  const loaded = loadWorkspace({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
  assert.deepEqual(loaded.projects.at(-1).seed.items, result.project.seed.items);
  assert.equal(loaded.projects.at(-1).items[1].rate, null);
});

test('recovering while a populated project is selected creates a sibling and preserves every saved claim', () => {
  const workspace = seedWorkspace();
  const current = workspace.projects[0];
  current.claimDrafts = [{ id: 'CLAIM-KEEP-R1', version: 1, assessment: { work: { 'WI-001': { assessedQuantity: 100 } } }, snapshot: { contract: { sourceFile: 'saved-source.pdf' }, totals: { currentValue: 12345 }, items: [{ description: 'Frozen work item' }] } }];
  current.claimTracking = [{ draftId: 'CLAIM-KEEP-R1', status: 'paid', claimedValue: 12345 }];
  const before = structuredClone(workspace);
  const recovery = retryContractPage(createContractRecovery(current.id, input)).recovery;
  const result = applyMockContract(workspace, current.id, { ...input, recovery }, now);
  assert.equal(result.outcome, 'applied');
  assert.equal(result.createdNew, true);
  assert.deepEqual(result.workspace.projects.slice(0, workspace.projects.length), before.projects);
  assert.deepEqual(workspace, before);
  assert.deepEqual(result.project.claimDrafts, []);
  assert.equal(result.project.items.length, 6);
  assert.deepEqual(result.project.contract.demoImport.recovery.recoveredItemIds, ['WI-002', 'WI-004']);
});

test('source selection identity stays bound to the project and retry cannot be reused for another PDF', () => {
  const upload = { inputKind: 'upload', fileName: 'C:\\private\\Chosen.pdf', fileSize: 2048 };
  const recovery = retryContractPage(createContractRecovery('RECOVERY01', upload)).recovery;
  assert.equal(recovery.source.fileName, 'Chosen.pdf');
  assert.equal(inspectContractRecovery(recovery, 'RECOVERY01', upload).outcome, 'ready');
  assert.equal(inspectContractRecovery(recovery, 'FOREIGN', upload).outcome, 'invalid');
  assert.equal(inspectContractRecovery(recovery, 'RECOVERY01', { ...upload, fileName: 'Another.pdf' }).outcome, 'invalid');
  assert.equal(inspectContractRecovery(recovery, 'RECOVERY01', { ...upload, fileSize: 2049 }).outcome, 'invalid');
  assert.equal(createContractRecovery('', input), null);
  assert.equal(createContractRecovery('RECOVERY01', { ...upload, fileSize: 0 }), null);
});
