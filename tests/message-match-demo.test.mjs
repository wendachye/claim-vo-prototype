import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { seedWorkspace, loadWorkspace, resetProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { getAreaLinkStatus } from '../src/data/drawing-mapping.ts';

const now = new Date('2026-10-12T10:00:00Z');

test('match-review demo is independent and offers a correct, mistaken and genuinely ambiguous mock suggestion', () => {
  const workspace = seedWorkspace(), before = structuredClone(workspace);
  const created = createMessageMatchDemo(workspace, now);
  assert.equal(created.outcome, 'updated', created.error);
  const project = created.project;
  assert.deepEqual(workspace, before);
  assert.deepEqual(created.workspace.projects.slice(0, -1), before.projects);
  assert.equal(created.workspace.activeProjectId, project.id);
  assert.equal(project.name, 'Message match review (Demo)');
  assert.equal(project.locked, true);
  assert.deepEqual(project.reports, []);
  assert.deepEqual(project.claimDrafts, []);
  assert.deepEqual(project.messageClarifications, []);
  assert.deepEqual(project.items.map(item => [item.reported, item.verified]), project.items.map(() => [0, 0]));
  assert.deepEqual(project.drawingMapping.areas.map(area => area.workItemQuantities['WI-001']), [720, 480]);
  const [correct, mistaken, ambiguous] = project.whatsappMessages;
  const west = project.drawingMapping.areas.find(area => area.code === 'WEST');
  for (const message of project.whatsappMessages) {
    assert.equal(message.kind, 'progress');
    assert.equal(message.status, 'new');
    assert.equal(message.projectId, project.id);
    assert.equal(message.projectCode, project.code);
    assert.equal(message.demo, true);
    assert.equal(message.origin, 'simulated');
    assert.equal(message.channel, 'whatsapp-mock');
    assert.equal(message.completionBasis, 'cumulative');
    assert.ok(Number.isFinite(Date.parse(message.date)));
    assert.doesNotMatch(message.text, /WI-\d|COMPLETE=|\|/);
    assert.ok(message.text.includes(message.matchSuggestion.sourceExcerpt));
    assert.equal(message.matchSuggestion.baselineVersion, project.version);
    assert.equal(message.matchSuggestion.origin, 'mock');
    assert.ok(existsSync(new URL(`../public${message.photo}`, import.meta.url)));
    assert.match(message.photoAlt, /Generated/);
  }
  assert.equal(new Set(project.whatsappMessages.map(message => message.photo)).size, 3);
  assert.deepEqual(correct.matchSuggestion.fields, { itemId: 'WI-001', areaId: west.id, completion: 50 });
  assert.equal(getAreaLinkStatus(project, correct).area.code, 'WEST');
  assert.equal(mistaken.itemId, 'WI-001');
  assert.equal(mistaken.area, 'East wall');
  assert.equal(getAreaLinkStatus(project, mistaken).area.code, 'EAST');
  assert.deepEqual(mistaken.matchSuggestion.fields, { itemId: 'WI-002', areaId: west.id, completion: 25 });
  assert.equal(getAreaLinkStatus(project, ambiguous).ambiguous, true);
  assert.deepEqual(new Set(getAreaLinkStatus(project, ambiguous).candidates.map(area => area.code)), new Set(['WEST', 'EAST']));
});

test('reopening, reloading and resetting the demo keeps its own immutable source seed and existing saved claims', () => {
  const workspace = seedWorkspace();
  const paid = createClaimExamplesDemo({ code: 'PAID-DEMO' }, now);
  workspace.projects.push(paid);
  const before = structuredClone(workspace);
  const csv = paid.claimDrafts.map(draft => toClaimCSV(buildClaimPack(paid, draft.id).pack));
  const first = createMessageMatchDemo(workspace, now);
  assert.equal(first.outcome, 'updated');
  const second = createMessageMatchDemo(first.workspace, now);
  assert.equal(second.outcome, 'updated');
  assert.notEqual(first.project.id, second.project.id);
  assert.notEqual(first.project.whatsappMessages[0].id, second.project.whatsappMessages[0].id);
  assert.deepEqual(second.workspace.projects.slice(0, before.projects.length), before.projects);
  const store = new Map([[WORKSPACE_STORE, JSON.stringify(second.workspace)]]);
  const loaded = loadWorkspace({ getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) });
  const restored = loaded.projects.find(project => project.id === first.project.id);
  assert.deepEqual(restored.whatsappMessages, first.project.whatsappMessages);
  assert.deepEqual(restored.drawingMapping, first.project.drawingMapping);
  const reset = resetProject({ ...restored, whatsappMessages: restored.whatsappMessages.map(message => ({ ...message, status: 'processed' })),
    reports: [{ id: 'TEMP-REPORT', projectId: restored.id, itemId: 'WI-001', status: 'pending', completion: 50 }] });
  assert.deepEqual(reset.whatsappMessages, first.project.whatsappMessages);
  assert.deepEqual(reset.drawingMapping, first.project.drawingMapping);
  assert.deepEqual(reset.reports, []);
  assert.equal(reset.locked, true);
  const unchanged = loaded.projects.find(project => project.id === paid.id);
  assert.deepEqual(unchanged.claimDrafts, paid.claimDrafts);
  assert.deepEqual(unchanged.claimTracking, paid.claimTracking);
  assert.deepEqual(unchanged.claimDrafts.map(draft => toClaimCSV(buildClaimPack(unchanged, draft.id).pack)), csv);
  assert.deepEqual(workspace, before);
});

test('an invalid showcase date leaves the entire existing workspace unchanged', () => {
  const workspace = seedWorkspace(), before = structuredClone(workspace);
  const result = createMessageMatchDemo(workspace, new Date('invalid'));
  assert.equal(result.outcome, 'invalid');
  assert.equal(result.workspace, workspace);
  assert.deepEqual(workspace, before);
});
