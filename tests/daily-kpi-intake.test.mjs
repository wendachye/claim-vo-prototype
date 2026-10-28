import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { DEMO_MESSAGE_PHOTOS, getDailyKPIMessageSample, previewDemoMessage, saveDemoMessage } from '../src/data/demo-message-intake.ts';
import { getMessageMatchContext } from '../src/data/message-match.ts';
import { getMessageClarification, getMessageClarificationEligibility, normalizeMessageClarifications, saveMessageClarificationRequest, saveMockClarificationReply } from '../src/data/whatsapp-clarification.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { getItemAreaRollup } from '../src/data/area-allocations.ts';
import { captureDailyKPIEvidence, isDailyKPIEvidenceSnapshot } from '../src/data/daily-kpi-evidence.ts';

const receivedAt = '2026-10-28T09:45:00.000Z';
const layouts = [
  '27/10/26 - TUESDAY\nWIP-01\n\nGKH(03man)\nPA-05 -ERECTION\n4*1*7\n\nMaterials lower down\n\nJV(04man) KPI\n\nTotal (07man)\n\nPA-06 modify pipe 27m height',
  'Date:-26/10/26\n\nKPI\n\nTeam:-15\n3man\n\nErection:-\nLevel6:-\n14 x 4.5 x 4 T\n\n1man support platform remove modification work, purpose ceiling work, angle bar lower down CJ5 :- W3 level6\n\nHrs:8:00 to 19:00hrs',
  '26/10/26 (Monday)\n\nDP01\n\nT11,13,20 KPI\n(WDP-01 Wetwell 1)\n\n20×1×1\n12PM to 1PM hoisting.\n\nAfternoon no materials lower down due to crane breakdown',
];
const setup = () => {
  const workspace = loadShowcaseWorkspace(null, '2026-10-28T09:00:00.000Z');
  return { workspace, project: workspace.projects.find(entry => entry.id === workspace.activeProjectId) };
};
const inputFor = (project, changes = {}) => ({ projectId: project.id, text: layouts[0], photoId: '', submissionId: 'DAILY-KPI-TEST-01', ...changes });
const save = (project, input, date = receivedAt) => saveDemoMessage(project, { ...input, previewKey: previewDemoMessage(project, input).sourceKey }, date);
const updated = result => { assert.equal(result.outcome, 'updated', result.error); return result.project; };
const financialAndProgress = project => Object.fromEntries(['items', 'sourceItems', 'reports', 'baselines', 'contract', 'seed', 'voReviews', 'claimDrafts', 'claimTracking', 'drawingMapping', 'messageMatchReviews', 'voiceTranscriptReviews'].map(key => [key, structuredClone(project[key])]));
const exportsFor = project => project.claimDrafts.map(draft => ({ draft: structuredClone(draft), csv: toClaimCSV(buildClaimPack(project, draft.id).pack) }));

test('daily KPI formats preserve dates, location, manpower, dimensions, hours and remarks without inventing cumulative progress', () => {
  const { project } = setup(), before = structuredClone(project), preserved = financialAndProgress(project), exports = exportsFor(project);
  for (const source of layouts) {
    const input = inputFor(project, { text: `  ${source}\n  ` });
    const preview = previewDemoMessage(project, input);
    assert.equal(preview.canSave, true, preview.error);
    assert.equal(preview.status, 'clarification');
    assert.ok(preview.dailyKPI, source);
    assert.equal(preview.text, input.text);
    assert.equal(preview.item, null);
    assert.equal(preview.completion, null);
    assert.ok(preview.issues.length);
    assert.deepEqual(project, before);
    const saved = updated(save(project, input)), message = saved.whatsappMessages.at(-1);
    assert.equal(message.text, input.text);
    assert.equal(message.demoIntake.input.text, input.text);
    assert.equal(message.date, receivedAt);
    assert.equal(message.receivedAt, receivedAt);
    assert.equal(message.kind, 'clarification');
    assert.equal(message.status, 'clarification');
    assert.equal(message.itemId, null);
    assert.equal(message.completion, null);
    assert.equal(message.completionBasis, 'unclear');
    assert.equal(message.matchSuggestion, undefined);
    assert.equal(getMessageMatchContext(saved, message.id).eligible, false);
    assert.equal(getMessageClarificationEligibility(saved, message.id).eligible, true);
    assert.notEqual(processWhatsAppMessage(saved, message.id).outcome, 'processed');
    assert.deepEqual(financialAndProgress(saved), preserved);
    assert.deepEqual(exportsFor(saved), exports);
    assert.deepEqual(saved.whatsappMessages.slice(0, -1), project.whatsappMessages);
    assert.equal(saved.history.length, project.history.length + 1);
  }
});

test('the daily KPI example is selected-project context and remains clarification-only with a generated bundled photo', () => {
  const { project } = setup();
  const input = inputFor(project, { text: getDailyKPIMessageSample(project), photoId: DEMO_MESSAGE_PHOTOS[0].id });
  const preview = previewDemoMessage(project, input);
  assert.equal(preview.status, 'clarification', preview.error);
  assert.ok(preview.dailyKPI);
  assert.equal(preview.projectCode, project.code);
  assert.equal(preview.completion, null);
  assert.deepEqual(preview.photo, DEMO_MESSAGE_PHOTOS[0]);
  const saved = updated(save(project, input)), message = saved.whatsappMessages.at(-1);
  assert.equal(message.photo, DEMO_MESSAGE_PHOTOS[0].photo);
  assert.equal(message.photoAlt, DEMO_MESSAGE_PHOTOS[0].photoAlt);
  assert.match(message.photoAlt, /Generated demo.*not project evidence/);
  assert.equal(message.itemId, null);
  assert.deepEqual(financialAndProgress(saved), financialAndProgress(project));
});

test('daily dimensions, manpower, team numbers and percentages do not become a progress suggestion', () => {
  const { project } = setup();
  for (const text of [
    layouts[0], layouts[1], layouts[2],
    `${layouts[2]}\n50% today.`,
    `${layouts[0]}\nCOMPLETE=50% TOTAL`,
  ]) {
    const input = inputFor(project, { text }), preview = previewDemoMessage(project, input);
    assert.notEqual(preview.status, 'ready');
    assert.equal(preview.completion, null);
    assert.equal(preview.item, null);
    if (!preview.canSave) {
      const rejected = save(project, input);
      assert.equal(rejected.outcome, 'invalid');
      assert.equal(rejected.project, project);
      continue;
    }
    const saved = updated(save(project, input)), message = saved.whatsappMessages.at(-1);
    assert.equal(message.matchSuggestion, undefined);
    assert.equal(message.completion, null);
    assert.deepEqual(financialAndProgress(processWhatsAppMessage(saved, message.id).project), financialAndProgress(project));
  }
});

test('daily evidence permits only its chosen bundled photo and a matching frozen photo description', () => {
  const { project } = setup(), input = inputFor(project, { photoId: 'column' });
  const saved = updated(save(project, input)), source = saved.whatsappMessages.at(-1);
  const snapshot = captureDailyKPIEvidence(project, source);
  assert.ok(snapshot);
  for (const change of [
    entry => { entry.photo = 'https://example.com/untrusted-daily-photo.jpg'; },
    entry => { entry.photo = '/assets/not-a-bundled-intake-photo.jpg'; },
    entry => { entry.photoAlt = 'Changed photograph description'; },
    entry => { entry.photo = null; },
  ]) {
    const altered = structuredClone(snapshot);
    change(altered);
    assert.equal(isDailyKPIEvidenceSnapshot(altered, project.id, project.code), false);
  }
  for (const change of [
    entry => { entry.demoIntake.input.photoId = 'not-allowlisted'; },
    entry => { entry.demoIntake.input.photoId = ''; },
    entry => { entry.demoIntake.input.photoId = 'platform'; },
    entry => { entry.photo = DEMO_MESSAGE_PHOTOS[1].photo; entry.photoAlt = DEMO_MESSAGE_PHOTOS[1].photoAlt; },
    entry => { entry.photo = 'https://example.com/untrusted-daily-photo.jpg'; },
    entry => { entry.photoAlt = 'Changed photograph description'; },
  ]) {
    const altered = structuredClone(source);
    change(altered);
    assert.equal(captureDailyKPIEvidence(project, altered), null);
  }
  const withoutPhoto = updated(save(project, inputFor(project))).whatsappMessages.at(-1);
  const blankSnapshot = captureDailyKPIEvidence(project, withoutPhoto);
  assert.ok(blankSnapshot);
  assert.equal(blankSnapshot.photo, null);
  assert.equal(blankSnapshot.photoAlt, null);
  assert.equal(isDailyKPIEvidenceSnapshot(blankSnapshot, project.id, project.code), true);
  assert.equal(isDailyKPIEvidenceSnapshot({ ...blankSnapshot, photoAlt: 'Unattached description' }), false);
});

test('daily intake rejects foreign project binding and an explicit foreign project code without changing the inbox', () => {
  const { project } = setup(), before = structuredClone(project);
  for (const input of [
    inputFor(project, { projectId: 'WH02' }),
    inputFor(project, { text: `Project: WH02\n${layouts[0]}` }),
    inputFor(project, { text: `Project: WH02\n${layouts[1]}` }),
    inputFor(project, { text: `Project: WH02\n${layouts[2]}` }),
    inputFor(project, { text: `Project- WH02\n${layouts[2]}` }),
  ]) {
    assert.equal(previewDemoMessage(project, input).canSave, false);
    const result = save(project, input);
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.project, project);
    assert.deepEqual(project, before);
  }
  const local = previewDemoMessage(project, inputFor(project, { text: `Project: ${project.code}\n${layouts[2]}` }));
  assert.equal(local.canSave, true, local.error);
  assert.equal(local.status, 'clarification');
  const localScreenshotLabel = previewDemoMessage(project, inputFor(project, { text: `Project:-${project.code}\n${layouts[0]}` }));
  assert.equal(localScreenshotLabel.canSave, true, localScreenshotLabel.error);
  assert.equal(localScreenshotLabel.status, 'clarification');
});

test('daily saves require their exact preview and reject changed text, photo or project context', () => {
  const { project } = setup(), input = inputFor(project), previewKey = previewDemoMessage(project, input).sourceKey;
  assert.ok(previewKey);
  assert.equal(saveDemoMessage(project, input, receivedAt).outcome, 'invalid');
  for (const changed of [{ ...input, text: `${input.text}\nLater note.` }, { ...input, photoId: 'scaffold' }]) {
    const result = saveDemoMessage(project, { ...changed, previewKey }, receivedAt);
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.project, project);
  }
  const changedProject = structuredClone(project);
  changedProject.version += 1;
  const stale = saveDemoMessage(changedProject, { ...input, previewKey }, receivedAt);
  assert.equal(stale.outcome, 'invalid');
  assert.equal(stale.project, changedProject);
});

test('daily retries deduplicate after storage reload while preserving other projects, saved claims and source evidence', () => {
  const { workspace, project } = setup(), otherProjects = structuredClone(workspace.projects.filter(entry => entry.id !== project.id));
  const input = inputFor(project, { text: layouts[2], photoId: 'platform' });
  const previewKey = previewDemoMessage(project, input).sourceKey;
  const result = saveDemoMessage(project, { ...input, previewKey }, receivedAt), saved = updated(result);
  const original = structuredClone(saved.whatsappMessages.at(-1));
  const store = new Map([[WORKSPACE_STORE, JSON.stringify({ ...workspace, projects: workspace.projects.map(entry => entry.id === saved.id ? saved : entry) })]]);
  const loaded = loadWorkspace({ getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) });
  const restored = loaded.projects.find(entry => entry.id === saved.id);
  assert.deepEqual(restored.whatsappMessages.find(entry => entry.id === original.id), original);
  assert.deepEqual(loaded.projects.filter(entry => entry.id !== saved.id), otherProjects);
  assert.deepEqual(exportsFor(restored), exportsFor(project));
  const duplicate = saveDemoMessage(restored, { ...input, previewKey }, '2026-10-28T11:00:00.000Z');
  assert.equal(duplicate.outcome, 'duplicate');
  assert.equal(duplicate.project, restored);
  assert.equal(duplicate.messageId, original.id);
  assert.equal(saveDemoMessage(restored, { ...input, text: `${input.text}\nReplaced source`, previewKey }, receivedAt).outcome, 'invalid');
});

test('daily clarification retains the original and a separate explicit worker reply without changing totals until processing', () => {
  const { project } = setup(), input = inputFor(project, { photoId: 'column' });
  const savedResult = save(project, input), saved = updated(savedResult), original = structuredClone(saved.whatsappMessages.at(-1));
  const request = saveMessageClarificationRequest(saved, original.id, {
    question: 'Which measured contract item and allocated area is this, and what is its cumulative completion to date?',
  }, '2026-10-28T10:00:00.000Z');
  const requested = updated(request);
  assert.deepEqual(request.thread.original, original);
  assert.deepEqual(financialAndProgress(requested), financialAndProgress(project));
  const area = requested.drawingMapping.areas.find(entry => entry.code === 'BRACKET-A');
  assert.ok(area);
  const replyValues = { text: 'Fictional worker clarification: BRACKET-A scaffold is 50% complete in total.',
    itemId: 'WI-016', areaId: area.id, area: area.code, completion: 50 };
  for (const invalidCompletion of [null, undefined, -1, 101, '50']) {
    const invalid = saveMockClarificationReply(requested, original.id, { ...replyValues, completion: invalidCompletion }, '2026-10-28T10:05:00.000Z');
    assert.equal(invalid.outcome, 'invalid');
    assert.equal(invalid.project, requested);
  }
  const replied = updated(saveMockClarificationReply(requested, original.id, replyValues, '2026-10-28T10:05:00.000Z'));
  assert.deepEqual(financialAndProgress(replied), financialAndProgress(project));
  const context = getMessageClarification(replied, original.id);
  assert.equal(context.stage, 'reply-received');
  assert.equal(context.original.text, input.text);
  assert.deepEqual(context.thread.original, original);
  assert.equal(context.reply.replyToMessageId, original.id);
  assert.equal(context.reply.completion, 50);
  assert.equal(context.reply.photo, original.photo);
  assert.equal(context.reply.sender, original.sender);
  assert.notEqual(context.reply.id, original.id);
  const dailyEvidence = context.reply.originalDailyKPI;
  assert.equal(isDailyKPIEvidenceSnapshot(dailyEvidence, project.id, project.code), true);
  assert.equal(dailyEvidence.messageId, original.id);
  assert.equal(dailyEvidence.text, original.text);
  assert.equal(dailyEvidence.sender, original.sender);
  assert.equal(dailyEvidence.date, original.date);
  assert.equal(dailyEvidence.photo, original.photo);
  assert.equal(isDailyKPIEvidenceSnapshot(dailyEvidence, 'WH02'), false);
  for (const change of [
    reply => { reply.originalDailyKPI = null; },
    reply => { delete reply.originalDailyKPI.date; },
    reply => { reply.originalDailyKPI.projectId = 'WH02'; },
    reply => { reply.originalDailyKPI.projectCode = 'WH02'; },
    reply => { reply.originalDailyKPI.messageId = 'FOREIGN-MESSAGE'; },
    reply => { reply.originalDailyKPI.text += '\nAltered original'; },
    reply => { reply.originalDailyKPI.photo = '/assets/demo-platform.jpg'; },
  ]) {
    const corrupt = structuredClone(replied);
    change(corrupt.whatsappMessages.find(entry => entry.id === context.reply.id));
    assert.deepEqual(normalizeMessageClarifications(corrupt), []);
    const refused = processWhatsAppMessage(corrupt, context.reply.id);
    assert.equal(refused.outcome, 'invalid');
    assert.equal(refused.project, corrupt);
  }
  const stale = structuredClone(replied);
  stale.whatsappMessages.find(entry => entry.id === original.id).text += '\nChanged live source';
  assert.equal(processWhatsAppMessage(stale, context.reply.id).outcome, 'invalid');
  const legacy = structuredClone(replied);
  delete legacy.whatsappMessages.find(entry => entry.id === context.reply.id).originalDailyKPI;
  assert.equal(normalizeMessageClarifications(legacy).length, 1);
  const legacyProcessed = processWhatsAppMessage(legacy, context.reply.id);
  assert.equal(legacyProcessed.outcome, 'processed');
  assert.equal(legacyProcessed.project.reports.find(entry => entry.id === legacyProcessed.reportId).dailyKPIEvidence, undefined);
  const processed = processWhatsAppMessage(replied, context.reply.id);
  assert.equal(processed.outcome, 'processed', processed.error);
  const report = processed.project.reports.find(entry => entry.id === processed.reportId);
  assert.equal(report.status, 'pending');
  assert.equal(report.completion, 50);
  assert.equal(report.message, replyValues.text);
  assert.equal(report.photo, original.photo);
  assert.deepEqual(report.dailyKPIEvidence, dailyEvidence);
  assert.notEqual(report.dailyKPIEvidence, replied.whatsappMessages.find(entry => entry.id === context.reply.id).originalDailyKPI);
  assert.deepEqual(processed.project.items.filter(item => item.id !== 'WI-016').map(item => item.verified), project.items.filter(item => item.id !== 'WI-016').map(item => item.verified));
  assert.deepEqual(getItemAreaRollup(processed.project, 'WI-016', 'verified'), getItemAreaRollup(project, 'WI-016', 'verified'));
  assert.deepEqual(exportsFor(processed.project), exportsFor(project));
  assert.equal(processed.project.whatsappMessages.find(entry => entry.id === original.id).text, input.text);
});
