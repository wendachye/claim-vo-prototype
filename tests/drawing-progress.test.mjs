import assert from 'node:assert/strict';
import test from 'node:test';
import { getAreaProgress, getDrawingProgress } from '../src/data/drawing-progress.js';
import { getDrawingMapping, installDrawing, saveAreaMapping, removeMappedArea } from '../src/data/drawing-mapping.js';

const now = new Date('2026-10-21T14:00:00Z');
function project(id = 'WAREHOUSE-DEMO') {
  return installDrawing({ id, items: [
    { id: 'WI-001', description: 'External wall', reported: 100, verified: 0, quantity: 1200, rate: 25, amount: 30000 },
    { id: 'WI-002', description: 'Roof', reported: 100, verified: 100 },
    { id: 'WI-003', description: 'Floor', reported: 75, verified: 40 },
    { id: 'WI-004', description: 'Loading bay', reported: null, verified: null },
  ], sourceItems: [{ id: 'WI-001', quantity: 1200 }], baselines: [{ quantity: 1200 }],
  reports: [{ message: 'Original site evidence', areaMapping: { code: 'OLD' } }],
  claimDrafts: [{ snapshot: { currentValue: 30000 } }], history: [] }, { inputKind: 'sample' }, now).project;
}
function link(value, workItemIds, areaIndex = 0) {
  const area = getDrawingMapping(value).areas[areaIndex];
  const result = saveAreaMapping(value, { ...area, areaId: area.id, workItemIds }, now);
  assert.equal(result.outcome, 'updated');
  return result.project;
}
const areaId = (value, index = 0) => getDrawingMapping(value).areas[index].id;
const progress = (value, basis) => getAreaProgress(value, areaId(value), basis);

test('unlinked areas have no derived completion and missing or foreign areas return null', () => {
  const value = project();
  const result = progress(value);
  assert.equal(result.basis, 'verified');
  assert.equal(result.status, 'unlinked');
  assert.equal(result.label, 'Not linked');
  assert.equal(result.tone, 'slate');
  assert.equal(result.totalCount, 0);
  assert.deepEqual(result.items, []);
  assert.equal(result.summary, '0 of 0 work items completed');
  assert.equal(getAreaProgress(value, 'MISSING'), null);
  assert.equal(getAreaProgress(value, areaId(project('OTHER-PROJECT'))), null);
  assert.equal(getAreaProgress(null, areaId(value)), null);
  assert.deepEqual(getDrawingProgress({ id: 'EMPTY', items: [] }), []);
});

test('completed and not-started status require every linked item to have the same known endpoint', () => {
  let value = link(project(), ['WI-002']);
  assert.deepEqual([progress(value).status, progress(value).label, progress(value).tone], ['completed', 'Completed', 'green']);
  assert.equal(progress(value).summary, '1 of 1 work item completed');
  value = link(value, ['WI-001']);
  assert.deepEqual([progress(value).status, progress(value).label, progress(value).tone], ['not-started', 'Not started', 'slate']);
  assert.equal(progress(value).notStartedCount, 1);
  assert.equal(progress(value).items[0].completion, 0);
});

test('partial progress or mixed zero and complete items are in progress without an average', () => {
  let value = link(project(), ['WI-001', 'WI-002']);
  let result = progress(value);
  assert.equal(result.status, 'in-progress');
  assert.equal(result.label, 'In progress');
  assert.equal(result.tone, 'blue');
  assert.equal(result.completedCount, 1);
  assert.equal(result.notStartedCount, 1);
  assert.equal(result.inProgressCount, 0);
  assert.equal(result.summary, '1 of 2 work items completed');
  for (const field of ['completion', 'average', 'percentage', 'quantity', 'rate', 'amount']) assert.equal(Object.hasOwn(result, field), false);
  value = link(value, ['WI-003', 'WI-004']);
  result = progress(value);
  assert.equal(result.status, 'in-progress');
  assert.equal(result.inProgressCount, 1);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.items[0].completion, 40);
  assert.equal(result.items[1].completion, null);
});

test('unknown values are never zero or complete and prevent endpoint-only groups becoming conclusive', () => {
  for (const workItemIds of [['WI-004'], ['WI-001', 'WI-004'], ['WI-002', 'WI-004']]) {
    const result = progress(link(project(), workItemIds));
    assert.equal(result.status, 'unknown');
    assert.equal(result.label, 'Needs update');
    assert.equal(result.tone, 'amber');
    assert.equal(result.unknownCount, 1);
    assert.equal(result.items.at(-1).status, 'unknown');
    assert.equal(result.items.at(-1).label, 'Needs update');
  }
  assert.equal(progress(link(project(), ['WI-001', 'WI-002', 'WI-004'])).status, 'in-progress');
  for (const malformed of [null, undefined, '', '0', '100', true, false, {}, NaN, Infinity, -1, 101]) {
    const value = link(project(), ['WI-001']);
    value.items[0].reported = malformed;
    value.items[0].verified = malformed;
    const result = progress(value);
    assert.equal(result.status, 'unknown');
    assert.deepEqual([result.items[0].reported, result.items[0].verified, result.items[0].completion], [null, null, null]);
  }
});

test('reported and verified use their own whole-item totals and invalid bases default to verified', () => {
  const value = link(project(), ['WI-001', 'WI-002']);
  const reported = progress(value, 'reported'), verified = progress(value);
  assert.equal(reported.basis, 'reported');
  assert.equal(reported.status, 'completed');
  assert.equal(reported.completedCount, 2);
  assert.equal(verified.basis, 'verified');
  assert.equal(verified.status, 'in-progress');
  assert.equal(verified.completedCount, 1);
  assert.deepEqual(reported.items.map((item) => [item.reported, item.verified]), [[100, 0], [100, 100]]);
  for (const invalid of ['', 'area', null, {}, 0]) assert.deepEqual(progress(value, invalid), verified);
  assert.deepEqual(getDrawingProgress(value, 'reported')[0], reported);
  assert.deepEqual(getDrawingProgress(value, 'reported').map((entry) => entry.code), ['A1', 'A2', 'B1', 'B2']);
});

test('areas reflect remapping and current list progress without changing saved evidence or financial records', () => {
  let value = link(project(), ['WI-002']);
  const before = structuredClone(value);
  const original = progress(value);
  original.items[0].description = 'Changed return value';
  assert.deepEqual(value, before);
  value = link(value, ['WI-003']);
  const remapped = progress(value);
  assert.equal(remapped.items[0].id, 'WI-003');
  assert.equal(remapped.status, 'in-progress');
  value.items[2].verified = 100;
  assert.equal(progress(value).status, 'completed');
  assert.equal(remapped.items[0].completion, 40);
  for (const field of ['sourceItems', 'baselines', 'reports', 'claimDrafts', 'history']) assert.deepEqual(value[field], before[field]);
  const snapshot = structuredClone(value);
  getDrawingProgress(value);
  assert.deepEqual(value, snapshot);
  value = removeMappedArea(value, areaId(value), now).project;
  assert.equal(getAreaProgress(value, before.drawingMapping.areas[0].id), null);
});

test('projects with overlapping item IDs retain separate maps and independent progress', () => {
  const first = link(project('ONE'), ['WI-001']);
  const second = link(project('TWO'), ['WI-001']);
  second.items[0].verified = 100;
  assert.equal(progress(first).status, 'not-started');
  assert.equal(progress(second).status, 'completed');
  assert.equal(getAreaProgress(first, areaId(second)), null);
  assert.equal(getAreaProgress(second, areaId(first)), null);
  const copiedMap = { ...first, drawingMapping: second.drawingMapping };
  assert.deepEqual(getDrawingProgress(copiedMap), []);
  const linkedTwice = link(first, ['WI-001'], 1);
  assert.deepEqual(getDrawingProgress(linkedTwice).slice(0, 2).map((entry) => entry.items[0].completion), [0, 0]);
});
