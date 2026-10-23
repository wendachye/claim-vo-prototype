import assert from 'node:assert/strict';
import test from 'node:test';
import { seedWorkspace, loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { getAreaForMessage, getAreaLinkStatus, getAreaMatchForMessage, getDrawingMapping, installDrawing, saveAreaMapping, snapshotMappedArea } from '../src/data/drawing-mapping.ts';

const now = new Date('2026-10-24T04:00:00Z');
const withDrawing = () => installDrawing(seedWorkspace().projects[1], { inputKind: 'sample' }, now).project;
const areaAt = (project, index = 0) => getDrawingMapping(project).areas[index];
const values = (project, index = 0) => {
  const area = areaAt(project, index);
  return { ...area, areaId: area.id, drawingId: project.drawingMapping.drawing.id };
};
const message = (project, area, extra = {}) => ({ projectId: project.id, projectCode: project.code, area, itemId: 'WI-001', kind: 'progress', ...extra });
function withAliases(project, aliases, index = 0) {
  const result = saveAreaMapping(project, { ...values(project, index), aliases }, now);
  assert.equal(result.outcome, 'updated', result.error);
  return result.project;
}

test('alternate names use exact normalized matching without guessing from a display name or partial text', () => {
  const project = withAliases(withDrawing(), [' West   wall ', 'West façade', '西 墙', 'Ｗｅｓｔ wall', 'west WALL']);
  assert.deepEqual(areaAt(project).aliases, ['West wall', 'West façade', '西 墙']);
  for (const name of ['A1', ' area a1 ', 'Ａ１', 'WEST WALL', 'Area West   wall', 'Ｗｅｓｔ wall', 'west façade', 'Area 西  墙']) {
    const result = getAreaMatchForMessage(project, message(project, name));
    assert.equal(result.status, 'matched', name);
    assert.equal(result.area.id, areaAt(project).id);
    assert.equal(result.candidates.length, 1);
    assert.equal(getAreaForMessage(project, message(project, name)).id, areaAt(project).id);
  }
  for (const name of ['', null, 'west', 'west wall done 50%', 'Block A - external wall', 'west facade', 'UNKNOWN']) {
    assert.deepEqual(getAreaMatchForMessage(project, message(project, name)), { status: 'unmatched', area: null, candidates: [] }, String(name));
  }
});

test('alias collisions including an exact code never pick the first area or infer an item to break the tie', () => {
  let project = withAliases(withDrawing(), ['Loading bay', 'A2']);
  project = withAliases(project, ['Area loading  bay'], 1);
  project = saveAreaMapping(project, { ...values(project), workItemIds: ['WI-001'] }, now).project;
  project = saveAreaMapping(project, { ...values(project, 1), workItemIds: ['WI-002'] }, now).project;
  for (const name of ['loading bay', 'Area LOADING BAY', 'a2', 'Area Ａ２']) {
    const result = getAreaMatchForMessage(project, message(project, name));
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.area, null);
    assert.deepEqual(result.candidates.map(area => area.code), ['A1', 'A2']);
    assert.equal(getAreaForMessage(project, message(project, name)), null);
    const link = getAreaLinkStatus(project, message(project, name));
    assert.equal(link.ambiguous, true);
    assert.equal(link.conflict, false);
    assert.deepEqual(link.linkedItems, []);
  }
  const link = getAreaLinkStatus(project, message(project, 'A1', { itemId: 'WI-002' }));
  assert.equal(link.ambiguous, false);
  assert.equal(link.conflict, true);
  link.linkedItems[0].quantity = 99;
  assert.notEqual(project.items[0].quantity, 99);
});

test('frozen explicit area references stay stable after names change and cannot drift to another area', () => {
  let project = withAliases(withDrawing(), ['West wall']);
  const area = areaAt(project), other = areaAt(project, 1);
  const original = message(project, 'West wall', { areaId: area.id, areaMapping: snapshotMappedArea(area), areaProgress: { areaId: area.id, itemId: 'WI-001', allocatedQuantity: 600, contractQuantity: 1000 } });
  project = saveAreaMapping(project, { ...values(project), code: 'WEST', aliases: ['Outer wall'] }, now).project;
  project = withAliases(project, ['West wall'], 1);
  assert.equal(getAreaMatchForMessage(project, original).area.id, area.id);
  assert.equal(getAreaMatchForMessage(project, message(project, 'West wall')).area.id, other.id);
  for (const extra of [
    { areaId: 'FOREIGN' }, { areaId: 100 },
    { areaId: area.id, areaProgress: { areaId: other.id } },
    { areaMapping: { areaId: 'FOREIGN' } },
    { areaId: area.id, areaMapping: { areaId: other.id } },
    { projectId: 'FOREIGN' }, { projectCode: 'FOREIGN' },
  ]) {
    const result = getAreaMatchForMessage(project, message(project, 'West wall', extra));
    assert.equal(result.status, 'unmatched', JSON.stringify(extra));
    if (!extra.projectId && !extra.projectCode) assert.equal(result.blocked, true, JSON.stringify(extra));
  }
  const second = { ...seedWorkspace().projects[1], id: 'OTHER', code: 'OTHER' };
  const foreign = installDrawing(second, { inputKind: 'sample' }, now).project;
  assert.equal(getAreaForMessage(foreign, original), null);
});

test('explicit alias saves preserve all other data and retained claims, while old pin/name saves keep aliases', () => {
  const project = withDrawing();
  project.claimDrafts = [{ id: 'SAVED', snapshot: { amount: 1234, evidence: [{ text: 'Original text', areaMapping: snapshotMappedArea(areaAt(project)) }] } }];
  project.reports = [{ id: 'ORIGINAL', status: 'verified', message: 'Original source', areaMapping: snapshotMappedArea(areaAt(project)) }];
  const before = structuredClone(project);
  const saved = withAliases(project, ['West wall']);
  const { drawingMapping: savedMap, ...savedOther } = saved;
  const { drawingMapping: oldMap, ...oldOther } = before;
  assert.deepEqual(savedOther, oldOther);
  assert.deepEqual(project, before);
  assert.equal(Object.hasOwn(before.reports[0].areaMapping, 'aliases'), false);
  const changed = saveAreaMapping(saved, { ...values(saved), aliases: undefined, position: { x: .3, y: .5 } }, now);
  assert.equal(changed.outcome, 'updated');
  assert.deepEqual(changed.area.aliases, ['West wall']);
  assert.deepEqual(changed.project.claimDrafts, before.claimDrafts);
  const history = changed.project.drawingMapping.history.at(-1);
  assert.deepEqual(history.previousArea.aliases, ['West wall']);
  assert.deepEqual(history.area.aliases, ['West wall']);
  const cleared = saveAreaMapping(changed.project, { ...values(changed.project), aliases: [] }, now);
  assert.equal(cleared.outcome, 'updated');
  assert.equal(Object.hasOwn(cleared.area, 'aliases'), false);
  assert.deepEqual(cleared.project.claimDrafts, before.claimDrafts);
});

test('legacy areas remain unchanged on no-op saves and alias snapshots are optional immutable evidence', () => {
  const project = withDrawing(), before = structuredClone(project);
  assert.equal(saveAreaMapping(project, { ...values(project), aliases: [] }, now).outcome, 'unchanged');
  assert.equal(saveAreaMapping(project, values(project), now).outcome, 'unchanged');
  assert.deepEqual(project, before);
  assert.equal(Object.hasOwn(snapshotMappedArea(areaAt(project)), 'aliases'), false);
  const saved = withAliases(project, ['West wall']);
  const area = areaAt(saved), snapshot = snapshotMappedArea(area);
  assert.deepEqual(snapshot.aliases, ['West wall']);
  snapshot.aliases.push('Changed snapshot');
  assert.deepEqual(area.aliases, ['West wall']);
  area.aliases.push('Changed returned mapping');
  assert.deepEqual(saved.drawingMapping.areas[0].aliases, ['West wall']);
});

test('aliases persist through reload and replacement without rewriting reports, claims or history', () => {
  const saved = withAliases(withDrawing(), ['West wall', 'West façade']);
  const before = structuredClone(saved);
  const workspace = seedWorkspace(); workspace.projects[1] = saved;
  const restored = loadWorkspace({ getItem: key => key === WORKSPACE_STORE ? JSON.stringify(workspace) : null }).projects.find(project => project.id === saved.id);
  assert.deepEqual(getDrawingMapping(restored), saved.drawingMapping);
  const replaced = installDrawing(restored, { inputKind: 'sample' }, new Date('2026-10-25')).project;
  assert.deepEqual(areaAt(replaced).aliases, ['West wall', 'West façade']);
  assert.equal(areaAt(replaced).id, areaAt(saved).id);
  assert.equal(areaAt(replaced).position, null);
  assert.equal(getAreaMatchForMessage(replaced, message(replaced, 'West wall')).area.id, areaAt(saved).id);
  assert.deepEqual(replaced.claimDrafts, saved.claimDrafts);
  assert.deepEqual(replaced.reports, saved.reports);
  assert.deepEqual(saved, before);
});

test('invalid new alternate names reject atomically, and malformed persisted aliases never sanitize into a wrong unique match', () => {
  const project = withDrawing(), before = structuredClone(project);
  for (const aliases of [null, 'West wall', {}, [''], ['  '], ['\u0000bad'], ['bad\nname'], ['A'.repeat(101)], Array.from({ length: 9 }, (_, i) => `Alias ${i}`), ['West wall', 42]]) {
    assert.equal(saveAreaMapping(project, { ...values(project), aliases }, now).outcome, 'invalid', JSON.stringify(aliases));
  }
  assert.deepEqual(project, before);
  for (const aliases of [null, 'West wall', ['West wall', 42], Array.from({ length: 9 }, (_, i) => i === 8 ? 'West wall' : `Alias ${i}`)]) {
    const malformed = withAliases(project, ['West wall']);
    malformed.drawingMapping.areas[1].aliases = aliases;
    const badBefore = structuredClone(malformed);
    const match = getAreaMatchForMessage(malformed, message(malformed, 'West wall'));
    assert.equal(match.status, 'unmatched');
    assert.equal(match.blocked, true);
    assert.equal(getAreaLinkStatus(malformed, message(malformed, 'West wall')).blocked, true);
    assert.equal(getAreaMatchForMessage(malformed, message(malformed, 'A1', { areaId: areaAt(malformed).id })).status, 'matched');
    assert.equal(saveAreaMapping(malformed, { ...values(malformed), name: 'Changed' }, now).outcome, 'invalid');
    assert.equal(installDrawing(malformed, { inputKind: 'sample' }, now).outcome, 'invalid');
    const repaired = saveAreaMapping(malformed, { ...values(malformed, 1), aliases: [] }, now);
    assert.equal(repaired.outcome, 'updated');
    assert.equal(getAreaMatchForMessage(repaired.project, message(repaired.project, 'West wall')).area.id, areaAt(malformed).id);
    assert.deepEqual(malformed, badBefore);
  }
});

test('a frozen unmapped source never acquires a new area through later aliases, while legacy unknown areas stay allowed', () => {
  const project = withAliases(withDrawing(), ['West wall']);
  for (const areaId of [null, '']) {
    const source = message(project, 'West wall', { areaMapping: { areaId } });
    const before = structuredClone(source);
    assert.deepEqual(getAreaMatchForMessage(project, source), { status: 'unmatched', area: null, candidates: [] });
    assert.equal(getAreaLinkStatus(project, source).blocked, false);
    assert.deepEqual(source, before);
    assert.equal(getAreaMatchForMessage(project, { ...source, areaId: areaAt(project).id }).blocked, true);
  }
  for (const source of [message(project, 'Not mapped yet'), message(project, ''), message(project, 'Not mapped yet', { areaId: null, areaMapping: null })]) {
    assert.equal(getAreaMatchForMessage(project, source).status, 'unmatched');
    assert.equal(getAreaLinkStatus(project, source).blocked, false);
  }
});

test('unfrozen incoming IDs require a compatible stated name while selected IDs resolve collisions and frozen names stay original', () => {
  let project = withAliases(withDrawing(), ['West wall', 'Shared wall']);
  project = withAliases(project, ['Shared wall'], 1);
  const area = areaAt(project), other = areaAt(project, 1);
  for (const name of [other.code, 'UNKNOWN', '', null]) {
    const source = message(project, name, { areaId: area.id });
    assert.equal(getAreaMatchForMessage(project, source).blocked, true, String(name));
    assert.equal(getAreaForMessage(project, source), null);
  }
  for (const name of [area.code, 'Area a1', 'West wall', 'Shared wall']) {
    const source = message(project, name, { areaId: area.id });
    assert.equal(getAreaMatchForMessage(project, source).area.id, area.id, name);
  }
  const original = message(project, 'West wall', { areaId: area.id, areaMapping: snapshotMappedArea(area) });
  const renamed = saveAreaMapping(project, { ...values(project), code: 'WEST', aliases: ['Outer wall'] }, now).project;
  assert.equal(getAreaMatchForMessage(renamed, original).area.id, area.id);
});
