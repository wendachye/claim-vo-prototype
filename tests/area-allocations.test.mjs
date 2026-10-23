import assert from 'node:assert/strict';
import test from 'node:test';
import { seedWorkspace } from '../src/data/projects.ts';
import { getDrawingMapping, installDrawing, saveAreaMapping, removeMappedArea, snapshotMappedArea } from '../src/data/drawing-mapping.ts';
import { getAreaProgress } from '../src/data/drawing-progress.ts';
import { getItemAreaAllocation, getItemAreaSplitStartedAt, getAreaAllocationSnapshot, getAreaItemProgress, getItemAreaRollup, sameProgressScope, syncAreaItemProgress } from '../src/data/area-allocations.ts';

const now = new Date('2026-10-24T01:00:00Z');
const oldTime = '2026-10-20T01:00:00Z';
const date = '2026-10-24T03:00:00Z';
function project() {
  const value = structuredClone(seedWorkspace().projects[1]);
  value.items[0] = { ...value.items[0], quantity: 1000, rate: 10, amount: 10000, reported: 80, verified: 75, needsReview: false };
  value.reports = [{ id: 'OLD-WHOLE', itemId: value.items[0].id, projectId: value.id, status: 'verified', completion: 75, approvedCompletion: 75, date: oldTime, verifiedAt: oldTime }];
  value.claimDrafts = [{ id: 'FROZEN', projectId: value.id, period: '2026-10', snapshot: { amount: 500, evidence: [{ original: true }] } }];
  return installDrawing(value, { inputKind: 'sample' }, now).project;
}
const firstItem = value => value.items[0];
const areaAt = (value, index = 0) => getDrawingMapping(value).areas[index];
function allocate(value, quantity, index = 0) {
  const area = areaAt(value, index), item = firstItem(value);
  return saveAreaMapping(value, { ...area, areaId: area.id, workItemIds: [item.id], workItemQuantities: { [item.id]: quantity } }, now);
}
function split() {
  const first = allocate(project(), 600);
  assert.equal(first.outcome, 'updated');
  const second = allocate(first.project, 400, 1);
  assert.equal(second.outcome, 'updated');
  return second.project;
}
function report(value, index, completion, status = 'verified', overrides = {}) {
  const item = firstItem(value), area = areaAt(value, index);
  return { id: `AREA-${index}-${completion}`, projectId: value.id, projectCode: value.code, itemId: item.id, date, verifiedAt: date,
    completion, approvedCompletion: completion, status, areaMapping: snapshotMappedArea(area), areaProgress: getAreaAllocationSnapshot(value, area.id, item.id), ...overrides };
}

test('explicit area quantities preserve every contract, physical and saved-claim field and leave old links as context', () => {
  const original = project(), before = structuredClone(original);
  const result = allocate(original, '600');
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(original, before);
  const { drawingMapping, ...savedFields } = result.project;
  const { drawingMapping: previousMapping, ...oldFields } = before;
  assert.deepEqual(savedFields, oldFields);
  assert.equal(result.area.workItemQuantities[firstItem(original).id], 600);
  const info = getItemAreaAllocation(result.project, firstItem(original).id);
  assert.deepEqual([info.split, info.valid, info.contractQuantity, info.allocatedQuantity, info.remainingQuantity], [true, true, 1000, 600, 400]);
  assert.equal(getAreaProgress(result.project, result.area.id).items[0].completion, null);
  assert.equal(getAreaProgress(result.project, result.area.id).items[0].trackingScope, 'area');
  const context = areaAt(result.project, 1);
  const linked = saveAreaMapping(result.project, { ...context, areaId: context.id, workItemIds: [firstItem(original).id] }, now).project;
  const contextProgress = getAreaProgress(linked, context.id).items[0];
  assert.deepEqual([contextProgress.completion, contextProgress.trackingScope, contextProgress.label], [null, 'link-only', 'Quantity not assigned']);
  assert.equal(getItemAreaRollup(linked, firstItem(original).id).completion, null);
  assert.equal(getItemAreaRollup(linked, firstItem(original).id).unknownCount, 1);
  assert.deepEqual(linked.claimDrafts, before.claimDrafts);
});

test('limits reject excessive, imprecise, foreign and unsupported allocations at the saved-state boundary', () => {
  const first = allocate(project(), 600).project;
  for (const quantity of [401, 0, -1, '', null, true, '0.00001', Infinity, 'abc']) {
    const before = structuredClone(first);
    assert.equal(allocate(first, quantity, 1).outcome, 'invalid', String(quantity));
    assert.deepEqual(first, before);
  }
  const area = areaAt(first, 1), item = firstItem(first);
  for (const workItemQuantities of [[], null, { FOREIGN: 1 }, { [item.id]: 10, FOREIGN: 1 }]) {
    assert.equal(saveAreaMapping(first, { ...area, areaId: area.id, workItemIds: [item.id], workItemQuantities }, now).outcome, 'invalid');
  }
  for (const patch of [{ pricingType: 'included' }, { pricingType: 'rateOnly' }, { quantity: null }, { quantity: 0 }]) {
    const value = project(); value.items[0] = { ...value.items[0], ...patch };
    assert.equal(allocate(value, 1).outcome, 'invalid');
  }
});

test('quantity totals use exact four-place limits, including decimal boundaries', () => {
  const value = project(); value.items[0].quantity = 0.3;
  const first = allocate(value, '0.1').project;
  const second = allocate(first, '0.2', 1);
  assert.equal(second.outcome, 'updated');
  const info = getItemAreaAllocation(second.project, firstItem(value).id);
  assert.deepEqual([info.allocatedQuantity, info.remainingQuantity, info.valid], [0.3, 0, true]);
  assert.equal(allocate(second.project, '0.0001', 2).outcome, 'invalid');
  assert.equal(allocate(second.project, '0.2001', 1).outcome, 'invalid');
});

test('each area uses its own cumulative observation and item totals count each allocated quantity only once', () => {
  const value = split(), itemId = firstItem(value).id;
  value.reports.push(report(value, 0, 100));
  let total = getItemAreaRollup(value, itemId);
  assert.deepEqual([total.completion, total.completedQuantity, total.knownCount, total.unknownCount], [60, 600, 1, 1]);
  assert.equal(getAreaProgress(value, areaAt(value).id).status, 'completed');
  assert.equal(getAreaProgress(value, areaAt(value, 1).id).status, 'unknown');
  value.reports.push(report(value, 1, 25));
  total = getItemAreaRollup(value, itemId);
  assert.deepEqual([total.completion, total.completedQuantity, total.knownCount, total.unknownCount], [70, 700, 2, 0]);
  value.reports.push(report(value, 1, 50, 'verified', { id: 'A2-NEW', date: '2026-10-25T03:00:00Z', verifiedAt: '2026-10-25T03:00:00Z' }));
  total = getItemAreaRollup(value, itemId);
  assert.equal(total.completion, 80);
  assert.equal(total.evidence.length, 2);
  assert.ok(!total.evidence.some(entry => entry.id === 'OLD-WHOLE'));
  assert.equal(getAreaItemProgress(value, areaAt(value, 1).id, itemId).completion, 50);
  const saved = structuredClone(value.claimDrafts);
  const synchronized = syncAreaItemProgress(value, itemId);
  assert.deepEqual([synchronized.items[0].reported, synchronized.items[0].verified], [80, 80]);
  assert.deepEqual(synchronized.claimDrafts, saved);
  assert.deepEqual(synchronized.reports, value.reports);
  total.evidence[0].message = 'Changed return value';
  assert.equal(value.reports.find(entry => entry.id === total.evidence[0].id).message, undefined);
});

test('reported, verified and claim-cutoff observations stay separate and explicit zero remains known', () => {
  const value = split(), itemId = firstItem(value).id;
  value.reports.push(report(value, 0, 0));
  value.reports.push(report(value, 1, 100, 'pending', { verifiedAt: undefined }));
  assert.deepEqual([getItemAreaRollup(value, itemId).completion, getItemAreaRollup(value, itemId).knownCount], [0, 1]);
  assert.equal(getItemAreaRollup(value, itemId, 'reported').completion, 40);
  value.reports.push(report(value, 0, 50, 'verified', { id: 'NEXT', date: '2026-11-01T03:00:00Z', verifiedAt: '2026-11-01T03:00:00Z' }));
  const cutoff = Date.parse('2026-10-31T15:59:59Z');
  assert.equal(getItemAreaRollup(value, itemId, 'verified', cutoff).completion, 0);
  assert.equal(getItemAreaRollup(value, itemId).completion, 30);
  assert.equal(getItemAreaRollup(value, itemId, 'verified', Date.parse(oldTime)).completion, null);
  value.reports.push(report(value, 1, 80, 'verified', { id: 'FOREIGN', projectId: 'OTHER' }));
  assert.equal(getItemAreaRollup(value, itemId).completion, 30);
});

test('recorded area evidence freezes its quantity and link but allows names, pins and replacement drawings', () => {
  const value = split(), area = areaAt(value), itemId = firstItem(value).id;
  value.reports.push(report(value, 0, 50, 'rejected'));
  const before = structuredClone(value);
  assert.equal(allocate(value, 599).outcome, 'invalid');
  assert.equal(saveAreaMapping(value, { ...area, areaId: area.id, workItemIds: [], workItemQuantities: {} }, now).outcome, 'invalid');
  assert.equal(removeMappedArea(value, area.id, now).outcome, 'invalid');
  const withVO = split();
  withVO.reports.push(report(withVO, 0, 0, 'rejected', { vo: true }));
  assert.equal(allocate(withVO, 599).outcome, 'invalid');
  assert.equal(removeMappedArea(withVO, areaAt(withVO).id, now).outcome, 'invalid');
  const renamed = saveAreaMapping(value, { ...area, areaId: area.id, code: 'RENAMED', name: 'Updated area name', position: { x: .5, y: .7 } }, now);
  assert.equal(renamed.outcome, 'updated');
  assert.equal(renamed.area.workItemQuantities[itemId], 600);
  const replaced = installDrawing(renamed.project, { inputKind: 'sample' }, new Date('2026-10-25'));
  assert.equal(replaced.outcome, 'updated');
  assert.equal(areaAt(replaced.project).workItemQuantities[itemId], 600);
  assert.deepEqual(replaced.project.reports, value.reports);
  assert.deepEqual(replaced.project.claimDrafts, value.claimDrafts);
  assert.deepEqual(value, before);
});

test('report scopes keep legacy whole-item history separate from each area and snapshots freeze quantity metadata', () => {
  const value = split();
  const first = report(value, 0, 30), same = report(value, 0, 60), other = report(value, 1, 50), legacy = value.reports[0];
  assert.equal(sameProgressScope(first, same), true);
  assert.equal(sameProgressScope(first, other), false);
  assert.equal(sameProgressScope(first, legacy), false);
  assert.equal(sameProgressScope(legacy, { ...legacy, id: 'OTHER-LEGACY' }), true);
  assert.equal(sameProgressScope(first, { ...first, itemId: 'FOREIGN' }), false);
  const snapshot = snapshotMappedArea(areaAt(value));
  snapshot.workItemQuantities[firstItem(value).id] = 1;
  assert.equal(areaAt(value).workItemQuantities[firstItem(value).id], 600);
});

test('invalid stored allocation totals or mismatched evidence never fall back to whole-item completion', () => {
  const value = split(), itemId = firstItem(value).id;
  value.drawingMapping.areas[1].workItemQuantities[itemId] = 401;
  assert.equal(getItemAreaAllocation(value, itemId).valid, false);
  assert.equal(getItemAreaRollup(value, itemId).completion, null);
  assert.equal(getAreaProgress(value, areaAt(value).id).items[0].completion, null);
  for (const broken of [null, [], { [itemId]: '600' }, { [itemId]: -1 }]) {
    const malformed = split();
    malformed.drawingMapping.areas[0].workItemQuantities = broken;
    assert.equal(getItemAreaAllocation(malformed, itemId).split, true);
    assert.equal(getItemAreaAllocation(malformed, itemId).valid, false);
    assert.equal(getItemAreaRollup(malformed, itemId).completion, null);
    const other = areaAt(malformed, 1);
    assert.equal(saveAreaMapping(malformed, { ...other, areaId: other.id, name: 'Changed name' }, now).outcome, 'invalid');
  }
  const duplicated = split();
  duplicated.drawingMapping.areas.push({ ...structuredClone(duplicated.drawingMapping.areas[0]), workItemQuantities: { [itemId]: 400 } });
  assert.equal(getItemAreaAllocation(duplicated, itemId).valid, false);
  assert.equal(getItemAreaRollup(duplicated, itemId).completion, null);
  const mismatch = split();
  mismatch.reports.push({ ...report(mismatch, 0, 100), areaProgress: { ...getAreaAllocationSnapshot(mismatch, areaAt(mismatch).id, itemId), allocatedQuantity: 601 } });
  assert.equal(getItemAreaAllocation(mismatch, itemId).valid, false);
  assert.equal(getItemAreaRollup(mismatch, itemId).completion, null);
});


test('split activation follows the current uninterrupted interval across cleared quantities, deletion and drawing replacement', () => {
  let value = project();
  const itemId = firstItem(value).id;
  const save = (index, quantities, time) => {
    const area = areaAt(value, index);
    const result = saveAreaMapping(value, { ...area, areaId: area.id, workItemIds: [itemId], workItemQuantities: quantities }, new Date(time));
    assert.equal(result.outcome, 'updated', result.error);
    value = result.project;
  };
  save(0, { [itemId]: 600 }, '2026-10-01T01:00:00Z');
  assert.equal(getItemAreaSplitStartedAt(value, itemId), '2026-10-01T01:00:00.000Z');
  save(1, { [itemId]: 400 }, '2026-10-02T01:00:00Z');
  assert.equal(getItemAreaSplitStartedAt(value, itemId), '2026-10-01T01:00:00.000Z');
  save(0, {}, '2026-10-03T01:00:00Z');
  assert.equal(getItemAreaSplitStartedAt(value, itemId), '2026-10-01T01:00:00.000Z');
  save(1, {}, '2026-10-04T01:00:00Z');
  assert.equal(getItemAreaSplitStartedAt(value, itemId), null);
  save(0, { [itemId]: 600 }, '2026-11-01T01:00:00Z');
  assert.equal(getItemAreaSplitStartedAt(value, itemId), '2026-11-01T01:00:00.000Z');
  value = installDrawing(value, { inputKind: 'sample' }, new Date('2026-11-02T01:00:00Z')).project;
  assert.equal(getItemAreaSplitStartedAt(value, itemId), '2026-11-01T01:00:00.000Z');
  value = removeMappedArea(value, areaAt(value).id, new Date('2026-11-03T01:00:00Z')).project;
  assert.equal(getItemAreaSplitStartedAt(value, itemId), null);
  save(0, { [itemId]: 1000 }, '2026-12-01T01:00:00Z');
  assert.equal(getItemAreaSplitStartedAt(value, itemId), '2026-12-01T01:00:00.000Z');
});
