import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMockContract, canImportIntoProject, DEMO_CONTRACT_FILENAME, DEMO_CONTRACT_PDF, MAX_CONTRACT_FILE_SIZE, validateContractFile } from '../src/data/contract-import.js';
import { createProject, loadWorkspace, resetProject, seedWorkspace, WORKSPACE_STORE } from '../src/data/projects.js';
import { buildClaimReview } from '../src/data/claims.js';

const now = new Date('2026-10-21T13:00:00Z');
const input = { inputKind: 'upload', fileName: 'Selected contract.pdf', fileSize: 2500 };
const blank = (code = 'UPLOAD01') => createProject({ name: 'Upload walkthrough', code, country: 'Singapore', subcontractor: 'Example team', description: 'User project description' });
const workspaceWith = (project) => ({ ...seedWorkspace(), activeProjectId: project.id, projects: [...seedWorkspace().projects, project] });

test('an empty project receives an independent fictional work list without changing its identity or other projects', () => {
  const empty = blank();
  empty.customMetadata = { owner: 'Demo team' };
  empty.contract.mainContractor = 'Example contractor';
  const workspace = workspaceWith(empty);
  const before = structuredClone(workspace);
  assert.equal(canImportIntoProject(empty), true);
  const result = applyMockContract(workspace, empty.id, input, now);
  assert.equal(result.outcome, 'applied');
  assert.equal(result.createdNew, false);
  assert.equal(result.workspace.projects.length, workspace.projects.length);
  assert.equal(result.workspace.activeProjectId, empty.id);
  assert.equal(result.project.id, empty.id);
  assert.equal(result.project.name, empty.name);
  assert.equal(result.project.country, empty.country);
  assert.equal(result.project.description, empty.description);
  assert.deepEqual(result.project.customMetadata, empty.customMetadata);
  assert.equal(result.project.contract.subcontractor, 'Example team');
  assert.equal(result.project.contract.mainContractor, 'Example contractor');
  assert.equal(result.project.items.length, 6);
  assert.equal(result.project.items[0].rawExtractedQuantity, 1320);
  assert.equal(result.project.sourceItems[0].quantity, 1200);
  assert.equal(result.project.items.filter((item) => item.needsReview).length, 1);
  assert.ok(result.project.items.every((item) => item.reported === 0 && item.verified === 0));
  assert.equal(result.project.locked, false);
  assert.equal(result.project.whatsappMessages.length, 4);
  assert.ok(result.project.whatsappMessages.every((message) => message.projectId === empty.id && message.status === 'new'));
  assert.deepEqual(result.project.reports, []);
  assert.deepEqual(result.project.voReviews, []);
  assert.deepEqual(result.project.claimDrafts, []);
  assert.deepEqual(result.workspace.projects.slice(0, 2), before.projects.slice(0, 2));
  assert.deepEqual(workspace, before);
  result.project.items[0].quantity = 999;
  result.project.customMetadata.owner = 'Changed';
  assert.equal(result.project.seed.items[0].quantity, 1200);
  assert.equal(empty.customMetadata.owner, 'Demo team');
});

test('existing or previously used project data always creates a uniquely named sibling instead of replacing records', () => {
  const workspace = seedWorkspace();
  const original = workspace.projects[1];
  original.locked = true;
  original.claimDrafts = [{ id: 'SAVED-CLAIM', snapshot: { totals: { currentValue: 345 } } }];
  const before = structuredClone(workspace);
  const first = applyMockContract(workspace, original.id, input, now);
  assert.equal(first.outcome, 'applied');
  assert.equal(first.createdNew, true);
  assert.equal(first.project.code, 'WH02-DOC1');
  assert.equal(first.project.name, `${original.name} - Upload demo`);
  assert.equal(first.project.country, original.country);
  assert.deepEqual(first.workspace.projects.slice(0, 2), before.projects);
  assert.deepEqual(workspace, before);
  const next = applyMockContract(first.workspace, original.id, input, now);
  assert.equal(next.project.code, 'WH02-DOC2');
  assert.equal(next.workspace.projects.length, 4);
  for (const field of ['items', 'sourceItems', 'reports', 'history', 'baselines', 'voReviews', 'claimDrafts', 'whatsappMessages']) {
    const used = blank();
    used[field] = [{ id: 'EXISTING' }];
    assert.equal(canImportIntoProject(used), false, field);
  }
  for (const patch of [{ locked: true }, { lockedAt: now.toISOString() }, { version: 2 }, { contract: { sourceFile: 'existing.pdf' } }, { contract: { sourceFilename: 'existing.pdf' } }, { contract: { sourceKind: 'provided' } }]) {
    const used = blank();
    Object.assign(used, patch.contract ? { contract: { ...used.contract, ...patch.contract } } : patch);
    assert.equal(canImportIntoProject(used), false);
  }
  const previous = blank();
  previous.seed.items.push({ id: 'PREVIOUS-SOURCE' });
  assert.equal(canImportIntoProject(previous), false);
});

test('a stable project ID that differs from its code remains the scope for imported messages and reset data', () => {
  const project = blank();
  project.id = 'stable-project-id';
  project.contract.id = project.id;
  const result = applyMockContract(workspaceWith(project), project.id, input, now);
  assert.equal(result.outcome, 'applied');
  assert.equal(result.project.id, project.id);
  assert.equal(result.project.contract.id, project.id);
  assert.equal(result.project.code, project.code);
  assert.ok(result.project.whatsappMessages.every((message) => message.projectId === project.id && message.id.startsWith(`${project.id}-WA-`)));
  assert.deepEqual(resetProject(result.project).whatsappMessages, result.project.whatsappMessages);
});

test('import metadata never attributes preset values to the selected PDF and the demo currency matches the bundled source', () => {
  const project = createProject({ name: 'Malaysia showcase', code: 'MYSHOWCASE', country: 'Malaysia' });
  const result = applyMockContract(workspaceWith(project), project.id, { ...input, fileName: 'C:\\private\\Selected contract.pdf', bytes: 'must not persist', url: 'blob:temporary', fields: ['not extracted'] }, now);
  assert.equal(result.project.country, 'Malaysia');
  assert.equal(result.project.contract.currency, 'SGD');
  assert.equal(result.project.contract.reference, 'WAREHOUSE-DEMO-SCHEDULE');
  assert.equal(result.project.contract.date, null);
  assert.equal(result.project.contract.dateLabel, 'Illustrative schedule - no execution date');
  assert.equal(result.project.contract.sourceKind, 'illustrative');
  assert.equal(result.project.contract.sourceFile, DEMO_CONTRACT_PDF);
  assert.equal(result.project.contract.sourceFilename, DEMO_CONTRACT_FILENAME);
  assert.deepEqual(result.project.contract.demoImport, { inputKind: 'upload', fileName: 'Selected contract.pdf', fileSize: 2500, importedAt: now.toISOString() });
  assert.match(result.project.contract.demoNotice, /not from the selected PDF/);
  const sample = applyMockContract(workspaceWith(blank()), 'UPLOAD01', { inputKind: 'sample' }, now);
  assert.equal(sample.outcome, 'applied');
  assert.equal(sample.project.contract.demoImport.fileName, DEMO_CONTRACT_FILENAME);
  assert.equal(sample.project.contract.demoImport.fileSize, null);
});

test('project-code and name limits remain valid when repeated uploads collide with long project codes or IDs', () => {
  const project = blank('ABCDEFGHIJKLMNOPQRST');
  project.name = 'A'.repeat(100);
  const workspace = workspaceWith(project);
  workspace.projects.push({ id: 'ABCDEFGHIJKLMNO-DOC1', code: 'OTHER' });
  const result = applyMockContract(workspace, project.id, input, now);
  assert.equal(result.createdNew, false);
  result.project.items[0].reviewedAt = now.toISOString();
  const next = applyMockContract(result.workspace, project.id, input, now);
  assert.equal(next.createdNew, true);
  assert.equal(next.project.code, 'ABCDEFGHIJKLMNO-DOC2');
  assert.equal(next.project.code.length, 20);
  assert.ok(next.project.name.length <= 100);
  assert.match(next.project.name, / - Upload demo$/);
});

test('invalid import inputs are inert and cannot create work or alter an existing project', () => {
  const workspace = workspaceWith(blank());
  const before = structuredClone(workspace);
  const badInputs = [null, {}, { ...input, inputKind: 'ai' }, { ...input, fileName: '' }, { ...input, fileName: 'notes.txt' }, { ...input, fileName: 'secret\u0000.pdf' }, { ...input, fileSize: 0 }, { ...input, fileSize: -1 }, { ...input, fileSize: MAX_CONTRACT_FILE_SIZE + 1 }, { ...input, fileSize: Infinity }];
  for (const value of badInputs) assert.equal(applyMockContract(workspace, 'UPLOAD01', value, now).outcome, 'invalid');
  assert.equal(applyMockContract(workspace, 'FOREIGN', input, now).outcome, 'invalid');
  assert.equal(applyMockContract(workspace, 'UPLOAD01', input, new Date('bad')).outcome, 'invalid');
  assert.equal(applyMockContract(null, 'UPLOAD01', input, now).outcome, 'invalid');
  assert.deepEqual(workspace, before);
});

test('reset and storage reload keep the imported mock source and independent unconfirmed seed without inventing claim eligibility', () => {
  const result = applyMockContract(workspaceWith(blank()), 'UPLOAD01', input, now);
  const project = result.project;
  project.items[0].quantity = 800;
  project.items[0].verified = 99;
  project.locked = true;
  project.lockedAt = now.toISOString();
  project.claimDrafts = [{ id: 'TEMPORARY' }];
  const reset = resetProject(project);
  assert.equal(reset.items[0].quantity, 1200);
  assert.equal(reset.items[0].verified, 0);
  assert.equal(reset.items[0].needsReview, true);
  assert.equal(reset.locked, false);
  assert.deepEqual(reset.claimDrafts, []);
  assert.equal(reset.contract.sourceFile, DEMO_CONTRACT_PDF);
  assert.deepEqual(reset.contract.demoImport, project.contract.demoImport);
  assert.equal(buildClaimReview(reset, '2026-10', {}).canPrepare, false);
  const workspace = { ...result.workspace, projects: result.workspace.projects.map((entry) => entry.id === reset.id ? reset : entry) };
  const entries = new Map([[WORKSPACE_STORE, JSON.stringify(workspace)]]);
  const loaded = loadWorkspace({ getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  assert.equal(loaded.activeProjectId, reset.id);
  assert.deepEqual(loaded.projects.at(-1).contract.demoImport, reset.contract.demoImport);
  assert.equal(loaded.projects.at(-1).items[0].needsReview, true);
  assert.equal(loaded.projects.at(-1).sourceItems[0].quantity, 1200);
  assert.deepEqual(loaded.projects.at(-1).seed, reset.seed);
});

const pdfFile = (overrides = {}) => ({ name: 'example.pdf', type: 'application/pdf', size: 20,
  slice: () => new Blob(['%PDF-1.7\nDemo']), ...overrides });

test('PDF selection accepts browser file types and verifies a local header without extracting content', async () => {
  assert.equal(await validateContractFile(pdfFile()), null);
  assert.equal(await validateContractFile(pdfFile({ name: 'EXAMPLE.PDF', type: '' })), null);
  assert.equal(await validateContractFile(pdfFile({ size: MAX_CONTRACT_FILE_SIZE })), null);
  for (const file of [null, pdfFile({ name: 'notes.txt' }), pdfFile({ type: 'text/plain' }), pdfFile({ size: 0 }), pdfFile({ size: MAX_CONTRACT_FILE_SIZE + 1 }), pdfFile({ slice: () => new Blob(['Not a PDF']) }), pdfFile({ slice: () => { throw Error('Unreadable'); } })]) {
    assert.equal(typeof await validateContractFile(file), 'string');
  }
});
