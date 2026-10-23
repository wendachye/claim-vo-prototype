import assert from 'node:assert/strict';
import test from 'node:test';
import { getAreaVOFlags, getDrawingVOFlags } from '../src/data/drawing-vo.ts';
import { getDrawingMapping, installDrawing, saveAreaMapping, snapshotMappedArea } from '../src/data/drawing-mapping.ts';
import { getVOCases, normalizeVOReviews } from '../src/data/vo.ts';

const now = new Date('2026-10-21T14:00:00Z');
function project(id = 'DEMO') {
  let value = installDrawing({ id, code: id, items: [
    { id: 'WI-001', description: 'External wall', reported: 65, verified: 40, quantity: 1200, amount: 30000 },
    { id: 'WI-002', description: 'Roof', reported: 20, verified: 0 },
  ], reports: [], whatsappMessages: [], voReviews: [], baselines: [{ version: 1 }],
  claimDrafts: [{ snapshot: { currentValue: 30000 } }], history: [] }, { inputKind: 'sample' }, now).project;
  const first = getDrawingMapping(value).areas[0];
  value = saveAreaMapping(value, { ...first, areaId: first.id, workItemIds: ['WI-001'] }, now).project;
  return value;
}
const area = (value, index = 0) => getDrawingMapping(value).areas[index];
const flags = (value, index = 0) => getAreaVOFlags(value, area(value, index).id);
const report = (id, patch = {}) => ({ id, area: 'Area A1', itemId: null, vo: true, status: 'needsReview',
  date: '2026-10-21T10:00:00Z', sender: 'Worker (demo)', message: 'Additional temporary access requested.', ...patch });
const message = (id, patch = {}) => ({ id, kind: 'vo', status: 'new', area: 'Area A1', itemId: null,
  date: '2026-10-21T11:00:00Z', sender: 'Worker (demo)', text: 'Possible additional protection.', ...patch });
const review = (value, id, status, patch = {}) => ({ id, reportId: id, projectId: value.id, status, title: `Extra work ${id}`, ...patch });

test('VO flags distinguish open review, recorded approvals and retained rejected history without duplicate cases', () => {
  const value = project();
  const statuses = ['flagged', 'clarification', 'pendingApproval', 'approved', 'rejected'];
  value.reports = statuses.map((status, index) => report(`R${index + 1}`));
  value.voReviews = statuses.map((status, index) => review(value, `R${index + 1}`, status));
  value.reports.push(structuredClone(value.reports[0]));
  value.whatsappMessages = [message('M1', { status: 'processed', reportId: 'R1' })];
  value.reports[0].sourceMessageId = 'M1';
  const result = flags(value);
  assert.equal(result.totalCount, 5);
  assert.equal(result.openCount, 3);
  assert.equal(result.approvedCount, 1);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.markerLabel, '3 VO to review');
  assert.equal(result.markerTone, 'amber');
  assert.deepEqual(result.cases.map((entry) => entry.status), statuses);
  assert.deepEqual(result.cases.map((entry) => entry.label), ['Flagged', 'Needs information', 'Awaiting approval', 'Approved', 'Rejected']);
  assert.deepEqual(result.cases.map((entry) => entry.tone), ['amber', 'amber', 'amber', 'green', 'slate']);
  assert.ok(result.cases.every((entry) => entry.id === entry.reportId && entry.matchKind === 'area-code'));
});

test('live status changes update markers while rejected-only areas never show an active warning', () => {
  const value = project();
  value.reports = [report('R1')];
  value.voReviews = [review(value, 'R1', 'flagged')];
  const original = flags(value);
  value.voReviews[0].status = 'approved';
  assert.deepEqual([flags(value).markerLabel, flags(value).markerTone, flags(value).openCount], ['1 approved VO', 'green', 0]);
  assert.equal(original.cases[0].status, 'flagged');
  value.voReviews[0].status = 'rejected';
  assert.deepEqual([flags(value).markerLabel, flags(value).markerTone, flags(value).rejectedCount], ['', 'slate', 1]);
  assert.equal(flags(value).cases[0].label, 'Rejected');
  value.voReviews[0].status = 'unknown-status';
  assert.equal(flags(value).cases[0].status, 'flagged');
  value.reports[0].status = 'rejected';
  assert.equal(flags(value).cases[0].status, 'rejected');
});

test('new extra-work messages stay separate from actual cases and use the correct marker priority', () => {
  const value = project();
  value.whatsappMessages = [message('M1'), message('M2'), message('NOT-VO', { kind: 'progress' }),
    message('PROCESSED-NO-REPORT', { status: 'processed' }), message('UNCLEAR', { kind: 'clarification' })];
  let result = flags(value);
  assert.equal(result.totalCount, 0);
  assert.equal(result.newMessageCount, 2);
  assert.equal(result.markerLabel, '2 new extra-work messages');
  assert.equal(result.markerTone, 'amber');
  assert.deepEqual(result.newMessages.map((entry) => entry.id), ['M1', 'M2']);
  assert.ok(result.newMessages.every((entry) => entry.label === 'New extra-work message'));
  value.reports = [report('R1')];
  value.voReviews = [review(value, 'R1', 'approved')];
  assert.equal(flags(value).markerLabel, '2 new extra-work messages');
  value.voReviews[0].status = 'flagged';
  assert.equal(flags(value).markerLabel, '1 VO to review');
  value.whatsappMessages[0].status = 'processed';
  value.whatsappMessages[0].reportId = 'R1';
  value.reports[0].sourceMessageId = 'M1';
  result = flags(value);
  assert.equal(result.totalCount, 1);
  assert.equal(result.newMessageCount, 1);
  assert.equal(result.newMessages[0].id, 'M2');
});

test('saved VO area references survive renaming, code reuse, remapping and drawing replacement', () => {
  let value = project();
  const first = area(value);
  value.reports = [report('R1', { areaMapping: snapshotMappedArea(first), itemId: 'WI-001' })];
  value = saveAreaMapping(value, { ...first, areaId: first.id, code: 'WALL', workItemIds: ['WI-002'] }, now).project;
  const second = area(value, 1);
  value = saveAreaMapping(value, { ...second, areaId: second.id, code: 'A1', workItemIds: ['WI-001'] }, now).project;
  assert.equal(flags(value).cases[0].matchKind, 'saved-area');
  assert.equal(flags(value, 1).totalCount, 0);
  value = installDrawing(value, { inputKind: 'upload', fileName: 'New plan.png', fileSize: 500, mimeType: 'image/png' }, now).project;
  assert.equal(getAreaVOFlags(value, first.id).totalCount, 1);
  value.reports.push(report('OLD-ID', { area: 'WALL', itemId: 'WI-002', areaMapping: { areaId: 'REMOVED-AREA' } }));
  assert.equal(flags(value).totalCount, 1);
  assert.equal(flags(value, 1).totalCount, 0);
});

test('legacy area codes work for unlinked areas and item-only matching never overrides another explicit area', () => {
  const value = project();
  value.reports = [report('BY-ITEM', { area: '', itemId: 'WI-001' }), report('OTHER-AREA', { area: 'Area A2', itemId: 'WI-001' }),
    report('NO-REFERENCE', { area: '', itemId: null, message: 'Area A1 extra work', photo: '/assets/demo-platform.jpg' })];
  assert.deepEqual(flags(value).cases.map((entry) => entry.id), ['BY-ITEM']);
  assert.equal(flags(value).cases[0].matchKind, 'work-item');
  assert.equal(flags(value).cases[0].matchLabel, 'Linked work item; area not stated');
  assert.deepEqual(flags(value, 1).cases.map((entry) => entry.id), ['OTHER-AREA']);
  assert.equal(area(value, 1).workItemIds.length, 0);
  assert.equal(flags(value, 1).cases[0].matchKind, 'area-code');
});

test('VO case getters exclude foreign reports and review codes, malformed records and duplicate IDs', () => {
  const value = project();
  value.reports = [null, report('FOREIGN-ID', { projectId: 'OTHER' }), report('FOREIGN-CODE', { projectCode: 'OTHER' }),
    report(''), report('   '), report('LOCAL'), report('LOCAL', { message: 'Duplicate must not appear' }),
    report('LOCAL-CODE', { projectId: value.id, projectCode: value.code.toLowerCase() })];
  value.voReviews = [review(value, 'LOCAL', 'approved', { projectCode: 'OTHER' }),
    review(value, 'LOCAL-CODE', 'rejected', { projectCode: value.code.toLowerCase() })];
  assert.deepEqual(getVOCases(value).map((entry) => entry.id), ['LOCAL', 'LOCAL-CODE']);
  assert.deepEqual(getVOCases(value).map((entry) => entry.status), ['flagged', 'rejected']);
  assert.deepEqual(normalizeVOReviews(value).map((entry) => entry.id), ['LOCAL-CODE']);
  assert.deepEqual(flags(value).cases.map((entry) => entry.id), ['LOCAL', 'LOCAL-CODE']);
  assert.equal(flags(value).openCount, 1);
  assert.equal(flags(value).approvedCount, 0);
  const second = project('OTHER');
  second.reports = [report('LOCAL')];
  second.voReviews = [review(second, 'LOCAL', 'approved')];
  assert.equal(flags(second).approvedCount, 1);
  assert.equal(flags(value).approvedCount, 0);
  assert.equal(getAreaVOFlags(value, area(second).id), null);
});

test('reading flags preserves completion, original reports, decisions and saved financial snapshots', () => {
  const value = project();
  value.reports = [report('R1')];
  value.voReviews = [review(value, 'R1', 'approved', { approvedValue: 500 })];
  const before = structuredClone(value);
  const result = flags(value);
  assert.deepEqual(value, before);
  result.cases[0].title = 'Changed returned value';
  assert.deepEqual(value, before);
  for (const key of ['amount', 'approvedValue', 'completion', 'reported', 'verified']) assert.equal(Object.hasOwn(result.cases[0], key), false);
  assert.equal(getDrawingVOFlags(value).length, 4);
  assert.deepEqual(getDrawingVOFlags(value)[0], flags(value));
  assert.deepEqual(getDrawingVOFlags({ id: 'EMPTY', items: [] }), []);
  assert.equal(getAreaVOFlags(value, 'UNKNOWN'), null);
  assert.equal(getAreaVOFlags(null, 'UNKNOWN'), null);
  const empty = flags(project());
  assert.deepEqual([empty.cases, empty.newMessages, empty.totalCount, empty.markerLabel, empty.markerTone], [[], [], 0, '', 'slate']);
});
