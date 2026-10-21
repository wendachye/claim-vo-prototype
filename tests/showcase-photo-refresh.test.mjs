import assert from 'node:assert/strict';
import test from 'node:test';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.js';
import { loadWorkspace, seedWorkspace, WORKSPACE_STORE } from '../src/data/projects.js';
import { createProvidedContractDemo, createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { buildClaimReview, markClaimPrepared, saveClaimDraft } from '../src/data/claims.js';

const now = new Date('2026-10-21T13:00:00Z');
const genericAlt = 'Generated construction illustration used as a demo site photo; not project evidence.';
const clone = (value) => structuredClone(value);

function memoryStorage(workspace, writable = true) {
  const entries = new Map(workspace ? [[WORKSPACE_STORE, JSON.stringify(workspace)]] : []);
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem(key, value) {
      if (!writable) throw new Error('Storage quota exceeded');
      entries.set(key, String(value));
    },
  };
}

function legacyProject(code = 'SIT-AUTOPHOTO') {
  let project = createSITContractDemo({ code, name: 'Saved S.I.T. walkthrough' }, now);
  const prepared = markClaimPrepared(project, project.claimDrafts[0].id);
  assert.equal(prepared.outcome, 'updated');
  project = prepared.project;
  project.whatsappMessages = project.whatsappMessages.map(({ demoPhotoHistory, ...message }) => ({
    ...message, photo: message.kind === 'vo' ? '/assets/demo-platform.jpg' : '/assets/demo-scaffold.jpg', photoAlt: genericAlt,
  }));
  project.reports = project.reports.map(({ demoPhotoHistory, ...report }) => {
    const message = project.whatsappMessages.find((entry) => entry.id === report.sourceMessageId);
    return { ...report, photo: message.photo, photoAlt: message.photoAlt };
  });
  return project;
}

function workspaceWith(...projects) {
  const base = seedWorkspace();
  return {
    ...base, activeProjectId: 'WH02', projects: [...base.projects, ...projects],
    sitShowcase: { version: 1, projectId: projects[0].id },
  };
}

const withoutPhoto = ({ photo, photoAlt, demoPhotoHistory, ...record }) => record;
const savedProject = (workspace, id) => workspace.projects.find((project) => project.id === id);

test('loading a saved showcase replaces repeated demo images without changing the prepared claim or progress', () => {
  const project = legacyProject();
  project.items[0].quantity = 2999;
  project.items[0].rate = 20;
  project.reports[0].customMetadata = { retain: true };
  const workspace = workspaceWith(project);
  // Compare against the existing loader's normalized state, so this assertion
  // isolates the photo upgrade from longstanding workspace normalization.
  const expected = savedProject(loadWorkspace(memoryStorage(workspace)), project.id);
  const storage = memoryStorage(workspace);
  const loadedWorkspace = loadShowcaseWorkspace(storage, now);
  const loaded = savedProject(loadedWorkspace, project.id);
  assert.equal(new Set(loaded.whatsappMessages.map((message) => message.photo)).size, 18);
  assert.equal(loadedWorkspace.activeProjectId, 'WH02');
  for (const [field, value] of Object.entries(expected)) {
    if (!['whatsappMessages', 'reports', 'history'].includes(field)) assert.deepEqual(loaded[field], value, field);
  }
  for (const field of ['whatsappMessages', 'reports']) {
    assert.deepEqual(loaded[field].map(withoutPhoto), expected[field].map(withoutPhoto), field);
    loaded[field].forEach((record, index) => {
      assert.equal(record.demoPhotoHistory.at(-1).photo, expected[field][index].photo);
      assert.equal(record.demoPhotoHistory.at(-1).photoAlt, expected[field][index].photoAlt);
    });
  }
  for (const report of loaded.reports) {
    const message = loaded.whatsappMessages.find((entry) => entry.id === report.sourceMessageId);
    assert.equal(report.photo, message.photo);
    assert.equal(report.photoAlt, message.photoAlt);
  }
  assert.equal(loaded.claimDrafts[0].status, 'prepared');
  assert.equal(loaded.claimDrafts[0].snapshot.totals.currentValue, 15894);
  assert.deepEqual(loaded.history.slice(-expected.history.length), expected.history);
  assert.deepEqual(JSON.parse(storage.getItem(WORKSPACE_STORE)), loadedWorkspace);
});

test('all saved original S.I.T. demos are refreshed, including inactive projects, with unrelated projects preserved', () => {
  const first = legacyProject('SIT-AUTO01'), second = legacyProject('SIT-AUTO02');
  const fictional = createProvidedContractDemo({ code: 'CAMPUS-AUTO', name: 'Fictional campus' }, now);
  const workspace = workspaceWith(first, second, fictional);
  const expected = loadWorkspace(memoryStorage(workspace));
  const loaded = loadShowcaseWorkspace(memoryStorage(workspace), now);
  assert.equal(loaded.activeProjectId, 'WH02');
  assert.equal(loaded.projects.length, expected.projects.length);
  for (const project of [first, second]) {
    assert.equal(new Set(savedProject(loaded, project.id).whatsappMessages.map((message) => message.photo)).size, 18);
  }
  for (const project of expected.projects.filter((entry) => ![first.id, second.id].includes(entry.id))) {
    assert.deepEqual(savedProject(loaded, project.id), project);
  }
});

test('automatic refresh retains uploaded, unknown, mismatched and edited-scope evidence', () => {
  const project = legacyProject();
  const uploaded = project.whatsappMessages[0];
  uploaded.photo = 'data:image/jpeg;base64,USERATTACHMENT';
  uploaded.photoAlt = 'Uploaded site photo';
  const uploadedReport = project.reports.find((report) => report.sourceMessageId === uploaded.id);
  const mismatchedReport = project.reports.find((report) => report.sourceMessageId.endsWith('CASE-WA-002'));
  mismatchedReport.message = 'Corrected original observation';
  project.items.find((item) => item.id === 'WI-003').description = 'User corrected scope';
  const editedScope = project.whatsappMessages.find((message) => message.id.endsWith('W3-ST36-PROGRESS'));
  const unknown = { ...clone(project.whatsappMessages[4]), id: `${project.id}-USER-MESSAGE` };
  delete unknown.reportId;
  project.whatsappMessages.push(unknown);
  const before = clone(project);
  const loaded = savedProject(loadShowcaseWorkspace(memoryStorage(workspaceWith(project)), now), project.id);
  for (const id of [uploaded.id, editedScope.id, unknown.id, mismatchedReport.sourceMessageId]) {
    assert.deepEqual(loaded.whatsappMessages.find((message) => message.id === id), before.whatsappMessages.find((message) => message.id === id));
  }
  for (const id of [uploadedReport.id, mismatchedReport.id]) {
    assert.deepEqual(loaded.reports.find((report) => report.id === id), before.reports.find((report) => report.id === id));
  }
  assert.notEqual(loaded.whatsappMessages.find((message) => message.id.endsWith('CASE-WA-003')).photo,
    before.whatsappMessages.find((message) => message.id.endsWith('CASE-WA-003')).photo);
  assert.deepEqual(loaded.claimDrafts, before.claimDrafts);
});

test('edited message bodies retain their photos even when the prefix and paired report still match', () => {
  const project = legacyProject();
  const pairedMessage = project.whatsappMessages.find((message) => message.id.endsWith('CASE-WA-003'));
  const pairedReport = project.reports.find((report) => report.sourceMessageId === pairedMessage.id);
  const unprocessedMessage = project.whatsappMessages.find((message) => message.id.endsWith('W5-NORTH-PROGRESS'));
  for (const message of [pairedMessage, unprocessedMessage]) {
    assert.equal(project.seed.whatsappMessages.find((entry) => entry.id === message.id).text, message.text);
    message.text += '\nWorker correction: the attached image relates to the revised observation.';
    assert.ok(message.text.startsWith(`${project.code} |`));
  }
  pairedReport.message = pairedMessage.text;
  assert.equal(unprocessedMessage.status, 'new');
  const before = clone(project);
  const loaded = savedProject(loadShowcaseWorkspace(memoryStorage(workspaceWith(project)), now), project.id);
  for (const message of [pairedMessage, unprocessedMessage]) {
    assert.deepEqual(loaded.whatsappMessages.find((entry) => entry.id === message.id),
      before.whatsappMessages.find((entry) => entry.id === message.id));
  }
  assert.deepEqual(loaded.reports.find((entry) => entry.id === pairedReport.id), pairedReport);
  assert.notEqual(loaded.whatsappMessages.find((message) => message.id.endsWith('CASE-WA-004')).photo,
    before.whatsappMessages.find((message) => message.id.endsWith('CASE-WA-004')).photo);
});

test('photo refresh preserves a saved draft and its totals while requiring a new revision for changed evidence', () => {
  let project = legacyProject('SIT-AUTO-DRAFT');
  // Save a current assessment with the old photos, representing a genuine
  // older browser draft rather than a snapshot already stale before loading.
  const previous = project.claimDrafts.at(-1);
  const saved = saveClaimDraft(project, previous.period, previous.assessment);
  assert.equal(saved.outcome, 'updated');
  project = saved.project;
  const draft = project.claimDrafts.at(-1);
  const beforeReview = buildClaimReview(project, draft.period, draft.assessment);
  assert.deepEqual(beforeReview, draft.snapshot);
  assert.equal(markClaimPrepared(project, draft.id).outcome, 'updated');
  const before = clone(project);
  const loaded = savedProject(loadShowcaseWorkspace(memoryStorage(workspaceWith(project)), now), project.id);
  const afterReview = buildClaimReview(loaded, draft.period, draft.assessment);
  assert.equal(afterReview.canPrepare, true);
  assert.deepEqual(afterReview.totals, beforeReview.totals);
  assert.deepEqual(loaded.claimDrafts, before.claimDrafts);
  const prepared = markClaimPrepared(loaded, draft.id);
  assert.equal(prepared.outcome, 'invalid');
  assert.match(prepared.error, /Source records changed.*new revision/);
  assert.deepEqual(prepared.project, loaded);
  const revised = saveClaimDraft(loaded, draft.period, draft.assessment);
  assert.equal(revised.outcome, 'updated');
  assert.equal(revised.draft.revision, draft.revision + 1);
  assert.deepEqual(revised.draft.snapshot.totals, draft.snapshot.totals);
  assert.deepEqual(revised.project.claimDrafts.slice(0, -1), before.claimDrafts);
  assert.equal(markClaimPrepared(revised.project, revised.draft.id).outcome, 'updated');
});

test('reloading does not duplicate history, photos, reports or claim revisions', () => {
  const storage = memoryStorage(workspaceWith(legacyProject()));
  const first = loadShowcaseWorkspace(storage, now);
  const second = loadShowcaseWorkspace(storage, new Date('2026-11-15T12:00:00Z'));
  assert.deepEqual(second, first);
  assert.deepEqual(JSON.parse(storage.getItem(WORKSPACE_STORE)), first);
});

test('readable storage with blocked writes still refreshes the in-memory showcase without losing saved state', () => {
  const project = legacyProject();
  const workspace = workspaceWith(project);
  const expected = savedProject(loadWorkspace(memoryStorage(workspace)), project.id);
  const storage = memoryStorage(workspace, false);
  const originalBytes = storage.getItem(WORKSPACE_STORE);
  const loaded = savedProject(loadShowcaseWorkspace(storage, now), project.id);
  assert.equal(new Set(loaded.whatsappMessages.map((message) => message.photo)).size, 18);
  assert.deepEqual(loaded.claimDrafts, expected.claimDrafts);
  assert.deepEqual(loaded.items, expected.items);
  assert.deepEqual(loaded.seed, expected.seed);
  assert.equal(storage.getItem(WORKSPACE_STORE), originalBytes);
});

test('a new visitor receives matching photos immediately and subsequent loads keep the same showcase', () => {
  const storage = memoryStorage();
  const loaded = loadShowcaseWorkspace(storage, now);
  const showcase = savedProject(loaded, loaded.sitShowcase.projectId);
  assert.equal(new Set(showcase.whatsappMessages.map((message) => message.photo)).size, 18);
  assert.equal(showcase.items[0].quantity, 2088);
  assert.equal(showcase.claimDrafts[0].snapshot.totals.currentValue, 15894);
  assert.deepEqual(loadShowcaseWorkspace(storage, new Date('2026-10-22T13:00:00Z')), loaded);
});
