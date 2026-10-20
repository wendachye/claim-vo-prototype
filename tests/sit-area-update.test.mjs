import assert from 'node:assert/strict';
import test from 'node:test';
import { createProvidedContractDemo, createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { applySITAreaUpdate, getSITAreaUpdate } from '../src/data/sit-area-update.js';
import { getDrawingMapping, getAreasForItem, installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.js';
import { getAreaEvidence } from '../src/data/drawing-evidence.js';
import { resetProject } from '../src/data/projects.js';

const now = new Date('2026-10-21T13:00:00Z');
const create = () => createSITContractDemo({ code: 'SIT-AREA01', name: 'Original S.I.T. area review' }, now);
const oldCodes = new Set(['W3-ST31', 'W3-ST34', 'W5-ST51', 'W5-EAST']);
const legacy = () => {
  const project = create();
  project.drawingMapping.areas = project.drawingMapping.areas.filter((area) => oldCodes.has(area.code));
  project.drawingMapping.history = project.drawingMapping.history.filter((event) => !event.area || oldCodes.has(event.area.code));
  project.contract.demoAreas = project.contract.demoAreas.filter((area) => project.drawingMapping.areas.some((entry) => entry.id === area.id));
  return project;
};
const addArea = (project, code, workItemIds) => saveAreaMapping(project, {
  drawingId: project.drawingMapping.drawing.id, code, name: 'User mapped area', page: 1,
  position: { x: .1, y: .2 }, workItemIds,
}, now).project;

test('the explicit update adds only missing named source scopes, retaining existing evidence and financial records', () => {
  const project = legacy();
  project.items[0].rate = 99;
  project.items[2].quantity = 900;
  project.drawingMapping.areas[0].userNote = 'Keep the existing manual placement';
  project.drawingMapping.userNote = 'Keep custom drawing metadata';
  project.reports[0].message = 'Saved original report text';
  const before = structuredClone(project);
  const preview = getSITAreaUpdate(project);
  assert.equal(preview.available, true);
  assert.equal(preview.areaCount, 8);
  assert.equal(preview.itemCount, 9);
  assert.deepEqual(preview.skipped, []);
  assert.ok(preview.additions.every((area) => area.position === null && area.page === 1));
  assert.deepEqual(project, before);
  const evidence = getAreaEvidence(project, project.drawingMapping.areas[0].id);
  const result = applySITAreaUpdate(project, now);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.areaCount, 8);
  assert.equal(result.itemCount, 9);
  assert.deepEqual(project, before);
  const { drawingMapping, ...remaining } = result.project;
  const { drawingMapping: oldMapping, ...oldRemaining } = before;
  assert.deepEqual(remaining, oldRemaining);
  assert.equal(drawingMapping.userNote, oldMapping.userNote);
  assert.deepEqual(drawingMapping.drawing, oldMapping.drawing);
  assert.deepEqual(drawingMapping.areas.slice(0, 4), oldMapping.areas);
  assert.deepEqual(drawingMapping.history.slice(0, oldMapping.history.length), oldMapping.history);
  assert.equal(drawingMapping.history.length, oldMapping.history.length + 8);
  assert.ok(drawingMapping.history.slice(-8).every((event) => event.action === 'addArea'));
  assert.equal(new Set(drawingMapping.areas.map((area) => area.id)).size, 12);
  assert.equal(new Set(drawingMapping.areas.flatMap((area) => area.workItemIds)).size, 13);
  assert.deepEqual(getAreaEvidence(result.project, project.drawingMapping.areas[0].id), evidence);
  for (const id of ['WI-014', 'WI-015', 'WI-016', 'WI-017', 'WI-018']) assert.deepEqual(getAreasForItem(result.project, id), []);
  assert.deepEqual(result.project.claimDrafts[0].snapshot, before.claimDrafts[0].snapshot);
  assert.equal(result.project.claimDrafts[0].snapshot.totals.currentValue, 15894);
});

test('shared included decking links to both new B.1 zones without splitting its quantity or adding a claim', () => {
  const project = legacy();
  const before = structuredClone(project.items.find((item) => item.id === 'WI-012'));
  const result = applySITAreaUpdate(project, now);
  const areas = getAreasForItem(result.project, 'WI-012');
  assert.deepEqual(areas.map((area) => area.code), ['W3-AMPH-A', 'W5-AMPH-AB']);
  assert.deepEqual(areas.map((area) => area.workItemIds), [['WI-009', 'WI-012'], ['WI-010', 'WI-012']]);
  assert.deepEqual(result.project.items.find((item) => item.id === 'WI-012'), before);
  assert.equal(before.pricingType, 'included');
  assert.equal(before.quantity, 1);
  assert.equal(before.rate, null);
  assert.equal(before.amount, null);
  assert.deepEqual(result.project.items, project.items);
  assert.deepEqual(result.project.claimDrafts, project.claimDrafts);
});

test('replaying the update is inert, and a complete new demo is already covered', () => {
  const first = applySITAreaUpdate(legacy(), now);
  const before = structuredClone(first.project);
  const preview = getSITAreaUpdate(first.project);
  assert.equal(preview.available, true);
  assert.equal(preview.areaCount, 0);
  assert.equal(preview.itemCount, 0);
  const replay = applySITAreaUpdate(first.project, new Date('2026-10-22T13:00:00Z'));
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.project, first.project);
  assert.deepEqual(replay.project, before);
  const fresh = create();
  assert.equal(getSITAreaUpdate(fresh).areaCount, 0);
  assert.equal(applySITAreaUpdate(fresh, now).project, fresh);
});

test('user mappings and code collisions take precedence over suggested source zones', () => {
  let project = addArea(legacy(), 'CUSTOM-ST36', ['WI-003']);
  project = addArea(project, 'W5-NORTH', ['WI-014']);
  project = addArea(project, 'CUSTOM-DECKING', ['WI-012']);
  const before = structuredClone(project);
  const preview = getSITAreaUpdate(project);
  assert.equal(preview.areaCount, 6);
  assert.equal(preview.itemCount, 6);
  assert.deepEqual(preview.skipped.map((entry) => entry.code), ['W5-NORTH']);
  const result = applySITAreaUpdate(project, now);
  assert.deepEqual(result.project.drawingMapping.areas.slice(0, before.drawingMapping.areas.length), before.drawingMapping.areas);
  assert.deepEqual(getAreasForItem(result.project, 'WI-003').map((area) => area.code), ['CUSTOM-ST36']);
  assert.deepEqual(getAreasForItem(result.project, 'WI-006'), []);
  assert.deepEqual(getAreasForItem(result.project, 'WI-012').map((area) => area.code), ['CUSTOM-DECKING']);
  assert.deepEqual(getAreasForItem(result.project, 'WI-014').map((area) => area.code), ['W5-NORTH']);
  assert.deepEqual(getDrawingMapping(result.project).areas.find((area) => area.code === 'W3-AMPH-A').workItemIds, ['WI-009']);
  assert.deepEqual(project, before);
});

test('an already mapped platform is not duplicated just to add its related decking', () => {
  let project = addArea(legacy(), 'USER-W3-PLATFORM', ['WI-009']);
  project = addArea(project, 'USER-W5-PLATFORM', ['WI-010']);
  const preview = getSITAreaUpdate(project);
  assert.equal(preview.areaCount, 6);
  assert.ok(preview.additions.every((area) => !area.workItemIds.includes('WI-012')));
  const result = applySITAreaUpdate(project, now);
  assert.deepEqual(getAreasForItem(result.project, 'WI-009').map((area) => area.code), ['USER-W3-PLATFORM']);
  assert.deepEqual(getAreasForItem(result.project, 'WI-010').map((area) => area.code), ['USER-W5-PLATFORM']);
  assert.deepEqual(getAreasForItem(result.project, 'WI-012'), []);
});

test('scope changes, foreign item metadata and missing rows never receive a coincidental source link', () => {
  const variants = [
    (project) => { project.items.find((item) => item.id === 'WI-009').description = 'Different project scope'; },
    (project) => { project.items.find((item) => item.id === 'WI-009').location = 'W5'; },
    (project) => { project.items.find((item) => item.id === 'WI-009').ref = 'Other / 1'; },
    (project) => { project.items.find((item) => item.id === 'WI-009').projectId = 'OTHER'; },
    (project) => { project.items.find((item) => item.id === 'WI-009').projectCode = 'OTHER'; },
    (project) => { project.items = project.items.filter((item) => item.id !== 'WI-009'); },
  ];
  for (const change of variants) {
    const project = legacy();
    change(project);
    const before = structuredClone(project);
    const preview = getSITAreaUpdate(project);
    assert.equal(preview.available, true);
    assert.equal(preview.areaCount, 7);
    assert.ok(preview.skipped.some((entry) => entry.code === 'W3-AMPH-A'));
    assert.ok(!preview.additions.some((area) => area.code === 'W3-AMPH-A'));
    const result = applySITAreaUpdate(project, now);
    assert.deepEqual(getAreasForItem(result.project, 'WI-009'), []);
    assert.deepEqual(getAreasForItem(result.project, 'WI-012').map((area) => area.code), ['W5-AMPH-AB']);
    assert.deepEqual(project, before);
  }
  const project = legacy();
  project.items.find((item) => item.id === 'WI-012').pricingType = 'measured';
  const result = applySITAreaUpdate(project, now);
  assert.deepEqual(getAreasForItem(result.project, 'WI-012'), []);
  assert.deepEqual(getDrawingMapping(result.project).areas.find((area) => area.code === 'W3-AMPH-A').workItemIds, ['WI-009']);
  assert.deepEqual(getDrawingMapping(result.project).areas.find((area) => area.code === 'W5-AMPH-AB').workItemIds, ['WI-010']);
});

test('a reset, replaced drawing, foreign source or damaged mapping cannot receive the source-zone update', () => {
  const projects = [
    null,
    createProvidedContractDemo({ code: 'CAMPUS01', name: 'Fictional campus' }, now),
    resetProject(legacy()),
    installDrawing(legacy(), { inputKind: 'upload', fileName: 'Other plan.png', fileSize: 1000, mimeType: 'image/png' }, now).project,
  ];
  for (const change of [
    (project) => { project.contract.drawingSource.asset = '/assets/contract-schedule.jpg'; },
    (project) => { project.contract.reference = 'Other contract'; },
    (project) => { project.drawingMapping.drawing.projectId = 'OTHER'; },
    (project) => { project.drawingMapping.areas[0].workItemIds.push('FOREIGN'); },
    (project) => { project.drawingMapping.history.push(null); },
    (project) => { project.items.push(structuredClone(project.items[0])); },
  ]) {
    const project = legacy(); change(project); projects.push(project);
  }
  for (const project of projects) {
    const before = structuredClone(project);
    const preview = getSITAreaUpdate(project);
    assert.equal(preview.available, false);
    assert.ok(preview.reason);
    const result = applySITAreaUpdate(project, now);
    assert.equal(result.outcome, 'unavailable');
    assert.equal(result.project, project);
    assert.deepEqual(project, before);
  }
  const project = legacy();
  const before = structuredClone(project);
  for (const invalidDate of [new Date('invalid'), Symbol('invalid')]) {
    const result = applySITAreaUpdate(project, invalidDate);
    assert.equal(result.outcome, 'unavailable');
    assert.equal(result.project, project);
    assert.deepEqual(project, before);
  }
});
