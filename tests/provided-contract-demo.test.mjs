import assert from 'node:assert/strict';
import test from 'node:test';
import { createProvidedContractDemo, getProvidedContractSample } from '../src/data/provided-contract-demo.js';
import { getDrawingAsset, getDrawingMapping } from '../src/data/drawing-mapping.js';
import { getDrawingProgress } from '../src/data/drawing-progress.js';
import { getAreaEvidence } from '../src/data/drawing-evidence.js';
import { getAreaVOFlags } from '../src/data/drawing-vo.js';
import { getVOCases } from '../src/data/vo.js';
import { processWhatsAppMessage } from '../src/data/whatsapp.js';
import { loadWorkspace, resetProject, seedWorkspace, updateProjectState, WORKSPACE_STORE } from '../src/data/projects.js';

const now = new Date('2026-10-21T13:00:00Z');
const create = (code = 'CASE01', date = now) => createProvidedContractDemo({
  code, name: 'Campus workflow (Demo)', country: 'Malaysia', subcontractor: 'A form override',
}, date);
const finances = (project) => project.items.map(({ id, quantity, rate, amount, pricingType, sourcePage }) => ({ id, quantity, rate, amount, pricingType, sourcePage }));

test('the public scenario uses pristine fictional rows and parties without existing project edits', () => {
  const sample = getProvidedContractSample();
  const workspace = seedWorkspace();
  workspace.projects[0].items[0].rate = 99;
  workspace.projects[0].reports[0].message = 'Existing edits';
  const before = structuredClone(workspace);
  const returned = getProvidedContractSample();
  returned.contract.reference = 'Changed copy';
  returned.items[0].quantity = 1;
  const project = create();
  assert.deepEqual(workspace, before);
  assert.deepEqual(finances(project), finances(sample));
  assert.equal(project.items.length, 18);
  assert.equal(project.contract.sourceKind, 'illustrative');
  assert.equal(project.contract.sourceFile, null);
  assert.equal(project.contract.representativeSubset, false);
  assert.equal(project.contract.reference, 'DEMO-CAMPUS-SC-001');
  assert.equal(project.contract.mainContractor, 'Fictional Campus Builder (Demo)');
  assert.equal(project.contract.subcontractor, 'Fictional Scaffold Team (Demo)');
  assert.equal(project.country, 'Singapore');
  assert.equal(project.providedContractDemo, true);
  assert.match(project.contract.demoNotice, /fictional/);
  assert.ok(project.sourceItems.every(item => item.reported === 0 && item.verified === 0 && !item.needsReview));
  assert.ok(project.items.every(item => !item.needsReview && !Object.hasOwn(item, 'rawExtractedQuantity')));
  assert.equal(project.locked, true);
  assert.ok(project.baselines[0].items.every(item => item.reported === 0 && item.verified === 0));
  assert.deepEqual(getProvidedContractSample(), sample);
});

test('the fictional W3/W5 plan has linked areas and separate reported and verified completion', () => {
  const project = create();
  const mapping = getDrawingMapping(project);
  assert.equal(mapping.drawing.fileName, 'campus-scaffold-area-plan.svg');
  assert.equal(getDrawingAsset(project), '/samples/campus-scaffold-area-plan.svg');
  assert.deepEqual(mapping.areas.map(({ code, workItemIds }) => ({ code, workItemIds })), [
    { code: 'W3-A', workItemIds: ['WI-001'] }, { code: 'W3-B', workItemIds: ['WI-002'] },
    { code: 'W5-A', workItemIds: ['WI-004'] }, { code: 'W5-B', workItemIds: ['WI-005'] },
  ]);
  const status = basis => Object.fromEntries(getDrawingProgress(project, basis).map(area => [area.code, area.status]));
  assert.deepEqual(status('verified'), { 'W3-A': 'in-progress', 'W3-B': 'completed', 'W5-A': 'not-started', 'W5-B': 'not-started' });
  assert.deepEqual(status('reported'), { 'W3-A': 'in-progress', 'W3-B': 'completed', 'W5-A': 'in-progress', 'W5-B': 'not-started' });
  assert.equal(project.items[0].reported, 65);
  assert.equal(project.items[0].verified, 50);
  assert.equal(project.items.find(item => item.id === 'WI-004').verified, 0);
});

test('mock messages pair with original reports once and duplicate processing changes nothing', () => {
  const project = create();
  const before = structuredClone(project);
  assert.equal(project.reports.length, 7);
  assert.equal(project.whatsappMessages.length, 8);
  for (const report of project.reports) {
    const message = project.whatsappMessages.find(entry => entry.id === report.sourceMessageId);
    assert.equal(message.reportId, report.id);
    assert.equal(message.text, report.message);
    assert.equal(message.sender, report.sender);
    assert.equal(message.date, report.date);
    assert.equal(message.photo, report.photo);
    assert.match(report.photoAlt, /not project evidence/);
    assert.equal(report.demo, true);
    assert.equal(report.origin, 'simulated');
    assert.ok(report.areaMapping.areaId.startsWith(`AREA-${project.id}-`));
    const replay = processWhatsAppMessage(project, message.id);
    assert.equal(replay.outcome, 'duplicate');
    assert.deepEqual(replay.project, before);
  }
  const area = getDrawingMapping(project).areas.find(entry => entry.code === 'W3-A');
  assert.equal(getAreaEvidence(project, area.id).entries.length, 3);
  assert.deepEqual(project, before);
});

test('open, approved and rejected VOs retain distinct flags and reject foreign area/case access', () => {
  const project = create();
  const second = create('CASE02');
  const cases = Object.fromEntries(getVOCases(project).map(entry => [entry.report.area, entry]));
  assert.equal(cases['Area W3-A'].status, 'flagged');
  assert.equal(cases['Area W3-A'].approvedValue, null);
  assert.equal(cases['Area W5-B'].status, 'approved');
  assert.equal(cases['Area W5-B'].approvedValue, 1800);
  assert.match(cases['Area W5-B'].approver, /Fictional/);
  assert.equal(cases['Area W3-B'].status, 'rejected');
  const flags = Object.fromEntries(getDrawingMapping(project).areas.map(area => [area.code, getAreaVOFlags(project, area.id)]));
  assert.equal(flags['W3-A'].openCount, 1);
  assert.equal(flags['W5-B'].approvedCount, 1);
  assert.equal(flags['W3-B'].rejectedCount, 1);
  assert.equal(flags['W3-B'].markerLabel, '');
  const foreignArea = getDrawingMapping(second).areas[0].id;
  assert.equal(getAreaEvidence(project, foreignArea), null);
  assert.equal(getAreaVOFlags(project, foreignArea), null);
  const polluted = { ...project, reports: [...project.reports, ...second.reports], voReviews: [...project.voReviews, ...second.voReviews] };
  assert.deepEqual(getVOCases(polluted), getVOCases(project));
});

test('unclear incremental updates require clarification without altering progress, VO decisions or claims', () => {
  const project = create();
  const before = structuredClone(project);
  const unclear = project.whatsappMessages.find(message => message.kind === 'clarification');
  assert.equal(unclear.status, 'new');
  assert.equal(unclear.itemId, null);
  assert.equal(unclear.completionBasis, 'unclear');
  const result = processWhatsAppMessage(project, unclear.id);
  assert.equal(result.outcome, 'clarification');
  for (const field of ['items', 'reports', 'voReviews', 'claimDrafts']) assert.deepEqual(result.project[field], before[field]);
  assert.deepEqual(project, before);
});

test('the saved draft uses explicit fictional QS inputs and freezes its gross-only evidence', () => {
  const project = create();
  const draft = project.claimDrafts[0];
  assert.equal(project.claimDrafts.length, 1);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.preparedAt, undefined);
  assert.equal(draft.period, '2026-10');
  assert.equal(draft.assessment.priorConfirmed, true);
  assert.equal(draft.assessment.work['WI-001'].assessedQuantity, 1000);
  assert.equal(draft.assessment.work['WI-001'].previousValue, 0);
  assert.equal(draft.snapshot.totals.workCurrentValue, 16250);
  assert.equal(draft.snapshot.totals.voCurrentValue, 1800);
  assert.equal(draft.snapshot.totals.currentValue, 18050);
  assert.equal(draft.snapshot.canPrepare, true);
  assert.match(draft.assessment.note, /not calculated from the progress percentage/);
  assert.match(draft.assessment.note, /retention, GST and other deductions are not calculated/);
  const frozen = structuredClone(draft.snapshot);
  project.items[0].verified = 65;
  project.items[0].rate = 99;
  project.voReviews.find(review => review.status === 'approved').approvedValue = 9999;
  assert.deepEqual(draft.snapshot, frozen);
});

test('scenario evidence dates remain in its local claim month even at the first instant', () => {
  for (const chosen of [now, new Date('2026-10-01T00:00:00+08:00')]) {
    const project = create('CASE01', chosen);
    const monthStart = Date.parse('2026-10-01T00:00:00+08:00');
    const dates = [project.lockedAt, project.claimDrafts[0].createdAt,
      ...project.reports.flatMap(report => [report.date, ...(report.verifiedAt ? [report.verifiedAt] : [])]),
      ...project.voReviews.flatMap(review => [review.updatedAt, ...review.history.map(event => event.date)]),
      ...project.history.map(event => event.date)];
    for (const date of dates) {
      assert.ok(Date.parse(date) >= monthStart, date);
      assert.ok(Date.parse(date) <= chosen.getTime(), date);
    }
    assert.equal(project.claimDrafts[0].snapshot.canPrepare, true);
  }
  assert.throws(() => create('CASE01', new Date('invalid')), /valid date/);
  assert.throws(() => create('CASE01', Symbol('invalid')), /valid date/);
});

test('reload and project reset retain independent scenario data and preserve other projects', () => {
  const workspace = seedWorkspace();
  const project = create();
  const second = create('CASE02');
  const saved = { ...workspace, activeProjectId: project.id, projects: [...workspace.projects, project, second] };
  const values = new Map([[WORKSPACE_STORE, JSON.stringify(saved)]]);
  const loaded = loadWorkspace({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  const restored = loaded.projects.find(entry => entry.id === project.id);
  assert.deepEqual(getDrawingMapping(restored), getDrawingMapping(project));
  assert.equal(getDrawingAsset(restored), '/samples/campus-scaffold-area-plan.svg');
  assert.deepEqual(restored.claimDrafts, project.claimDrafts);
  assert.deepEqual(restored.voReviews, project.voReviews);
  const changed = updateProjectState(loaded, project.id, current => ({ ...current, claimDrafts: [], items: current.items.map(item => ({ ...item, verified: 0 })) }));
  const reset = updateProjectState(changed, project.id, resetProject);
  const result = reset.projects.find(entry => entry.id === project.id);
  for (const field of ['items', 'reports', 'claimDrafts', 'voReviews']) assert.deepEqual(result[field], project.seed[field]);
  assert.equal(result.drawingMapping, undefined);
  assert.deepEqual(reset.projects.filter(entry => entry.id !== project.id), saved.projects.filter(entry => entry.id !== project.id));
});
