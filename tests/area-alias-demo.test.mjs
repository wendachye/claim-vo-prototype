import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorkspace, resetProject, loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createAreaAliasDemo } from '../src/data/area-alias-demo.ts';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { getAreaMatchForMessage } from '../src/data/drawing-mapping.ts';
import { getItemAreaRollup } from '../src/data/area-allocations.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';

const now = new Date('2026-10-10T10:00:00+08:00');
const create = workspace => {
  const result = createAreaAliasDemo(workspace, now);
  assert.equal(result.outcome, 'updated', result.error);
  return result;
};

test('independent alternate-name demo preserves existing projects, paid claims and exports', () => {
  const workspace = seedWorkspace();
  workspace.projects.push(createClaimExamplesDemo({ code: 'EXISTING-CLAIMS' }, now));
  const before = structuredClone(workspace);
  const existing = workspace.projects.at(-1);
  const csv = existing.claimDrafts.map(draft => toClaimCSV(buildClaimPack(existing, draft.id).pack));
  const result = create(workspace), project = result.project;
  assert.deepEqual(workspace, before);
  assert.deepEqual(result.workspace.projects.slice(0, -1), before.projects);
  assert.equal(result.workspace.activeProjectId, project.id);
  assert.equal(project.name, 'Area name matching (Demo)');
  assert.deepEqual(project.drawingMapping.areas.map(area => area.workItemQuantities['WI-001']), [720, 480]);
  assert.deepEqual(project.reports, []);
  assert.deepEqual(project.claimDrafts, []);
  assert.deepEqual(project.whatsappMessages.map(message => [message.area, message.completion]), [
    ['West façade', 50], ['East wall', 25], ['Wall frontage', 75],
  ]);
  assert.equal(new Set(project.whatsappMessages.map(message => message.id)).size, 3);
  assert.ok(project.whatsappMessages.every(message => !Object.hasOwn(message, 'areaId') && !Object.hasOwn(message, 'areaProgress') && !Object.hasOwn(message, 'areaMapping')));
  assert.ok(project.whatsappMessages.every(message => message.photoAlt.includes('Generated')));
  assert.equal(getAreaMatchForMessage(project, project.whatsappMessages[0]).area.code, 'WEST');
  assert.equal(getAreaMatchForMessage(project, project.whatsappMessages[1]).area.code, 'EAST');
  assert.equal(getAreaMatchForMessage(project, project.whatsappMessages[2]).status, 'ambiguous');
  assert.equal(getItemAreaRollup(project, 'WI-001', 'reported').knownCount, 0);
  const second = create(result.workspace);
  assert.notEqual(second.project.id, project.id);
  assert.deepEqual(existing.claimDrafts.map(draft => toClaimCSV(buildClaimPack(existing, draft.id).pack)), csv);
});

test('name matching demo reloads and resets to its own aliases and fresh inbox without changing another project', () => {
  const { project, workspace } = create(seedWorkspace());
  const processed = processWhatsAppMessage(project, project.whatsappMessages[0].id);
  assert.equal(processed.outcome, 'processed', processed.error);
  assert.equal(getItemAreaRollup(processed.project, 'WI-001', 'reported').completion, 30);
  const stored = { ...workspace, projects: workspace.projects.map(entry => entry.id === project.id ? processed.project : entry) };
  const values = new Map([[WORKSPACE_STORE, JSON.stringify(stored)]]);
  const loaded = loadWorkspace({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) });
  const retained = loaded.projects.find(entry => entry.id === project.id);
  assert.deepEqual(retained.drawingMapping, processed.project.drawingMapping);
  assert.equal(getItemAreaRollup(retained, 'WI-001', 'reported').completion, 30);
  const reset = resetProject(retained);
  assert.deepEqual(reset.drawingMapping, project.drawingMapping);
  assert.deepEqual(reset.whatsappMessages, project.whatsappMessages);
  assert.deepEqual(reset.reports, []);
  assert.equal(reset.lockedAt, project.lockedAt);
  assert.deepEqual(workspace.projects.slice(0, -1), seedWorkspace().projects);
});

test('trying the shared name asks for clarification while keeping original evidence and physical totals unchanged', () => {
  const { project } = create(seedWorkspace());
  const original = structuredClone(project.whatsappMessages[2]);
  const result = processWhatsAppMessage(project, original.id);
  assert.equal(result.outcome, 'clarification');
  assert.deepEqual(result.project.reports, project.reports);
  assert.deepEqual(result.project.items, project.items);
  assert.deepEqual(result.project.claimDrafts, project.claimDrafts);
  const retained = result.project.whatsappMessages.find(message => message.id === original.id);
  for (const field of ['text', 'photo', 'photoAlt', 'sender', 'date', 'area', 'completion']) assert.equal(retained[field], original[field]);
  assert.match(retained.processingNote, /WEST and EAST/);
  assert.equal(retained.status, 'clarification');
  assert.equal(getItemAreaRollup(result.project, 'WI-001', 'reported').knownCount, 0);
});
