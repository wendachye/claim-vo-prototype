import assert from 'node:assert/strict';
import test from 'node:test';
import { getAreaEvidence, resolveAreaEvidenceSource } from '../src/data/drawing-evidence.js';
import { getDrawingMapping, installDrawing, saveAreaMapping, snapshotMappedArea } from '../src/data/drawing-mapping.js';
import { getMessageReport, seedWhatsAppMessages } from '../src/data/whatsapp.js';

const now = new Date('2026-10-21T14:00:00Z');
function project(id = 'DEMO') {
  let value = installDrawing({ id, code: id, items: [
    { id: 'WI-001', description: 'External wall', reported: 65, verified: 40, quantity: 1200, amount: 30000 },
    { id: 'WI-002', description: 'Roof', reported: 20, verified: 0 },
  ], reports: [], whatsappMessages: [], voReviews: [], baselines: [{ version: 1 }],
  claimDrafts: [{ snapshot: { currentValue: 30000 } }], history: [] }, { inputKind: 'sample' }, now).project;
  for (const [index, itemId] of [[0, 'WI-001'], [1, 'WI-002']]) {
    const area = getDrawingMapping(value).areas[index];
    value = saveAreaMapping(value, { ...area, areaId: area.id, workItemIds: [itemId] }, now).project;
  }
  return value;
}
const area = (value, index = 0) => getDrawingMapping(value).areas[index];
const evidence = (value, index = 0) => getAreaEvidence(value, area(value, index).id);
const message = (id, patch = {}) => ({ id, kind: 'progress', status: 'new', sender: 'Worker (demo)',
  date: '2026-10-21T10:00:00Z', text: 'Original inbox message', area: 'Area A1', itemId: 'WI-001',
  photo: '/assets/demo-scaffold.jpg', photoAlt: 'Generated demo photograph', ...patch });
const report = (id, patch = {}) => ({ id, sender: 'Original worker (demo)', date: '2026-10-20T10:00:00Z',
  message: 'Original saved message', area: 'Area A1', itemId: 'WI-001', status: 'pending', vo: false,
  photo: '/assets/demo-platform.jpg', photoAlt: 'Original generated photo description', ...patch });

test('processed message/report pairs appear once using saved original evidence and current report review status', () => {
  const value = project();
  value.whatsappMessages = [message('M1', { projectId: value.id, projectCode: value.code, status: 'processed', reportId: 'R1',
    sender: 'Changed inbox sender', date: '2026-10-22', text: 'Changed inbox text', photo: '/assets/changed.jpg' })];
  value.reports = [report('R1', { sourceMessageId: 'M1', status: 'verified', areaMapping: snapshotMappedArea(area(value)),
    photo: { url: '/assets/demo-platform.jpg', extra: 'Do not expose this object' } })];
  const before = structuredClone(value);
  const result = evidence(value);
  assert.equal(result.messageCount, 1);
  assert.equal(result.photoCount, 1);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0], {
    id: 'report:R1', messageId: 'M1', reportId: 'R1', sourceLabel: 'WhatsApp message', kind: 'progress',
    status: 'verified', label: 'Verified', tone: 'green', sender: 'Original worker (demo)',
    date: '2026-10-20T10:00:00Z', text: 'Original saved message', photo: '/assets/demo-platform.jpg',
    photoAlt: 'Original generated photo description', itemId: 'WI-001', matchKind: 'saved-area', matchLabel: 'Saved area reference',
  });
  assert.deepEqual(value, before);
  result.entries[0].text = 'Changed returned value';
  assert.deepEqual(value, before);
});

test('legacy report-only, superseded and dismissed evidence remains visible in stable chronological order', () => {
  const value = project('MAP01');
  value.whatsappMessages = [message('M2', { status: 'processed', reportId: 'R2' }), message('M3', { status: 'processed' })];
  value.reports = [
    report('R3', { sourceMessageId: 'M3', status: 'rejected', date: '2026-10-21T12:00:00Z' }),
    report('R2', { status: 'superseded', date: '2026-10-21T11:00:00Z' }),
    report('R1', { status: 'pending' }),
    report('R5', { date: 'invalid' }), report('R4', { date: '' }),
  ];
  const result = evidence(value);
  assert.equal(result.entries.length, 5);
  assert.deepEqual(result.entries.map((entry) => entry.reportId), ['R3', 'R2', 'R1', 'R4', 'R5']);
  assert.deepEqual(result.entries.slice(0, 3).map((entry) => entry.label), ['Dismissed', 'Superseded', 'Needs verification']);
  assert.equal(result.entries[0].messageId, 'M3');
  assert.equal(result.entries[1].messageId, 'M2');
  assert.equal(result.entries[2].messageId, null);
  assert.equal(result.entries[2].sourceLabel, 'Site update');
});

test('supervisor clarification appears once with its original area evidence and distinct review status', () => {
  const value = project();
  value.whatsappMessages = [message('M1', { status: 'processed', reportId: 'R1' })];
  value.reports = [report('R1', { sourceMessageId: 'M1', status: 'needsClarification',
    reviewReason: 'Confirm the cumulative total.', areaMapping: snapshotMappedArea(area(value)) })];
  const before = structuredClone(value);
  const result = evidence(value);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].kind, 'clarification');
  assert.equal(result.entries[0].label, 'Needs clarification');
  assert.equal(result.entries[0].tone, 'amber');
  assert.equal(result.entries[0].text, value.reports[0].message);
  assert.equal(result.entries[0].photo, value.reports[0].photo);
  assert.deepEqual(value, before);
});

test('saved area IDs remain authoritative after renaming, code reuse, remapping and drawing replacement', () => {
  let value = project();
  const originalArea = area(value);
  value.whatsappMessages = [message('M1', { reportId: 'R1', status: 'processed' })];
  value.reports = [report('R1', { sourceMessageId: 'M1', areaMapping: snapshotMappedArea(originalArea) })];
  value = saveAreaMapping(value, { ...originalArea, areaId: originalArea.id, code: 'WALL', workItemIds: ['WI-002'] }, now).project;
  const second = area(value, 1);
  value = saveAreaMapping(value, { ...second, areaId: second.id, code: 'A1', workItemIds: ['WI-001'] }, now).project;
  assert.equal(evidence(value).entries[0].reportId, 'R1');
  assert.equal(evidence(value).entries[0].matchKind, 'saved-area');
  assert.equal(evidence(value, 1).entries.length, 0);
  value = installDrawing(value, { inputKind: 'upload', fileName: 'Replacement.png', fileSize: 500, mimeType: 'image/png' }, now).project;
  assert.equal(getAreaEvidence(value, originalArea.id).entries.length, 1);
  assert.equal(evidence(value, 1).entries.length, 0);
  value.reports.push(report('UNKNOWN', { area: 'WALL', itemId: 'WI-002', areaMapping: { areaId: 'DELETED-AREA', code: 'WALL' } }));
  value.reports.push(report('EMPTY-SNAPSHOT', { area: 'WALL', itemId: 'WI-002', areaMapping: { areaId: '' } }));
  assert.deepEqual(evidence(value).entries.map((entry) => entry.reportId), ['R1']);
});

test('exact area codes precede work-item fallback and explicit different areas cannot leak shared-item evidence', () => {
  const value = project();
  value.whatsappMessages = [
    message('EXACT', { area: '  aReA a1  ', itemId: 'WI-002' }),
    message('BARE', { area: 'a1', itemId: null, kind: 'vo' }),
    message('OTHER', { area: 'Area A2', itemId: 'WI-001' }),
    message('PARTIAL', { area: 'Area A10' }),
    message('ITEM', { area: '' }),
    message('NO-ITEM', { area: '', itemId: 'WI-999', text: 'Area A1 finished', photo: '/assets/demo-scaffold.jpg' }),
    message('PHOTO-ONLY', { area: null, itemId: null, text: 'Area A1' }),
  ];
  const result = evidence(value);
  assert.deepEqual(result.entries.map((entry) => entry.messageId), ['BARE', 'EXACT', 'ITEM']);
  assert.equal(result.entries.find((entry) => entry.messageId === 'ITEM').matchKind, 'work-item');
  assert.equal(result.entries.find((entry) => entry.messageId === 'ITEM').matchLabel, 'Linked work item; area not stated');
  assert.equal(result.entries.find((entry) => entry.messageId === 'EXACT').matchKind, 'area-code');
});

test('paired report references suppress inbox duplicates even when the saved report is excluded from an area', () => {
  const value = project();
  value.whatsappMessages = [message('M1', { reportId: 'R1', status: 'processed' }), message('M2', { reportId: 'R2' })];
  value.reports = [
    report('R1', { sourceMessageId: 'M1', areaMapping: snapshotMappedArea(area(value, 1)) }),
    report('R2', { area: '', itemId: 'WI-002' }),
  ];
  assert.deepEqual(evidence(value).entries.map((entry) => entry.reportId), ['R2']);
  assert.equal(evidence(value).entries[0].matchKind, 'area-code');
  assert.deepEqual(evidence(value, 1).entries.map((entry) => entry.reportId), ['R1']);
  value.whatsappMessages[1].area = 'Area A2';
  assert.equal(evidence(value).entries.length, 0);
  assert.deepEqual(evidence(value, 1).entries.map((entry) => entry.reportId), ['R1', 'R2']);
});

test('foreign project IDs, codes, messages and VO reviews are excluded individually without invented inbox fallback', () => {
  const value = project('WH02');
  value.whatsappMessages = [null, message('LOCAL', { projectId: value.id, projectCode: value.code }),
    message('FOREIGN-ID', { projectId: 'OTHER' }), message('FOREIGN-CODE', { projectCode: 'OTHER' })];
  value.reports = [null, report('FOREIGN-REPORT', { projectId: 'OTHER' }), report('FOREIGN-CODE', { projectCode: 'OTHER' }),
    report('LOCAL-REPORT', { sourceMessageId: 'FOREIGN-ID', vo: true })];
  value.voReviews = [{ id: 'LOCAL-REPORT', reportId: 'LOCAL-REPORT', projectId: 'OTHER', status: 'approved' }];
  const result = evidence(value);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries.find((entry) => entry.reportId === 'LOCAL-REPORT').messageId, null);
  assert.equal(result.entries.find((entry) => entry.reportId === 'LOCAL-REPORT').label, 'Needs extra-work review');
  assert.equal(getAreaEvidence(value, area(project('OTHER')).id), null);
  assert.equal(getAreaEvidence({ ...value, drawingMapping: project('OTHER').drawingMapping }, area(value).id), null);
  value.whatsappMessages = { malformed: true };
  value.reports = [];
  assert.equal(evidence(value).entries.length, 0);
});

test('new progress, possible VO, clarification and current VO review decisions have plain labels', () => {
  const value = project();
  value.whatsappMessages = [message('PROGRESS'), message('VO', { kind: 'vo', itemId: null }),
    message('UNCLEAR', { kind: 'clarification', status: 'clarification', itemId: null })];
  let result = evidence(value);
  assert.deepEqual(Object.fromEntries(result.entries.map((entry) => [entry.messageId, [entry.kind, entry.label]])), {
    PROGRESS: ['progress', 'New'], UNCLEAR: ['clarification', 'Needs clarification'], VO: ['vo', 'Extra work · new'],
  });
  value.reports = [report('VO-REPORT', { vo: true, sourceMessageId: 'VO', areaMapping: snapshotMappedArea(area(value)) })];
  value.voReviews = [{ id: 'VO-REPORT', reportId: 'VO-REPORT', projectId: value.id, status: 'approved' }];
  result = evidence(value);
  assert.equal(result.entries.find((entry) => entry.reportId === 'VO-REPORT').label, 'Approved');
  assert.equal(result.entries.find((entry) => entry.reportId === 'VO-REPORT').tone, 'green');
  value.voReviews[0].status = 'constructor';
  assert.equal(evidence(value).entries.find((entry) => entry.reportId === 'VO-REPORT').label, 'Needs extra-work review');
});

test('safe photo strings and URL objects count once per update while unsupported formats remain absent', () => {
  const value = project();
  const accepted = ['/assets/demo-scaffold.jpg', 'site.jpg', './images/site.png', 'images/site.webp', 'https://example.com/site.jpg',
    'http://example.com/site.png', 'data:image/png;base64,aGVsbG8=', { url: '/assets/demo-platform.jpg' }];
  const rejected = [null, '', {}, { src: '/assets/demo-scaffold.jpg' }, { url: 'javascript:alert(1)' }, 'javascript:alert(1)',
    '//example.com/site.jpg', 'data:text/html;base64,aGVsbG8=', 'data:image/svg+xml;base64,aGVsbG8=', 'file:///private/site.jpg',
    'blob:session-only', '/\\example.com/site.jpg', 'https://example.com/\nsite.jpg'];
  value.whatsappMessages = [...accepted, ...rejected].map((photo, index) => message(`PHOTO-${index}`, { photo }));
  const before = structuredClone(value);
  const result = evidence(value);
  assert.equal(result.messageCount, accepted.length + rejected.length);
  assert.equal(result.photoCount, accepted.length);
  assert.ok(result.entries.every((entry) => entry.photo === null || typeof entry.photo === 'string'));
  assert.deepEqual(value, before);
});

test('empty areas and unknown projects are safe and reading evidence never writes progress or financial records', () => {
  const value = project();
  const before = structuredClone(value);
  assert.deepEqual(evidence(value), { areaId: area(value).id, entries: [], messageCount: 0, photoCount: 0 });
  assert.equal(getAreaEvidence(value, 'MISSING'), null);
  assert.equal(getAreaEvidence(null, 'MISSING'), null);
  value.reports = [report('NO-PHOTO', { photo: null })];
  const saved = structuredClone(value);
  assert.equal(evidence(value).photoCount, 0);
  assert.deepEqual(value, saved);
  for (const field of ['items', 'baselines', 'claimDrafts', 'history', 'drawingMapping']) assert.deepEqual(value[field], before[field]);
});

test('original update resolution opens only the exact canonical inbox source and preserves saved evidence when changed', () => {
  const value = project();
  const source = message('M1', { projectId: value.id, projectCode: value.code, reportId: 'R1', status: 'processed' });
  value.whatsappMessages = [source];
  value.reports = [report('R1', { sourceMessageId: 'M1', message: source.text, sender: source.sender,
    date: source.date, photo: { url: source.photo }, photoAlt: source.photoAlt })];
  const before = structuredClone(value);
  const entry = evidence(value).entries[0];
  assert.deepEqual(resolveAreaEvidenceSource(value, area(value).id, entry.id), { kind: 'message', messageId: 'M1', reportId: 'R1' });
  for (const [field, changed] of Object.entries({ text: 'Edited inbox message', sender: 'Another sender', date: '2026-10-22',
    photo: '/assets/different.jpg', photoAlt: 'A different photo description' })) {
    const changedProject = structuredClone(value);
    changedProject.whatsappMessages[0][field] = changed;
    assert.deepEqual(resolveAreaEvidenceSource(changedProject, area(value).id, entry.id), { kind: 'report', reportId: 'R1' });
  }
  assert.equal(resolveAreaEvidenceSource(value, area(value).id, 'MISSING'), null);
  assert.equal(resolveAreaEvidenceSource(value, 'FOREIGN-AREA', entry.id), null);
  assert.deepEqual(value, before);
});

test('generated inbox fallbacks with reused IDs never resolve as original messages', () => {
  const value = project('WH02');
  value.contract = { sourceKind: 'illustrative' };
  const seeded = seedWhatsAppMessages(value)[0];
  value.whatsappMessages = [seeded, message('FOREIGN', { projectId: 'OTHER', projectCode: 'OTHER' })];
  value.reports = [report('R1', { sourceMessageId: seeded.id, area: seeded.area, itemId: seeded.itemId,
    message: seeded.text, sender: seeded.sender, date: seeded.date, photo: seeded.photo, photoAlt: seeded.photoAlt,
    areaMapping: snapshotMappedArea(area(value)) })];
  assert.deepEqual(resolveAreaEvidenceSource(value, area(value).id, 'report:R1'), { kind: 'report', reportId: 'R1' });
  value.reports = [];
  // This is a real raw-array entry, but the normal inbox would replace it with
  // generated fixtures because another entry makes that array invalid.
  assert.deepEqual(resolveAreaEvidenceSource(value, area(value).id, `message:${seeded.id}`), { kind: 'unavailable' });
  value.whatsappMessages = [seeded];
  assert.deepEqual(resolveAreaEvidenceSource(value, area(value).id, `message:${seeded.id}`), { kind: 'message', messageId: seeded.id, reportId: null });
});

test('message/report pairing rejects foreign IDs and codes while retaining local legacy reports', () => {
  const value = project();
  const source = message('M1', { projectId: value.id, projectCode: value.code, reportId: 'R1' });
  value.reports = [report('R1', { projectId: 'OTHER', sourceMessageId: 'M1' }),
    report('FOREIGN-CODE', { projectCode: 'OTHER', sourceMessageId: 'M1' })];
  assert.equal(getMessageReport(value, source), null);
  value.reports.push(report('LEGACY', { sourceMessageId: 'M1' }));
  assert.equal(getMessageReport(value, source).id, 'LEGACY');
  value.reports.push(report('LOCAL', { projectId: value.id, projectCode: value.code, sourceMessageId: 'M1' }));
  assert.equal(getMessageReport(value, { ...source, reportId: 'LOCAL' }).id, 'LOCAL');
  assert.equal(getMessageReport(value, { ...source, projectId: 'OTHER' }), null);
  assert.equal(getMessageReport(value, { ...source, projectCode: 'OTHER' }), null);
  assert.equal(getMessageReport(value, {}), null);
  assert.equal(getMessageReport(null, source), null);
});
