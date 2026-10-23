import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, seedWorkspace } from '../src/data/projects.ts';
import { createDemoProject } from '../src/data/demo-project.ts';
import { createAreaSplitDemo } from '../src/data/area-split-demo.ts';
import { createAreaAliasDemo } from '../src/data/area-alias-demo.ts';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { createVoiceNoteDemo } from '../src/data/voice-note-demo.ts';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.ts';
import { createDrawingProgressDemo } from '../src/data/drawing-progress-demo.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getProjectCatalog, getProjectDemoKind, getProjectGroups, findExistingDemo } from '../src/data/demo-catalog.ts';
import { applyMockContract } from '../src/data/contract-import.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

const now = new Date('2026-10-24T12:00:00+08:00');
const make = (factory, workspace = seedWorkspace()) => {
  const result = factory(workspace, now);
  assert.ok(result.outcome === 'updated' || result.outcome === 'created', result.error);
  return result;
};
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) freeze(entry);
  }
  return value;
};

test('catalog recognizes canonical fixtures and distinguishes inherited area split demo variants', () => {
  const workspace = seedWorkspace();
  assert.deepEqual(workspace.projects.map(getProjectDemoKind), ['campus', 'warehouse']);
  for (const [factory, kind] of [
    [createAreaSplitDemo, 'area-split'], [createAreaAliasDemo, 'area-alias'],
    [createMessageMatchDemo, 'message-match'], [createVoiceNoteDemo, 'voice-note'],
    [createDrawingProgressDemo, 'drawing-progress'],
  ]) {
    const { project } = make(factory);
    assert.equal(getProjectDemoKind(project), kind);
    // Display names are not the identity; the immutable seed recognizes a demo
    // even after the user processed or removed its visible messages.
    assert.equal(getProjectDemoKind({ ...project, name: 'My renamed example', whatsappMessages: [] }), kind);
  }
  assert.equal(getProjectDemoKind(createClaimExamplesDemo({}, now)), 'claim-examples');
  assert.equal(getProjectDemoKind(createDemoProject({ code: 'CUSTOM-SAMPLE', name: 'My walkthrough' }, now)), 'sample-project');
  assert.equal(getProjectDemoKind(createSITContractDemo({ code: 'SIT-SCENARIO', name: 'Original contract' }, now)), 'contract-scenario');
});

test('names and codes alone never hide ordinary projects under demo examples', () => {
  for (const [code, name] of [
    ['AREA-SPLIT01', 'Voice-note review (Demo)'], ['MAP01', 'Drawing Progress Showcase (Demo)'],
    ['CLAIM-EXAMPLES', 'Claim examples (Demo)'], ['SIT01', 'Campus Scaffold (Demo)'],
    ['WH02', 'Warehouse Extension (Demo)'],
  ]) {
    const project = createProject({ code, name });
    assert.equal(getProjectDemoKind(project), null, code);
    assert.equal(getProjectCatalog([project]).projects[0], project);
  }
  const imported = { ...createProject({ code: 'CLIENT', name: 'Client contract' }),
    contract: { sourceKind: 'provided', sourceProfile: 'sit-loa-2021' } };
  assert.equal(getProjectDemoKind(imported), null);
});

test('main showcase stays separate from examples, with regular projects and all duplicates retained', () => {
  const first = createSITContractDemo({ code: 'SIT-DEMO01', name: 'Earlier S.I.T. scenario' }, now);
  const main = createSITContractDemo({ code: 'SIT-DEMO02', name: 'Main S.I.T.' }, now);
  const custom = createProject({ code: 'CLIENT01', name: 'Customer project' });
  const voice = make(createVoiceNoteDemo).project;
  const duplicate = make(createVoiceNoteDemo, { ...seedWorkspace(), projects: [...seedWorkspace().projects, voice] }).project;
  const projects = [first, custom, main, voice, duplicate];
  const before = structuredClone(projects);
  const grouped = getProjectCatalog(freeze(projects), main.id);
  assert.equal(grouped.showcase, main);
  assert.deepEqual(grouped.projects, [custom]);
  assert.deepEqual(grouped.examples, [first, voice, duplicate]);
  assert.equal(grouped.examples.length + grouped.projects.length + 1, projects.length);
  assert.deepEqual(projects, before);
  assert.equal(grouped.examples[1], voice);
  assert.equal(getProjectCatalog(projects).showcase, first, 'fallback uses first existing original S.I.T., not a fresh copy');
  assert.equal(getProjectCatalog(projects, custom.id).showcase, first, 'a stale or invalid showcase ID cannot promote an ordinary project');
});

test('workspace marker selects the exact main showcase while later examples remain grouped', () => {
  const first = createSITContractDemo({ code: 'SIT-A', name: 'Earlier scenario' }, now);
  const marked = createSITContractDemo({ code: 'SIT-B', name: 'Marked scenario' }, now);
  const workspace = { ...seedWorkspace(), projects: [first, marked], sitShowcase: { version: 1, projectId: marked.id } };
  assert.equal(getProjectGroups(workspace).showcase, marked);
  assert.deepEqual(getProjectGroups(workspace).examples, [first]);
});

test('reuse keeps the current duplicate or earliest stored matching example without reset or copying', () => {
  const first = make(createAreaSplitDemo);
  const second = make(createAreaSplitDemo, first.workspace);
  const processed = processWhatsAppMessage(first.project, first.project.whatsappMessages[0].id);
  assert.equal(processed.outcome, 'processed', processed.error);
  const existing = { ...second.workspace, activeProjectId: 'SIT01',
    projects: second.workspace.projects.map(project => project.id === first.project.id ? processed.project : project) };
  const before = structuredClone(existing);
  freeze(existing);
  assert.equal(findExistingDemo(existing, 'area-split'), processed.project);
  assert.equal(findExistingDemo({ ...existing, activeProjectId: second.project.id }, 'area-split'), second.project);
  assert.equal(findExistingDemo(existing, 'voice-note'), null);
  assert.deepEqual(existing, before);
  assert.equal(processed.project.reports.length, 1);
  assert.equal(findExistingDemo(existing, 'area-split').reports[0], processed.project.reports[0]);
});

test('specialized fixtures cannot be reopened as a plain area split and repeated openers preserve saved claims', () => {
  const voice = make(createVoiceNoteDemo);
  const match = make(createMessageMatchDemo, voice.workspace);
  const alias = make(createAreaAliasDemo, match.workspace);
  const paid = createClaimExamplesDemo({ code: 'PAID-RECORDS' }, now);
  const workspace = { ...alias.workspace, projects: [...alias.workspace.projects, paid] };
  const saved = structuredClone(paid.claimDrafts);
  const exports = paid.claimDrafts.map(draft => toClaimCSV(buildClaimPack(paid, draft.id).pack));
  const before = structuredClone(workspace);
  freeze(workspace);
  assert.equal(findExistingDemo(workspace, 'area-split'), null);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(findExistingDemo(workspace, 'voice-note'), voice.project);
    assert.equal(findExistingDemo(workspace, 'message-match'), match.project);
    assert.equal(findExistingDemo(workspace, 'area-alias'), alias.project);
    assert.equal(findExistingDemo(workspace, 'claim-examples'), paid);
  }
  assert.deepEqual(workspace, before);
  assert.deepEqual(paid.claimDrafts, saved);
  assert.deepEqual(paid.claimDrafts.map(draft => toClaimCSV(buildClaimPack(paid, draft.id).pack)), exports);
});

test('validated explicit metadata classifies new demo fixtures without relying on legacy IDs', () => {
  const project = { ...createProject({ code: 'EXAMPLE', name: 'Renamed fixture' }), demoKind: 'voice-note' };
  assert.equal(getProjectDemoKind(project), 'voice-note');
  assert.equal(getProjectDemoKind({ ...project, demoKind: 'unknown' }), null);
  assert.equal(getProjectCatalog([project]).examples[0], project);
});

test('mock contract imports remain examples with source provenance, while an ordinary upload stays regular', () => {
  const empty = createProject({ code: 'IMPORT-EXAMPLE', name: 'Extraction review' });
  const workspace = { ...seedWorkspace(), projects: [...seedWorkspace().projects, empty] };
  const result = applyMockContract(workspace, empty.id, { inputKind: 'upload', fileName: 'User-selected.pdf', fileSize: 2500 }, now);
  assert.equal(result.outcome, 'applied', result.error);
  const { demoTemplate, ...legacyImported } = result.project;
  assert.equal(getProjectDemoKind(legacyImported), 'sample-project');
  const actualUpload = { ...empty, contract: { ...empty.contract, demoImport: result.project.contract.demoImport, sourceKind: 'provided', sourceFile: 'uploaded.pdf' } };
  assert.equal(getProjectDemoKind(actualUpload), null);
});

test('reserved legacy S.I.T. fixture groups as an example only with its original source and seed fingerprints', () => {
  const fixture = createSITContractDemo({ code: 'SIT01', name: 'S.I.T. Plot 1' }, now);
  const { providedContractDemo, ...legacy } = fixture;
  delete legacy.contract.sourceProfile;
  const before = structuredClone(legacy);
  const csv = legacy.claimDrafts.map(draft => toClaimCSV(buildClaimPack(legacy, draft.id).pack));
  freeze(legacy);
  assert.equal(getProjectDemoKind(legacy), 'contract-scenario');
  assert.equal(getProjectCatalog([legacy]).showcase, null, 'legacy test fixture does not replace the canonical main showcase');
  assert.equal(getProjectCatalog([legacy]).examples[0], legacy);
  assert.equal(getProjectDemoKind({ ...legacy, name: 'Renamed old walkthrough' }), 'contract-scenario');
  assert.deepEqual(legacy, before);
  assert.deepEqual(legacy.claimDrafts.map(draft => toClaimCSV(buildClaimPack(legacy, draft.id).pack)), csv);
  assert.equal(getProjectDemoKind({ ...legacy, id: 'CUSTOM-SIT', code: 'CUSTOM-SIT' }), null);
  assert.equal(getProjectDemoKind({ ...legacy, seed: { ...legacy.seed, sourceItems: [] } }), null);
  assert.equal(getProjectDemoKind({ ...legacy, seed: { ...legacy.seed, sourceItems: legacy.seed.sourceItems.map(item => item.id === 'WI-002' ? { ...item, quantity: 999 } : item) } }), null);
  assert.equal(getProjectDemoKind({ ...legacy, contract: { ...legacy.contract, sourceFilename: 'My actual uploaded contract.pdf' } }), null);
});
