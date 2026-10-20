import assert from 'node:assert/strict';
import test from 'node:test';
import { getVOCases, updateVOReview, VO_STATUS_LABELS } from '../src/data/vo.js';
import { processWhatsAppMessage } from '../src/data/whatsapp.js';
import { createProject, loadWorkspace, resetProject, seedWorkspace, updateProjectState, WORKSPACE_STORE, LEGACY_STORE } from '../src/data/projects.js';

const sit = () => seedWorkspace().projects[0];
const id = 'DEMO-REPORT-003';
const draft = {
  title: 'Additional platform', scopeAssessment: 'Additional access platform outside the baseline scaffold location.',
  instructionReference: 'Demo instruction SI-03', proposedValue: '2400', relatedItemId: 'WI-001', reviewNote: 'QS demo review',
};
const approval = { approvedValue: '2200', approvalReference: 'DEMO-APP-03', approver: 'Client QS (demo)', reviewNote: 'Recorded for prototype testing.' };
const submit = (project = sit()) => updateVOReview(project, id, 'submit', draft).project;
const store = (values = {}) => {
  const entries = new Map(Object.entries(values));
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
};

test('cases derive only from project flags and retain their original evidence', () => {
  const before = sit();
  const cases = getVOCases(before);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].id, id);
  assert.equal(cases[0].reference, 'SIT01-VO-001');
  assert.equal(cases[0].status, 'flagged');
  assert.equal(cases[0].title, 'Extra access platform');
  assert.equal(cases[0].proposedValue, null);
  assert.equal(cases[0].approvedValue, null);
  assert.equal(cases[0].report, before.reports.find((report) => report.id === id));
  assert.deepEqual(before.voReviews, []);
  assert.deepEqual(getVOCases(createProject({ name: 'Empty', code: 'NEW' })), []);
  assert.equal(VO_STATUS_LABELS.pendingApproval, 'Awaiting approval');
  const processed = processWhatsAppMessage(before, 'SIT01-WA-002').project;
  assert.equal(getVOCases(processed)[0].reference, 'SIT01-VO-001');
  assert.equal(getVOCases(processed)[1].report.photo, '/assets/demo-platform.jpg');
  assert.equal(getVOCases(processed)[1].reference, 'SIT01-VO-002');
});

test('QS draft, submission and recorded approval follow explicit transitions', () => {
  const original = sit();
  const saved = updateVOReview(original, id, 'save', draft);
  assert.equal(saved.outcome, 'updated');
  assert.equal(getVOCases(saved.project)[0].status, 'flagged');
  assert.equal(getVOCases(saved.project)[0].proposedValue, 2400);
  assert.equal(updateVOReview(saved.project, id, 'save', draft).outcome, 'unchanged');
  const pending = updateVOReview(saved.project, id, 'submit', draft);
  assert.equal(pending.outcome, 'updated');
  assert.equal(getVOCases(pending.project)[0].status, 'pendingApproval');
  assert.equal(updateVOReview(pending.project, id, 'submit', draft).outcome, 'unchanged');
  const approved = updateVOReview(pending.project, id, 'approve', approval);
  const record = getVOCases(approved.project)[0];
  assert.equal(approved.outcome, 'updated');
  assert.equal(record.status, 'approved');
  assert.equal(record.approvedValue, 2200);
  assert.equal(record.proposedValue, 2400);
  assert.equal(record.approvalReference, 'DEMO-APP-03');
  assert.equal(record.approver, 'Client QS (demo)');
  assert.deepEqual(record.history.map((event) => event.action), ['save', 'submit', 'approve']);
  assert.equal(record.history.at(-1).from, 'pendingApproval');
  assert.equal(record.history.at(-1).to, 'approved');
  assert.equal(record.history.at(-1).values.approvedValue, 2200);
  assert.equal(approved.project.reports.find((report) => report.id === id).status, 'voApproved');
  const replay = updateVOReview(approved.project, id, 'approve', approval);
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.project, approved.project);
  assert.ok(!Object.hasOwn(approved.project.voReviews[0], 'report'));
});

test('approval requires submitted review, explicit amount, reference and approver; zero is accepted', () => {
  const original = sit();
  assert.equal(updateVOReview(original, id, 'approve', approval).outcome, 'invalid');
  for (const values of [{}, { ...draft, title: '' }, { ...draft, scopeAssessment: '' }, { ...draft, instructionReference: '' }]) {
    const result = updateVOReview(original, id, 'submit', values);
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.project, original);
  }
  const pending = submit();
  for (const changes of [{ approvedValue: '' }, { approvedValue: null }, { approvedValue: '-1' }, { approvedValue: Infinity }, { approvedValue: 'invalid' }, { approvedValue: false }, { approvalReference: '' }, { approver: '' }]) {
    const result = updateVOReview(pending, id, 'approve', { ...approval, ...changes });
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.project, pending);
  }
  const zero = updateVOReview(pending, id, 'approve', { ...approval, approvedValue: '0' });
  assert.equal(zero.outcome, 'updated');
  assert.equal(getVOCases(zero.project)[0].approvedValue, 0);
  const unknown = updateVOReview(original, id, 'submit', { ...draft, proposedValue: '' });
  assert.equal(unknown.outcome, 'updated');
  assert.equal(getVOCases(unknown.project)[0].proposedValue, null);
});

test('clarification, rejection and reopening require reasons and retain prior terms in history', () => {
  const original = sit();
  for (const action of ['clarify', 'reject']) assert.equal(updateVOReview(original, id, action, { reviewNote: ' ' }).outcome, 'invalid');
  const clarified = updateVOReview(original, id, 'clarify', { reviewNote: 'Please supply a written instruction.' });
  assert.equal(getVOCases(clarified.project)[0].status, 'clarification');
  assert.equal(updateVOReview(clarified.project, id, 'clarify', { reviewNote: 'Please supply a written instruction.' }).outcome, 'unchanged');
  const pending = submit(clarified.project);
  const returned = updateVOReview(pending, id, 'clarify', { reviewNote: 'Approver requests measured quantity.', scopeAssessment: 'Must not overwrite submitted assessment' });
  assert.equal(getVOCases(returned.project)[0].status, 'clarification');
  assert.equal(getVOCases(returned.project)[0].scopeAssessment, draft.scopeAssessment);
  const resubmitted = submit(returned.project);
  const approved = updateVOReview(resubmitted, id, 'approve', approval).project;
  assert.equal(updateVOReview(approved, id, 'save', { title: 'Illegal overwrite' }).outcome, 'invalid');
  assert.equal(updateVOReview(approved, id, 'reject', { reviewNote: 'Cannot overwrite final approval' }).outcome, 'invalid');
  assert.equal(updateVOReview(approved, id, 'reopen', { reviewNote: '' }).outcome, 'invalid');
  const reopened = updateVOReview(approved, id, 'reopen', { reviewNote: 'Recheck scope before a revised decision.' });
  const record = getVOCases(reopened.project)[0];
  assert.equal(record.status, 'flagged');
  assert.equal(record.approvedValue, null);
  assert.equal(record.approvalReference, '');
  assert.equal(record.approver, '');
  assert.equal(record.history.at(-1).previousValues.approvedValue, 2200);
  assert.equal(record.history.at(-1).previousValues.approvalReference, 'DEMO-APP-03');
  assert.equal(record.history.at(-1).previousValues.approver, 'Client QS (demo)');
  assert.equal(updateVOReview(reopened.project, id, 'reopen', { reviewNote: record.reviewNote }).outcome, 'unchanged');
  const rejected = updateVOReview(reopened.project, id, 'reject', { reviewNote: 'Already covered by existing scope.' });
  assert.equal(getVOCases(rejected.project)[0].status, 'rejected');
  assert.equal(rejected.project.reports.find((report) => report.id === id).status, 'rejected');
  assert.equal(getVOCases(rejected.project).length, 1);
  assert.equal(updateVOReview(rejected.project, id, 'reject', { reviewNote: 'Already covered by existing scope.' }).outcome, 'unchanged');
});

test('every review action preserves completion, contract totals and source message/photo', () => {
  const original = processWhatsAppMessage(sit(), 'SIT01-WA-002').project;
  const caseId = original.reports.at(-1).id;
  const source = structuredClone(original.reports.at(-1));
  let project = original;
  const actions = [
    ['save', draft], ['clarify', { reviewNote: 'Need instruction' }], ['submit', draft],
    ['approve', approval], ['reopen', { reviewNote: 'Recheck' }], ['reject', { reviewNote: 'Included' }],
  ];
  for (const [action, values] of actions) {
    const result = updateVOReview(project, caseId, action, values);
    assert.equal(result.outcome, 'updated');
    project = result.project;
    assert.deepEqual(project.items, original.items);
    assert.deepEqual(project.sourceItems, original.sourceItems);
    assert.deepEqual(project.contract, original.contract);
    assert.deepEqual(project.whatsappMessages, original.whatsappMessages);
    const report = project.reports.find((entry) => entry.id === caseId);
    const { status, ...evidence } = report;
    const { status: originalStatus, ...originalEvidence } = source;
    assert.deepEqual(evidence, originalEvidence);
    assert.deepEqual(project.reports.slice(0, -1), original.reports.slice(0, -1));
  }
  assert.deepEqual(original.reports.at(-1), source);
});

test('foreign IDs, non-VO reports and invalid related item/value cannot change this project', () => {
  const workspace = seedWorkspace();
  const warehouse = workspace.projects[1];
  assert.equal(updateVOReview(warehouse, id, 'save', draft).outcome, 'invalid');
  const before = workspace.projects[0];
  for (const [caseId, action, values] of [
    ['DEMO-REPORT-001', 'save', draft], [id, 'unknown', draft], [id, 'save', null],
    [id, 'save', { ...draft, relatedItemId: 'WH02-WI-999' }],
    [id, 'save', { ...draft, proposedValue: '-1' }], [id, 'save', { ...draft, proposedValue: 'NaN' }],
  ]) {
    const result = updateVOReview(before, caseId, action, values);
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.project, before);
  }
  const other = structuredClone(warehouse);
  const changed = updateProjectState(workspace, 'SIT01', (project) => updateVOReview(project, id, 'submit', draft).project);
  assert.deepEqual(changed.projects[1], other);
  assert.deepEqual(workspace.projects[0].voReviews, []);
});

test('migration and reload retain existing edits, review statuses and immutable reset seeds', () => {
  const workspace = seedWorkspace();
  workspace.projects[0] = updateVOReview(submit(workspace.projects[0]), id, 'approve', approval).project;
  workspace.projects[0].items[0].description = 'User correction retained';
  workspace.projects[0].locked = true;
  workspace.projects[0].version = 4;
  const loaded = loadWorkspace(store({ [WORKSPACE_STORE]: JSON.stringify(workspace) }));
  assert.deepEqual(loaded, workspace);
  assert.equal(getVOCases(loaded.projects[0])[0].status, 'approved');
  assert.deepEqual(loaded.projects[0].seed.voReviews, []);
  const old = seedWorkspace();
  delete old.projects[0].voReviews;
  delete old.projects[0].seed.voReviews;
  old.projects[0].items[0].verified = 36;
  old.projects[0].history = [{ id: 'KEEP', action: 'Existing history' }];
  const migrated = loadWorkspace(store({ [WORKSPACE_STORE]: JSON.stringify(old) }));
  assert.equal(migrated.projects[0].items[0].verified, 36);
  assert.deepEqual(migrated.projects[0].reports, old.projects[0].reports);
  assert.deepEqual(migrated.projects[0].history, old.projects[0].history);
  assert.deepEqual(migrated.projects[0].voReviews, []);
  assert.deepEqual(migrated.projects[0].seed.voReviews, []);
  assert.equal(getVOCases(migrated.projects[0])[0].status, 'flagged');
});

test('old/new reset seeds clear only the selected review state; v1 migration keeps legacy bytes', () => {
  for (const oldSeed of [false, true]) {
    const workspace = seedWorkspace();
    workspace.projects[0] = updateVOReview(submit(), id, 'approve', approval).project;
    if (oldSeed) delete workspace.projects[0].seed.voReviews;
    const other = structuredClone(workspace.projects[1]);
    const reset = updateProjectState(workspace, 'SIT01', resetProject);
    assert.deepEqual(reset.projects[0].voReviews, []);
    assert.equal(getVOCases(reset.projects[0])[0].status, 'flagged');
    assert.deepEqual(reset.projects[1], other);
    assert.equal(getVOCases(workspace.projects[0])[0].status, 'approved');
  }
  const before = sit();
  const legacy = { items: before.items, reports: before.reports, history: [{ id: 'KEEP' }] };
  const bytes = JSON.stringify(legacy);
  const storage = store({ [LEGACY_STORE]: bytes });
  const loaded = loadWorkspace(storage);
  assert.equal(storage.getItem(LEGACY_STORE), bytes);
  assert.deepEqual(loaded.projects[0].reports, before.reports);
  assert.deepEqual(loaded.projects[0].voReviews, []);
  assert.equal(getVOCases(loaded.projects[0])[0].status, 'flagged');
});
