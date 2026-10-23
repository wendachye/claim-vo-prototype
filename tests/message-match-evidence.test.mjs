import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorkspace } from '../src/data/projects.ts';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { getAreaEvidence, resolveAreaEvidenceSource } from '../src/data/drawing-evidence.ts';
import { saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { saveAreaMapping } from '../src/data/drawing-mapping.ts';

const now = new Date('2026-10-12T10:00:00Z');
const fixture = () => createMessageMatchDemo(seedWorkspace(), now).project;
const area = (project, code) => project.drawingMapping.areas.find(area => area.code === code);
const checked = result => { assert.equal(result.outcome, 'updated', result.error); return result.project; };
const confirm = (project, index, code, reason = '') => checked(saveMessageMatchReview(project, project.whatsappMessages[index].id,
  { itemId: 'WI-001', areaId: area(project, code).id, reason }, now));

test('unreviewed mock proposals are not assigned to drawing areas, while ordinary explicit messages retain existing behavior', () => {
  const project = fixture(), before = structuredClone(project);
  for (const mapped of project.drawingMapping.areas) assert.deepEqual(getAreaEvidence(project, mapped.id).entries, []);
  assert.deepEqual(project, before);
  const { matchSuggestion, ...ordinary } = project.whatsappMessages[0];
  const legacy = { ...project, whatsappMessages: [ordinary] };
  assert.equal(getAreaEvidence(legacy, area(legacy, 'WEST').id).entries[0].messageId, ordinary.id);
  assert.equal(getAreaEvidence(legacy, area(legacy, 'EAST').id).entries.length, 0);
});

test('a saved correction routes only to its reviewed area and opens the exact unchanged original', () => {
  let project = fixture();
  const original = structuredClone(project.whatsappMessages[1]);
  project = confirm(project, 1, 'EAST', 'Original message and photo describe east-wall cladding, not the roof.');
  const east = area(project, 'EAST'), west = area(project, 'WEST');
  assert.equal(getAreaEvidence(project, west.id).entries.length, 0);
  const result = getAreaEvidence(project, east.id);
  assert.equal(result.entries.length, 1);
  const entry = result.entries[0];
  assert.equal(entry.itemId, 'WI-001');
  assert.equal(entry.matchKind, 'saved-area');
  for (const [entryKey, sourceKey] of [['text', 'text'], ['photo', 'photo'], ['photoAlt', 'photoAlt'], ['date', 'date'], ['sender', 'sender']]) {
    assert.deepEqual(entry[entryKey], original[sourceKey]);
  }
  assert.deepEqual(resolveAreaEvidenceSource(project, east.id, entry.id), { kind: 'message', messageId: original.id, reportId: null });
  assert.deepEqual(project.reports, []);
  assert.deepEqual(project.items.map(item => [item.reported, item.verified]), project.items.map(() => [0, 0]));
});

test('processed review evidence stays once in its frozen area after alias reuse and retains original-message navigation', () => {
  let project = fixture();
  const original = structuredClone(project.whatsappMessages[1]);
  project = confirm(project, 1, 'EAST', 'Correcting the suggestion to match the east-wall cladding described.');
  const processed = processWhatsAppMessage(project, original.id);
  assert.equal(processed.outcome, 'processed');
  project = processed.project;
  const eastId = area(project, 'EAST').id, westId = area(project, 'WEST').id;
  const report = structuredClone(project.reports.find(report => report.id === processed.reportId));
  const east = area(project, 'EAST');
  project = checked(saveAreaMapping(project, { ...east, areaId: east.id, code: 'EAST-RENAMED', aliases: ['Renamed east façade'] }, now));
  const west = area(project, 'WEST');
  project = checked(saveAreaMapping(project, { ...west, areaId: west.id, aliases: [...west.aliases, 'East wall'] }, now));
  assert.deepEqual(project.reports.find(entry => entry.id === report.id), report);
  assert.equal(getAreaEvidence(project, westId).entries.length, 0);
  const entries = getAreaEvidence(project, eastId).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reportId, report.id);
  assert.equal(entries[0].text, original.text);
  assert.equal(entries[0].photo, original.photo);
  assert.deepEqual(resolveAreaEvidenceSource(project, eastId, entries[0].id), { kind: 'message', messageId: original.id, reportId: report.id });
  const altered = structuredClone(project);
  altered.whatsappMessages.find(message => message.id === original.id).text = 'A changed inbox source';
  assert.deepEqual(resolveAreaEvidenceSource(altered, eastId, entries[0].id), { kind: 'report', reportId: report.id });
});

test('stale reviewed sources cannot regain area assignment from their old raw fields', () => {
  let project = confirm(fixture(), 0, 'WEST');
  const message = project.whatsappMessages[0];
  assert.equal(getAreaEvidence(project, area(project, 'WEST').id).entries.length, 1);
  project = { ...project, whatsappMessages: project.whatsappMessages.map(source => source.id === message.id
    ? { ...source, text: `${source.text} Edited after review.` } : source) };
  for (const mapped of project.drawingMapping.areas) assert.equal(getAreaEvidence(project, mapped.id).entries.length, 0);
});
