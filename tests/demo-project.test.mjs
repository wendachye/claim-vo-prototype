import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoProject } from '../src/data/demo-project.ts';
import { createProject, loadWorkspace, resetProject, seedWorkspace, updateProjectState, WORKSPACE_STORE } from '../src/data/projects.ts';
import { buildClaimReview } from '../src/data/claims.ts';
import { getWhatsAppMessages, processWhatsAppMessage } from '../src/data/whatsapp.ts';

const now = new Date('2026-10-21T13:00:00Z');
const mock = (code = 'DEMO01') => createDemoProject({ name: 'Workflow walkthrough (Demo)', code, country: 'Singapore' }, now);

test('a mock project starts with an independent fictional contract and no invented completed work', () => {
  const project = mock();
  assert.equal(project.id, 'DEMO01');
  assert.equal(project.code, 'DEMO01');
  assert.equal(project.contract.id, 'DEMO01');
  assert.equal(project.contract.name, project.name);
  assert.equal(project.contract.reference, 'DEMO01-DEMO-SCHEDULE');
  assert.equal(project.contract.currency, 'SGD');
  assert.equal(project.contract.sourceKind, 'illustrative');
  assert.equal(project.contract.sourceFile, null);
  assert.equal(project.items.length, 6);
  assert.equal(project.sourceItems[0].quantity, 1200);
  assert.equal(project.sourceItems[0].amount, 33600);
  assert.equal(project.items[0].needsReview, true);
  assert.equal(project.items[0].rawExtractedQuantity, 1320);
  assert.equal(project.items.filter((item) => item.needsReview).length, 1);
  assert.ok(project.items.every((item) => item.reported === 0 && item.verified === 0));
  assert.equal(project.locked, false);
  assert.equal(project.version, 1);
  for (const field of ['reports', 'history', 'baselines', 'voReviews', 'claimDrafts']) assert.deepEqual(project[field], []);
  assert.equal(buildClaimReview(project, '2026-10', {}).canPrepare, false);
  assert.deepEqual(createProject({ name: 'Empty', code: 'EMPTY' }).items, []);
  assert.equal(createDemoProject({ name: 'Malaysia mock', code: 'MYDEMO', country: 'Malaysia', subcontractor: 'Example team' }, now).contract.currency, 'MYR');
  assert.equal(createDemoProject({ name: 'Malaysia mock', code: 'MYDEMO', country: 'Malaysia', subcontractor: 'Example team' }, now).contract.subcontractor, 'Example team');
});

test('custom project messages process cumulatively and cannot modify other projects', () => {
  const project = mock();
  const workspace = seedWorkspace();
  const before = structuredClone(workspace.projects);
  workspace.projects.push(project);
  const messages = getWhatsAppMessages(project);
  assert.equal(messages.length, 4);
  assert.ok(messages.every((message) => message.projectId === project.id && message.projectCode === project.code
    && message.id.startsWith(`${project.id}-WA-`) && message.text.includes(project.code) && !message.text.includes('WH02') && message.status === 'new'));
  const changed = updateProjectState(workspace, project.id, (current) => processWhatsAppMessage(current, 'DEMO01-WA-001').project);
  assert.deepEqual(changed.projects.slice(0, 2), before);
  const updated = changed.projects[2];
  assert.equal(updated.items[0].reported, 65);
  assert.equal(updated.items[0].verified, 0);
  assert.equal(updated.reports[0].sourceMessageId, 'DEMO01-WA-001');
  assert.equal(updated.reports[0].projectId, project.id);
  assert.equal(processWhatsAppMessage(updated, 'DEMO01-WA-001').outcome, 'duplicate');
  assert.equal(processWhatsAppMessage(project, 'WH02-WA-001').outcome, 'invalid');
  const extra = processWhatsAppMessage(updated, 'DEMO01-WA-002');
  assert.equal(extra.outcome, 'processed');
  assert.equal(extra.project.reports.at(-1).vo, true);
  assert.deepEqual(extra.project.items, updated.items);
  assert.equal(extra.project.contract.totalAmount, project.contract.totalAmount);
});

test('mock message dates follow the current Kuala Lumpur day and claim month cutoff', () => {
  const project = createDemoProject({ name: 'Month boundary demo', code: 'BOUNDARY', country: 'Singapore' }, new Date('2026-10-31T17:30:00Z'));
  const messages = getWhatsAppMessages(project);
  assert.equal(project.contract.date, '2026-11-01');
  assert.equal(messages[0].date, '2026-11-01T09:15:00+08:00');
  assert.equal(messages[3].date, '2026-11-01T10:05:00+08:00');
  const october = buildClaimReview(project, '2026-10', {});
  const november = buildClaimReview(project, '2026-11', {});
  assert.ok(messages.every((message) => Date.parse(message.date) > Date.parse(october.cutoff)
    && Date.parse(message.date) <= Date.parse(november.cutoff)));
});

test('reset and reload retain the independent mock seed without resetting an existing project', () => {
  const project = mock();
  const another = mock('DEMO02');
  const seed = structuredClone(project.seed);
  project.items[0].quantity = 999;
  project.sourceItems[0].description = 'Changed only in this object';
  project.whatsappMessages[0].text = 'Changed only in this object';
  const reset = resetProject(project);
  assert.deepEqual(reset.items, seed.items);
  assert.deepEqual(reset.sourceItems, seed.sourceItems);
  assert.deepEqual(reset.whatsappMessages, seed.whatsappMessages);
  assert.equal(reset.name, project.name);
  assert.equal(another.items[0].quantity, 1200);
  assert.notEqual(another.whatsappMessages[0].text, project.whatsappMessages[0].text);
  assert.equal(seedWorkspace().projects[1].items[0].quantity, 1200);
  const workspace = seedWorkspace();
  const originalProjects = structuredClone(workspace.projects);
  workspace.projects.push(reset);
  workspace.activeProjectId = reset.id;
  const entries = new Map([[WORKSPACE_STORE, JSON.stringify(workspace)]]);
  const loaded = loadWorkspace({ getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  assert.equal(loaded.activeProjectId, 'DEMO01');
  assert.deepEqual(loaded.projects.slice(0, 2), originalProjects);
  assert.deepEqual(loaded.projects[2].seed.whatsappMessages, seed.whatsappMessages);
  assert.deepEqual(getWhatsAppMessages(loaded.projects[2]), seed.whatsappMessages);
});
