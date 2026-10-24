import test from 'node:test';
import assert from 'node:assert/strict';
import { accessSync } from 'node:fs';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { DEMO_MESSAGE_PHOTOS, getDemoMessageSample, previewDemoMessage, saveDemoMessage } from '../src/data/demo-message-intake.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { getMessageClarificationEligibility } from '../src/data/whatsapp-clarification.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { getAreaItemProgress, getItemAreaRollup } from '../src/data/area-allocations.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

const now = '2026-10-24T03:00:00.000Z';
const setup = () => {
  const workspace = loadShowcaseWorkspace(null, '2026-10-24T02:00:00.000Z');
  return { workspace, project: workspace.projects.find(entry => entry.id === workspace.activeProjectId) };
};
const values = (project, changes = {}) => ({ projectId: project.id, text: getDemoMessageSample(project), photoId: '', submissionId: 'INTAKE-TEST-01', ...changes });
const replace = (project, from, to, changes = {}) => values(project, { text: getDemoMessageSample(project).replace(from, to), ...changes });
const save = (project, input, date = now) => saveDemoMessage(project, { ...input, previewKey: previewDemoMessage(project, input).sourceKey }, date);
const updated = result => { assert.equal(result.outcome, 'updated', result.error); return result.project; };
const protectedFields = project => Object.fromEntries(['items', 'sourceItems', 'reports', 'baselines', 'contract', 'seed', 'voReviews', 'claimDrafts', 'claimTracking', 'drawingMapping', 'messageClarifications', 'messageMatchReviews', 'voiceTranscriptReviews'].map(key => [key, structuredClone(project[key])]));
const exportsFor = project => project.claimDrafts.map(draft => ({ draft: structuredClone(draft), csv: toClaimCSV(buildClaimPack(project, draft.id).pack) }));

test('preview resolves only the selected project’s formatted item and saved area without changing anything', () => {
  const { project } = setup(), before = structuredClone(project), input = values(project), original = input.text;
  const preview = previewDemoMessage(project, input);
  assert.equal(preview.canSave, true); assert.equal(preview.status, 'ready'); assert.deepEqual(preview.issues, []);
  assert.equal(preview.item.id, 'WI-016'); assert.equal(preview.area.code, 'BRACKET-A'); assert.equal(preview.completion, 50);
  assert.equal(preview.text, original); assert.equal(preview.photo, null); assert.ok(preview.sourceKey);
  preview.item.description = 'Preview copy'; preview.area.name = 'Preview area copy';
  assert.deepEqual(project, before); assert.equal(input.text, original);
  const inline = previewDemoMessage(project, values(project, { text: original.replace('\nCOMPLETE=', ' | COMPLETE=') }));
  assert.equal(inline.status, 'ready');
});

test('optional attachments are existing bundled generated demo illustrations, never caller paths', () => {
  const { project } = setup();
  for (const photo of DEMO_MESSAGE_PHOTOS) {
    accessSync(new URL(`../public${photo.photo}`, import.meta.url));
    const input = values(project, { photoId: photo.id });
    const preview = previewDemoMessage(project, input);
    assert.equal(preview.status, 'ready'); assert.deepEqual(preview.photo, photo); assert.match(photo.photoAlt, /Generated demo.*not project evidence/);
    const saved = save(project, input).project.whatsappMessages.at(-1);
    assert.equal(saved.photo, photo.photo); assert.equal(saved.photoAlt, photo.photoAlt);
  }
  for (const photoId of ['https://example.com/site.jpg', '/assets/demo-platform.jpg', '../photo.jpg', {}, null]) {
    const input = values(project, { photoId }); assert.equal(previewDemoMessage(project, input).canSave, false);
    assert.equal(save(project, input).project, project);
  }
});

test('saving appends one immutable source and received event, preserving progress, seeds, claims and exports', () => {
  const { project } = setup(), before = structuredClone(project), protectedBefore = protectedFields(project), packs = exportsFor(project);
  const input = values(project, { text: `  ${getDemoMessageSample(project)}\nWorker note retained exactly.  `, photoId: 'scaffold' });
  const result = save(project, input), saved = updated(result), message = saved.whatsappMessages.at(-1);
  assert.equal(result.messageId, message.id); assert.equal(saved.whatsappMessages.length, project.whatsappMessages.length + 1);
  assert.deepEqual(saved.whatsappMessages.slice(0, -1), project.whatsappMessages);
  assert.equal(saved.history.length, project.history.length + 1); assert.equal(saved.history[0].action, 'Demo message received');
  assert.deepEqual(saved.history.slice(1), project.history); assert.deepEqual(project, before);
  assert.deepEqual(protectedFields(saved), protectedBefore); assert.deepEqual(exportsFor(saved), packs);
  assert.equal(message.text, input.text); assert.equal(message.status, 'new'); assert.equal(message.kind, 'progress');
  assert.equal(message.sender, 'Demo worker'); assert.equal(message.date, now); assert.equal(message.receivedAt, now);
  assert.equal(message.channel, 'whatsapp-intake-mock'); assert.equal(message.demo, true); assert.equal(message.origin, 'simulated');
  assert.equal(message.areaId, undefined); assert.equal(message.areaMapping, undefined); assert.equal(message.areaProgress, undefined);
  assert.deepEqual(message.demoIntake.input, { projectId: project.id, text: input.text, photoId: 'scaffold' });
  assert.equal(message.demoIntake.receivedAt, now); assert.equal(message.matchSuggestion.fields.itemId, 'WI-016');
  assert.equal(getMessageMatchContext(saved, message.id).requiresReview, true);
  assert.equal(processWhatsAppMessage(saved, message.id).outcome, 'invalid');
});

test('a unique saved alternate name resolves while shared, unknown or conflicting references require clarification', () => {
  const { project } = setup();
  const unique = previewDemoMessage(project, replace(project, 'BRACKET-A', 'Bracket zone A'));
  assert.equal(unique.status, 'ready'); assert.equal(unique.area.code, 'BRACKET-A');
  assert.equal(previewDemoMessage(project, values(project, { text: `${getDemoMessageSample(project)}\nBracket zone A work checked.` })).status, 'ready');
  for (const [from, to, expected] of [
    ['BRACKET-A', 'Bracket zone', /matches BRACKET-A and BRACKET-B/],
    ['BRACKET-A', 'Unlisted place', /not a saved code/],
    ['WI-016', 'WI-999', /not in this project/],
    ['WI-016', 'WI-001', /not linked to this contract item/],
  ]) {
    const input = replace(project, from, to), preview = previewDemoMessage(project, input);
    assert.equal(preview.canSave, true); assert.equal(preview.status, 'clarification'); assert.match(preview.issues.join(' '), expected);
    const result = save(project, input), saved = updated(result), message = saved.whatsappMessages.at(-1);
    assert.equal(message.kind, 'clarification'); assert.equal(message.status, 'clarification'); assert.equal(message.matchSuggestion, undefined);
    assert.equal(message.text, input.text); assert.equal(message.areaId, undefined); assert.equal(message.areaProgress, undefined);
    assert.equal(getMessageClarificationEligibility(saved, message.id).eligible, true);
    assert.deepEqual(protectedFields(saved), protectedFields(project));
    if (to === 'Bracket zone' || to === 'Unlisted place') assert.equal(preview.area, null);
    if (to === 'WI-999') assert.equal(message.itemId, null);
  }
});

test('unspecified and incremental totals and contradictory notes stay clarification-only', () => {
  const { project } = setup();
  const cases = [
    getDemoMessageSample(project).replace('50% TOTAL', '10%'),
    getDemoMessageSample(project).replace('50% TOTAL', '10% TODAY'),
    getDemoMessageSample(project).replace('50% TOTAL', '+10% TOTAL'),
    `${getDemoMessageSample(project)}\nAnother 10% completed.`,
    `${getDemoMessageSample(project)}\nUse WI-001 instead.`,
    `${getDemoMessageSample(project)}\nActually area BRACKET-B.`,
    `${getDemoMessageSample(project)}\nActually Bracket zone B.`,
    `${getDemoMessageSample(project)}\nCheck Bracket zone.`,
    `${getDemoMessageSample(project)}\nCompletion is 70%.`,
    `${getDemoMessageSample(project)}\nAdditional work needs a separate price.`,
    `${getDemoMessageSample(project)}\nPossible VO.`,
  ];
  for (const text of cases) {
    const input = values(project, { text }), preview = previewDemoMessage(project, input);
    assert.equal(preview.canSave, true, text); assert.equal(preview.status, 'clarification', text); assert.ok(preview.issues.length);
    const result = save(project, input), saved = updated(result), message = saved.whatsappMessages.at(-1);
    assert.equal(message.matchSuggestion, undefined); assert.equal(message.completionBasis, 'unclear');
    assert.equal(getMessageClarificationEligibility(saved, message.id).eligible, true); assert.equal(saved.reports.length, project.reports.length);
  }
});

test('foreign projects, malformed fields/percentages and unsupported pricing never silently resolve', () => {
  const { project } = setup();
  const cases = [
    values(project, { projectId: 'WH02' }),
    replace(project, project.code, 'WH02'),
    replace(project, '| WI-016', '| WI-016 | WI-001'),
    replace(project, 'WI-016', 'WI-016 or WI-001'),
    replace(project, 'Project-wide', ''),
    replace(project, '50%', '101%'), replace(project, '50%', '-1%'), replace(project, '50%', '-0%'),
    replace(project, '50%', 'NaN%'), replace(project, '50%', 'fifty%'), replace(project, '50%', '50'),
    replace(project, 'WI-016', 'WI-017'), replace(project, 'WI-016', 'WI-012'),
    values(project, { text: 'Area A is half done' }), values(project, { text: 'x'.repeat(4001) }),
    values(project, { text: `${getDemoMessageSample(project)}\u0000` }),
    values(project, { completion: 50 }), values(project, { submissionId: 'short' }),
    null, [], 'message',
  ];
  for (const input of cases) {
    const before = structuredClone(project), preview = previewDemoMessage(project, input), result = save(project, input);
    assert.equal(preview.canSave, false, JSON.stringify(input)); assert.equal(preview.status, 'invalid');
    assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project); assert.deepEqual(project, before);
  }
  for (const completion of ['0%', '100%', '12.5%']) assert.equal(previewDemoMessage(project, replace(project, '50%', completion)).status, 'ready');
});

test('save requires the exact preview and rejects stale mapping, contract scope, form text or photo', () => {
  const { project } = setup(), input = values(project), key = previewDemoMessage(project, input).sourceKey;
  assert.equal(saveDemoMessage(project, input, now).outcome, 'invalid');
  for (const change of [
    value => { value.version += 1; }, value => { value.locked = false; },
    value => { value.items.find(item => item.id === 'WI-016').quantity = 200; },
    value => { value.drawingMapping.areas.at(-2).aliases.push('New nickname'); },
    value => { value.drawingMapping.areas.at(-2).position = { x: 10, y: 20 }; },
    value => { value.drawingMapping.areas.at(-2).workItemQuantities['WI-016'] = 80; },
    value => { value.drawingMapping.areas.at(-2).aliases = { invalid: true }; },
  ]) {
    const changed = structuredClone(project); change(changed);
    const result = saveDemoMessage(changed, { ...input, previewKey: key }, now);
    assert.equal(result.outcome, 'invalid'); assert.match(result.error, /changed.*Preview again/); assert.equal(result.project, changed);
  }
  for (const changed of [{ ...input, text: input.text + '\nLater note.' }, { ...input, photoId: 'scaffold' }]) {
    assert.equal(saveDemoMessage(project, { ...changed, previewKey: key }, now).outcome, 'invalid');
  }
});

test('unrelated progress, review events, saved claims and mapping history do not invalidate a message preview', () => {
  const { project } = setup(), input = values(project), key = previewDemoMessage(project, input).sourceKey, changed = structuredClone(project);
  changed.items[0].reported = 90; changed.items[0].verified = 80; changed.items[0].reviewedAt = now;
  changed.reports.push({ id: 'ANOTHER-REPORT', itemId: 'WI-001', status: 'verified', completion: 80, date: now });
  changed.history.push({ id: 'ANOTHER-EVENT', action: 'Supervisor review', date: now });
  changed.messageMatchReviews = []; changed.voiceTranscriptReviews = [];
  changed.claimDrafts[0].status = 'prepared'; changed.claimTracking = [];
  changed.drawingMapping.history.push({ id: 'PIN-HISTORY', action: 'updateArea', date: now });
  assert.equal(previewDemoMessage(changed, input).sourceKey, key);
  assert.equal(saveDemoMessage(changed, { ...input, previewKey: key }, now).outcome, 'updated');
  const parsed = JSON.parse(key);
  assert.equal(parsed.project.reports, undefined); assert.equal(parsed.project.items[0].reported, undefined);
  assert.equal(parsed.project.history, undefined); assert.equal(parsed.project.mappingHistory, undefined);
});

test('a repeated submission reopens the original without duplicating or replacing it, even after processing or a map rename', () => {
  const { project } = setup(), input = values(project), previewKey = previewDemoMessage(project, input).sourceKey;
  let result = saveDemoMessage(project, { ...input, previewKey }, now), saved = updated(result), id = result.messageId;
  saved = updated(saveMessageMatchReview(saved, id, { itemId: 'WI-016', areaId: saved.drawingMapping.areas.at(-2).id, reason: '' }, '2026-10-24T04:00:00Z'));
  saved = processWhatsAppMessage(saved, id).project;
  saved = { ...saved, drawingMapping: { ...saved.drawingMapping, areas: saved.drawingMapping.areas.map(area => ({ ...area, name: area.name + ' renamed' })) } };
  const before = structuredClone(saved);
  result = saveDemoMessage(saved, { ...input, previewKey }, '2026-10-25T04:00:00Z');
  assert.equal(result.outcome, 'duplicate'); assert.equal(result.messageId, id); assert.equal(result.project, saved); assert.deepEqual(saved, before);
  assert.equal(saved.whatsappMessages.at(-1).date, now);
  assert.equal(saveDemoMessage(saved, { ...input, text: input.text + ' Replaced.', previewKey }, now).outcome, 'invalid');
  const malformed = structuredClone(saved); malformed.whatsappMessages.at(-1).demoIntake.receivedAt = 'bad-date';
  assert.equal(saveDemoMessage(malformed, { ...input, previewKey }, now).outcome, 'invalid');
});

test('a fresh inbox message passes through separate match, processing, area verification and assessed claim evidence', () => {
  const { workspace, project } = setup(), oldExports = exportsFor(project), otherProjects = workspace.projects.filter(entry => entry.id !== project.id);
  const input = values(project, { photoId: 'scaffold' });
  const received = save(project, input), id = received.messageId; let current = updated(received);
  const area = current.drawingMapping.areas.at(-2), before = protectedFields(project);
  assert.equal(getAreaItemProgress(current, area.id, 'WI-016').completion, null);
  current = updated(saveMessageMatchReview(current, id, { itemId: 'WI-016', areaId: area.id, reason: '' }, '2026-10-24T04:00:00Z'));
  assert.deepEqual(current.items, before.items); assert.deepEqual(current.reports, before.reports);
  const processed = processWhatsAppMessage(current, id); assert.equal(processed.outcome, 'processed'); current = processed.project;
  assert.equal(getAreaItemProgress(current, area.id, 'WI-016', 'reported').completion, 50);
  assert.equal(getItemAreaRollup(current, 'WI-016', 'reported').completion, 25); assert.equal(getItemAreaRollup(current, 'WI-016', 'verified').completion, null);
  current = updated(verifyProgressReport(current, processed.reportId, 50, '', '2026-10-24T05:00:00Z'));
  assert.equal(getItemAreaRollup(current, 'WI-016', 'verified').completedQuantity, 45);
  current = updated(saveClaimDraft(current, '2026-10', { priorConfirmed: true, work: { 'WI-016': { include: true, assessedQuantity: 45, previousValue: 0 } } }));
  const draft = current.claimDrafts.at(-1), pack = buildClaimPack(current, draft.id).pack;
  assert.equal(pack.totals.currentValue, 4050); assert.equal(pack.evidenceRefs.length, 1);
  assert.equal(pack.evidenceRefs[0].message, input.text); assert.equal(pack.evidenceRefs[0].photo, DEMO_MESSAGE_PHOTOS[0].photo);
  assert.equal(pack.evidenceRefs[0].matchReview.confirmed.areaCode, 'BRACKET-A');
  assert.deepEqual(exportsFor(current).slice(0, oldExports.length), oldExports);
  const store = new Map([[WORKSPACE_STORE, JSON.stringify({ ...workspace, projects: workspace.projects.map(entry => entry.id === current.id ? current : entry) })]]);
  const loaded = loadWorkspace({ getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) });
  const loadedProject = loaded.projects.find(entry => entry.id === current.id);
  assert.deepEqual(loadedProject.whatsappMessages.find(message => message.id === id).demoIntake, current.whatsappMessages.find(message => message.id === id).demoIntake);
  assert.deepEqual(loaded.projects.filter(entry => entry.id !== current.id), otherProjects);
  assert.deepEqual(loadedProject.claimDrafts.at(-1), draft);
  assert.equal(saveDemoMessage(loadedProject, { ...input, previewKey: previewDemoMessage(project, input).sourceKey }, now).outcome, 'duplicate');
});

test('malformed inbox/history and invalid dates retain the original project without fixture fallback', () => {
  const { project } = setup(), input = values(project);
  for (const change of [
    value => { value.whatsappMessages = {}; },
    value => { value.whatsappMessages[0].projectId = 'FOREIGN'; },
    value => { value.whatsappMessages.push(structuredClone(value.whatsappMessages[0])); },
    value => { value.history = {}; }, value => { value.reports = {}; },
    value => { value.items.push(structuredClone(value.items[0])); },
  ]) {
    const changed = structuredClone(project); change(changed);
    const result = save(changed, input); assert.equal(result.outcome, 'invalid'); assert.equal(result.project, changed);
  }
  for (const date of [null, undefined, false, '', NaN, {}, new Date('bad')]) {
    if (date === undefined) continue; // The omitted argument intentionally uses the current date.
    const result = save(project, input, date); assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project);
  }
});
