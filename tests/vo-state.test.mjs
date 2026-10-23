import assert from 'node:assert/strict';
import test from 'node:test';
import { getVOCases, getVOClaimEligibility, updateVOReview, VO_STATUS_LABELS } from '../src/data/vo.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { createProject, loadWorkspace, resetProject, seedWorkspace, updateProjectState, WORKSPACE_STORE, LEGACY_STORE } from '../src/data/projects.ts';

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


const eligibility = {
  scopeDisposition: 'variation', scopeAssessment: draft.scopeAssessment,
  instructionStatus: 'documented', instructionReference: draft.instructionReference,
  executionStatus: 'verified', executionReference: 'DEMO-INSPECTION-03',
  claimEligibility: 'eligible', eligibilityNote: 'QS checked the documented changed scope, inspected work and approved price.',
  reviewNote: 'Completed the separate scope and instruction evidence checks after the recorded demo price approval.',
};
const approve = (project = sit(), approvedValue = approval.approvedValue) => updateVOReview(submit(project), id, 'approve', { ...approval, approvedValue }).project;

test('legacy approvals never imply documented instructions, verified work or claim eligibility', () => {
  const project = approve();
  const review = project.voReviews[0];
  for (const field of ['scopeDisposition', 'instructionStatus', 'executionStatus', 'executionReference', 'claimEligibility', 'eligibilityNote', 'eligibilityReviewedAt', 'executionVerifiedAt', 'reviewChecksVersion']) delete review[field];
  const before = structuredClone(project);
  const entry = getVOCases(project)[0];
  assert.equal(entry.status, 'approved');
  assert.equal(entry.instructionReference, draft.instructionReference);
  assert.equal(entry.scopeDisposition, 'unassessed');
  assert.equal(entry.instructionStatus, 'notRecorded');
  assert.equal(entry.executionStatus, 'notVerified');
  assert.equal(entry.claimEligibility, 'needsReview');
  assert.deepEqual(getVOClaimEligibility(entry), {
    status: 'needsReview', eligible: false, ready: false, structured: false, decisionAt: null, executionVerifiedAt: null,
    issues: ['Confirm the changed scope and why it is extra work.', 'Record the supporting documented instruction.',
      'Record the verified work and its evidence reference.', 'The QS has not confirmed claim eligibility.'],
  });
  assert.deepEqual(project, before);
});

test('eligibility is a separate explicit decision with complete checks; zero approved price is valid', () => {
  assert.equal(updateVOReview(sit(), id, 'assessEligibility', eligibility).outcome, 'invalid');
  const project = approve();
  for (const changes of [
    { scopeDisposition: 'unassessed' }, { scopeDisposition: 'existingScope' }, { scopeAssessment: '' },
    { instructionStatus: 'reported' }, { instructionStatus: 'disputed' }, { instructionReference: '' },
    { executionStatus: 'notVerified' }, { executionReference: '' }, { eligibilityNote: '' },
    { scopeDisposition: 'invalid' }, { instructionStatus: 'invalid' }, { executionStatus: 'invalid' }, { claimEligibility: 'invalid' },
    { reviewNote: '' },
  ]) {
    const result = updateVOReview(project, id, 'assessEligibility', { ...eligibility, ...changes });
    assert.equal(result.outcome, 'invalid', JSON.stringify(changes));
    assert.equal(result.project, project);
  }
  const zero = updateVOReview(approve(sit(), '0'), id, 'assessEligibility', eligibility);
  assert.equal(zero.outcome, 'updated');
  const entry = getVOCases(zero.project)[0];
  assert.equal(entry.status, 'approved');
  assert.equal(entry.approvedValue, 0);
  assert.equal(entry.reviewChecksVersion, 1);
  const ready = getVOClaimEligibility(entry);
  assert.equal(ready.eligible, true);
  assert.equal(ready.ready, true);
  assert.equal(ready.structured, true);
  assert.equal(ready.status, 'eligible');
  assert.equal(ready.decisionAt, entry.eligibilityReviewedAt);
  assert.equal(ready.executionVerifiedAt, entry.executionVerifiedAt);
  assert.ok(Number.isFinite(Date.parse(ready.decisionAt)));
  assert.deepEqual(ready.issues, []);
  assert.equal(entry.history.at(-1).action, 'assessEligibility');
  assert.equal(entry.history.at(-1).from, 'approved');
  assert.equal(entry.history.at(-1).to, 'approved');
});

test('eligibility review is idempotent and cannot change price approval, original evidence or saved claim snapshots', () => {
  const project = { ...approve(), claimDrafts: [{ id: 'KEEP-SAVED', snapshot: { totals: { currentValue: 2200 }, evidence: ['original'] } }] };
  const original = structuredClone(project);
  const result = updateVOReview(project, id, 'assessEligibility', {
    ...eligibility, title: 'Must not overwrite title', relatedItemId: 'FOREIGN', approvedValue: 9999,
    proposedValue: 1, approvalReference: 'MUST-NOT-OVERWRITE', approver: 'Must not overwrite',
  });
  assert.equal(result.outcome, 'updated');
  const entry = getVOCases(result.project)[0];
  assert.equal(entry.title, draft.title);
  assert.equal(entry.relatedItemId, draft.relatedItemId);
  assert.equal(entry.approvedValue, Number(approval.approvedValue));
  assert.equal(entry.proposedValue, Number(draft.proposedValue));
  assert.equal(entry.approvalReference, approval.approvalReference);
  assert.equal(entry.approver, approval.approver);
  for (const field of ['items', 'sourceItems', 'reports', 'whatsappMessages', 'contract', 'claimDrafts']) assert.deepEqual(result.project[field], original[field], field);
  assert.deepEqual(project, original);
  const replay = updateVOReview(result.project, id, 'assessEligibility', eligibility);
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.project, result.project);
});

test('incomplete and excluded assessments stay visible while reopening clears current eligibility and retains history', () => {
  const project = approve();
  const partial = updateVOReview(project, id, 'assessEligibility', {
    claimEligibility: 'needsReview', eligibilityNote: 'Waiting for the site inspection.',
  });
  assert.equal(partial.outcome, 'updated');
  assert.equal(getVOClaimEligibility(getVOCases(partial.project)[0]).status, 'needsReview');
  assert.equal(getVOCases(partial.project)[0].status, 'approved');
  assert.equal(updateVOReview(partial.project, id, 'assessEligibility', { claimEligibility: 'excluded', eligibilityNote: '' }).outcome, 'invalid');
  const excluded = updateVOReview(partial.project, id, 'assessEligibility', { claimEligibility: 'excluded', eligibilityNote: 'Not claimable in this mock assessment.' });
  assert.equal(excluded.outcome, 'updated');
  assert.equal(getVOClaimEligibility(getVOCases(excluded.project)[0]).status, 'excluded');
  assert.equal(getVOCases(excluded.project)[0].approvedValue, Number(approval.approvedValue));
  const ready = updateVOReview(excluded.project, id, 'assessEligibility', eligibility).project;
  const reopened = updateVOReview(ready, id, 'reopen', { reviewNote: 'Recheck the changed scope before issuing a new price decision.' });
  const entry = getVOCases(reopened.project)[0];
  assert.equal(entry.status, 'flagged');
  assert.equal(entry.claimEligibility, 'needsReview');
  assert.equal(entry.eligibilityReviewedAt, null);
  assert.equal(entry.approvedValue, null);
  assert.equal(entry.history.at(-1).previousValues.claimEligibility, 'eligible');
  assert.ok(entry.history.at(-1).previousValues.eligibilityReviewedAt);
  assert.equal(getVOClaimEligibility(entry).eligible, false);
  const rejected = updateVOReview(reopened.project, id, 'reject', { reviewNote: 'This work is already included in the original contract.' });
  assert.equal(getVOCases(rejected.project)[0].claimEligibility, 'excluded');
  assert.equal(getVOClaimEligibility(getVOCases(rejected.project)[0]).eligible, false);
});

test('changed instruction or work evidence cannot leave an invalid eligible decision in place', () => {
  const project = updateVOReview(approve(), id, 'assessEligibility', eligibility).project;
  for (const changes of [{ instructionStatus: 'reported' }, { scopeDisposition: 'rectification' }, { executionStatus: 'notVerified' }]) {
    const result = updateVOReview(project, id, 'assessEligibility', { ...eligibility, ...changes });
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.project, project);
  }
  const saved = updateVOReview(project, id, 'assessEligibility', { ...eligibility, instructionStatus: 'disputed', claimEligibility: 'needsReview', eligibilityNote: 'Instruction disputed; wait for confirmation.' });
  assert.equal(saved.outcome, 'updated');
  assert.equal(getVOClaimEligibility(getVOCases(saved.project)[0]).eligible, false);
  const corrupted = { ...getVOCases(project)[0], approvedValue: null };
  assert.equal(getVOClaimEligibility(corrupted).eligible, false);
  assert.equal(getVOClaimEligibility({ ...getVOCases(project)[0], eligibilityReviewedAt: null }).eligible, false);
  assert.equal(getVOClaimEligibility({ ...getVOCases(project)[0], executionVerifiedAt: null }).eligible, false);
});
