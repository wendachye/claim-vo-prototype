import assert from 'node:assert/strict';
import test from 'node:test';
import { seedWorkspace, loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { getProjectWorkflow } from '../src/data/workflow.ts';
import { isReviewableProgressReport, isUnresolvedProgressReport, needsMessageClarification,
  needsProgressClarification, requestProgressClarification } from '../src/data/report-status.ts';

const now = new Date('2026-10-21T12:00:00Z');
const example = () => {
  const project = seedWorkspace().projects[0];
  project.reports = project.reports.filter((report) => !report.vo && report.itemId === 'WI-001');
  project.whatsappMessages = [project.whatsappMessages[0]];
  return project;
};

test('requesting clarification preserves source evidence, progress and saved assessments', () => {
  const before = example();
  const original = structuredClone(before);
  const report = before.reports[0];
  const result = requestProgressClarification(before, report.id, '  Confirm the area and total completion.  ', now);
  assert.equal(result.outcome, 'updated');
  const changed = result.project.reports[0];
  assert.equal(changed.status, 'needsClarification');
  assert.equal(changed.reviewReason, 'Confirm the area and total completion.');
  assert.equal(changed.clarificationRequestedAt, now.toISOString());
  for (const field of Object.keys(report)) {
    if (field !== 'status' && field !== 'reviewReason') assert.deepEqual(changed[field], report[field], field);
  }
  assert.deepEqual(result.project.items, before.items);
  assert.deepEqual(result.project.whatsappMessages, before.whatsappMessages);
  assert.deepEqual(result.project.claimDrafts, before.claimDrafts);
  assert.deepEqual(result.project.baselines, before.baselines);
  assert.deepEqual(before, original);
  assert.equal(isReviewableProgressReport(changed), false, 'clarification cannot be directly verified');
  assert.equal(isUnresolvedProgressReport(changed), true);
  assert.equal(getProjectWorkflow(result.project, '2026-10').counts.pendingReports, 0);
  assert.equal(getProjectWorkflow(result.project, '2026-10').counts.clarifications, 1);
});

test('legacy needsReview stays reviewable while clarification and final reports do not', () => {
  assert.equal(isReviewableProgressReport({ status: 'pending' }), true);
  assert.equal(isReviewableProgressReport({ status: 'needsReview' }), true);
  for (const status of ['needsClarification', 'clarification', 'verified', 'rejected', 'superseded']) {
    assert.equal(isReviewableProgressReport({ status }), false, status);
  }
  assert.equal(isReviewableProgressReport({ status: 'needsReview', vo: true }), false);
  assert.equal(needsProgressClarification({ status: 'clarification' }), true);
  assert.equal(needsProgressClarification({ status: 'needsClarification', vo: true }), false);
  const project = example();
  project.reports[0].status = 'needsReview';
  assert.equal(requestProgressClarification(project, project.reports[0].id, 'Confirm the total.', now).outcome, 'updated');
});

test('clarification requires a local unresolved progress report and a note', () => {
  const before = example();
  const id = before.reports[0].id;
  assert.equal(requestProgressClarification(before, id, ' ', now).outcome, 'invalid');
  assert.equal(requestProgressClarification(before, 'missing', 'Clarify.', now).outcome, 'invalid');
  for (const patch of [{ status: 'verified' }, { status: 'rejected' }, { status: 'superseded' },
    { vo: true }, { projectId: 'OTHER' }, { projectCode: 'OTHER' }]) {
    const project = structuredClone(before);
    Object.assign(project.reports[0], patch);
    const result = requestProgressClarification(project, id, 'Clarify.', now);
    assert.equal(result.outcome, 'invalid', JSON.stringify(patch));
    assert.equal(result.project, project);
  }
});

test('clarification survives reload and replay cannot restore verification eligibility', () => {
  const workspace = seedWorkspace();
  workspace.projects[0] = processWhatsAppMessage(example(), 'SIT01-WA-001').project;
  const report = workspace.projects[0].reports.at(-1);
  const result = requestProgressClarification(workspace.projects[0], report.id, 'Confirm the total.', now);
  workspace.projects[0] = result.project;
  const loaded = loadWorkspace({ getItem: (key) => key === WORKSPACE_STORE ? JSON.stringify(workspace) : null });
  const project = loaded.projects[0];
  const replay = processWhatsAppMessage(project, 'SIT01-WA-001');
  assert.equal(replay.outcome, 'duplicate');
  assert.equal(replay.project, project);
  assert.equal(isReviewableProgressReport(project.reports.at(-1)), false);
  assert.equal(needsMessageClarification(project.whatsappMessages[0], project.reports.at(-1)), true);
  assert.equal(requestProgressClarification(project, report.id, 'Confirm the total.', now).outcome, 'unchanged');
});

test('a newer cumulative update supersedes clarification and updates reported progress only', () => {
  const before = example();
  const old = before.reports[0];
  const clarified = requestProgressClarification(before, old.id, 'Confirm the area.', now).project;
  const result = processWhatsAppMessage(clarified, 'SIT01-WA-001');
  assert.equal(result.outcome, 'processed');
  const prior = result.project.reports.find((report) => report.id === old.id);
  assert.equal(prior.status, 'superseded');
  assert.equal(prior.reviewReason, 'Confirm the area.');
  assert.equal(prior.message, old.message);
  assert.equal(prior.photo, old.photo);
  assert.equal(prior.supersededByReportId, result.reportId);
  assert.equal(result.project.items[0].reported, 65);
  assert.equal(result.project.items[0].verified, before.items[0].verified);
  assert.equal(getProjectWorkflow(result.project, '2026-10').counts.clarifications, 0);
  assert.equal(getProjectWorkflow(result.project, '2026-10').counts.pendingReports, 1);
  assert.deepEqual(result.project.claimDrafts, before.claimDrafts);
  assert.equal(needsMessageClarification({ status: 'clarification' }, prior), false, 'terminal linked report wins over old inbox status');
});
