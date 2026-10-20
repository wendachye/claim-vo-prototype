import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_AREAS, DEMO_DRAWING_ASSET, DEMO_DRAWING_FILENAME, MAX_DRAWING_FILE_SIZE,
  getDrawingMapping, getDrawingAsset, getProvidedDrawingSource, installDrawing, saveAreaMapping, removeMappedArea,
  getAreasForItem, getAreaForMessage, getAreaLinkStatus, snapshotMappedArea, validateDrawingFile,
} from '../src/data/drawing-mapping.js';
import { seedWorkspace, loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.js';

const now = new Date('2026-10-21T14:00:00Z');
const sample = { inputKind: 'sample' };
const image = { inputKind: 'upload', fileName: 'My drawing.png', fileSize: 2500, mimeType: 'image/png' };
const pdf = { inputKind: 'upload', fileName: 'Drawing.pdf', fileSize: 3500, mimeType: 'application/pdf' };
const project = () => seedWorkspace().projects[1];
const withDrawing = () => installDrawing(project(), sample, now).project;
const valuesFor = (value, area = getDrawingMapping(value).areas[0]) => ({
  areaId: area.id, drawingId: value.drawingMapping.drawing.id, code: area.code,
  name: area.name, page: area.page, position: area.position, workItemIds: area.workItemIds,
});

test('a drawing is a separate project-scoped record and cannot change baseline, progress, evidence or claim snapshots', () => {
  const value = project();
  value.locked = true;
  value.claimDrafts = [{ id: 'SAVED', snapshot: { currentValue: 1234, evidence: [{ message: 'Original evidence' }] } }];
  const before = structuredClone(value);
  const result = installDrawing(value, sample, now);
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(value, before);
  const { drawingMapping, ...remaining } = result.project;
  assert.deepEqual(remaining, before);
  assert.equal(drawingMapping.projectId, value.id);
  assert.equal(drawingMapping.drawing.projectId, value.id);
  assert.equal(drawingMapping.drawing.fileName, DEMO_DRAWING_FILENAME);
  assert.equal(DEMO_DRAWING_ASSET, '/samples/warehouse-area-plan.svg');
  assert.equal(drawingMapping.areas.length, 4);
  assert.deepEqual(drawingMapping.areas.map((area) => area.code), ['A1', 'A2', 'B1', 'B2']);
  assert.ok(drawingMapping.areas.every((area) => area.workItemIds.length === 0 && area.projectId === value.id && area.drawingId === drawingMapping.drawing.id));
  result.project.claimDrafts[0].snapshot.currentValue = 99;
  assert.equal(value.claimDrafts[0].snapshot.currentValue, 1234);
  result.project.drawingMapping.areas[0].position.x = 0.9;
  assert.equal(DEMO_AREAS[0].position.x, 0.23);
});

test('saved areas accept multiple contract items with stable, replay-safe explicit links', () => {
  const value = withDrawing();
  const before = structuredClone(value);
  const fields = { ...valuesFor(value), code: 'a1', name: 'External wall and roof', workItemIds: ['WI-002', 'WI-001', 'WI-001'] };
  const first = saveAreaMapping(value, fields, now);
  assert.equal(first.outcome, 'updated');
  assert.deepEqual(value, before);
  assert.equal(first.area.code, 'A1');
  assert.deepEqual(first.area.workItemIds, ['WI-001', 'WI-002']);
  assert.equal(getAreasForItem(first.project, 'WI-001')[0].id, first.area.id);
  assert.equal(getAreasForItem(first.project, 'WI-002')[0].id, first.area.id);
  assert.deepEqual(getAreasForItem(first.project, 'FOREIGN'), []);
  const replay = saveAreaMapping(first.project, { ...fields, workItemIds: ['WI-001', 'WI-002'] }, new Date('2026-10-22'));
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.project, first.project);
  assert.equal(replay.project.drawingMapping.history.length, 2);
  const unlinked = saveAreaMapping(first.project, { ...fields, workItemIds: [] }, now);
  assert.equal(unlinked.outcome, 'updated');
  assert.deepEqual(getAreasForItem(unlinked.project, 'WI-001'), []);
  assert.deepEqual(unlinked.project.items, before.items);
  assert.deepEqual(unlinked.project.claimDrafts, before.claimDrafts);
});

test('a replaced drawing retains named links, clears stale pin/page positions and rejects an old edit', () => {
  let value = withDrawing();
  value = saveAreaMapping(value, { ...valuesFor(value), page: 2, workItemIds: ['WI-001'] }, now).project;
  const fields = valuesFor(value);
  const before = structuredClone(value);
  const replaced = installDrawing(value, pdf, now);
  assert.equal(replaced.outcome, 'updated');
  assert.notEqual(replaced.drawing.id, value.drawingMapping.drawing.id);
  assert.equal(replaced.drawing.kind, 'pdf');
  assert.equal(replaced.project.drawingMapping.areas.length, 4);
  assert.ok(replaced.project.drawingMapping.areas.every((area) => area.position === null && area.page === 1 && area.drawingId === replaced.drawing.id));
  assert.deepEqual(replaced.project.drawingMapping.areas[0].workItemIds, ['WI-001']);
  assert.equal(saveAreaMapping(replaced.project, fields, now).outcome, 'invalid');
  assert.deepEqual(replaced.project.drawingMapping.history.at(-1).previousAreas, before.drawingMapping.areas);
  assert.deepEqual(value, before);
  const pinOnPdf = saveAreaMapping(replaced.project, { ...valuesFor(replaced.project), position: { x: 0.2, y: 0.2 } }, now);
  assert.equal(pinOnPdf.outcome, 'invalid');
});

test('invalid area identifiers, duplicate codes, foreign items and out-of-range coordinates are inert', () => {
  const value = withDrawing();
  const before = structuredClone(value);
  const base = valuesFor(value);
  const invalid = [
    { areaId: 'FOREIGN' }, { drawingId: 'OTHER-DRAWING' }, { code: 'a2' }, { code: '' }, { code: '_A' }, { code: 'A'.repeat(21) },
    { name: '' }, { name: 'A'.repeat(101) }, { name: 'bad\u0000name' }, { page: 0 }, { page: 1000 }, { page: 1.2 },
    { position: { x: -0.01, y: 0.2 } }, { position: { x: 0.1, y: Infinity } }, { position: { x: '0.2', y: 0.1 } },
    { workItemIds: ['FOREIGN'] }, { workItemIds: null },
  ];
  for (const patch of invalid) assert.equal(saveAreaMapping(value, { ...base, ...patch }, now).outcome, 'invalid', JSON.stringify(patch));
  assert.equal(saveAreaMapping(value, base, new Date('bad')).outcome, 'invalid');
  assert.equal(saveAreaMapping(project(), base, now).outcome, 'invalid');
  assert.deepEqual(value, before);
  const boundary = saveAreaMapping(value, { ...base, position: { x: 0, y: 1 }, workItemIds: ['WI-001'] }, now);
  assert.equal(boundary.outcome, 'updated');
});

test('message area links remain project-scoped and never guess the work item of an ambiguous update', () => {
  let value = withDrawing();
  value = saveAreaMapping(value, { ...valuesFor(value), workItemIds: ['WI-001', 'WI-002'] }, now).project;
  const matching = { projectId: value.id, kind: 'progress', area: ' area a1 ', itemId: 'WI-001' };
  assert.equal(getAreaForMessage(value, matching).code, 'A1');
  const linked = getAreaLinkStatus(value, matching);
  assert.equal(linked.conflict, false);
  assert.deepEqual(linked.linkedItems.map((item) => item.id), ['WI-001', 'WI-002']);
  assert.equal(getAreaLinkStatus(value, { ...matching, itemId: 'WI-003' }).conflict, true);
  assert.equal(getAreaLinkStatus(value, { ...matching, kind: 'vo', itemId: 'WI-003' }).conflict, false);
  const ambiguous = { ...matching, kind: 'clarification', itemId: null, completionBasis: 'unclear' };
  const before = structuredClone(ambiguous);
  assert.equal(getAreaLinkStatus(value, ambiguous).conflict, false);
  assert.deepEqual(ambiguous, before);
  assert.equal(ambiguous.itemId, null);
  assert.equal(getAreaForMessage(value, { ...matching, projectId: 'OTHER' }), null);
  const foreign = project(); foreign.id = 'OTHER'; foreign.drawingMapping = value.drawingMapping;
  assert.equal(getDrawingMapping(foreign).drawing, null);
  assert.deepEqual(getAreasForItem(foreign, 'WI-001'), []);
  linked.linkedItems[0].quantity = 999;
  assert.notEqual(value.items[0].quantity, 999);
});

test('removing and creating an area retains history and never reuses a removed area identity', () => {
  const value = withDrawing();
  const area = value.drawingMapping.areas[0];
  const before = structuredClone(value);
  const removed = removeMappedArea(value, area.id, now);
  assert.equal(removed.outcome, 'updated');
  assert.equal(removed.project.drawingMapping.areas.length, 3);
  assert.deepEqual(removed.project.drawingMapping.history.at(-1).previousArea, area);
  assert.deepEqual(value, before);
  assert.equal(removeMappedArea(value, 'OTHER', now).outcome, 'invalid');
  const created = saveAreaMapping(removed.project, { ...valuesFor(removed.project, removed.project.drawingMapping.areas[0]), areaId: '', code: 'C1', name: 'New area', workItemIds: [] }, now);
  assert.equal(created.outcome, 'updated');
  assert.notEqual(created.area.id, area.id);
  assert.equal(created.project.drawingMapping.areas.length, 4);
});

test('drawing metadata excludes file bytes and URLs, while saved links survive storage reload independently', () => {
  const value = project();
  const first = installDrawing(value, { ...image, fileName: 'C:\\private\\My drawing.png', file: { secret: 'bytes' }, bytes: 'secret', url: 'blob:session-only' }, now);
  assert.equal(first.outcome, 'updated');
  assert.equal(first.drawing.fileName, 'My drawing.png');
  assert.equal(first.project.drawingMapping.areas.length, 0);
  assert.deepEqual(Object.keys(first.drawing).sort(), ['id', 'projectId', 'inputKind', 'kind', 'fileName', 'fileSize', 'mimeType', 'uploadedAt'].sort());
  const added = saveAreaMapping(first.project, { areaId: '', drawingId: first.drawing.id, code: 'CUSTOM', name: 'Chosen image area', page: '1', position: { x: 0.5, y: 0.5 }, workItemIds: ['WI-001'] }, now);
  const workspace = seedWorkspace();
  workspace.projects[1] = added.project;
  const storage = { getItem: (key) => key === WORKSPACE_STORE ? JSON.stringify(workspace) : null };
  const restored = loadWorkspace(storage).projects.find((entry) => entry.id === added.project.id);
  assert.deepEqual(getDrawingMapping(restored), added.project.drawingMapping);
  assert.deepEqual(restored.claimDrafts, value.claimDrafts);
  const read = getDrawingMapping(restored); read.areas[0].position.x = 0.9;
  assert.equal(restored.drawingMapping.areas[0].position.x, 0.5);
  const other = seedWorkspace().projects[0];
  assert.equal(getDrawingMapping(other).drawing, null);
});

test('malformed stored drawings and invalid install inputs cannot establish cross-project links', () => {
  const value = project();
  for (const mapping of [null, [], {}, { projectId: 'OTHER', drawing: {} }, { projectId: value.id, drawing: { id: 'X', projectId: 'OTHER' } }]) {
    assert.equal(getDrawingMapping({ ...value, drawingMapping: mapping }).drawing, null);
  }
  const saved = withDrawing();
  saved.drawingMapping.areas.push({ ...saved.drawingMapping.areas[0], id: 'FOREIGN', code: 'F1', projectId: 'OTHER' });
  assert.equal(getDrawingMapping(saved).areas.length, 4);
  const bad = [null, {}, { ...image, fileSize: 0 }, { ...image, fileSize: MAX_DRAWING_FILE_SIZE + 1 }, { ...image, mimeType: 'application/pdf' }, { ...image, fileName: 'Drawing.svg', mimeType: 'image/svg+xml' }, { ...image, fileName: 'bad\u0000name.png' }];
  const before = structuredClone(value);
  for (const input of bad) assert.equal(installDrawing(value, input, now).outcome, 'invalid');
  assert.equal(installDrawing(value, image, new Date('bad')).outcome, 'invalid');
  assert.deepEqual(value, before);
});

test('local drawing validation checks supported signatures, size, filename and MIME without parsing content', async () => {
  const file = (name, type, bytes) => ({ name, type, size: bytes.length, slice: () => new Blob([new Uint8Array(bytes)]) });
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  assert.equal(await validateDrawingFile(file('plan.PNG', 'image/png', png)), null);
  assert.equal(await validateDrawingFile(file('plan.jpg', '', [255, 216, 255, 224])), null);
  assert.equal(await validateDrawingFile(file('plan.jpeg', 'image/jpeg', [255, 216, 255, 224])), null);
  assert.equal(await validateDrawingFile(file('plan.pdf', 'application/pdf', [...Buffer.from('%PDF-1.7\n')])), null);
  assert.equal(await validateDrawingFile(file('plan.webp', 'image/webp', [...Buffer.from('RIFFxxxxWEBP')])), null);
  for (const invalid of [file('plan.svg', 'image/svg+xml', png), file('plan.pdf', 'image/png', png), file('plan.png', 'image/png', [1, 2, 3]), file('plan.png', 'image/png', []), { ...file('plan.png', 'image/png', png), size: MAX_DRAWING_FILE_SIZE + 1 }, { ...file('plan.png', 'image/png', png), slice: () => { throw new Error('Unreadable'); } }]) {
    assert.equal(typeof await validateDrawingFile(invalid), 'string');
  }
});

test('same-time drawings in projects with overlapping item IDs reject each other’s drawing and area references', () => {
  const first = withDrawing();
  const other = { ...project(), id: 'OTHER', code: 'OTHER' };
  const second = installDrawing(other, sample, now).project;
  const before = structuredClone(second);
  const firstMap = getDrawingMapping(first);
  const secondMap = getDrawingMapping(second);
  assert.notEqual(firstMap.drawing.id, secondMap.drawing.id);
  assert.notEqual(firstMap.areas[0].id, secondMap.areas[0].id);
  assert.notEqual(firstMap.history[0].id, secondMap.history[0].id);
  const foreign = { ...valuesFor(first), workItemIds: ['WI-001'] };
  assert.equal(saveAreaMapping(second, foreign, now).outcome, 'invalid');
  assert.equal(saveAreaMapping(second, { ...foreign, drawingId: secondMap.drawing.id }, now).outcome, 'invalid');
  assert.equal(removeMappedArea(second, firstMap.areas[0].id, now).outcome, 'invalid');
  assert.deepEqual(second, before);
  const valid = saveAreaMapping(second, { ...valuesFor(second), workItemIds: ['WI-001'] }, now);
  assert.equal(valid.outcome, 'updated');
  assert.deepEqual(first.drawingMapping, firstMap);
});

test('report area snapshots whitelist saved mapping fields and share no mutable values with the live map', () => {
  const value = withDrawing();
  const source = { ...getDrawingMapping(value).areas[0], workItemIds: ['WI-001'], selected: true, file: { private: 'not evidence' }, url: 'blob:temporary' };
  const snapshot = snapshotMappedArea(source);
  assert.deepEqual(Object.keys(snapshot).sort(), ['areaId', 'code', 'name', 'drawingId', 'page', 'position', 'workItemIds'].sort());
  assert.equal(snapshot.areaId, source.id);
  snapshot.position.x = 0.9;
  snapshot.workItemIds.push('WI-002');
  assert.equal(source.position.x, 0.23);
  assert.deepEqual(source.workItemIds, ['WI-001']);
  assert.equal(snapshotMappedArea(null), null);
  assert.equal(snapshotMappedArea({}), null);
});


const providedProject = () => {
  const value = project();
  value.contract = { ...value.contract, sourceKind: 'provided', drawingSource: {
    id: 'provided-site-plan', asset: '/assets/site-plan.png', fileName: 'site-plan.png', mimeType: 'image/png',
    label: 'Provided site plan', note: 'Source drawing; area pins are illustrative manual links, not surveyed positions.',
  } };
  return value;
};

test('a bundled provided drawing round-trips without file bytes or session URLs and starts without fictional areas', () => {
  const value = providedProject();
  const before = structuredClone(value);
  const result = installDrawing(value, { inputKind: 'provided', url: 'blob:ignored', file: { bytes: 'ignored' }, fileSize: 99 }, now);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.drawing.kind, 'image');
  assert.equal(result.drawing.inputKind, 'provided');
  assert.equal(result.drawing.sourceId, 'provided-site-plan');
  assert.equal(result.drawing.fileName, 'site-plan.png');
  assert.equal(result.drawing.fileSize, null);
  assert.equal('url' in result.drawing, false);
  assert.equal('asset' in result.drawing, false);
  assert.equal('file' in result.drawing, false);
  assert.deepEqual(result.project.drawingMapping.areas, []);
  assert.deepEqual(value, before);
  const saved = saveAreaMapping(result.project, {
    areaId: '', drawingId: result.drawing.id, code: 'W3-A', name: 'W3 manually linked area',
    page: 1, position: { x: .24, y: .35 }, workItemIds: ['WI-001'],
  }, now);
  assert.equal(saved.outcome, 'updated');
  const workspace = seedWorkspace();
  workspace.projects[1] = saved.project;
  const restored = loadWorkspace({ getItem: (key) => key === WORKSPACE_STORE ? JSON.stringify(workspace) : null }).projects[1];
  assert.deepEqual(getDrawingMapping(restored), saved.project.drawingMapping);
  assert.equal(getDrawingAsset(restored), '/assets/site-plan.png');
  assert.equal(getProvidedDrawingSource(restored).label, 'Provided site plan');
  const source = getProvidedDrawingSource(restored); source.asset = '/assets/other.png';
  assert.equal(getProvidedDrawingSource(restored).asset, '/assets/site-plan.png');
  assert.deepEqual(restored.items, before.items);
  assert.deepEqual(restored.reports, before.reports);
  assert.deepEqual(restored.claimDrafts, before.claimDrafts);
  assert.equal(getDrawingAsset(withDrawing()), DEMO_DRAWING_ASSET);
  assert.equal(getDrawingAsset(installDrawing(value, image, now).project), null);
});

test('provided drawing assets require a matching project contract descriptor and safe local image path', () => {
  const value = providedProject();
  for (const patch of [
    { asset: 'https://example.com/site-plan.png' }, { asset: '//example.com/site-plan.png' },
    { asset: '/assets/../site-plan.png' }, { asset: '/assets/site-plan.png?token=x' },
    { asset: '/other/site-plan.png' }, { asset: '/assets/site-plan.svg', fileName: 'site-plan.svg', mimeType: 'image/svg+xml' },
    { fileName: 'different.png' }, { mimeType: 'application/pdf' }, { id: '' },
  ]) {
    const malformed = { ...value, contract: { ...value.contract, drawingSource: { ...value.contract.drawingSource, ...patch } } };
    assert.equal(getProvidedDrawingSource(malformed), null, JSON.stringify(patch));
    assert.equal(installDrawing(malformed, { inputKind: 'provided' }, now).outcome, 'invalid');
  }
  for (const contract of [{ ...value.contract, sourceKind: 'illustrative' }, { ...value.contract, drawingSource: null }]) {
    assert.equal(installDrawing({ ...value, contract }, { inputKind: 'provided' }, now).outcome, 'invalid');
  }
  assert.equal(installDrawing(value, { inputKind: 'provided', sourceId: 'foreign-source' }, now).outcome, 'invalid');
  const installed = installDrawing(value, { inputKind: 'provided' }, now).project;
  for (const patch of [{ projectId: 'OTHER' }, { sourceId: 'OTHER' }, { fileName: 'other.png' }, { mimeType: 'image/jpeg' }, { fileSize: 12 }, { kind: 'sample' }]) {
    const malformed = { ...installed, drawingMapping: { ...installed.drawingMapping, drawing: { ...installed.drawingMapping.drawing, ...patch } } };
    assert.equal(getDrawingMapping(malformed).drawing, null, JSON.stringify(patch));
    assert.equal(getDrawingAsset(malformed), null, JSON.stringify(patch));
  }
  const foreign = { ...installed, id: 'OTHER' };
  assert.equal(getDrawingAsset(foreign, installed.drawingMapping.drawing), null);
  assert.equal(getDrawingMapping(foreign).drawing, null);
});

test('replacing a provided drawing retains named links and evidence while requiring pins to be placed again', () => {
  const value = installDrawing(providedProject(), { inputKind: 'provided' }, now).project;
  const saved = saveAreaMapping(value, {
    areaId: '', drawingId: value.drawingMapping.drawing.id, code: 'W5-E', name: 'W5 east elevation',
    page: 2, position: { x: .2, y: .6 }, workItemIds: ['WI-001', 'WI-002'],
  }, now).project;
  const before = structuredClone(saved);
  const replaced = installDrawing(saved, image, now).project;
  const area = getDrawingMapping(replaced).areas[0];
  assert.equal(area.id, saved.drawingMapping.areas[0].id);
  assert.equal(area.code, 'W5-E');
  assert.deepEqual(area.workItemIds, ['WI-001', 'WI-002']);
  assert.equal(area.position, null);
  assert.equal(area.page, 1);
  assert.notEqual(area.drawingId, saved.drawingMapping.drawing.id);
  assert.equal(getDrawingAsset(replaced), null);
  assert.deepEqual(replaced.reports, saved.reports);
  assert.deepEqual(replaced.claimDrafts, saved.claimDrafts);
  assert.deepEqual(saved, before);
  const restored = installDrawing(replaced, { inputKind: 'provided' }, now).project;
  assert.equal(getDrawingMapping(restored).areas[0].position, null);
  assert.deepEqual(getDrawingMapping(restored).areas[0].workItemIds, area.workItemIds);
  assert.equal(getDrawingAsset(restored), '/assets/site-plan.png');
});
