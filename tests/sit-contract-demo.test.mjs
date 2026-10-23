import assert from 'node:assert/strict';
import test from 'node:test';
import * as source from '../src/data/sit-contract-source.ts';
import { createProvidedContractDemo, createSITContractDemo, getProvidedContractSample, getSITContractSample } from '../src/data/provided-contract-demo.ts';
import { getDrawingAsset, getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getDrawingProgress } from '../src/data/drawing-progress.ts';
import { getAreaEvidence } from '../src/data/drawing-evidence.ts';
import { getAreaVOFlags } from '../src/data/drawing-vo.ts';
import { getVOCases } from '../src/data/vo.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { loadWorkspace, resetProject, seedWorkspace, updateProjectState, WORKSPACE_STORE } from '../src/data/projects.ts';

const now = new Date('2026-10-21T13:00:00Z');
const create = (code = 'SIT-DEMO01', date = now) => createSITContractDemo({
  code, name: 'S.I.T. contract walkthrough', country: 'Malaysia', subcontractor: 'Form override',
}, date);
const financialRows = rows => rows.map(({ id, ref, description, quantity, rate, amount, pricingType, sourcePage, startDate, durationMonths }) => ({
  id, ref, description, quantity, rate, amount, pricingType, sourcePage, startDate, durationMonths,
}));

test('the S.I.T. source is an independent representative schedule with the original identity and pricing', () => {
  const sample = getSITContractSample();
  const project = create();
  assert.deepEqual(Object.keys(source).sort(), ['contract', 'initialItems']);
  assert.equal(project.contract.sourceProfile, 'sit-loa-2021');
  assert.equal(project.contract.sourceKind, 'provided');
  assert.equal(project.contract.sourceFile, 'China Con (LOA S.I.T Project).pdf');
  assert.equal(project.contract.sourceFilename, project.contract.sourceFile);
  assert.equal(project.contract.sourcePageCount, 115);
  assert.equal(project.contract.reference, 'CCSC/SIT/SC/21.183');
  assert.equal(project.contract.date, '2021-10-20');
  assert.equal(project.contract.mainContractor, 'China Construction–Straits LLP');
  assert.equal(project.contract.subcontractor, 'Goh Kwang Heng Scaffolding Pte Ltd');
  assert.equal(project.contract.currency, 'SGD');
  assert.equal(project.contract.totalAmount, 543887.61);
  assert.equal(project.country, 'Singapore');
  assert.equal(project.contract.representativeSubset, true);
  assert.equal(project.items.length, 18);
  assert.match(project.contract.sampleNote, /not the full schedule/);
  assert.deepEqual(financialRows(project.items), financialRows(sample.sourceItems));
  assert.equal(project.items[0].quantity, 2088);
  assert.equal(project.items[0].rate, 13.5);
  assert.equal(project.items[0].amount, 28188);
  assert.equal(project.items.filter(row => row.pricingType === 'included').length, 2);
  assert.equal(project.items.filter(row => row.pricingType === 'rateOnly').length, 2);
  assert.equal(Math.round(project.items.reduce((sum, row) => sum + (row.amount ?? 0), 0) * 100) / 100, 377016.72);
  assert.ok(project.sourceItems.every(row => row.reported === 0 && row.verified === 0 && !row.needsReview));
  assert.ok(project.items.every(row => !Object.hasOwn(row, 'rawExtractedQuantity')));
  assert.match(project.contract.demoNotice, /all site updates.*simulated/);
});

test('creating a S.I.T. scenario leaves fictional campus seeds and existing browser projects untouched', () => {
  const workspace = seedWorkspace();
  workspace.projects[0].items[0].quantity = 999;
  workspace.projects[0].reports[0].message = 'Browser-edited evidence';
  const before = structuredClone(workspace);
  const campusBefore = getProvidedContractSample();
  const sourceBefore = getSITContractSample();
  const changedSample = getSITContractSample();
  changedSample.contract.reference = 'Edited copy';
  changedSample.sourceItems[0].rate = 99;
  const sit = create();
  const campus = createProvidedContractDemo({ code: 'CAMPUS01', name: 'Campus walkthrough' }, now);
  assert.deepEqual(workspace, before);
  assert.deepEqual(getProvidedContractSample(), campusBefore);
  assert.deepEqual(getSITContractSample(), sourceBefore);
  assert.equal(campus.contract.sourceKind, 'illustrative');
  assert.equal(campus.contract.sourceFile, null);
  assert.equal(campus.contract.reference, 'DEMO-CAMPUS-SC-001');
  assert.equal(campus.items[0].quantity, 2000);
  assert.equal(sit.items[0].quantity, 2088);
  assert.equal(sit.id, 'SIT-DEMO01');
  assert.notEqual(sit.contract.id, sourceBefore.contract.id);
  sit.items[0].quantity = 123;
  sit.contract.aliases.W3.push('Scenario-only alias');
  assert.equal(campus.items[0].quantity, 2000);
  assert.deepEqual(getSITContractSample(), sourceBefore);
});

test('original drawing references map named source scopes without inventing new pin positions', () => {
  const project = create();
  const mapping = getDrawingMapping(project);
  assert.equal(mapping.drawing.fileName, 'site-plan.png');
  assert.equal(mapping.drawing.inputKind, 'provided');
  assert.equal(getDrawingAsset(project), '/assets/site-plan.png');
  assert.match(project.contract.drawingSource.note, /illustrative manual links/);
  assert.deepEqual(mapping.areas.map(({ code, workItemIds, position }) => ({ code, workItemIds, position })), [
    { code: 'W3-ST31', workItemIds: ['WI-001'], position: { x: .5, y: .83 } },
    { code: 'W3-ST34', workItemIds: ['WI-002'], position: { x: .65, y: .87 } },
    { code: 'W5-ST51', workItemIds: ['WI-004'], position: { x: .58, y: .48 } },
    { code: 'W5-EAST', workItemIds: ['WI-005'], position: { x: .78, y: .51 } },
    { code: 'W3-ST36', workItemIds: ['WI-003'], position: null },
    { code: 'W5-NORTH', workItemIds: ['WI-006'], position: null },
    { code: 'W5-ESCALATOR', workItemIds: ['WI-007'], position: null },
    { code: 'W3-COLUMNS', workItemIds: ['WI-008'], position: null },
    { code: 'W3-AMPH-A', workItemIds: ['WI-009', 'WI-012'], position: null },
    { code: 'W5-AMPH-AB', workItemIds: ['WI-010', 'WI-012'], position: null },
    { code: 'W3-LIFT-CORES', workItemIds: ['WI-011'], position: null },
    { code: 'W3-TEMP-ACCESS', workItemIds: ['WI-013'], position: null },
  ]);
  assert.equal(new Set(mapping.areas.flatMap(area => area.workItemIds)).size, 13);
  for (const area of mapping.areas) {
    const primaryItem = project.items.find(item => item.id === area.workItemIds[0]);
    assert.equal(area.name, primaryItem.description);
    assert.equal(area.page, 1);
    assert.equal(area.projectId, project.id);
    assert.equal(area.drawingId, mapping.drawing.id);
  }
  const status = basis => Object.fromEntries(getDrawingProgress(project, basis).slice(0, 4).map(area => [area.code, area.status]));
  assert.deepEqual(status('verified'), { 'W3-ST31': 'in-progress', 'W3-ST34': 'completed', 'W5-ST51': 'not-started', 'W5-EAST': 'not-started' });
  assert.deepEqual(status('reported'), { 'W3-ST31': 'in-progress', 'W3-ST34': 'completed', 'W5-ST51': 'in-progress', 'W5-EAST': 'not-started' });
  assert.equal(project.items[0].reported, 65);
  assert.equal(project.items[0].verified, 50);
  assert.equal(project.items.find(row => row.id === 'WI-004').verified, 0);
  for (const area of getDrawingProgress(project).slice(4)) assert.equal(area.status, 'not-started');
});

test('shared included decking is linked to both platform scopes without splitting quantities or processing new sample activity', () => {
  const project = create();
  const mapping = getDrawingMapping(project);
  const decking = project.items.find(item => item.id === 'WI-012');
  assert.deepEqual(mapping.areas.filter(area => area.workItemIds.includes(decking.id)).map(area => area.code), ['W3-AMPH-A', 'W5-AMPH-AB']);
  assert.equal(decking.quantity, 1);
  assert.equal(decking.rate, null);
  assert.equal(decking.amount, null);
  assert.equal(decking.pricingType, 'included');
  const access = project.items.find(item => item.id === 'WI-013');
  assert.equal(access.quantity, 4);
  assert.equal(access.pricingType, 'included');
  assert.equal(mapping.areas.filter(area => area.workItemIds.includes(access.id)).length, 1);
  for (const area of mapping.areas.slice(4)) {
    const evidence = getAreaEvidence(project, area.id).entries;
    assert.ok(evidence.length >= 1);
    assert.ok(evidence.every(entry => entry.messageId && !entry.reportId));
    assert.equal(getAreaVOFlags(project, area.id).openCount, 0);
    assert.equal(getAreaVOFlags(project, area.id).newMessageCount, ['W5-ESCALATOR', 'W3-COLUMNS'].includes(area.code) ? 1 : 0);
  }
  const excludedIds = ['WI-014', 'WI-015', 'WI-016', 'WI-017', 'WI-018'];
  assert.ok(mapping.areas.every(area => area.workItemIds.every(id => !excludedIds.includes(id))));
  assert.deepEqual(financialRows(project.items.filter(item => excludedIds.includes(item.id))), financialRows(source.initialItems.filter(item => excludedIds.includes(item.id))));
  assert.equal(project.reports.length, 7);
  assert.equal(project.whatsappMessages.length, 18);
  assert.equal(project.claimDrafts[0].snapshot.totals.currentValue, 15894);
});

test('source-linked messages, photos and three VO decisions stay simulated and replay safely', () => {
  const project = create();
  const before = structuredClone(project);
  assert.equal(project.reports.length, 7);
  assert.equal(project.whatsappMessages.length, 18);
  for (const report of project.reports) {
    const message = project.whatsappMessages.find(entry => entry.id === report.sourceMessageId);
    assert.equal(message.reportId, report.id);
    assert.equal(message.text, report.message);
    assert.equal(message.sender, report.sender);
    assert.equal(message.photo, report.photo);
    assert.match(report.photoAlt, /not project evidence/);
    assert.equal(report.demo, true);
    assert.equal(report.origin, 'simulated');
    assert.ok(report.areaMapping.areaId.startsWith(`AREA-${project.id}-`));
    const savedArea = getDrawingMapping(project).areas.find(area => area.id === report.areaMapping.areaId);
    assert.ok(savedArea);
    assert.ok(['W3-ST31', 'W3-ST34', 'W5-ST51', 'W5-EAST'].includes(savedArea.code));
    assert.deepEqual(report.areaMapping.workItemIds, savedArea.workItemIds);
    const replay = processWhatsAppMessage(project, message.id);
    assert.equal(replay.outcome, 'duplicate');
    assert.deepEqual(replay.project, before);
  }
  const cases = Object.fromEntries(getVOCases(project).map(entry => [entry.report.area, entry]));
  assert.equal(cases['Area W3-ST31'].status, 'flagged');
  assert.equal(cases['Area W3-ST31'].approvedValue, null);
  const queryMessage = project.whatsappMessages.find(message => message.id.endsWith('-005'));
  assert.match(queryMessage.text, /clauses 3\(c\)–\(d\)/);
  assert.equal(cases['Area W5-EAST'].status, 'approved');
  assert.match(cases['Area W5-EAST'].approver, /Fictional/);
  assert.match(cases['Area W5-EAST'].scopeAssessment, /Fictional QS assumption/);
  assert.equal(cases['Area W3-ST34'].status, 'rejected');
  const firstArea = getDrawingMapping(project).areas[0];
  assert.equal(getAreaEvidence(project, firstArea.id).entries.length, 3);
  assert.equal(getAreaVOFlags(project, firstArea.id).openCount, 1);
  const unclear = project.whatsappMessages.find(message => message.kind === 'clarification');
  const result = processWhatsAppMessage(project, unclear.id);
  assert.equal(result.outcome, 'clarification');
  for (const field of ['items', 'reports', 'voReviews', 'claimDrafts']) assert.deepEqual(result.project[field], before[field]);
});

test('fresh S.I.T. progress messages name the exact source scope and stay paired with their original reports', () => {
  const project = create('SIT-TEXT01');
  const second = create('SIT-TEXT02');
  for (const report of project.reports.filter((entry) => !entry.vo)) {
    const item = project.sourceItems.find((entry) => entry.id === report.itemId);
    const message = project.whatsappMessages.find((entry) => entry.id === report.sourceMessageId);
    assert.ok(report.message.startsWith(`${project.code} | ${item.location} | ${report.area} | ${item.id}\n`));
    assert.ok(report.message.includes(`CONTRACT=${item.ref} | ${item.description}`));
    assert.ok(report.message.includes(`SCOPE=${item.subsection}`));
    assert.ok(report.message.includes(`COMPLETE=${report.completion}% TOTAL`));
    assert.match(report.message, /Simulated physical progress.*not actual site activity/);
    assert.equal(message.text, report.message);
    assert.equal(message.itemId, item.id);
    assert.equal(message.area, report.area);
    assert.equal(message.completion, report.completion);
    assert.ok(!message.text.includes(second.code));
    assert.ok(second.whatsappMessages.some((entry) => entry.id.endsWith(message.id.slice(project.id.length))
      && entry.text.startsWith(`${second.code} |`)));
  }
  // The separate fictional campus factory keeps its original message format.
  const campus = createProvidedContractDemo({ code: 'CAMPUS-TEXT01', name: 'Fictional campus' }, now);
  for (const report of campus.reports.filter((entry) => !entry.vo)) {
    assert.equal(report.message, `${campus.code} | ${report.location} | ${report.area} | ${report.itemId}\nCOMPLETE=${report.completion}% TOTAL\nFictional campus scenario progress; not actual site activity.`);
  }
  assert.ok(campus.whatsappMessages.every((message) => !message.text.includes('CONTRACT CONTEXT=')
    && !message.text.includes('Possible source context')));
});

test('S.I.T. scope queries cite source rows and areas as context without inventing a progress match or entitlement', () => {
  const project = create();
  for (const [sequence, itemId] of [['005', 'WI-001'], ['007', 'WI-005'], ['008', 'WI-002']]) {
    const message = project.whatsappMessages.find((entry) => entry.id.endsWith(`-WA-${sequence}`));
    const report = project.reports.find((entry) => entry.sourceMessageId === message.id);
    const item = project.sourceItems.find((entry) => entry.id === itemId);
    const area = getDrawingMapping(project).areas.find((entry) => entry.workItemIds.includes(itemId));
    assert.ok(message.text.includes(`CONTRACT CONTEXT=${item.ref} | ${item.description}`));
    assert.ok(message.text.includes(`SCOPE=${item.subsection}`));
    assert.ok(message.text.includes(`Area ${area.code}`));
    assert.match(message.text, /source row is context only.*QS must confirm scope, instruction and any variation entitlement/);
    assert.equal(message.itemId, null);
    assert.equal(report.itemId, null);
    assert.equal(message.completion, null);
    assert.equal(report.vo, true);
    assert.equal(report.message, message.text);
  }
  const unclear = project.whatsappMessages.find((entry) => entry.kind === 'clarification');
  assert.equal(unclear.itemId, null);
  assert.equal(unclear.completionBasis, 'unclear');
  assert.equal(unclear.area, 'W5');
  assert.match(unclear.text, /Possible source context \(not matched\)/);
  for (const itemId of ['WI-004', 'WI-005']) {
    const item = project.sourceItems.find((entry) => entry.id === itemId);
    const area = getDrawingMapping(project).areas.find((entry) => entry.workItemIds.includes(itemId));
    assert.ok(unclear.text.includes(`${item.ref} | ${item.description}`));
    assert.ok(unclear.text.includes(`Area ${area.code}`));
  }
  assert.ok(!unclear.text.includes('COMPLETE=10% TOTAL'));
  assert.equal(getVOCases(project).find((entry) => entry.status === 'flagged').approvedValue, null);
  assert.deepEqual(project.claimDrafts[0].snapshot.totals, {
    workCurrentValue: 14094, voCurrentValue: 1800, previousValue: 0, cumulativeValue: 15894, currentValue: 15894,
  });
});

test('the S.I.T. draft uses explicit mock QS quantities at original rates and freezes the saved evidence', () => {
  const project = create();
  const draft = project.claimDrafts[0];
  assert.equal(draft.status, 'draft');
  assert.equal(draft.preparedAt, undefined);
  assert.equal(draft.assessment.work['WI-001'].assessedQuantity, 1044);
  assert.equal(draft.assessment.work['WI-001'].previousValue, 0);
  assert.equal(draft.snapshot.totals.workCurrentValue, 14094);
  assert.equal(draft.snapshot.totals.voCurrentValue, 1800);
  assert.equal(draft.snapshot.totals.currentValue, 15894);
  assert.equal(draft.snapshot.canPrepare, true);
  assert.match(draft.assessment.note, /not calculated from the progress percentage/);
  assert.match(draft.assessment.note, /retention, GST and other deductions are not calculated/);
  assert.match(draft.assessment.note, /Not submitted, certified or paid/);
  const frozen = structuredClone(draft.snapshot);
  project.items[0].rate = 99;
  project.items[0].verified = 100;
  project.voReviews.find(review => review.status === 'approved').approvedValue = 9999;
  assert.deepEqual(draft.snapshot, frozen);
  assert.equal(draft.snapshot.workRows.find(row => row.itemId === 'WI-001').rate, 13.5);
});

test('S.I.T. evidence respects local month boundaries and rejects invalid dates', () => {
  for (const chosen of [now, new Date('2026-10-01T00:00:00+08:00')]) {
    const project = create('SIT-DEMO01', chosen);
    const start = Date.parse('2026-10-01T00:00:00+08:00');
    for (const date of [project.lockedAt, project.claimDrafts[0].createdAt,
      ...project.reports.flatMap(report => [report.date, ...(report.verifiedAt ? [report.verifiedAt] : [])]),
      ...project.voReviews.flatMap(review => [review.updatedAt, ...review.history.map(event => event.date)]),
      ...project.history.map(event => event.date)]) {
      assert.ok(Date.parse(date) >= start, date);
      assert.ok(Date.parse(date) <= chosen.getTime(), date);
    }
    assert.equal(project.claimDrafts[0].snapshot.canPrepare, true);
  }
  assert.throws(() => create('SIT-DEMO01', new Date('invalid')), /valid date/);
  assert.throws(() => create('SIT-DEMO01', Symbol('invalid')), /valid date/);
});

test('reload/reset preserve the new source scenario and never mix its records with campus or another S.I.T. project', () => {
  const project = create();
  const second = create('SIT-DEMO02');
  const workspace = seedWorkspace();
  const saved = { ...workspace, activeProjectId: project.id, projects: [...workspace.projects, project, second] };
  const entries = new Map([[WORKSPACE_STORE, JSON.stringify(saved)]]);
  const loaded = loadWorkspace({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  const restored = loaded.projects.find(entry => entry.id === project.id);
  assert.deepEqual(loaded.projects.slice(0, workspace.projects.length), workspace.projects);
  assert.deepEqual(restored.contract, project.contract);
  assert.deepEqual(getDrawingMapping(restored), getDrawingMapping(project));
  assert.equal(getDrawingAsset(restored), '/assets/site-plan.png');
  assert.deepEqual(restored.claimDrafts, project.claimDrafts);
  assert.deepEqual(restored.voReviews, project.voReviews);
  const foreignArea = getDrawingMapping(second).areas[0].id;
  assert.equal(getAreaEvidence(restored, foreignArea), null);
  assert.equal(getAreaVOFlags(restored, foreignArea), null);
  const polluted = { ...restored, reports: [...restored.reports, ...second.reports], voReviews: [...restored.voReviews, ...second.voReviews] };
  assert.deepEqual(getVOCases(polluted), getVOCases(restored));
  const changed = updateProjectState(loaded, restored.id, current => ({ ...current, claimDrafts: [], items: current.items.map(row => ({ ...row, verified: 0 })) }));
  const reset = updateProjectState(changed, restored.id, resetProject);
  const result = reset.projects.find(entry => entry.id === project.id);
  for (const field of ['items', 'reports', 'voReviews', 'claimDrafts']) assert.deepEqual(result[field], project.seed[field]);
  assert.equal(result.drawingMapping, undefined);
  assert.deepEqual(result.contract, project.contract);
  assert.deepEqual(reset.projects.filter(entry => entry.id !== project.id), saved.projects.filter(entry => entry.id !== project.id));
});

test('loading a saved S.I.T. project retains its earlier evidence and claim snapshots after fresh scenario text changes', () => {
  const project = create('SIT-SAVED01');
  const report = project.reports.find((entry) => !entry.vo);
  const message = project.whatsappMessages.find((entry) => entry.id === report.sourceMessageId);
  report.message = 'Earlier browser evidence retained exactly.';
  message.text = report.message;
  project.claimDrafts[0].snapshot.workRows[0].evidence.message = 'Earlier frozen claim evidence retained exactly.';
  const before = structuredClone(project);
  const workspace = { ...seedWorkspace(), activeProjectId: project.id, projects: [project] };
  const entries = new Map([[WORKSPACE_STORE, JSON.stringify(workspace)]]);
  create('SIT-FRESH01');
  const loaded = loadWorkspace({ getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  assert.deepEqual(loaded.projects[0].reports, before.reports);
  assert.deepEqual(loaded.projects[0].whatsappMessages, before.whatsappMessages);
  assert.deepEqual(loaded.projects[0].claimDrafts, before.claimDrafts);
});
