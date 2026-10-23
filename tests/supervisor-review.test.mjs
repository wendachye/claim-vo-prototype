import assert from 'node:assert/strict';
import test from 'node:test';
import { applySupervisorReview, createSupervisorReviewSnapshot, getSupervisorReview } from '../src/data/supervisor-review.ts';
import { getAreaAllocationSnapshot } from '../src/data/area-allocations.ts';
import { getDrawingMapping, installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { addProgressReport, verifyProgressReport } from '../src/data/progress-review.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';

const date = '2026-10-24T10:00:00Z';
function fixture() {
  const item = { id: 'WORK', ref: 'A.1', description: 'External scaffold', location: 'Block A', unit: 'm²',
    quantity: 1000, rate: 10, amount: 10000, pricingType: 'measured', reported: 50, verified: 20 };
  return { id: 'P', code: 'P01', name: 'Supervisor review demo', locked: true, version: 1,
    contract: { currency: 'SGD', sourceKind: 'illustrative' }, items: [item], sourceItems: [structuredClone(item)],
    reports: [{ id: 'R', projectId: 'P', projectCode: 'P01', itemId: 'WORK', status: 'pending', completion: 50,
      completionBasis: 'cumulative', date: '2026-10-23T12:00:00Z', sender: 'Demo worker', area: 'Block A',
      message: 'Block A scaffold 50% cumulative complete.', photo: '/demo-scaffold.png', photoAlt: 'Demonstration photo' }],
    baselines: [{ version: 1, items: [structuredClone(item)] }],
    claimDrafts: [{ id: 'SAVED', snapshot: { value: 2000, evidence: { completion: 20, photo: '/saved.png' } } }],
    claimTracking: [{ draftId: 'SAVED', status: 'paid' }], voReviews: [], history: [], whatsappMessages: [], seed: {} };
}
const frozen = project => Object.fromEntries(['sourceItems', 'baselines', 'claimDrafts', 'claimTracking', 'contract', 'seed', 'whatsappMessages', 'voReviews']
  .map(key => [key, structuredClone(project[key])]));
const apply = (project, decision = 'confirm', values = {}, snapshot = createSupervisorReviewSnapshot(project, 'R')) =>
  applySupervisorReview(project, snapshot, decision, values, date);

test('opening the exact report is read-only and scopes the mobile view to one pending observation', () => {
  const project = fixture(), before = structuredClone(project);
  const context = getSupervisorReview(project, 'P', 'R');
  assert.equal(context.canReview, true); assert.equal(context.state, 'pending');
  assert.equal(context.report.id, 'R'); assert.equal(context.item.id, 'WORK');
  assert.equal(context.reportedCompletion, 50); assert.equal(context.verifiedCompletion, 20);
  assert.equal(context.snapshot.projectId, 'P'); assert.equal(context.snapshot.reportId, 'R');
  assert.deepEqual(project, before);
  const foreign = getSupervisorReview(project, 'OTHER', 'R');
  assert.equal(foreign.report, null); assert.equal(foreign.item, null); assert.equal(foreign.snapshot, null);
  assert.equal(getSupervisorReview(project, 'P', 'UNKNOWN').state, 'unavailable');
});

test('Confirm uses the original reported total and keeps evidence and saved claims unchanged', () => {
  const project = fixture(), before = structuredClone(project), protectedValues = frozen(project);
  const snapshot = createSupervisorReviewSnapshot(project, 'R');
  const result = apply(project, 'confirm', { completion: '99' }, snapshot);
  assert.equal(result.outcome, 'updated', result.error);
  assert.equal(result.project.items[0].verified, 50); assert.equal(result.project.items[0].reported, 50);
  assert.equal(result.project.reports[0].approvedCompletion, 50); assert.equal(result.project.reports[0].status, 'verified');
  for (const key of ['message', 'photo', 'photoAlt', 'sender', 'date', 'completion', 'area']) assert.deepEqual(result.project.reports[0][key], project.reports[0][key]);
  assert.deepEqual(frozen(result.project), protectedValues); assert.deepEqual(project, before);
  assert.equal(getProjectAttention(result.project).some(task => task.reference === 'R'), false);
  const replay = apply(result.project, 'confirm', {}, snapshot);
  assert.equal(replay.outcome, 'unchanged'); assert.equal(replay.project, result.project);
});

test('Correct requires a reason, accepts zero and retains reported progress separately', () => {
  const project = fixture();
  for (const value of ['', '-1', '101', 'not a number']) assert.equal(apply(project, 'correct', { completion: value, reason: 'Measured onsite.' }).outcome, 'invalid');
  assert.equal(apply(project, 'correct', { completion: '50', reason: '' }).outcome, 'invalid', 'even same-value correction needs a reason');
  const result = apply(project, 'correct', { completion: '0', reason: ' Photo shows access only; scaffold is not installed. ' });
  assert.equal(result.outcome, 'updated', result.error);
  assert.equal(result.project.items[0].verified, 0); assert.equal(result.project.items[0].reported, 50);
  assert.equal(result.project.reports[0].completion, 50); assert.equal(result.project.reports[0].approvedCompletion, 0);
  assert.equal(result.project.reports[0].reviewReason, 'Photo shows access only; scaffold is not installed.');
  assert.deepEqual(frozen(result.project), frozen(project));
});

test('Confirm of reduced cumulative completion requires a reason', () => {
  const project = fixture(); project.items[0].verified = 80;
  assert.equal(apply(project).outcome, 'invalid');
  const result = apply(project, 'confirm', { reason: 'Remeasured remaining work on site.' });
  assert.equal(result.outcome, 'updated'); assert.equal(result.project.items[0].verified, 50);
});

test('Can’t verify reuses clarification and leaves both totals unchanged while attention stays pending', () => {
  const project = fixture(), snapshot = createSupervisorReviewSnapshot(project, 'R');
  assert.equal(apply(project, 'cant-verify', { reason: ' ' }, snapshot).outcome, 'invalid');
  const result = apply(project, 'cant-verify', { reason: 'Need a wide photo showing the whole elevation.' }, snapshot);
  assert.equal(result.outcome, 'updated', result.error);
  assert.deepEqual(result.project.items, project.items); assert.deepEqual(frozen(result.project), frozen(project));
  assert.equal(result.project.reports[0].status, 'needsClarification'); assert.equal(result.project.reports[0].completion, 50);
  assert.equal(result.project.reports[0].photo, project.reports[0].photo);
  assert.equal(getSupervisorReview(result.project, 'P', 'R').state, 'clarification');
  assert.equal(getProjectAttention(result.project).find(task => task.reference === 'R').kind, 'clarification');
  const replay = apply(result.project, 'cant-verify', { reason: 'Another note must not replace the first.' }, snapshot);
  assert.equal(replay.outcome, 'unchanged'); assert.equal(replay.project, result.project);
});

test('foreign projects, duplicate IDs and unsupported source scopes cannot be reviewed', () => {
  const initial = fixture(), snapshot = createSupervisorReviewSnapshot(initial, 'R');
  const mutations = [
    project => { project.id = 'OTHER'; },
    project => { project.reports[0].projectId = 'OTHER'; },
    project => { project.reports[0].projectCode = 'OTHER'; },
    project => { project.reports.push({ ...project.reports[0] }); },
    project => { project.reports.push({ ...project.reports[0], projectId: 'OTHER' }); },
    project => { project.items.push({ ...project.items[0] }); },
    project => { project.reports[0].vo = true; },
    project => { project.reports[0].completionBasis = 'incremental'; },
    project => { project.items[0].pricingType = 'included'; },
    project => { project.items[0].pricingType = 'rateOnly'; },
    project => { project.locked = false; },
    project => { project.reports[0].completion = null; },
  ];
  for (const mutate of mutations) {
    const project = structuredClone(initial); mutate(project);
    assert.equal(createSupervisorReviewSnapshot(project, 'R'), null);
    const result = apply(project, 'confirm', {}, snapshot);
    assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project);
  }
});

test('stale originals, baseline, current contract, prior progress or newer same-scope reports are rejected', () => {
  const initial = fixture(), snapshot = createSupervisorReviewSnapshot(initial, 'R');
  const mutations = [
    project => { project.reports[0].message = 'Changed source'; },
    project => { project.reports[0].photo = '/changed.png'; },
    project => { project.reports[0].completion = 60; },
    project => { project.version = 2; },
    project => { project.baselines[0].items[0].quantity = 999; },
    project => { project.items[0].quantity = 999; },
    project => { project.contract.currency = 'MYR'; },
    project => { project.items[0].verified = 30; },
    project => { project.reports[0].status = 'needsReview'; },
    project => { project.reports.push({ ...project.reports[0], id: 'NEW', date }); },
    project => { project.reports.push({ ...project.reports[0], id: 'TIED' }); },
  ];
  for (const mutate of mutations) {
    const project = structuredClone(initial); mutate(project);
    const result = apply(project, 'cant-verify', { reason: 'Must not save a stale review.' }, snapshot);
    assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project);
  }
  const result = apply(initial, 'confirm', {}, snapshot);
  const changed = structuredClone(result.project); changed.reports[0].photo = '/changed-after-review.png';
  assert.equal(apply(changed, 'confirm', {}, snapshot).outcome, 'invalid', 'already reviewed must not hide a changed source');
});

function allocatedFixture() {
  let project = fixture(); project.reports = []; project.items[0].reported = null; project.items[0].verified = null;
  project = installDrawing(project, { inputKind: 'sample' }, '2026-10-20T10:00:00Z').project;
  for (const [index, quantity] of [600, 400].entries()) {
    const area = getDrawingMapping(project).areas[index];
    const saved = saveAreaMapping(project, { ...area, areaId: area.id, workItemIds: ['WORK'], workItemQuantities: { WORK: quantity } }, '2026-10-20T11:00:00Z');
    assert.equal(saved.outcome, 'updated', saved.error); project = saved.project;
  }
  for (const [index, percentage] of [50, 25].entries()) {
    const area = getDrawingMapping(project).areas[index];
    const added = addProgressReport(project, { itemId: 'WORK', area: area.code, areaId: area.id,
      completion: String(percentage), message: `${area.code} ${percentage}% total`, photo: `/${area.code}.png` }, `2026-10-23T${10 + index}:00:00Z`);
    assert.equal(added.outcome, 'updated', added.error); project = added.project;
  }
  return project;
}

test('allocated areas review independently without double counting or invalidating another area’s open review', () => {
  const project = allocatedFixture(), report = project.reports[0], other = project.reports[1];
  const snapshot = createSupervisorReviewSnapshot(project, report.id), protectedValues = frozen(project);
  assert.deepEqual(report.areaProgress, getAreaAllocationSnapshot(project, getDrawingMapping(project).areas[0].id, 'WORK'));
  assert.equal(getSupervisorReview(project, 'P', report.id).verifiedCompletion, null);
  const checkedOther = verifyProgressReport(project, other.id, '25', '', date);
  assert.equal(checkedOther.outcome, 'updated', checkedOther.error); assert.equal(checkedOther.project.items[0].verified, 10);
  const result = applySupervisorReview(checkedOther.project, snapshot, 'correct', { completion: '40', reason: 'Measured six bays out of fifteen.' }, date);
  assert.equal(result.outcome, 'updated', result.error);
  assert.equal(result.project.items[0].verified, 34, '40% of 600 + 25% of 400, against 1000 once');
  assert.equal(result.project.items[0].reported, 40);
  assert.equal(result.project.reports[0].completion, 50); assert.equal(result.project.reports[0].approvedCompletion, 40);
  assert.equal(result.project.reports[1].approvedCompletion, 25); assert.deepEqual(frozen(result.project), protectedValues);
});

test('changed, missing or legacy whole-item allocations cannot fall back to whole-item verification', () => {
  const initial = allocatedFixture(), report = initial.reports[0], snapshot = createSupervisorReviewSnapshot(initial, report.id);
  for (const change of [
    project => { project.drawingMapping.areas[0].workItemQuantities.WORK = 500; },
    project => { project.drawingMapping.areas[0].name = 'Renamed area'; },
    project => { project.drawingMapping.areas[0].workItemIds = []; },
    project => { project.drawingMapping.areas = []; },
    project => { project.reports[0].areaProgress.itemId = 'OTHER'; },
    project => { delete project.reports[0].areaProgress; },
  ]) {
    const project = structuredClone(initial); change(project);
    const result = applySupervisorReview(project, snapshot, 'confirm', {}, date);
    assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project);
  }
});

test('invalid review dates and malformed snapshots cannot throw or mutate the selected project', () => {
  const project = fixture(), snapshot = createSupervisorReviewSnapshot(project, 'R');
  for (const saved of [null, {}, { ...snapshot, key: '' }, { ...snapshot, key: 'invalid' }, { ...snapshot, key: '{}' }]) {
    assert.equal(applySupervisorReview(project, saved, 'confirm', {}, date).outcome, 'invalid');
  }
  for (const decision of ['confirm', 'correct', 'cant-verify']) {
    const result = applySupervisorReview(project, snapshot, decision, { completion: '50', reason: 'Check' }, 'invalid');
    assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project);
  }
  assert.equal(applySupervisorReview(project, snapshot, 'unknown', {}, date).outcome, 'invalid');
});
