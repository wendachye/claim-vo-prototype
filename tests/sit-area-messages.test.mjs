import assert from 'node:assert/strict';
import test from 'node:test';
import { createProvidedContractDemo, createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { addSITAreaMessages, getSITAreaMessageUpdate } from '../src/data/sit-area-messages.js';
import { getDrawingMapping, installDrawing } from '../src/data/drawing-mapping.js';
import { getAreaEvidence } from '../src/data/drawing-evidence.js';
import { getAreaVOFlags } from '../src/data/drawing-vo.js';
import { getAreaProgress } from '../src/data/drawing-progress.js';
import { getVOCases } from '../src/data/vo.js';
import { processWhatsAppMessage } from '../src/data/whatsapp.js';

const now = new Date('2026-10-21T13:00:00Z');
const marker = '-SIT-AREA-';
const create = (code = 'SIT-MSG01', date = now) => createSITContractDemo({ code, name: 'Original S.I.T. site update walkthrough' }, date);
const samples = (project) => project.whatsappMessages.filter((message) => message.id.includes(marker));
const legacy = () => {
  const project = create();
  project.whatsappMessages = project.whatsappMessages.filter((message) => !message.id.includes(marker));
  return project;
};
const areaFor = (project, code) => getDrawingMapping(project).areas.find((area) => area.code === code);
const messageFor = (project, code, kind = 'progress') => samples(project).find((message) => message.kind === kind && message.area === `Area ${code}`);
const areaCodes = ['W3-ST36', 'W5-NORTH', 'W5-ESCALATOR', 'W3-COLUMNS', 'W3-AMPH-A', 'W5-AMPH-AB', 'W3-LIFT-CORES', 'W3-TEMP-ACCESS'];

test('new S.I.T. scenarios include source-linked photos and unprocessed updates for all eight newly named areas', () => {
  const project = create();
  const messages = samples(project);
  assert.equal(project.whatsappMessages.length, 18);
  assert.equal(messages.length, 10);
  assert.deepEqual([...new Set(messages.map((message) => message.area.replace(/^Area /, '')))].sort(), [...areaCodes].sort());
  assert.equal(messages.filter((message) => message.kind === 'progress').length, 7);
  assert.equal(messages.filter((message) => message.kind === 'vo').length, 2);
  assert.equal(messages.filter((message) => message.kind === 'clarification').length, 1);
  for (const message of messages) {
    const area = areaFor(project, message.area.replace(/^Area /, ''));
    assert.ok(area);
    assert.equal(message.projectId, project.id);
    assert.equal(message.projectCode, project.code);
    assert.equal(message.status, 'new');
    assert.ok(message.id.startsWith(`${project.id}${marker}${area.code}-`));
    assert.match(message.photo, /^\/assets\/demo-[a-z0-9-]+\.jpg$/);
    assert.match(message.photoAlt, /[Gg]enerated/);
    assert.match(message.photoAlt, /not.*(?:project|evidence|actual)/);
    assert.match(message.text, /[Ss]imulated|[Dd]emo|[Ff]ictional/);
    assert.ok(!message.reportId);
    assert.ok(!project.reports.some((report) => report.sourceMessageId === message.id));
    if (message.kind === 'progress') {
      const item = project.items.find((item) => item.id === message.itemId);
      assert.equal(item.pricingType, 'measured');
      assert.ok(area.workItemIds.includes(item.id));
      assert.ok(message.text.includes(item.ref));
      assert.ok(message.text.includes(item.description));
      assert.ok(message.text.includes(`COMPLETE=${message.completion}% TOTAL`));
      assert.equal(message.completionBasis, 'cumulative');
      assert.equal(item.reported, 0);
      assert.equal(item.verified, 0);
    }
  }
  assert.equal(messageFor(project, 'W5-ESCALATOR').photo, '/assets/demo-escalator-access.jpg');
  assert.equal(messageFor(project, 'W3-LIFT-CORES').photo, '/assets/demo-lift-core.jpg');
  assert.equal(messageFor(project, 'W3-TEMP-ACCESS', 'clarification').photo, '/assets/demo-temporary-stair.jpg');
  assert.deepEqual(project.seed.whatsappMessages, project.whatsappMessages);
  assert.equal(project.reports.length, 7);
  assert.equal(getVOCases(project).length, 3);
  assert.equal(project.claimDrafts[0].snapshot.totals.currentValue, 15894);
});

test('explicitly adding samples preserves every original record and never processes progress or VOs', () => {
  const project = legacy();
  project.whatsappMessages[0].text = 'Original browser-corrected message';
  project.reports[0].message = 'Original saved evidence';
  project.items[0].quantity = 2999;
  project.claimDrafts[0].assessment.note = 'Keep the saved QS note';
  const before = structuredClone(project);
  const preview = getSITAreaMessageUpdate(project, now);
  assert.equal(preview.available, true);
  assert.equal(preview.messageCount, 10);
  assert.equal(preview.messages.length, 10);
  assert.deepEqual(project, before);
  const result = addSITAreaMessages(project, now);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.messageCount, 10);
  assert.ok(result.project.whatsappMessages.some((message) => message.id === result.firstMessageId));
  assert.deepEqual(result.project.whatsappMessages.slice(0, before.whatsappMessages.length), before.whatsappMessages);
  for (const [field, value] of Object.entries(before)) {
    if (!['history', 'whatsappMessages'].includes(field)) assert.deepEqual(result.project[field], value, field);
  }
  assert.equal(result.project.history.length, before.history.length + 1);
  assert.equal(getVOCases(result.project).length, getVOCases(before).length);
  for (const code of areaCodes) assert.equal(getAreaVOFlags(result.project, areaFor(result.project, code).id).openCount, 0);
  assert.deepEqual(project, before);
});

test('processing a sample updates reported completion and saved area evidence, retaining verified progress and claims', () => {
  const project = create();
  const message = messageFor(project, 'W3-ST36');
  const before = structuredClone(project);
  const area = areaFor(project, 'W3-ST36');
  const result = processWhatsAppMessage(project, message.id);
  assert.equal(result.outcome, 'processed');
  const item = result.project.items.find((item) => item.id === 'WI-003');
  assert.equal(item.reported, message.completion);
  assert.equal(item.verified, 0);
  assert.deepEqual(result.project.items.filter((item) => item.id !== 'WI-003'), before.items.filter((item) => item.id !== 'WI-003'));
  const report = result.project.reports.find((report) => report.id === result.reportId);
  assert.equal(report.status, 'pending');
  assert.equal(report.vo, false);
  assert.equal(report.areaMapping.areaId, area.id);
  assert.equal(report.message, message.text);
  assert.equal(report.photo, message.photo);
  const evidence = getAreaEvidence(result.project, area.id).entries.filter((entry) => entry.messageId === message.id);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].reportId, report.id);
  assert.equal(getAreaProgress(result.project, area.id, 'reported').status, 'in-progress');
  assert.equal(getAreaProgress(result.project, area.id, 'verified').status, 'not-started');
  for (const field of ['claimDrafts', 'baselines', 'voReviews', 'drawingMapping']) assert.deepEqual(result.project[field], before[field]);
  const repeated = processWhatsAppMessage(result.project, message.id);
  assert.equal(repeated.outcome, 'duplicate');
  assert.deepEqual(repeated.project, result.project);
  assert.deepEqual(project, before);
});

test('possible-VO photos are only hints until processed, then create unpriced QS cases without changing completion', () => {
  for (const code of ['W5-ESCALATOR', 'W3-COLUMNS']) {
    const project = create();
    const message = messageFor(project, code, 'vo');
    const before = structuredClone(project);
    const area = areaFor(project, code);
    assert.equal(message.itemId, null);
    assert.equal(message.completion, null);
    assert.equal(getAreaVOFlags(project, area.id).newMessageCount, 1);
    assert.equal(getAreaVOFlags(project, area.id).openCount, 0);
    const result = processWhatsAppMessage(project, message.id);
    assert.equal(result.outcome, 'processed');
    const vo = getVOCases(result.project).find((entry) => entry.id === result.reportId);
    assert.equal(vo.status, 'flagged');
    assert.equal(vo.proposedValue, null);
    assert.equal(vo.approvedValue, null);
    assert.equal(vo.report.itemId, null);
    assert.equal(vo.report.completion, null);
    assert.equal(vo.report.areaMapping.areaId, area.id);
    assert.equal(vo.report.photo, message.photo);
    assert.equal(getAreaVOFlags(result.project, area.id).openCount, 1);
    assert.equal(getAreaVOFlags(result.project, area.id).newMessageCount, 0);
    assert.deepEqual(result.project.items, before.items);
    assert.deepEqual(result.project.claimDrafts, before.claimDrafts);
    assert.deepEqual(project, before);
  }
});

test('included access and shared decking do not receive inferred percentages, quantities or additional claim values', () => {
  const project = create();
  const access = messageFor(project, 'W3-TEMP-ACCESS', 'clarification');
  assert.equal(access.completion, null);
  assert.equal(access.completionBasis, 'unclear');
  assert.doesNotMatch(access.text, /COMPLETE=|50\s*%|SGD\s*\d|S\$\s*\d/);
  assert.match(access.text, /[Ii]ncluded/);
  const result = processWhatsAppMessage(project, access.id);
  assert.equal(result.outcome, 'clarification');
  for (const field of ['items', 'reports', 'voReviews', 'claimDrafts', 'baselines']) assert.deepEqual(result.project[field], project[field]);
  assert.ok(!samples(project).some((message) => message.itemId === 'WI-012' && message.kind === 'progress'));
  for (const code of ['W3-AMPH-A', 'W5-AMPH-AB']) {
    const message = messageFor(project, code);
    assert.match(message.text, /D\.1/);
    assert.match(message.text, /[Ii]ncluded/);
  }
  assert.equal(project.items.find((item) => item.id === 'WI-012').quantity, 1);
  assert.equal(project.items.find((item) => item.id === 'WI-012').amount, null);
  assert.equal(project.items.find((item) => item.id === 'WI-013').quantity, 4);
});

test('sample addition is idempotent and a report preserves a removed inbox sample against re-creation', () => {
  const first = addSITAreaMessages(legacy(), now);
  const before = structuredClone(first.project);
  const repeat = addSITAreaMessages(first.project, new Date('2026-10-22T13:00:00Z'));
  assert.equal(repeat.outcome, 'unchanged');
  assert.equal(repeat.messageCount, 0);
  assert.equal(repeat.project, first.project);
  assert.deepEqual(repeat.project, before);
  const progress = messageFor(first.project, 'W3-ST36');
  const processed = processWhatsAppMessage(first.project, progress.id).project;
  processed.whatsappMessages = processed.whatsappMessages.filter((message) => message.id !== progress.id);
  const preserved = structuredClone(processed);
  const afterRemoval = addSITAreaMessages(processed, now);
  assert.equal(afterRemoval.outcome, 'unchanged');
  assert.deepEqual(afterRemoval.project, preserved);
  const fresh = create();
  assert.equal(getSITAreaMessageUpdate(fresh, now).messageCount, 0);
});

test('edited scopes and mismatched area links require manual review rather than fabricated source associations', () => {
  const changes = [
    ['W3-ST36', (project) => { project.items.find((item) => item.id === 'WI-003').description = 'User-reviewed different scope'; }],
    ['W5-ESCALATOR', (project) => { project.drawingMapping.areas.find((area) => area.code === 'W5-ESCALATOR').workItemIds = ['WI-014']; }],
    ['W3-AMPH-A', (project) => { project.drawingMapping.areas.find((area) => area.code === 'W3-AMPH-A').workItemIds = ['WI-009']; }],
    ['W3-LIFT-CORES', (project) => { project.drawingMapping.areas = project.drawingMapping.areas.filter((area) => area.code !== 'W3-LIFT-CORES'); }],
  ];
  for (const [code, change] of changes) {
    const project = legacy(); change(project);
    const before = structuredClone(project);
    const preview = getSITAreaMessageUpdate(project, now);
    assert.equal(preview.available, true);
    assert.ok(preview.skipped.some((entry) => entry.areaCode === code && entry.reason));
    assert.ok(!preview.messages.some((message) => message.area === `Area ${code}`));
    const result = addSITAreaMessages(project, now);
    assert.deepEqual(result.project.items, before.items);
    assert.deepEqual(result.project.drawingMapping, before.drawingMapping);
    assert.deepEqual(project, before);
  }
});

test('existing physical observations and incoming progress are never lowered or displaced by a new demo sample', () => {
  const changes = [
    (project) => { project.items.find((item) => item.id === 'WI-003').reported = 75; },
    (project) => { project.items.find((item) => item.id === 'WI-003').verified = 50; },
    (project) => { project.reports.push({ id: 'KEEP-PROGRESS', projectId: project.id, projectCode: project.code, itemId: 'WI-003', vo: false, status: 'pending', date: '2026-10-22T13:00:00Z', completion: 85 }); },
    (project) => { project.whatsappMessages.push({ id: 'KEEP-INCOMING', projectId: project.id, projectCode: project.code, kind: 'progress', status: 'new', itemId: 'WI-003', text: 'Current incoming update', date: '2026-10-22T13:00:00Z' }); },
  ];
  for (const change of changes) {
    const project = legacy(); change(project);
    const before = structuredClone(project);
    const preview = getSITAreaMessageUpdate(project, now);
    assert.ok(!preview.messages.some((message) => message.kind === 'progress' && message.itemId === 'WI-003'));
    assert.ok(preview.skipped.some((entry) => entry.areaCode === 'W3-ST36'));
    const result = addSITAreaMessages(project, now);
    for (const field of ['items', 'reports', 'claimDrafts']) assert.deepEqual(result.project[field], before[field]);
    assert.deepEqual(project, before);
  }
});

test('non-S.I.T., replaced drawings, foreign evidence, duplicate IDs and invalid dates cannot receive samples', () => {
  const inputs = [null, createProvidedContractDemo({ code: 'CAMPUS01', name: 'Fictional campus' }, now),
    installDrawing(legacy(), { inputKind: 'upload', fileName: 'Other.png', fileSize: 1000, mimeType: 'image/png' }, now).project];
  for (const change of [
    (project) => { project.contract.sourceProfile = 'OTHER'; },
    (project) => { project.whatsappMessages[0].projectId = 'OTHER'; },
    (project) => { project.whatsappMessages[0].projectCode = 'OTHER'; },
    (project) => { project.whatsappMessages.push(structuredClone(project.whatsappMessages[0])); },
    (project) => { project.reports[0].projectId = 'OTHER'; },
  ]) { const project = legacy(); change(project); inputs.push(project); }
  for (const project of inputs) {
    const before = structuredClone(project);
    const preview = getSITAreaMessageUpdate(project, now);
    assert.equal(preview.available, false);
    assert.ok(preview.reason);
    const result = addSITAreaMessages(project, now);
    assert.equal(result.outcome, 'unavailable');
    assert.equal(result.project, project);
    assert.deepEqual(project, before);
  }
  for (const invalidDate of [new Date('invalid'), Symbol('invalid')]) {
    const project = legacy();
    const result = addSITAreaMessages(project, invalidDate);
    assert.equal(result.outcome, 'unavailable');
    assert.equal(result.project, project);
  }
});

test('new sample dates stay inside the chosen local month, and project-specific IDs never overlap', () => {
  const boundary = new Date('2026-10-01T00:00:00+08:00');
  const project = create('SIT-MONTH01', boundary);
  const second = create('SIT-MONTH02', boundary);
  assert.equal(samples(project).length, 10);
  const secondIds = new Set(second.whatsappMessages.map((message) => message.id));
  for (const message of samples(project)) {
    assert.ok(Date.parse(message.date) >= Date.parse('2026-10-01T00:00:00+08:00'));
    assert.ok(Date.parse(message.date) <= boundary.getTime());
    assert.ok(!secondIds.has(message.id));
    assert.ok(message.text.startsWith(`${project.code} |`));
    assert.ok(!message.text.includes(second.code));
  }
});
