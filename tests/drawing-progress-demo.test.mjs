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
  assert.equal(project.whatsappMessages.length, 6);
  assert.equal(project.whatsappMessages.filter((message) => message.status === 'processed').length, 4);
  assert.equal(project.whatsappMessages.filter((message) => message.status === 'new').length, 2);
  assert.deepEqual(project.claimDrafts, []);
  assert.deepEqual(project.voReviews, []);
  assert.equal(buildClaimReview(project, '2026-10', {}).canPrepare, false);
  assert.deepEqual(financial(project), financial(seedWorkspace().projects.find((entry) => entry.id === 'WH02')));
});

test('demo reports have project-scoped fictional evidence, cumulative totals and dated verification', () => {
  const { project } = createDrawingProgressDemo(seedWorkspace(), now);
  assert.equal(project.reports.length, 4);
  assert.equal(project.reports.filter((report) => report.status === 'pending').length, 2);
  for (const report of project.reports) {
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
  assert.equal(messages.length, 6);
  for (const report of project.reports) {
    const message = messages.find((entry) => entry.id === report.sourceMessageId);
    assert.ok(message);
    assert.equal(message.status, 'processed');
    assert.equal(message.reportId, report.id);
    assert.equal(message.kind, 'progress');
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

test('new VO and unclear messages remain separate from progress until explicit processing', () => {
  const { project } = createDrawingProgressDemo(seedWorkspace(), now);
  const before = structuredClone(project);
  const voMessage = project.whatsappMessages.find((message) => message.id === `${project.id}-MAP-WA-005`);
  const unclearMessage = project.whatsappMessages.find((message) => message.id === `${project.id}-MAP-WA-006`);
  assert.equal(voMessage.kind, 'vo');
  assert.equal(voMessage.status, 'new');
  assert.equal(voMessage.area, 'Area A2');
  assert.equal(voMessage.photo, '/assets/demo-platform.jpg');
  assert.equal(unclearMessage.kind, 'clarification');
  assert.equal(unclearMessage.status, 'new');
  assert.equal(unclearMessage.area, 'Area B1');
  assert.equal(unclearMessage.photo, '/assets/demo-scaffold.jpg');
  for (const message of [voMessage, unclearMessage]) {
    assert.equal(message.reportId, undefined);
    assert.match(message.photoAlt, /not project evidence/);
    assert.ok(message.text.includes(project.code));
    assert.ok(Date.parse(message.date) <= now.getTime());
    assert.ok(!project.reports.some((report) => report.sourceMessageId === message.id));
  }
  assert.deepEqual(getVOCases(project), []);
  assert.equal(project.reports.length, 4);
  assert.deepEqual(project.claimDrafts, []);
  const vo = processWhatsAppMessage(project, voMessage.id);
  assert.equal(vo.outcome, 'processed');
  assert.equal(vo.project.reports.length, 5);
  assert.equal(getVOCases(vo.project).length, 1);
  assert.equal(getVOCases(vo.project)[0].status, 'flagged');
  assert.deepEqual(vo.project.items, before.items);
  assert.deepEqual(vo.project.claimDrafts, []);
  assert.deepEqual(vo.project.baselines, before.baselines);
  const clarification = processWhatsAppMessage(project, unclearMessage.id);
  assert.equal(clarification.outcome, 'clarification');
  assert.deepEqual(clarification.project.reports, before.reports);
  assert.deepEqual(clarification.project.items, before.items);
  assert.deepEqual(getVOCases(clarification.project), []);
  assert.equal(clarification.project.whatsappMessages.find((message) => message.id === unclearMessage.id).status, 'clarification');
  assert.deepEqual(project, before);
});
