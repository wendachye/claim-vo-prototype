import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { previewDemoMessage, saveDemoMessage } from '../src/data/demo-message-intake.ts';
import { saveMessageClarificationRequest, saveMockClarificationReply, getMessageClarification } from '../src/data/whatsapp-clarification.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { buildClaimReview, saveClaimDraft, markClaimPrepared } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

const receivedAt = '2026-10-28T09:45:00.000Z';
const requestAt = '2026-10-28T10:00:00.000Z';
const replyAt = '2026-10-28T10:05:00.000Z';
const verifiedAt = '2026-10-28T11:00:00.000Z';
const originalText = '26/10/26 (Monday)\nDP01\nT11,13,20 KPI\n(WDP-01 Wetwell 1)\n0man\n20×1×1\n12PM to 1PM hoisting.\nAfternoon no materials lower down due to crane breakdown';
const replyText = 'Fictional clarification: BRACKET-A is 50% complete in total for the measured bracket item.';
const question = 'Confirm the measured contract item, allocated area and cumulative completion to date.';
const updated = result => { assert.equal(result.outcome, 'updated', result.error); return result.project; };
const packFor = (project, draftId) => {
  const result = buildClaimPack(project, draftId);
  assert.equal(result.outcome, 'ready', result.error);
  return result.pack;
};
const exportsFor = project => project.claimDrafts.map(draft => ({ id: draft.id, draft: structuredClone(draft),
  pack: packFor(project, draft.id), csv: toClaimCSV(packFor(project, draft.id)) }));
const assessment = (quantity = 7) => ({ work: { 'WI-016': { include: true, assessedQuantity: quantity, previousValue: 0 } },
  vos: {}, priorConfirmed: true, note: 'Explicit fictional QS measurement; daily dimensions and team identifiers are supporting context only.' });

function repliedDaily() {
  const workspace = loadShowcaseWorkspace(null, '2026-10-28T09:00:00.000Z');
  const project = workspace.projects.find(entry => entry.id === workspace.activeProjectId);
  const previousExports = exportsFor(project);
  const input = { projectId: project.id, text: originalText, photoId: 'column', submissionId: 'DAILY-CLAIM-TEST-01' };
  const preview = previewDemoMessage(project, input);
  assert.equal(preview.status, 'clarification', preview.error);
  const received = saveDemoMessage(project, { ...input, previewKey: preview.sourceKey }, receivedAt);
  const inbox = updated(received);
  const requested = updated(saveMessageClarificationRequest(inbox, received.messageId, { question }, requestAt));
  const area = requested.drawingMapping.areas.find(entry => entry.code === 'BRACKET-A');
  const replied = updated(saveMockClarificationReply(requested, received.messageId, {
    text: replyText, itemId: 'WI-016', areaId: area.id, area: area.code, completion: 50,
  }, replyAt));
  const context = getMessageClarification(replied, received.messageId);
  return { workspace, initial: project, project: replied, original: context.original, reply: context.reply, previousExports };
}

function verifiedDaily() {
  const fixture = repliedDaily();
  const processed = processWhatsAppMessage(fixture.project, fixture.reply.id);
  assert.equal(processed.outcome, 'processed', processed.error);
  const project = updated(verifyProgressReport(processed.project, processed.reportId, '50', '', verifiedAt));
  return { ...fixture, project, reportId: processed.reportId };
}

test('a new claim freezes the daily KPI original and separate clarified progress without using dimensions as QS quantities', () => {
  const fixture = verifiedDaily();
  const report = fixture.project.reports.find(entry => entry.id === fixture.reportId);
  assert.equal(report.message, replyText);
  assert.equal(report.sourceMessageId, fixture.reply.id);
  assert.equal(report.completion, 50);
  assert.equal(report.dailyKPIEvidence.text, originalText);
  assert.equal(report.dailyKPIEvidence.messageId, fixture.original.id);
  assert.equal(report.dailyKPIEvidence.date, receivedAt);
  assert.equal(report.dailyKPIEvidence.sender, fixture.original.sender);
  assert.equal(report.dailyKPIEvidence.photo, fixture.original.photo);
  assert.notEqual(report.dailyKPIEvidence.messageId, report.sourceMessageId);
  const result = saveClaimDraft(fixture.project, '2026-10', assessment());
  const saved = updated(result), pack = packFor(saved, result.draft.id);
  const evidence = pack.evidenceRefs.find(entry => entry.reportId === fixture.reportId);
  assert.ok(evidence);
  assert.deepEqual(evidence.dailyKPIEvidence, report.dailyKPIEvidence);
  assert.equal(evidence.message, replyText);
  assert.equal(evidence.sourceMessageId, fixture.reply.id);
  const row = pack.workRows.find(entry => entry.id === 'WI-016');
  assert.equal(row.assessedQuantity, 7);
  assert.equal(row.cumulativeValue, Math.round(7 * row.rate * 100) / 100);
  assert.equal(row.previousValue, 0);
  assert.equal(row.currentValue, row.cumulativeValue);
  const csv = toClaimCSV(pack);
  assert.ok(csv.includes(originalText));
  assert.ok(csv.includes(replyText));
  for (const field of ['T11,13,20 KPI', '0man', '20×1×1', '12PM to 1PM hoisting.', 'crane breakdown']) assert.ok(csv.includes(field), field);
  assert.deepEqual(saved.claimDrafts.slice(0, fixture.previousExports.length), fixture.previousExports.map(entry => entry.draft));
  for (const previous of fixture.previousExports) {
    assert.deepEqual(packFor(saved, previous.id), previous.pack);
    assert.equal(toClaimCSV(packFor(saved, previous.id)), previous.csv);
  }
});

test('unknown and zero QS inputs remain explicit despite daily manpower, team identifiers, dimensions and verified progress', () => {
  const fixture = verifiedDaily();
  const unknown = buildClaimReview(fixture.project, '2026-10', { work: { 'WI-016': { include: true, previousValue: 0 } }, vos: {}, priorConfirmed: true });
  const unknownRow = unknown.workRows.find(entry => entry.id === 'WI-016');
  assert.equal(unknownRow.assessedQuantity, null);
  assert.equal(unknownRow.cumulativeValue, null);
  assert.equal(unknownRow.currentValue, null);
  assert.equal(unknown.canPrepare, false);
  const zero = buildClaimReview(fixture.project, '2026-10', assessment(0));
  const zeroRow = zero.workRows.find(entry => entry.id === 'WI-016');
  assert.equal(zeroRow.assessedQuantity, 0);
  assert.equal(zeroRow.cumulativeValue, 0);
  assert.equal(zeroRow.currentValue, 0);
  assert.equal(zero.canPrepare, true, zero.issues.join(' '));
});

test('saved daily evidence and exports survive source removal, live edits and a storage reload without hydration', () => {
  const fixture = verifiedDaily(), result = saveClaimDraft(fixture.project, '2026-10', assessment());
  const project = updated(result), before = structuredClone(result.draft), pack = packFor(project, result.draft.id), csv = toClaimCSV(pack);
  const changed = structuredClone(project);
  changed.whatsappMessages = [];
  changed.messageClarifications = [];
  changed.reports = [];
  changed.drawingMapping = undefined;
  changed.items.find(entry => entry.id === 'WI-016').rate = 999;
  assert.deepEqual(changed.claimDrafts.at(-1), before);
  assert.deepEqual(packFor(changed, result.draft.id), pack);
  assert.equal(toClaimCSV(packFor(changed, result.draft.id)), csv);
  const store = new Map([[WORKSPACE_STORE, JSON.stringify({ ...fixture.workspace,
    projects: fixture.workspace.projects.map(entry => entry.id === project.id ? project : entry) })]]);
  const loaded = loadWorkspace({ getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) });
  const restored = loaded.projects.find(entry => entry.id === project.id);
  assert.deepEqual(restored.claimDrafts.find(entry => entry.id === result.draft.id), before);
  assert.deepEqual(packFor(restored, result.draft.id), pack);
  assert.equal(toClaimCSV(packFor(restored, result.draft.id)), csv);
});

test('present malformed or foreign daily evidence cannot be silently omitted from a new assessment or saved pack', () => {
  const fixture = verifiedDaily();
  const saved = saveClaimDraft(fixture.project, '2026-10', assessment());
  updated(saved);
  const originalEvidence = fixture.project.reports.find(entry => entry.id === fixture.reportId).dailyKPIEvidence;
  for (const value of [null, {}, { ...originalEvidence, projectId: 'FOREIGN' }, { ...originalEvidence, projectCode: 'OTHER' },
    { ...originalEvidence, text: 'Not a daily KPI original' }, { ...originalEvidence, date: 'invalid date' }]) {
    const changed = structuredClone(fixture.project);
    changed.reports.find(entry => entry.id === fixture.reportId).dailyKPIEvidence = value;
    const result = saveClaimDraft(changed, '2026-10', assessment());
    assert.equal(result.outcome, 'invalid', JSON.stringify(value));
    assert.equal(result.project, changed);
    const malformedSaved = structuredClone(saved.project);
    const row = malformedSaved.claimDrafts.at(-1).snapshot.workRows.find(entry => entry.id === 'WI-016');
    row.evidence.dailyKPIEvidence = value;
    if (row.areaEvidence) row.areaEvidence.forEach(entry => { entry.dailyKPIEvidence = value; });
    assert.equal(buildClaimPack(malformedSaved, saved.draft.id).outcome, 'invalid', JSON.stringify(value));
  }
});

test('changed supporting daily evidence requires a new saved revision before preparation and preserves earlier exports', () => {
  const fixture = verifiedDaily(), result = saveClaimDraft(fixture.project, '2026-10', assessment());
  const project = updated(result), before = structuredClone(result.draft), oldPack = packFor(project, result.draft.id), csv = toClaimCSV(oldPack);
  const changed = structuredClone(project);
  changed.reports.find(entry => entry.id === fixture.reportId).dailyKPIEvidence.text += '\nAdditional reported remark retained for review.';
  const blocked = markClaimPrepared(changed, result.draft.id);
  assert.equal(blocked.outcome, 'invalid');
  assert.match(blocked.error, /Source records changed/);
  assert.deepEqual(blocked.project.claimDrafts.at(-1), before);
  assert.deepEqual(packFor(changed, result.draft.id), oldPack);
  assert.equal(toClaimCSV(packFor(changed, result.draft.id)), csv);
  const revised = saveClaimDraft(changed, '2026-10', assessment());
  const revisionProject = updated(revised);
  assert.equal(revised.draft.revision, before.revision + 1);
  assert.deepEqual(revisionProject.claimDrafts.find(entry => entry.id === before.id), before);
  assert.equal(toClaimCSV(packFor(revisionProject, before.id)), csv);
});

test('foreign or malformed original evidence cannot be processed through a clarification reply', () => {
  const fixture = repliedDaily();
  assert.ok(fixture.reply.originalDailyKPI);
  for (const value of [null, {}, { ...fixture.reply.originalDailyKPI, projectId: 'FOREIGN' },
    { ...fixture.reply.originalDailyKPI, messageId: 'WRONG-ORIGINAL' },
    { ...fixture.reply.originalDailyKPI, text: `${originalText}\nChanged original.` }]) {
    const changed = structuredClone(fixture.project), reply = changed.whatsappMessages.find(entry => entry.id === fixture.reply.id);
    reply.originalDailyKPI = value;
    const before = structuredClone(changed);
    const result = processWhatsAppMessage(changed, reply.id);
    assert.notEqual(result.outcome, 'processed', JSON.stringify(value));
    assert.deepEqual(result.project.reports, before.reports);
    assert.deepEqual(result.project.items, before.items);
    assert.deepEqual(result.project.claimDrafts, before.claimDrafts);
  }
});

test('legacy reports and saved claims never acquire daily evidence from live inbox or clarification records', () => {
  const fixture = verifiedDaily(), project = structuredClone(fixture.project);
  const report = project.reports.find(entry => entry.id === fixture.reportId);
  delete report.dailyKPIEvidence;
  const saved = saveClaimDraft(project, '2026-10', assessment());
  const legacy = updated(saved), oldPack = packFor(legacy, saved.draft.id), csv = toClaimCSV(oldPack);
  const evidence = oldPack.evidenceRefs.find(entry => entry.reportId === fixture.reportId);
  assert.equal(Object.hasOwn(evidence, 'dailyKPIEvidence'), false);
  assert.equal(csv.includes(originalText), false);
  legacy.reports.find(entry => entry.id === fixture.reportId).dailyKPIEvidence = fixture.project.reports.find(entry => entry.id === fixture.reportId).dailyKPIEvidence;
  assert.deepEqual(packFor(legacy, saved.draft.id), oldPack);
  assert.equal(toClaimCSV(packFor(legacy, saved.draft.id)), csv);
});
