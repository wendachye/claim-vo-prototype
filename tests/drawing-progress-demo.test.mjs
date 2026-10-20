import assert from 'node:assert/strict';
import test from 'node:test';
import { createDrawingProgressDemo } from '../src/data/drawing-progress-demo.js';
import { getDrawingMapping } from '../src/data/drawing-mapping.js';
import { getDrawingProgress } from '../src/data/drawing-progress.js';
import { createProject, loadWorkspace, resetProject, seedWorkspace, updateProjectState, WORKSPACE_STORE } from '../src/data/projects.js';
import { buildClaimReview } from '../src/data/claims.js';
import { getWhatsAppMessages, processWhatsAppMessage } from '../src/data/whatsapp.js';
import { getVOCases } from '../src/data/vo.js';

const now = new Date('2026-10-21T13:00:00Z');
const statusByCode = (project, basis) => Object.fromEntries(getDrawingProgress(project, basis).map((area) => [area.code, area.status]));
const financial = (project) => project.items.map(({ id, quantity, rate, amount, pricingType }) => ({ id, quantity, rate, amount, pricingType }));

test('completion showcase creates an independent fictional mapped project with all three verified states', () => {
  const workspace = seedWorkspace();
  workspace.projects[0].items[0].quantity = 987;
  workspace.projects[0].reports[0].message = 'Existing browser-edited evidence';
  const original = structuredClone(workspace);
  const result = createDrawingProgressDemo(workspace, now);
  assert.equal(result.outcome, 'created');
  const { project } = result;
  assert.deepEqual(workspace, original);
  assert.deepEqual(result.workspace.projects.slice(0, original.projects.length), original.projects);
  assert.equal(result.workspace.activeProjectId, 'MAP01');
  assert.equal(project.name, 'Drawing Progress Showcase (Demo)');
  assert.equal(project.drawingProgressDemo, true);
  assert.equal(project.contract.sourceKind, 'illustrative');
  assert.equal(project.contract.sourceFile, null);
  assert.equal(project.contract.currency, 'SGD');
  assert.equal(project.contract.reference, 'MAP01-DEMO-SCHEDULE');
  assert.equal(project.items[0].quantity, 1200);
  assert.equal(project.items[0].rawExtractedQuantity, undefined);
  assert.ok(project.items.every((item) => !item.needsReview));
  assert.ok(project.sourceItems.every((item) => item.reported === 0 && item.verified === 0));
  assert.equal(project.locked, true);
  assert.equal(project.baselines.length, 1);
  assert.equal(project.baselines[0].version, 1);
  assert.ok(project.baselines[0].items.every((item) => item.reported === 0 && item.verified === 0));
  assert.equal(getDrawingMapping(project).areas.length, 4);
  assert.deepEqual(statusByCode(project, 'verified'), { A1: 'completed', A2: 'in-progress', B1: 'not-started', B2: 'not-started' });
  assert.deepEqual(statusByCode(project, 'reported'), { A1: 'completed', A2: 'in-progress', B1: 'not-started', B2: 'completed' });
  assert.equal(project.whatsappMessages.length, 8);
  assert.equal(project.whatsappMessages.filter((message) => message.status === 'processed').length, 7);
  assert.equal(project.whatsappMessages.filter((message) => message.status === 'new').length, 1);
  assert.deepEqual(project.claimDrafts, []);
  assert.equal(project.voReviews.length, 2);
  assert.equal(buildClaimReview(project, '2026-10', {}).canPrepare, false);
  assert.deepEqual(financial(project), financial(seedWorkspace().projects.find((entry) => entry.id === 'WH02')));
});

test('demo reports have project-scoped fictional evidence, cumulative totals and dated verification', () => {
  const { project } = createDrawingProgressDemo(seedWorkspace(), now);
  assert.equal(project.reports.length, 7);
  assert.equal(project.reports.filter((report) => report.status === 'pending').length, 2);
  for (const report of project.reports.filter((entry) => !entry.vo)) {
    assert.ok(report.id.startsWith(`${project.id}-MAP-REPORT-`));
    assert.equal(report.projectId, project.id);
    assert.equal(report.projectCode, project.code);
    assert.equal(report.completionBasis, 'cumulative');
    assert.equal(report.channel, 'whatsapp-mock');
    assert.equal(report.demo, true);
    assert.equal(report.vo, false);
    assert.ok(report.message.includes(project.code));
    assert.ok(report.message.includes(`COMPLETE=${report.completion}% TOTAL`));
    assert.ok(report.photo.startsWith('/assets/demo-'));
    assert.match(report.photoAlt, /demo site photo; not project evidence/);
    assert.ok(Date.parse(report.date) <= now.getTime());
    assert.ok(report.areaMapping.workItemIds.includes(report.itemId));
    if (report.status === 'verified') {
      assert.equal(report.approvedCompletion, report.completion);
      assert.match(report.verifiedBy, /demo/);
      assert.ok(Date.parse(report.verifiedAt) >= Date.parse(report.date));
      assert.ok(Date.parse(report.verifiedAt) <= now.getTime());
    } else {
      assert.equal(report.verifiedAt, undefined);
    }
  }
});

test('repeated demo creation avoids existing names, IDs and codes while preserving prior records', () => {
  const workspace = seedWorkspace();
  workspace.projects.push(createProject({ name: 'Unrelated project', code: 'MAP01' }));
  const first = createDrawingProgressDemo(workspace, now);
  assert.equal(first.project.id, 'MAP02');
  const before = structuredClone(first.workspace.projects);
  const second = createDrawingProgressDemo(first.workspace, now);
  assert.equal(second.project.id, 'MAP03');
  assert.notEqual(second.project.name, first.project.name);
  assert.deepEqual(second.workspace.projects.slice(0, before.length), before);
  assert.ok(second.project.reports.every((report) => report.projectId === 'MAP03' && report.message.includes('MAP03')));
  assert.ok(second.project.whatsappMessages.every((message) => message.projectId === 'MAP03' && message.text.includes('MAP03') && message.id.startsWith('MAP03-MAP-WA-')));
  assert.notEqual(second.project.drawingMapping.drawing.id, first.project.drawingMapping.drawing.id);
  const nameCollision = seedWorkspace();
  nameCollision.projects.push(createProject({ name: 'Drawing Progress Showcase (Demo)', code: 'OTHER' }));
  assert.equal(createDrawingProgressDemo(nameCollision, now).project.id, 'MAP02');
  const idCollision = seedWorkspace();
  idCollision.projects.push({ ...createProject({ name: 'Stable ID project', code: 'OTHER' }), id: 'MAP01' });
  assert.equal(createDrawingProgressDemo(idCollision, now).project.id, 'MAP02');
});

test('reload keeps seeded progress and reset clears only this project drawing while retaining its mock workflow', () => {
  const { workspace, project } = createDrawingProgressDemo(seedWorkspace(), now);
  const original = structuredClone(workspace);
  const storage = new Map([[WORKSPACE_STORE, JSON.stringify(workspace)]]);
  const loaded = loadWorkspace({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
  assert.deepEqual(statusByCode(loaded.projects.at(-1), 'verified'), statusByCode(project, 'verified'));
  assert.deepEqual(loaded.projects.slice(0, -1), workspace.projects.slice(0, -1));
  assert.equal(project.seed.drawingMapping, undefined);
  project.items[0].reported = 22;
  project.items[0].verified = 10;
  const changed = updateProjectState(workspace, project.id, resetProject);
  const reset = changed.projects.at(-1);
  assert.deepEqual(reset.items, original.projects.at(-1).seed.items);
  assert.deepEqual(reset.reports, original.projects.at(-1).seed.reports);
  assert.deepEqual(reset.baselines, original.projects.at(-1).seed.baselines);
  assert.deepEqual(reset.whatsappMessages, original.projects.at(-1).seed.whatsappMessages);
  assert.deepEqual(getVOCases(reset).map((entry) => entry.status), ['flagged', 'approved', 'rejected']);
  assert.deepEqual(loaded.projects.at(-1).voReviews, project.seed.voReviews);
  assert.deepEqual(loaded.projects.at(-1).whatsappMessages, project.seed.whatsappMessages);
  assert.equal(reset.drawingMapping, undefined);
  assert.equal(reset.locked, true);
  assert.deepEqual(changed.projects.slice(0, -1), original.projects.slice(0, -1));
});

test('invalid demo inputs do not change the workspace', () => {
  const workspace = seedWorkspace();
  const before = structuredClone(workspace);
  assert.equal(createDrawingProgressDemo(workspace, new Date('invalid')).outcome, 'invalid');
  assert.equal(createDrawingProgressDemo(workspace, Symbol('invalid')).outcome, 'invalid');
  assert.equal(createDrawingProgressDemo(null, now).outcome, 'invalid');
  assert.equal(createDrawingProgressDemo({ projects: [null] }, now).outcome, 'invalid');
  assert.deepEqual(workspace, before);
});


test('processed showcase inbox messages match their original reports and cannot replay completion', () => {
  const { project } = createDrawingProgressDemo(seedWorkspace(), now);
  const before = structuredClone(project);
  const messages = getWhatsAppMessages(project);
  assert.equal(messages.length, 8);
  for (const report of project.reports) {
    const message = messages.find((entry) => entry.id === report.sourceMessageId);
    assert.ok(message);
    assert.equal(message.status, 'processed');
    assert.equal(message.reportId, report.id);
    assert.equal(message.kind, report.vo ? 'vo' : 'progress');
    assert.equal(message.text, report.message);
    assert.equal(message.photo, report.photo);
    assert.equal(message.photoAlt, report.photoAlt);
    assert.equal(message.date, report.date);
    assert.equal(message.sender, report.sender);
    assert.equal(message.completion, report.completion);
    assert.equal(message.itemId, report.itemId);
    assert.equal(message.projectId, project.id);
    const replay = processWhatsAppMessage(project, message.id);
    assert.equal(replay.outcome, 'duplicate');
    assert.equal(replay.reportId, report.id);
    assert.deepEqual(replay.project, before);
  }
  assert.deepEqual(project, before);
});

test('flagged, approved and rejected VO examples retain source evidence without changing physical progress or making claims', () => {
  const { project } = createDrawingProgressDemo(seedWorkspace(), now);
  const before = structuredClone(project);
  const cases = getVOCases(project);
  assert.equal(cases.length, 3);
  const byArea = Object.fromEntries(cases.map((entry) => [entry.report.area, entry]));
  assert.equal(byArea['Area A2'].status, 'flagged');
  assert.equal(byArea['Area A2'].approvedValue, null);
  assert.equal(byArea['Area B2'].status, 'approved');
  assert.equal(byArea['Area B2'].approvedValue, 2500);
  assert.equal(byArea['Area B2'].approvalReference, `${project.code}-DEMO-APPROVAL-007`);
  assert.equal(byArea['Area B2'].approver, 'Fictional demo approver');
  assert.deepEqual(byArea['Area B2'].history.map((event) => event.action), ['submit', 'approve']);
  assert.equal(byArea['Area A1'].status, 'rejected');
  assert.match(byArea['Area A1'].reviewNote, /included in the contract/);
  assert.deepEqual(byArea['Area A1'].history.map((event) => event.action), ['reject']);
  for (const entry of cases) {
    assert.equal(entry.projectId, project.id);
    assert.equal(entry.report.completion, null);
    assert.equal(entry.report.itemId, null);
    assert.equal(entry.report.channel, 'whatsapp-mock');
    assert.equal(entry.report.vo, true);
    assert.equal(entry.report.demo, true);
    assert.ok(entry.report.areaMapping.areaId.startsWith(`AREA-${project.id}-`));
    const message = project.whatsappMessages.find((candidate) => candidate.id === entry.report.sourceMessageId);
    assert.equal(message.kind, 'vo');
    assert.equal(message.status, 'processed');
    assert.equal(message.text, entry.report.message);
    assert.equal(message.photo, entry.report.photo);
    assert.equal(message.date, entry.report.date);
    assert.equal(message.sender, entry.report.sender);
    assert.equal(message.reportId, entry.report.id);
    assert.match(message.photoAlt, /not project evidence/);
    assert.ok(Date.parse(message.processedAt) >= Date.parse(message.date));
    assert.ok(Date.parse(message.processedAt) <= now.getTime());
    for (const event of entry.history) {
      assert.ok(Date.parse(event.date) >= Date.parse(message.date));
      assert.ok(Date.parse(event.date) <= now.getTime());
      assert.match(event.actor, /Demo/);
    }
  }
  assert.equal(byArea['Area A2'].report.sourceMessageId, `${project.id}-MAP-WA-005`);
  assert.equal(byArea['Area B2'].report.sourceMessageId, `${project.id}-MAP-WA-007`);
  assert.equal(byArea['Area A1'].report.sourceMessageId, `${project.id}-MAP-WA-008`);
  assert.deepEqual(project.items.map(({ id, reported, verified }) => ({ id, reported, verified })), [
    { id: 'WI-001', reported: 100, verified: 100 }, { id: 'WI-002', reported: 65, verified: 40 },
    { id: 'WI-003', reported: 0, verified: 0 }, { id: 'WI-004', reported: 100, verified: 0 },
    { id: 'WI-005', reported: 0, verified: 0 }, { id: 'WI-006', reported: 0, verified: 0 },
  ]);
  assert.deepEqual(project.claimDrafts, []);
  assert.deepEqual(project.items.map(({ id, quantity, rate, amount, pricingType }) => ({ id, quantity, rate, amount, pricingType })), financial(seedWorkspace().projects.find((entry) => entry.id === 'WH02')));
  assert.ok(project.history.every((event) => Date.parse(event.date) <= now.getTime()));
  assert.deepEqual(project, before);
});

test('the remaining unclear message needs explicit processing without changing progress or seeded VO decisions', () => {
  const { project } = createDrawingProgressDemo(seedWorkspace(), now);
  const before = structuredClone(project);
  const unclearMessage = project.whatsappMessages.find((message) => message.id === `${project.id}-MAP-WA-006`);
  assert.equal(unclearMessage.kind, 'clarification');
  assert.equal(unclearMessage.status, 'new');
  assert.equal(unclearMessage.area, 'Area B1');
  assert.equal(unclearMessage.photo, '/assets/demo-scaffold.jpg');
  assert.equal(unclearMessage.reportId, undefined);
  assert.ok(!project.reports.some((report) => report.sourceMessageId === unclearMessage.id));
  const clarification = processWhatsAppMessage(project, unclearMessage.id);
  assert.equal(clarification.outcome, 'clarification');
  assert.deepEqual(clarification.project.reports, before.reports);
  assert.deepEqual(clarification.project.items, before.items);
  assert.deepEqual(clarification.project.voReviews, before.voReviews);
  assert.deepEqual(clarification.project.claimDrafts, []);
  assert.equal(clarification.project.whatsappMessages.find((message) => message.id === unclearMessage.id).status, 'clarification');
  assert.deepEqual(project, before);
});
