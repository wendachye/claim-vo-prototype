import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_STORE,
  WORKSPACE_STORE,
  createProject,
  loadWorkspace,
  resetProject,
  seedWorkspace,
  updateProjectState,
} from '../src/data/projects.ts';
import { initialItems, initialReports } from '../src/data/contract.ts';

function memoryStorage(values = {}) {
  const entries = new Map(Object.entries(values));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
  };
}

test('project seeds keep independent source, editable and reset data', () => {
  const first = seedWorkspace();
  const next = seedWorkspace();
  const [sit, warehouse] = first.projects;
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.activeProjectId, sit.id);
  assert.equal(sit.items[0].id, warehouse.items[0].id);
  assert.notEqual(sit.items[0].description, warehouse.items[0].description);
  assert.equal(sit.contract.sourceKind, 'illustrative');
  assert.equal(sit.contract.sourcePageCount, 1);
  assert.equal(warehouse.contract.sourceKind, 'illustrative');
  assert.equal(warehouse.contract.hasDrawing, false);
  assert.equal(warehouse.items.length, 6);
  assert.equal(warehouse.items.filter((item) => item.pricingType === 'measured')
    .reduce((sum, item) => sum + item.amount, 0), warehouse.contract.totalAmount);

  sit.items[0].description = 'Edited locally';
  sit.reports[0].completion = 99;
  sit.contract.aliases.W3.push('Only this workspace');
  assert.notEqual(sit.sourceItems[0].description, 'Edited locally');
  assert.notEqual(sit.seed.items[0].description, 'Edited locally');
  assert.equal(next.projects[0].items[0].description, initialItems[0].description);
  assert.equal(initialReports[0].completion, 50);
  assert.equal(warehouse.reports[0].completion, 40);
  assert.ok(!next.projects[0].contract.aliases.W3.includes('Only this workspace'));
});

test('a scoped update cannot change the other project when item IDs overlap', () => {
  const before = seedWorkspace();
  const otherBefore = structuredClone(before.projects[0]);
  const changed = updateProjectState(before, 'WH02', (project) => {
    project.items.find((item) => item.id === 'WI-001').verified = 80;
    project.reports[0].status = 'verified';
    project.history.push({ id: 'WH-AUDIT', action: 'Progress verified' });
  });
  assert.equal(changed.projects[1].items[0].verified, 80);
  assert.equal(changed.projects[1].reports[0].status, 'verified');
  assert.deepEqual(changed.projects[0], otherBefore);
  assert.equal(before.projects[1].items[0].verified, 25);
  assert.equal(before.projects[1].reports[0].status, 'pending');
  assert.equal(changed.activeProjectId, 'SIT01');
  assert.equal(updateProjectState(before, 'missing', () => assert.fail('Unknown project updater ran')), before);
});

test('valid v1 migration preserves edited rows of any length and keeps legacy bytes', () => {
  const legacy = {
    items: [{ ...initialItems[0], description: 'User correction', quantity: 2100 }],
    reports: [{ ...initialReports[0], completion: 65 }],
    locked: true,
    lockedAt: '2026-10-15T12:00:00+08:00',
    version: 4,
    history: [{ id: 'A-1', action: 'User correction retained' }],
    baselines: [{ version: 3, items: [{ ...initialItems[0], quantity: 2090 }] }],
  };
  const bytes = JSON.stringify(legacy);
  const storage = memoryStorage({ [LEGACY_STORE]: bytes });
  const workspace = loadWorkspace(storage);
  const sit = workspace.projects.find((project) => project.id === 'SIT01');
  assert.deepEqual(sit.items, legacy.items);
  assert.deepEqual(sit.reports, legacy.reports);
  assert.deepEqual(sit.history, legacy.history);
  assert.deepEqual(sit.baselines, legacy.baselines);
  assert.equal(sit.version, 4);
  assert.equal(sit.locked, true);
  assert.equal(sit.lockedAt, legacy.lockedAt);
  assert.equal(storage.getItem(LEGACY_STORE), bytes);
  assert.deepEqual(JSON.parse(storage.getItem(WORKSPACE_STORE)), workspace);
  assert.equal(workspace.projects[1].items.length, 6);
});

test('empty v1 arrays migrate while malformed arrays do not replace seeded data', () => {
  const empty = loadWorkspace(memoryStorage({
    [LEGACY_STORE]: JSON.stringify({ items: [], reports: [], history: [] }),
  }));
  assert.deepEqual(empty.projects[0].items, []);
  const malformed = loadWorkspace(memoryStorage({
    [LEGACY_STORE]: JSON.stringify({ items: 'not an array', reports: [], history: [] }),
  }));
  assert.equal(malformed.projects[0].items.length, initialItems.length);
});

test('a stored v2 envelope wins over stale legacy state and restores a valid active project', () => {
  const saved = seedWorkspace();
  saved.activeProjectId = 'deleted-project';
  saved.projects.reverse();
  saved.projects[0].items[0].verified = 88;
  const storage = memoryStorage({
    [WORKSPACE_STORE]: JSON.stringify(saved),
    [LEGACY_STORE]: JSON.stringify({ items: [], reports: [], history: [] }),
  });
  const loaded = loadWorkspace(storage);
  assert.equal(loaded.activeProjectId, 'WH02');
  assert.equal(loaded.projects[0].items[0].verified, 88);
  assert.equal(loaded.projects[1].items.length, initialItems.length);
  assert.deepEqual(JSON.parse(storage.getItem(WORKSPACE_STORE)), loaded);
});

test('reset restores only the specified project workflow and preserves custom metadata', () => {
  let workspace = seedWorkspace();
  workspace = updateProjectState(workspace, 'SIT01', (project) => ({
    ...project, items: project.items.map((item) => ({ ...item, verified: 90 })),
    history: [{ id: 'KEEP', action: 'SIT history' }],
  }));
  workspace = updateProjectState(workspace, 'WH02', (project) => ({
    ...project,
    name: 'Warehouse revised title',
    description: 'A custom project description',
    contract: { ...project.contract, subcontractor: 'Custom demo subcontractor' },
    items: [{ ...project.items[0], verified: 99 }],
    reports: [],
    locked: true,
    lockedAt: '2026-10-15',
    version: 8,
    history: [{ id: 'RESET', action: 'Warehouse edits' }],
    baselines: [{ version: 7, items: [] }],
  }));
  const previous = structuredClone(workspace);
  const reset = updateProjectState(workspace, 'WH02', resetProject);
  assert.deepEqual(reset.projects[0], previous.projects[0]);
  const warehouse = reset.projects[1];
  assert.equal(warehouse.name, 'Warehouse revised title');
  assert.equal(warehouse.description, 'A custom project description');
  assert.equal(warehouse.contract.subcontractor, 'Custom demo subcontractor');
  assert.equal(warehouse.items.length, 6);
  assert.equal(warehouse.items[0].verified, 25);
  assert.equal(warehouse.reports.length, 3);
  assert.equal(warehouse.locked, false);
  assert.equal(warehouse.version, 1);
  assert.equal(warehouse.lockedAt, undefined);
  assert.deepEqual(warehouse.history, []);
  assert.deepEqual(warehouse.baselines, []);
  assert.equal(workspace.projects[1].items[0].verified, 99);
});

test('project creation starts empty without inventing contract values', () => {
  const project = createProject({
    name: ' New project ', code: ' my / 03! ', country: ' Malaysia ',
    subcontractor: ' Contractor entered by user ', description: ' Interior works ',
  });
  assert.equal(project.id, 'MY03');
  assert.equal(project.code, 'MY03');
  assert.equal(project.name, 'New project');
  assert.equal(project.country, 'Malaysia');
  assert.equal(project.contract.subcontractor, 'Contractor entered by user');
  assert.equal(project.contract.sourceKind, 'none');
  assert.equal(project.contract.currency, 'MYR');
  assert.equal(project.contract.totalAmount, null);
  assert.equal(project.contract.date, null);
  assert.equal(project.contract.sourcePageCount, null);
  assert.equal(project.contract.hasDrawing, false);
  assert.deepEqual(project.items, []);
  assert.deepEqual(project.sourceItems, []);
  assert.deepEqual(project.reports, []);
  assert.deepEqual(resetProject({ ...project, locked: true, version: 4 }).items, []);
  assert.equal(createProject({ name: 'Underscore code', code: 'new_01', country: 'Singapore' }).code, 'NEW_01');
  assert.equal(createProject({ name: 'Currency not selected', code: 'NEW02' }).contract.currency, null);
  assert.throws(() => createProject({ name: 'Missing code', code: '!!!' }), TypeError);
});

test('corrupt or unavailable storage still returns independent usable seeds', () => {
  const corrupt = loadWorkspace(memoryStorage({ [WORKSPACE_STORE]: '{bad json' }));
  assert.equal(corrupt.projects.length, 2);
  const blocked = loadWorkspace({
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); },
  });
  assert.equal(blocked.projects[0].items[0].quantity, 2000);
  assert.notEqual(blocked.projects[0].items, corrupt.projects[0].items);
});
