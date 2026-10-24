import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorkspace } from '../src/data/projects.ts';
import { createAreaSplitDemo } from '../src/data/area-split-demo.ts';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { createVoiceNoteDemo } from '../src/data/voice-note-demo.ts';
import { getAreaAllocationSnapshot } from '../src/data/area-allocations.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { getVoiceNoteContext, saveVoiceTranscriptReview } from '../src/data/voice-notes.ts';
import { getMessageProgressCheck } from '../src/data/message-progress-check.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

const date = '2026-10-14T10:00:00Z';
const now = new Date('2026-10-12T10:00:00Z');
const fixture = (completion = 50, reported = 50, verified = 40) => {
  const project = structuredClone(seedWorkspace().projects[0]);
  const source = { ...project.whatsappMessages[0], id: 'NEW-UPDATE', date, itemId: 'WI-001', kind: 'progress',
    status: 'new', completion, completionBasis: 'cumulative', text: `WI-001 | COMPLETE=${completion}% TOTAL`, area: '',
    photo: '/assets/demo-scaffold.jpg', demo: true, origin: 'simulated' };
  delete source.areaId; delete source.areaMapping; delete source.areaProgress;
  project.items = project.items.map(item => item.id === 'WI-001' ? { ...item, reported, verified } : item);
  project.whatsappMessages = [source]; project.reports = [];
  return project;
};
const current = (project, values = {}) => ({ id: 'LATEST-REPORT', projectId: project.id, projectCode: project.code,
  itemId: 'WI-001', completion: 50, completionBasis: 'cumulative', date: '2026-10-13T10:00:00Z', status: 'pending', ...values });
const areaReport = (project, code, values = {}) => {
  const area = getDrawingMapping(project).areas.find(area => area.code === code);
  return current(project, { id: `LATEST-${code}`, area: code,
    areaProgress: getAreaAllocationSnapshot(project, area.id, 'WI-001'), ...values });
};
const areaFixture = () => {
  const project = createAreaSplitDemo(seedWorkspace(), now).project;
  const source = { ...project.whatsappMessages[0], date };
  project.whatsappMessages = [source];
  return project;
};
const review = (project, index = 0, code = 'WEST', reason = '') => {
  const message = project.whatsappMessages[index], area = getDrawingMapping(project).areas.find(area => area.code === code);
  const result = saveMessageMatchReview(project, message.id, { itemId: 'WI-001', areaId: area.id, reason }, '2026-10-14T10:00:00Z');
  assert.equal(result.outcome, 'updated', result.error);
  return result.project;
};

test('repeated cumulative totals remain distinct reviewable events with an exact latest-report link', () => {
  const project = fixture(); project.reports = [current(project)];
  const before = structuredClone(project), check = getMessageProgressCheck(project, 'NEW-UPDATE');
  assert.deepEqual(check, { kind: 'repeated', completion: 50, reported: 50, verified: 40, basis: 'whole-item',
    itemId: 'WI-001', areaId: null, latestReportId: 'LATEST-REPORT', latestReportDate: project.reports[0].date, isBelowVerified: false });
  assert.deepEqual(project, before);
  const processed = processWhatsAppMessage(project, 'NEW-UPDATE');
  assert.equal(processed.outcome, 'processed');
  assert.equal(processed.project.reports.length, 2);
  assert.equal(processed.project.reports[0].status, 'superseded');
  assert.equal(processed.project.reports[1].completion, 50);
  assert.equal(getMessageProgressCheck(processed.project, 'NEW-UPDATE'), null);
});

test('zero is known, unknown stays null, and a seeded repeated total has no invented report', () => {
  const zero = getMessageProgressCheck(fixture(0, 0, null), 'NEW-UPDATE');
  assert.equal(zero.kind, 'repeated'); assert.equal(zero.reported, 0); assert.equal(zero.verified, null);
  assert.equal(zero.latestReportId, null); assert.equal(zero.latestReportDate, null);
  const verified = getMessageProgressCheck(fixture(40, null, 40), 'NEW-UPDATE');
  assert.equal(verified.kind, 'repeated'); assert.equal(verified.reported, null); assert.equal(verified.verified, 40);
  assert.equal(getMessageProgressCheck(fixture(0, null, null), 'NEW-UPDATE'), null);
  assert.equal(getMessageProgressCheck(fixture(25, null, 0), 'NEW-UPDATE'), null);
});

test('lower completion compares both known totals and takes priority over an unchanged reported total', () => {
  const lower = getMessageProgressCheck(fixture(40, 50, 30), 'NEW-UPDATE');
  assert.equal(lower.kind, 'lower'); assert.equal(lower.isBelowVerified, false);
  const belowVerified = getMessageProgressCheck(fixture(40, 40, 60), 'NEW-UPDATE');
  assert.equal(belowVerified.kind, 'lower'); assert.equal(belowVerified.isBelowVerified, true);
  const onlyVerified = getMessageProgressCheck(fixture(0, null, 50), 'NEW-UPDATE');
  assert.equal(onlyVerified.kind, 'lower'); assert.equal(onlyVerified.reported, null);
  assert.equal(getMessageProgressCheck(fixture(60, 50, 50), 'NEW-UPDATE'), null);
});

test('older source dates take priority over repeated/lower totals and ignore verification or array order', () => {
  const project = fixture(40, 50, 60);
  project.whatsappMessages[0].date = '2026-10-10T10:00:00Z';
  project.reports = [current(project, { id: 'NEWEST', date: '2026-10-13T10:00:00Z', status: 'verified', verifiedAt: '2026-10-13T11:00:00Z' }),
    current(project, { id: 'EARLIER', date: '2026-10-12T10:00:00Z', status: 'verified', verifiedAt: '2026-10-15T11:00:00Z' })];
  const check = getMessageProgressCheck(project, 'NEW-UPDATE');
  assert.equal(check.kind, 'older'); assert.equal(check.isBelowVerified, true); assert.equal(check.latestReportId, 'NEWEST');
  const newer = processWhatsAppMessage(project, 'NEW-UPDATE');
  assert.equal(newer.outcome, 'clarification');
  assert.equal(getMessageProgressCheck(newer.project, 'NEW-UPDATE').kind, 'older');
  assert.deepEqual(newer.project.items, project.items); assert.deepEqual(newer.project.reports, project.reports);
  project.whatsappMessages[0].date = project.reports[0].date;
  assert.equal(getMessageProgressCheck(project, 'NEW-UPDATE').kind, 'lower');
});

test('latest-report links exclude rejected, superseded, VO, foreign, bad dates and duplicate IDs', () => {
  const project = fixture();
  project.reports = [current(project), ...[
    { id: 'REJECTED', status: 'rejected' }, { id: 'SUPERSEDED', status: 'superseded' }, { id: 'VO', vo: true },
    { id: 'FOREIGN', projectId: 'OTHER' }, { id: 'FOREIGN-CODE', projectCode: 'OTHER' },
    { id: 'UNDATED', date: undefined }, { id: 'BAD-DATE', date: 'not a date' },
    { id: 'OTHER-ITEM', itemId: 'WI-002' }, { id: 'WRONG-BASIS', completionBasis: 'incremental' }, { id: 'UNKNOWN', completion: null },
    { id: 'DUPLICATE' }, { id: 'DUPLICATE' }, { id: '' }, { id: ' spaced ' },
  ].map(values => current(project, { date: '2026-10-17T10:00:00Z', ...values }))];
  const check = getMessageProgressCheck(project, 'NEW-UPDATE');
  assert.equal(check.kind, 'repeated'); assert.equal(check.latestReportId, 'LATEST-REPORT');
});

test('foreign, duplicated, processed or already-linked source messages never receive a progress check', () => {
  for (const change of [
    project => project.whatsappMessages[0].projectId = 'OTHER',
    project => project.whatsappMessages[0].projectCode = 'OTHER',
    project => project.whatsappMessages.push({ ...project.whatsappMessages[0] }),
    project => project.whatsappMessages[0].status = 'processed',
    project => project.whatsappMessages[0].reportId = 'SAVED-REPORT',
    project => project.reports.push(current(project, { sourceMessageId: 'NEW-UPDATE' })),
    project => project.items.push({ ...project.items[0] }),
    project => project.items[0].projectId = 'OTHER',
    project => project.items[0].pricingType = 'included',
  ]) {
    const project = fixture(); change(project); const before = structuredClone(project);
    assert.equal(getMessageProgressCheck(project, 'NEW-UPDATE'), null);
    assert.deepEqual(project, before);
  }
  const project = fixture(); project.reports = [current(project, { projectId: 'OTHER', sourceMessageId: 'NEW-UPDATE' })];
  assert.equal(getMessageProgressCheck(project, 'NEW-UPDATE').kind, 'repeated');
});

test('ambiguous, incremental, unknown and conflicting source totals remain on clarification without guessed checks', () => {
  for (const change of [
    source => source.kind = 'vo', source => source.vo = true, source => source.kind = 'clarification',
    source => source.completionBasis = 'incremental', source => source.completion = null,
    source => source.completion = 101, source => source.date = 'invalid',
    source => source.text += ' Another 50% today.', source => source.text += ' +50% today.',
    source => source.text += ' Previously 30%.', source => source.areaId = 'UNAVAILABLE',
  ]) {
    const project = fixture(); change(project.whatsappMessages[0]);
    assert.equal(getMessageProgressCheck(project, 'NEW-UPDATE'), null);
  }
  const project = createMessageMatchDemo(seedWorkspace(), now).project;
  assert.equal(getMessageProgressCheck(project, project.whatsappMessages[2].id), null);
});

test('allocated area totals never use another area or the whole-item rollup', () => {
  const project = areaFixture(), messageId = project.whatsappMessages[0].id;
  project.items[0].reported = 99; project.items[0].verified = 99;
  project.reports = [areaReport(project, 'EAST', { completion: 90, date: '2026-10-18T10:00:00Z', status: 'verified', verifiedAt: '2026-10-18T11:00:00Z' }),
    current(project, { id: 'HISTORIC-WHOLE-ITEM', completion: 95, date: '2026-10-19T10:00:00Z' })];
  assert.equal(getMessageProgressCheck(project, messageId), null);
  project.reports.push(areaReport(project, 'WEST', { status: 'verified', verifiedAt: '2026-10-13T11:00:00Z' }));
  const check = getMessageProgressCheck(project, messageId);
  assert.equal(check.kind, 'repeated'); assert.equal(check.basis, 'area'); assert.equal(check.reported, 50); assert.equal(check.verified, 50);
  assert.equal(check.latestReportId, 'LATEST-WEST'); assert.equal(check.areaId, project.whatsappMessages[0].areaId);
  project.reports.push(areaReport(project, 'WEST', { id: 'DUP-WEST', completion: 90, date: '2026-10-19T10:00:00Z' }),
    areaReport(project, 'WEST', { id: 'DUP-WEST', completion: 90, date: '2026-10-19T10:00:00Z' }));
  assert.equal(getMessageProgressCheck(project, messageId).reported, 50);
});

test('unassigned and changed area quantities block checks instead of falling back to whole-item values', () => {
  const initial = areaFixture(), id = initial.whatsappMessages[0].id;
  for (const change of [
    project => project.drawingMapping.areas[0].workItemQuantities['WI-001'] = 9000,
    project => project.whatsappMessages[0].areaProgress.allocatedQuantity = 999,
    project => project.whatsappMessages[0].areaId = 'UNAVAILABLE',
    project => project.drawingMapping.areas[0].workItemIds = [],
  ]) {
    const project = structuredClone(initial); change(project);
    assert.equal(getMessageProgressCheck(project, id), null);
  }
});

test('corrected current matches determine the area; stale or unconfirmed suggestions are never compared', () => {
  let project = createMessageMatchDemo(seedWorkspace(), now).project;
  const id = project.whatsappMessages[1].id;
  project.reports = [areaReport(project, 'WEST', { completion: 80, date: '2026-10-17T10:00:00Z' }),
    areaReport(project, 'EAST', { completion: 25, date: '2026-10-11T10:00:00Z' })];
  assert.equal(getMessageProgressCheck(project, id), null);
  project = review(project, 1, 'EAST', 'Worker described east-wall cladding, not the wrong suggested item and WEST.');
  const check = getMessageProgressCheck(project, id);
  assert.equal(check.kind, 'repeated'); assert.equal(check.reported, 25); assert.equal(check.latestReportId, 'LATEST-EAST');
  assert.equal(check.areaId, getMessageMatchContext(project, id).review.fields.areaId);
  const stale = structuredClone(project); stale.drawingMapping.areas[1].name = 'Renamed after review';
  assert.equal(getMessageProgressCheck(stale, id), null);
  const malformed = structuredClone(project); malformed.messageMatchReviews.push({ ...malformed.messageMatchReviews[0], fields: { itemId: 'WI-001', areaId: 'EAST', completion: 99 } });
  assert.equal(getMessageProgressCheck(malformed, id), null);
});

test('an older confirmed match keeps its exact notice after processing requests chronology clarification', () => {
  let project = createMessageMatchDemo(seedWorkspace(), now).project;
  project.reports = [areaReport(project, 'WEST', { completion: 60, date: '2026-10-13T10:00:00Z' })];
  project = review(project);
  const id = project.whatsappMessages[0].id, original = structuredClone(project.whatsappMessages[0]);
  const check = getMessageProgressCheck(project, id); assert.equal(check.kind, 'older');
  const result = processWhatsAppMessage(project, id); assert.equal(result.outcome, 'clarification');
  assert.deepEqual(getMessageProgressCheck(result.project, id), check);
  for (const key of ['text', 'photo', 'sender', 'date', 'matchSuggestion']) assert.deepEqual(result.project.whatsappMessages[0][key], original[key]);
  const changed = structuredClone(result.project); changed.version++;
  assert.equal(getMessageProgressCheck(changed, id), null);
});

test('voice checks require reviewed transcript and current match, use corrected area, and preserve original audio', () => {
  let project = createVoiceNoteDemo(seedWorkspace(), now).project;
  const id = project.whatsappMessages[0].id, original = structuredClone(project.whatsappMessages[0]);
  project.reports = [areaReport(project, 'WEST', { completion: 80, date: '2026-10-18T10:00:00Z' }),
    areaReport(project, 'EAST', { completion: 50, date: '2026-10-11T10:00:00Z' })];
  assert.equal(getMessageProgressCheck(project, id), null);
  const context = getVoiceNoteContext(project, id);
  const corrected = saveVoiceTranscriptReview(project, id, { sourceKey: context.sourceKey,
    transcript: 'Block A east wall cladding is 50% complete in total.', reason: 'The recording identifies the east wall.' }, '2026-10-14T10:00:00Z');
  assert.equal(corrected.outcome, 'updated', corrected.error); project = corrected.project;
  assert.equal(getMessageProgressCheck(project, id), null);
  project = review(project, 0, 'EAST');
  const check = getMessageProgressCheck(project, id);
  assert.equal(check.kind, 'repeated'); assert.equal(check.latestReportId, 'LATEST-EAST'); assert.equal(check.reported, 50);
  assert.deepEqual(project.whatsappMessages[0], original);
  assert.equal(getMessageProgressCheck(project, project.whatsappMessages[1].id), null);
  const older = structuredClone(project); older.reports.find(report => report.id === 'LATEST-EAST').date = '2026-10-13T10:00:00Z';
  const chronology = getMessageProgressCheck(older, id); assert.equal(chronology.kind, 'older');
  const processed = processWhatsAppMessage(older, id); assert.equal(processed.outcome, 'clarification');
  assert.deepEqual(getMessageProgressCheck(processed.project, id), chronology);
  project.voiceTranscriptReviews.at(-1).transcript = 'Block A west wall cladding is 50% complete in total.';
  assert.equal(getMessageProgressCheck(project, id), null);
});

test('repeated checks leave saved claim evidence, amounts, exports and unrelated project state unchanged', () => {
  let project = areaFixture();
  const processed = processWhatsAppMessage(project, project.whatsappMessages[0].id);
  assert.equal(processed.outcome, 'processed');
  const verified = verifyProgressReport(processed.project, processed.reportId, 50, '', '2026-10-14T11:00:00Z');
  assert.equal(verified.outcome, 'updated'); project = verified.project;
  const saved = saveClaimDraft(project, '2026-10', { priorConfirmed: true, work: { 'WI-001': { include: true, assessedQuantity: 360, previousValue: 0 } } });
  assert.equal(saved.outcome, 'updated', saved.error); project = saved.project;
  const draft = project.claimDrafts.at(-1), csv = toClaimCSV(buildClaimPack(project, draft.id).pack);
  project.whatsappMessages.push({ ...project.whatsappMessages[0], id: 'INDEPENDENT-REPEAT', date: '2026-10-15T10:00:00Z', status: 'new', reportId: undefined, processedAt: undefined });
  const before = structuredClone(project), unrelated = structuredClone(seedWorkspace().projects[1]), unrelatedBefore = structuredClone(unrelated);
  for (let index = 0; index < 3; index++) assert.equal(getMessageProgressCheck(project, 'INDEPENDENT-REPEAT').kind, 'repeated');
  assert.equal(getMessageProgressCheck(unrelated, 'INDEPENDENT-REPEAT'), null);
  assert.deepEqual(project, before); assert.deepEqual(unrelated, unrelatedBefore);
  assert.equal(toClaimCSV(buildClaimPack(project, draft.id).pack), csv);
});
