import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureSITShowcase, loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { createProject, LEGACY_STORE, seedWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getDrawingAsset, getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getVOCases } from '../src/data/vo.ts';
import { markClaimPrepared } from '../src/data/claims.ts';

const now = new Date('2026-10-21T13:00:00Z');
const isOriginal = (project) => project.contract?.sourceKind === 'provided'
  && project.contract?.sourceProfile === 'sit-loa-2021';
const originals = (workspace) => workspace.projects.filter(isOriginal);
const key = (value) => String(value).trim().toUpperCase();
function memoryStorage(values = {}) {
  const entries = new Map(Object.entries(values));
  return {
    getItem: (name) => entries.get(name) ?? null,
    setItem: (name, value) => entries.set(name, String(value)),
  };
}

test('a fresh visitor starts on the complete original S.I.T. showcase with other sample projects available', () => {
  const storage = memoryStorage();
  const workspace = loadShowcaseWorkspace(storage, now);
  assert.equal(originals(workspace).length, 1);
  const sit = originals(workspace)[0];
  assert.equal(workspace.projects[0].id, sit.id);
  assert.equal(workspace.activeProjectId, sit.id);
  assert.deepEqual(workspace.projects.filter((project) => !isOriginal(project)), seedWorkspace().projects);
  assert.equal(sit.items.length, 18);
  assert.equal(sit.items[0].quantity, 2088);
  assert.equal(sit.items[0].rate, 13.5);
  assert.equal(sit.contract.reference, 'CCSC/SIT/SC/21.183');
  assert.equal(getDrawingAsset(sit), '/assets/site-plan.png');
  const areas = getDrawingMapping(sit).areas;
  assert.equal(areas.length, 14);
  assert.equal(new Set(areas.flatMap(area => area.workItemIds)).size, 14);
  assert.equal(areas.filter(area => area.position !== null).length, 4);
  assert.equal(areas.find(area => area.code === 'W3-ST36').position, null);
  assert.equal(sit.reports.length, 7);
  assert.equal(sit.whatsappMessages.length, 22);
  assert.equal(sit.whatsappMessages.filter(message => message.audio).length, 2);
  assert.deepEqual(areas.filter(area => area.code.startsWith('BRACKET-')).map(area => area.workItemQuantities['WI-016']), [90, 90]);
  assert.equal(sit.whatsappMessages.filter(message => message.mockSampleSet === 'sit-mapped-areas-v1').length, 10);
  assert.ok(sit.reports.every((report) => report.demo && report.origin === 'simulated'));
  assert.deepEqual(getVOCases(sit).map((entry) => entry.status).sort(), ['approved', 'flagged', 'rejected']);
  assert.equal(sit.claimDrafts.length, 1);
  assert.equal(sit.claimDrafts[0].status, 'draft');
  assert.equal(sit.claimDrafts[0].snapshot.totals.currentValue, 15894);
  assert.equal(sit.claimDrafts[0].snapshot.canPrepare, true);
  assert.equal(markClaimPrepared(sit, sit.claimDrafts[0].id).outcome, 'updated');
  assert.deepEqual(JSON.parse(storage.getItem(WORKSPACE_STORE)), workspace);
});

test('adding the showcase preserves all existing projects, source evidence and saved claim snapshots', () => {
  const existing = createSITContractDemo({ name: 'Existing contract sample', code: 'SAVED01' }, now);
  // A different source profile is an unrelated existing project, even if its data resembles this demo.
  existing.contract.sourceProfile = 'another-user-contract';
  existing.items[0].quantity = 2177;
  existing.items[0].rate = 17;
  existing.reports[0].message = 'Preserve the user-corrected original evidence';
  existing.claimDrafts[0].snapshot.totals.currentValue = 4321;
  existing.claimDrafts[0].assessment.note = 'A user-edited saved assessment';
  existing.history.push({ id: 'KEEP-MY-AUDIT', action: 'Preserve this review' });
  const workspace = { ...seedWorkspace(), activeProjectId: 'SAVED01', projects: [...seedWorkspace().projects, existing] };
  const original = structuredClone(workspace);
  const result = ensureSITShowcase(workspace, now);
  assert.equal(originals(result).length, 1);
  assert.deepEqual(result.projects.filter((project) => !isOriginal(project)), original.projects);
  assert.deepEqual(workspace, original);
  assert.equal(result.activeProjectId, originals(result)[0].id);
  assert.equal(originals(result)[0].items[0].rate, 13.5);
  assert.equal(originals(result)[0].claimDrafts[0].snapshot.totals.currentValue, 15894);
  const storage = memoryStorage({ [WORKSPACE_STORE]: JSON.stringify(original) });
  const loaded = loadShowcaseWorkspace(storage, now);
  assert.deepEqual(loaded.projects.filter((project) => !isOriginal(project)), original.projects);
  assert.equal(originals(loaded).length, 1);
  assert.deepEqual(loadShowcaseWorkspace(storage, now), loaded);
});

test('an existing original demo is reused without replacing browser edits or adding another copy', () => {
  const existing = createSITContractDemo({ name: 'My S.I.T. walkthrough', code: 'MY-SIT' }, now);
  existing.items[0].verified = 65;
  existing.reports[0].message = 'Original evidence edited in this browser';
  existing.claimDrafts[0].assessment.note = 'Keep this saved review note';
  existing.claimDrafts[0].snapshot.totals.currentValue = 12345;
  const before = structuredClone(existing);
  const workspace = { ...seedWorkspace(), projects: [...seedWorkspace().projects, existing] };
  const result = ensureSITShowcase(workspace, now);
  assert.equal(originals(result).length, 1);
  assert.equal(result.projects.length, workspace.projects.length);
  assert.equal(result.activeProjectId, existing.id);
  assert.deepEqual(originals(result)[0], before);
});

test('automatic creation avoids existing IDs and project codes even when their identities differ', () => {
  const preferred = originals(ensureSITShowcase(seedWorkspace(), now))[0];
  const idCollision = { ...createProject({ name: 'Existing ID', code: 'KEEP-ID' }), id: preferred.id };
  const codeCollision = { ...createProject({ name: 'Existing code', code: preferred.code }), id: 'KEEP-CODE' };
  const base = seedWorkspace();
  const occupied = [...base.projects, idCollision, codeCollision];
  const result = ensureSITShowcase({ ...base, projects: occupied }, now);
  const sit = originals(result)[0];
  const reserved = new Set(occupied.flatMap((project) => [key(project.id), key(project.code)]));
  assert.ok(!reserved.has(key(sit.id)));
  assert.ok(!reserved.has(key(sit.code)));
  assert.equal(new Set(result.projects.map((project) => key(project.id))).size, result.projects.length);
  assert.equal(new Set(result.projects.map((project) => key(project.code))).size, result.projects.length);
  assert.deepEqual(result.projects.filter((project) => !isOriginal(project)), occupied);
  assert.ok(sit.reports.every((report) => report.projectId === sit.id));
  assert.equal(sit.claimDrafts[0].projectId, sit.id);
});

test('the default selection is applied once and reloads respect the project the visitor later chooses', () => {
  const storage = memoryStorage();
  const first = loadShowcaseWorkspace(storage, now);
  const sit = originals(first)[0];
  const chosen = { ...first, activeProjectId: 'WH02' };
  const firstSnapshot = structuredClone(chosen);
  assert.equal(ensureSITShowcase(chosen, now).activeProjectId, 'WH02');
  assert.deepEqual(chosen, firstSnapshot);
  storage.setItem(WORKSPACE_STORE, JSON.stringify(chosen));
  const next = loadShowcaseWorkspace(storage, new Date('2026-11-15T12:00:00Z'));
  assert.equal(next.activeProjectId, 'WH02');
  assert.equal(originals(next).length, 1);
  assert.deepEqual(originals(next)[0], sit);
  assert.deepEqual(loadShowcaseWorkspace(storage, now), next);
});

test('legacy migration retains corrected work, history and the untouched legacy storage before adding S.I.T.', () => {
  const base = seedWorkspace().projects[0];
  const legacy = {
    items: [{ ...base.items[0], quantity: 2111, description: 'Legacy corrected work' }],
    reports: [{ ...base.reports[0], message: 'Keep legacy site evidence' }],
    history: [{ id: 'LEGACY-HISTORY', action: 'Keep my audit trail' }],
    locked: true, version: 4,
    baselines: [{ version: 3, items: [{ ...base.items[0], quantity: 2100 }] }],
  };
  const bytes = JSON.stringify(legacy);
  const storage = memoryStorage({ [LEGACY_STORE]: bytes });
  const result = loadShowcaseWorkspace(storage, now);
  const campus = result.projects.find((project) => project.id === 'SIT01');
  assert.deepEqual(campus.items, legacy.items);
  assert.deepEqual(campus.reports, legacy.reports);
  assert.deepEqual(campus.history, legacy.history);
  assert.deepEqual(campus.baselines, legacy.baselines);
  assert.equal(campus.version, 4);
  assert.equal(originals(result).length, 1);
  assert.equal(result.activeProjectId, originals(result)[0].id);
  assert.equal(storage.getItem(LEGACY_STORE), bytes);
  assert.deepEqual(loadShowcaseWorkspace(storage, now), result);
});

test('restoring a missing showcase keeps the visitor’s later project choice and unrelated saved records', () => {
  const initialized = ensureSITShowcase(seedWorkspace(), now);
  const withoutOriginal = { ...initialized, activeProjectId: 'WH02', projects: initialized.projects.filter((project) => !isOriginal(project)) };
  withoutOriginal.projects[1].items[0].reported = 73;
  const before = structuredClone(withoutOriginal);
  const result = ensureSITShowcase(withoutOriginal, now);
  assert.equal(originals(result).length, 1);
  assert.equal(result.activeProjectId, 'WH02');
  assert.deepEqual(result.projects.filter((project) => !isOriginal(project)), before.projects);
  assert.deepEqual(withoutOriginal, before);
});

test('missing, corrupt or blocked storage still opens an independent usable showcase', () => {
  const blocked = { getItem() { throw new Error('Storage unavailable'); }, setItem() { throw new Error('Storage unavailable'); } };
  const inputs = [null, blocked, memoryStorage({ [WORKSPACE_STORE]: '{bad json' })];
  const workspaces = inputs.map((storage) => loadShowcaseWorkspace(storage, now));
  for (const workspace of workspaces) {
    assert.equal(originals(workspace).length, 1);
    const sit = originals(workspace)[0];
    assert.equal(workspace.activeProjectId, sit.id);
    assert.equal(sit.items.length, 18);
    assert.equal(sit.claimDrafts[0].snapshot.totals.currentValue, 15894);
  }
  originals(workspaces[0])[0].items[0].rate = 999;
  assert.equal(originals(workspaces[1])[0].items[0].rate, 13.5);
  assert.equal(originals(workspaces[2])[0].items[0].rate, 13.5);
});
