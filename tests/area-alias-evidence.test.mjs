import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorkspace } from '../src/data/projects.ts';
import { createAreaAliasDemo } from '../src/data/area-alias-demo.ts';
import { getAreaEvidence, resolveAreaEvidenceSource } from '../src/data/drawing-evidence.ts';
import { getDrawingMapping, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';

const now = new Date('2026-10-10T10:00:00+08:00');
const demo = () => {
  const result = createAreaAliasDemo(seedWorkspace(), now);
  assert.equal(result.outcome, 'updated', result.error);
  return result.project;
};

test('a unique alternate-name inbox message appears on its own drawing area without writes or item-only leakage', () => {
  const project = demo(), before = structuredClone(project);
  const [west, east] = getDrawingMapping(project).areas;
  const westEvidence = getAreaEvidence(project, west.id), eastEvidence = getAreaEvidence(project, east.id);
  assert.deepEqual(westEvidence.entries.map(entry => entry.messageId), [project.whatsappMessages[0].id]);
  assert.deepEqual(eastEvidence.entries.map(entry => entry.messageId), [project.whatsappMessages[1].id]);
  for (const entry of [...westEvidence.entries, ...eastEvidence.entries]) {
    assert.equal(entry.matchKind, 'area-alias');
    assert.equal(entry.matchLabel, 'Matching alternate name');
    assert.equal(entry.status, 'new');
  }
  assert.deepEqual(resolveAreaEvidenceSource(project, west.id, westEvidence.entries[0].id), {
    kind: 'message', messageId: project.whatsappMessages[0].id, reportId: null,
  });
  assert.deepEqual(project, before);
});

test('shared alternate names remain absent from both areas until an explicit clarification identifies one', () => {
  let project = demo();
  const [west, east] = getDrawingMapping(project).areas;
  const ambiguous = project.whatsappMessages[2];
  assert.ok([west, east].every(area => !getAreaEvidence(project, area.id).entries.some(entry => entry.messageId === ambiguous.id)));
  const saved = saveAreaMapping(project, { ...east, areaId: east.id, aliases: [...east.aliases, 'West façade'] }, now);
  assert.equal(saved.outcome, 'updated', saved.error);
  project = saved.project;
  assert.ok([west, east].every(area => !getAreaEvidence(project, area.id).entries.some(entry => entry.messageId === project.whatsappMessages[0].id)));
  assert.equal(getAreaEvidence(project, west.id).entries.length, 0);
});

test('processed alias evidence keeps its original area, message and photo after names are reused elsewhere', () => {
  let project = demo();
  const [west, east] = getDrawingMapping(project).areas;
  const original = structuredClone(project.whatsappMessages[0]);
  const processed = processWhatsAppMessage(project, original.id);
  assert.equal(processed.outcome, 'processed', processed.error);
  project = processed.project;
  const frozen = structuredClone(project.reports[0]);
  assert.equal(frozen.areaMapping.areaId, west.id);
  assert.equal(frozen.areaProgress.allocatedQuantity, 720);
  for (const [areaId, values] of [[west.id, { code: 'WEST2', name: 'Renamed wall', aliases: ['West replacement'] }],
    [east.id, { aliases: ['East wall', 'West façade'] }]]) {
    const area = getDrawingMapping(project).areas.find(entry => entry.id === areaId);
    const saved = saveAreaMapping(project, { ...area, areaId, ...values }, now);
    assert.equal(saved.outcome, 'updated', saved.error);
    project = saved.project;
  }
  const evidence = getAreaEvidence(project, west.id).entries.find(entry => entry.reportId === frozen.id);
  assert.equal(evidence.matchKind, 'saved-area');
  assert.equal(evidence.text, original.text);
  assert.equal(evidence.photo, original.photo);
  assert.equal(evidence.sender, original.sender);
  assert.equal(evidence.date, original.date);
  assert.ok(!getAreaEvidence(project, east.id).entries.some(entry => entry.reportId === frozen.id || entry.messageId === original.id));
  assert.deepEqual(project.reports[0], frozen);
});
