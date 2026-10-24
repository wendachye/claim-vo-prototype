import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { addProgressCheckExamples } from '../src/data/message-progress-check-demo.ts';
import { getMessageProgressCheck } from '../src/data/message-progress-check.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { createAreaSplitDemo } from '../src/data/area-split-demo.ts';
import { seedWorkspace } from '../src/data/projects.ts';
import { getAreaItemProgress, getItemAreaRollup } from '../src/data/area-allocations.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

const start = '2026-10-24T10:00:00.000Z';
const now = '2026-10-24T11:00:00.000Z';
const fixture = () => loadShowcaseWorkspace(null, start).projects[0];
const examples = project => project.whatsappMessages.filter(message => message.id.startsWith(`${project.id}-PROGRESS-CHECK-`));
const protectedFields = project => Object.fromEntries(['contract', 'items', 'sourceItems', 'reports', 'baselines', 'locked', 'version', 'seed', 'voReviews', 'claimDrafts', 'claimTracking', 'drawingMapping', 'messageClarifications', 'messageMatchReviews', 'voiceTranscriptReviews']
  .map(key => [key, structuredClone(project[key])]));
const exportsFor = project => project.claimDrafts.map(draft => toClaimCSV(buildClaimPack(project, draft.id).pack));
const updated = result => { assert.equal(result.outcome, 'updated', result.error); return result.project; };
const confirm = (project, message) => {
  const context = getMessageMatchContext(project, message.id);
  assert.equal(context.eligible, true, context.issue);
  return updated(saveMessageMatchReview(project, message.id, { ...context.fields, reason: '' }, now));
};

test('selected-project examples append three simulated sources and one history event without changing progress or frozen finances', () => {
  const project = fixture(), before = structuredClone(project), frozen = protectedFields(project), exports = exportsFor(project);
  const result = addProgressCheckExamples(project, now), next = updated(result), messages = examples(next);
  assert.deepEqual(project, before); assert.deepEqual(protectedFields(next), frozen); assert.deepEqual(exportsFor(next), exports);
  assert.equal(next.whatsappMessages.length, project.whatsappMessages.length + 3);
  assert.deepEqual(next.whatsappMessages.slice(0, -3), project.whatsappMessages);
  assert.deepEqual(next.history.slice(1), project.history); assert.equal(next.history.length, project.history.length + 1);
  assert.equal(result.messageId, messages[0].id); assert.equal(messages.length, 3);
  assert.deepEqual(messages.map(message => message.completion), [65, 40, 65]);
  for (const message of messages) {
    assert.equal(message.projectId, project.id); assert.equal(message.projectCode, project.code);
    assert.equal(message.demo, true); assert.equal(message.origin, 'simulated'); assert.equal(message.kind, 'progress');
    assert.equal(message.status, 'new'); assert.equal(message.channel, 'whatsapp-progress-check-mock');
    assert.equal(message.itemId, 'WI-001'); assert.equal(message.area, 'W3-ST31'); assert.equal(message.receivedAt, now);
    assert.match(message.text, new RegExp(`${project.code} \\| W3 \\| W3-ST31 \\| WI-001`));
    assert.match(message.text, new RegExp(`COMPLETE=${message.completion}% TOTAL`)); assert.match(message.text, /Simulated progress check/);
    assert.match(message.processingNote, /Worker event time:.*received in the mock inbox:/);
    assert.equal(message.areaProgress, undefined); assert.equal(message.areaMapping, undefined);
    assert.equal(message.matchSuggestion.fields.itemId, 'WI-001'); assert.equal(message.matchSuggestion.sourceExcerpt, message.text);
    assert.equal(getMessageProgressCheck(next, message.id), null, 'Match confirmation remains required');
    assert.equal(processWhatsAppMessage(next, message.id).outcome, 'invalid');
    assert.match(message.photoAlt, /generated demo.*not project evidence/); assert.match(message.photo, /^\/assets\/demo-/);
  }
});

test('confirmed main S.I.T. examples explain repeated, lower and older totals against the exact latest report', () => {
  const project = updated(addProgressCheckExamples(fixture(), now)), original = structuredClone(project);
  const latest = project.reports.filter(report => report.itemId === 'WI-001').at(-1);
  const kinds = ['repeated', 'lower', 'older'];
  for (const [index, message] of examples(project).entries()) {
    const reviewed = confirm(project, message), check = getMessageProgressCheck(reviewed, message.id);
    assert.equal(check.kind, kinds[index]); assert.equal(check.reported, 65); assert.equal(check.verified, 50);
    assert.equal(check.basis, 'whole-item'); assert.equal(check.latestReportId, latest.id); assert.equal(check.latestReportDate, latest.date);
    assert.equal(check.isBelowVerified, index === 1); assert.deepEqual(reviewed.items, project.items); assert.deepEqual(reviewed.reports, project.reports);
    if (index === 2) {
      assert.ok(Date.parse(message.date) < Date.parse(latest.date)); assert.ok(Date.parse(message.date) < Date.parse(message.receivedAt));
      const stale = processWhatsAppMessage(reviewed, message.id);
      assert.equal(stale.outcome, 'clarification'); assert.deepEqual(stale.project.items, project.items);
      assert.deepEqual(stale.project.reports, project.reports); assert.deepEqual(stale.project.claimDrafts, project.claimDrafts);
    } else assert.equal(message.date, now);
  }
  assert.deepEqual(project, original);
});

test('reopening retains edited originals, partially deleted examples and all existing records', () => {
  let project = updated(addProgressCheckExamples(fixture(), now));
  const messages = examples(project);
  project = { ...project, whatsappMessages: project.whatsappMessages.filter(message => message.id !== messages[0].id)
    .map(message => message.id === messages[1].id ? { ...message, text: 'My retained original message', processingNote: 'My existing note' } : message) };
  const before = structuredClone(project), reopened = addProgressCheckExamples(project, '2026-10-25T12:00:00Z');
  assert.equal(reopened.outcome, 'unchanged'); assert.equal(reopened.project, project); assert.equal(reopened.messageId, messages[1].id);
  assert.deepEqual(project, before); assert.equal(examples(reopened.project).length, 2);
  const removed = { ...project, whatsappMessages: project.whatsappMessages.filter(message => !messages.some(example => example.id === message.id)) };
  const removedBefore = structuredClone(removed), result = addProgressCheckExamples(removed, now);
  assert.equal(result.outcome, 'invalid'); assert.equal(result.project, removed); assert.deepEqual(result.project, removedBefore);
  assert.match(result.error, /already added/);
});

test('no mapped current scope, missing totals, foreign sources, invalid allocations or future source dates produce no invented examples', () => {
  const narrow = () => {
    const project = fixture();
    return { ...project, items: project.items.filter(item => item.id === 'WI-001'), reports: project.reports.filter(report => report.itemId === 'WI-001') };
  };
  const changes = [
    project => { project.reports = []; },
    project => { project.items[0].verified = null; },
    project => { project.items[0].reported = null; },
    project => { project.items[0].verified = 70; },
    project => { project.drawingMapping.areas = []; },
    project => { project.reports.forEach(report => { report.projectId = 'FOREIGN'; }); },
    project => { project.reports.at(-1).date = 'invalid'; },
    project => { project.reports.at(-1).date = '2026-10-25T12:00:00.000Z'; },
    project => { project.items[0].projectCode = 'FOREIGN'; },
    project => { project.drawingMapping.areas[0].workItemQuantities = { 'WI-001': 999999 }; },
  ];
  for (const change of changes) {
    const project = narrow(); change(project); const before = structuredClone(project), result = addProgressCheckExamples(project, now);
    assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project); assert.ok(result.error); assert.deepEqual(project, before);
  }
  for (const date of ['invalid', '', Number.NaN, Symbol('invalid')]) {
    const project = fixture(), result = addProgressCheckExamples(project, date);
    assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project);
  }
  assert.equal(addProgressCheckExamples(null, now).outcome, 'invalid');
});

test('split examples use a verified area’s own completion rather than the item weighted percentage', () => {
  const created = createAreaSplitDemo(seedWorkspace(), new Date(start));
  assert.equal(created.outcome, 'updated');
  let project = created.project;
  const west = project.whatsappMessages[0];
  const processed = processWhatsAppMessage(project, west.id);
  assert.equal(processed.outcome, 'processed');
  project = updated(verifyProgressReport(processed.project, processed.reportId, 50, '', '2026-10-24T10:01:00Z'));
  assert.equal(getItemAreaRollup(project, 'WI-001').completion, 30);
  const before = structuredClone(project), frozen = protectedFields(project), next = updated(addProgressCheckExamples(project, now));
  assert.deepEqual(protectedFields(next), frozen); assert.deepEqual(project, before);
  assert.deepEqual(examples(next).map(message => message.completion), [50, 40, 50]);
  for (const [index, message] of examples(next).entries()) {
    assert.equal(message.area, 'WEST');
    const check = getMessageProgressCheck(confirm(next, message), message.id);
    assert.equal(check.kind, ['repeated', 'lower', 'older'][index]); assert.equal(check.basis, 'area');
    assert.equal(check.reported, 50); assert.equal(check.verified, 50); assert.equal(check.areaId, west.areaId);
    assert.equal(check.latestReportId, processed.reportId);
  }
  assert.equal(getAreaItemProgress(next, west.areaId, 'WI-001').completion, 50);
});

test('known verified zero can demonstrate lower reported completion without fabricating a verification', () => {
  const project = fixture();
  project.items = project.items.filter(item => item.id === 'WI-001'); project.items[0].verified = 0;
  project.reports = project.reports.filter(report => report.itemId === 'WI-001');
  const result = addProgressCheckExamples(project, now), next = updated(result), lower = examples(next)[1];
  assert.equal(lower.completion, 55);
  const check = getMessageProgressCheck(confirm(next, lower), lower.id);
  assert.equal(check.kind, 'lower'); assert.equal(check.verified, 0); assert.equal(check.isBelowVerified, false);
  assert.deepEqual(next.reports, project.reports); assert.deepEqual(next.claimDrafts, project.claimDrafts);
});
