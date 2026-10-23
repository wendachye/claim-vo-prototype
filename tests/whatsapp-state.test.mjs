import assert from 'node:assert/strict';
import test from 'node:test';
import { createProject, loadWorkspace, resetProject, seedWorkspace, updateProjectState, WORKSPACE_STORE, LEGACY_STORE } from '../src/data/projects.ts';
import { getWhatsAppMessages, processWhatsAppMessage } from '../src/data/whatsapp.ts';

const sit = () => seedWorkspace().projects[0];
const store = (values = {}) => {
  const entries = new Map(Object.entries(values));
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
};

test('mock inbox seeds are project-specific, independent and absent from empty projects', () => {
  const workspace = seedWorkspace();
  const [first, other] = workspace.projects;
  assert.equal(first.whatsappMessages.length, 4);
  assert.equal(other.whatsappMessages.length, 4);
  assert.ok(first.whatsappMessages.every((message) => message.projectId === 'SIT01' && message.text.includes('SIT01')));
  assert.ok(other.whatsappMessages.every((message) => message.projectId === 'WH02' && message.text.includes('WH02')));
  assert.equal(other.whatsappMessages[2].itemId, 'WI-003');
  first.whatsappMessages[0].text = 'changed';
  assert.notEqual(first.seed.whatsappMessages[0].text, 'changed');
  assert.notEqual(seedWorkspace().projects[0].whatsappMessages[0].text, 'changed');
  assert.deepEqual(createProject({ name: 'Empty', code: 'NEW' }).whatsappMessages, []);
});

test('processing sets cumulative reported progress once, retains photos and leaves verification unchanged', () => {
  const before = sit();
  const snapshot = structuredClone(before);
  const result = processWhatsAppMessage(before, 'SIT01-WA-001');
  assert.equal(result.outcome, 'processed');
  assert.equal(result.project.items[0].reported, 65);
  assert.equal(result.project.items[0].verified, 25);
  assert.equal(result.project.locked, false);
  assert.equal(result.project.reports.length, before.reports.length + 1);
  const report = result.project.reports.find((entry) => entry.id === result.reportId);
  assert.equal(report.status, 'pending');
  assert.equal(report.completion, 65);
  assert.equal(report.completionBasis, 'cumulative');
  assert.equal(report.photo, '/assets/demo-scaffold.jpg');
  assert.equal(report.sourceMessageId, 'SIT01-WA-001');
  assert.equal(report.demo, true);
  const prior = result.project.reports.find((entry) => entry.id === before.reports[0].id);
  assert.equal(prior.status, 'superseded');
  assert.equal(prior.message, before.reports[0].message);
  assert.equal(prior.completion, 50);
  assert.equal(prior.supersededByReportId, result.reportId);
  assert.deepEqual(result.project.reports.find((entry) => entry.vo), before.reports.find((entry) => entry.vo));
  assert.deepEqual(before, snapshot);
  const replay = processWhatsAppMessage(result.project, 'SIT01-WA-001');
  assert.equal(replay.outcome, 'duplicate');
  assert.equal(replay.project, result.project);
  assert.equal(replay.reportId, result.reportId);
  assert.equal(replay.project.items[0].reported, 65);
});

test('a processed VO adds a review flag and preserves every progress and financial field', () => {
  const before = sit();
  const result = processWhatsAppMessage(before, 'SIT01-WA-002');
  assert.equal(result.outcome, 'processed');
  assert.deepEqual(result.project.items, before.items);
  assert.deepEqual(result.project.contract, before.contract);
  assert.deepEqual(result.project.reports.slice(0, -1), before.reports);
  const report = result.project.reports.at(-1);
  assert.equal(report.vo, true);
  assert.equal(report.status, 'needsReview');
  assert.equal(report.itemId, null);
  assert.equal(report.completion, null);
  assert.equal(report.photo, '/assets/demo-platform.jpg');
  assert.equal(processWhatsAppMessage(result.project, 'SIT01-WA-002').outcome, 'duplicate');
});

test('ambiguous messages and stale messages require clarification without changing the register', () => {
  const before = sit();
  const ambiguous = processWhatsAppMessage(before, 'SIT01-WA-004');
  assert.equal(ambiguous.outcome, 'clarification');
  assert.equal(ambiguous.project.whatsappMessages[3].status, 'clarification');
  assert.deepEqual(ambiguous.project.items, before.items);
  assert.deepEqual(ambiguous.project.reports, before.reports);
  assert.equal(processWhatsAppMessage(ambiguous.project, 'SIT01-WA-004').outcome, 'duplicate');

  const newer = { ...before, reports: [...before.reports, {
    id: 'NEWER', itemId: 'WI-001', date: '2026-10-22T09:00:00+08:00',
    status: 'verified', completion: 90, vo: false,
  }] };
  const stale = processWhatsAppMessage(newer, 'SIT01-WA-001');
  assert.equal(stale.outcome, 'clarification');
  assert.match(stale.project.whatsappMessages[0].processingNote, /newer site report/);
  assert.deepEqual(stale.project.items, newer.items);
  assert.deepEqual(stale.project.reports, newer.reports);
});

test('processing rejects invalid percentages and unmatched items without inventing progress', () => {
  for (const changes of [{ completion: 101 }, { completion: -1 }, { completion: null }, { completion: '65' }, { itemId: 'missing' }, { completionBasis: 'incremental' }]) {
    const project = sit();
    Object.assign(project.whatsappMessages[0], changes);
    const result = processWhatsAppMessage(project, 'SIT01-WA-001');
    assert.equal(result.outcome, 'clarification');
    assert.deepEqual(result.project.items, project.items);
    assert.deepEqual(result.project.reports, project.reports);
  }
});

test('foreign message IDs cannot modify another project with overlapping item IDs', () => {
  const before = seedWorkspace();
  const other = structuredClone(before.projects[1]);
  const missing = processWhatsAppMessage(before.projects[1], 'SIT01-WA-001');
  assert.equal(missing.outcome, 'invalid');
  assert.equal(missing.project, before.projects[1]);
  const changed = updateProjectState(before, 'SIT01', (project) => processWhatsAppMessage(project, 'SIT01-WA-001').project);
  assert.equal(changed.projects[0].items[0].reported, 65);
  assert.deepEqual(changed.projects[1], other);
  assert.equal(before.projects[0].items[0].reported, 50);
});

test('processed queue and review decisions survive reload and remain idempotent', () => {
  const before = seedWorkspace();
  const processed = updateProjectState(before, 'SIT01', (project) => processWhatsAppMessage(project, 'SIT01-WA-001').project);
  processed.projects[0].items[0].verified = 65;
  processed.projects[0].reports.at(-1).status = 'verified';
  const loaded = loadWorkspace(store({ [WORKSPACE_STORE]: JSON.stringify(processed) }));
  assert.deepEqual(loaded.projects[0], processed.projects[0]);
  assert.equal(processWhatsAppMessage(loaded.projects[0], 'SIT01-WA-001').outcome, 'duplicate');
  assert.equal(loaded.projects[0].seed.whatsappMessages[0].status, 'new');
});

test('old v2 migration adds the inbox while retaining contract edits, reports and seed', () => {
  const saved = seedWorkspace();
  delete saved.projects[0].whatsappMessages;
  delete saved.projects[0].seed.whatsappMessages;
  saved.projects[0].items[0].description = 'Retained correction';
  saved.projects[0].items[0].verified = 41;
  saved.projects[0].history = [{ id: 'KEEP', action: 'Retain' }];
  saved.projects[0].locked = true;
  saved.projects[0].version = 3;
  const loaded = loadWorkspace(store({ [WORKSPACE_STORE]: JSON.stringify(saved) }));
  assert.equal(loaded.projects[0].items[0].description, 'Retained correction');
  assert.equal(loaded.projects[0].items[0].verified, 41);
  assert.deepEqual(loaded.projects[0].reports, saved.projects[0].reports);
  assert.deepEqual(loaded.projects[0].history, saved.projects[0].history);
  assert.equal(loaded.projects[0].version, 3);
  assert.equal(loaded.projects[0].locked, true);
  assert.equal(loaded.projects[0].whatsappMessages.length, 4);
  assert.equal(loaded.projects[0].seed.whatsappMessages.length, 4);
});

test('reset restores the queue for both old and new seeds without resetting another project', () => {
  for (const oldSeed of [false, true]) {
    const workspace = seedWorkspace();
    if (oldSeed) delete workspace.projects[0].seed.whatsappMessages;
    workspace.projects[0] = processWhatsAppMessage(workspace.projects[0], 'SIT01-WA-001').project;
    const other = structuredClone(workspace.projects[1]);
    const reset = updateProjectState(workspace, 'SIT01', resetProject);
    assert.ok(reset.projects[0].whatsappMessages.every((message) => message.status === 'new'));
    assert.ok(reset.projects[0].seed.whatsappMessages.every((message) => message.status === 'new'));
    assert.equal(reset.projects[0].items[0].reported, 50);
    assert.equal(reset.projects[0].items[0].verified, 25);
    assert.deepEqual(reset.projects[1], other);
  }
});

test('v1 migration preserves legacy bytes and adds only usable demo messages', () => {
  const original = sit();
  const legacy = { items: original.items, reports: original.reports, history: [{ id: 'KEEP' }], version: 2 };
  const bytes = JSON.stringify(legacy);
  const storage = store({ [LEGACY_STORE]: bytes });
  const loaded = loadWorkspace(storage);
  assert.deepEqual(loaded.projects[0].items, original.items);
  assert.deepEqual(loaded.projects[0].reports, original.reports);
  assert.equal(getWhatsAppMessages(loaded.projects[0]).length, 4);
  assert.equal(storage.getItem(LEGACY_STORE), bytes);
  const empty = loadWorkspace(store({ [LEGACY_STORE]: JSON.stringify({ items: [], reports: [], history: [] }) }));
  assert.deepEqual(empty.projects[0].whatsappMessages, []);
});
