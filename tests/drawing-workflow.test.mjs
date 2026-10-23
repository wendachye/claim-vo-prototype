import assert from 'node:assert/strict';
import test from 'node:test';
import { installDrawing, saveAreaMapping, getDrawingMapping, getAreasForItem } from '../src/data/drawing-mapping.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { seedWorkspace, loadWorkspace, resetProject, updateProjectState, WORKSPACE_STORE } from '../src/data/projects.ts';

const now = new Date('2026-10-21T12:00:00Z');
const addMap = project => installDrawing(project, { inputKind: 'sample' }, now).project;
function linkArea(project, workItemIds) {
  const area = getDrawingMapping(project).areas.find(entry => entry.code === 'A1');
  return saveAreaMapping(project, { ...area, areaId: area.id, workItemIds }, now).project;
}

test('mapped messages retain an area snapshot without automatically verifying or valuing work', () => {
  const original = seedWorkspace().projects.find(project => project.id === 'WH02');
  const project = linkArea(addMap(original), ['WI-001', 'WI-002']);
  const before = structuredClone(project);
  const result = processWhatsAppMessage(project, 'WH02-WA-001');
  assert.equal(result.outcome, 'processed');
  const report = result.project.reports.find(entry => entry.id === result.reportId);
  assert.equal(report.areaMapping.code, 'A1');
  assert.deepEqual(report.areaMapping.workItemIds, ['WI-001', 'WI-002']);
  assert.equal(result.project.items[0].reported, 65);
  assert.equal(result.project.items[0].verified, project.items[0].verified);
  for (const field of ['contract', 'sourceItems', 'baselines', 'voReviews', 'claimDrafts']) assert.deepEqual(result.project[field], before[field]);
  const remapped = linkArea(result.project, ['WI-003']);
  assert.deepEqual(remapped.reports.find(entry => entry.id === report.id).areaMapping, report.areaMapping);
  assert.equal(getAreasForItem(remapped, 'WI-001').length, 0);
  assert.deepEqual(project, before);
});

test('a conflicting area link requires clarification and an area-only message is never inferred into progress', () => {
  const project = linkArea(addMap(seedWorkspace().projects.find(entry => entry.id === 'WH02')), ['WI-003']);
  const conflict = processWhatsAppMessage(project, 'WH02-WA-001');
  assert.equal(conflict.outcome, 'clarification');
  assert.match(conflict.project.whatsappMessages[0].processingNote, /A1.*WI-003.*WI-001/);
  for (const field of ['items', 'reports', 'contract', 'baselines', 'voReviews', 'claimDrafts', 'drawingMapping']) assert.deepEqual(conflict.project[field], project[field]);
  const ambiguous = processWhatsAppMessage(linkArea(project, ['WI-001']), 'WH02-WA-004');
  assert.equal(ambiguous.outcome, 'clarification');
  assert.deepEqual(ambiguous.project.items, project.items);
  assert.deepEqual(ambiguous.project.reports, project.reports);
});

test('reload retains project maps and resetting one project clears only its drawing and links', () => {
  let workspace = seedWorkspace();
  workspace = updateProjectState(workspace, workspace.projects[0].id, addMap);
  workspace = updateProjectState(workspace, 'WH02', project => linkArea(addMap(project), ['WI-001']));
  const saved = JSON.stringify(workspace);
  const storage = { getItem: key => key === WORKSPACE_STORE ? saved : null, setItem() {} };
  const loaded = loadWorkspace(storage);
  assert.deepEqual(getDrawingMapping(loaded.projects[1]), getDrawingMapping(workspace.projects[1]));
  const other = structuredClone(loaded.projects[0]);
  const reset = updateProjectState(loaded, 'WH02', resetProject);
  assert.equal(getDrawingMapping(reset.projects[1]).drawing, null);
  assert.deepEqual(getDrawingMapping(reset.projects[1]).areas, []);
  assert.deepEqual(reset.projects[0], other);
  assert.notEqual(getDrawingMapping(loaded.projects[1]).drawing, null);
});
