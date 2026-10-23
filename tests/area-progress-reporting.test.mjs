import assert from 'node:assert/strict';
import test from 'node:test';
import { installDrawing, getDrawingMapping, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { getAreaAllocationSnapshot, getItemAreaRollup } from '../src/data/area-allocations.ts';
import { getLatestProgressReports, getItemProgressReview, verifyProgressReport, addProgressReport } from '../src/data/progress-review.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { saveMessageClarificationRequest, saveMockClarificationReply, getMessageClarification } from '../src/data/whatsapp-clarification.ts';

const day = (hour = 10) => `2026-10-21T${String(hour).padStart(2, '0')}:00:00Z`;
function fixture() {
  let project = { id: 'SPLIT', code: 'SP01', name: 'Allocated scaffold', locked: true, version: 1,
    contract: { currency: 'SGD', sourceKind: 'illustrative' },
    items: [{ id: 'WORK', ref: 'A.1', description: 'External scaffold', location: 'Block A', unit: 'm²', quantity: 1000,
      rate: 10, amount: 10000, pricingType: 'measured', reported: 80, verified: 25 }],
    sourceItems: [{ id: 'SOURCE', description: 'Keep source unchanged' }],
    reports: [{ id: 'LEGACY', itemId: 'WORK', projectId: 'SPLIT', projectCode: 'SP01', status: 'pending',
      date: '2026-10-19T10:00:00Z', completion: 80, completionBasis: 'cumulative', message: 'Original whole-item observation', photo: '/original.png' }],
    baselines: [{ version: 1, items: [{ id: 'WORK', quantity: 1000 }] }],
    claimDrafts: [{ id: 'SAVED', snapshot: { amount: 2500, evidence: { id: 'LEGACY', completion: 25 } } }],
    claimTracking: [{ draftId: 'SAVED', status: 'paid' }], voReviews: [], history: [], whatsappMessages: [], messageClarifications: [], seed: {} };
  project = installDrawing(project, { inputKind: 'sample' }, '2026-10-18T10:00:00Z').project;
  for (const [index, quantity] of [600, 400].entries()) {
    const area = getDrawingMapping(project).areas[index];
    const saved = saveAreaMapping(project, { ...area, areaId: area.id, workItemIds: ['WORK'], workItemQuantities: { WORK: quantity } }, '2026-10-18T11:00:00Z');
    assert.equal(saved.outcome, 'updated', saved.error); project = saved.project;
  }
  return project;
}
const areas = project => getDrawingMapping(project).areas.slice(0, 2);
function message(project, areaIndex, id, completion, date = day()) {
  const area = areas(project)[areaIndex];
  return { id, projectId: project.id, projectCode: project.code, itemId: 'WORK', area: area.code, areaId: area.id,
    kind: 'progress', status: 'new', completion, completionBasis: 'cumulative', sender: 'Demo worker', date,
    text: `${area.code} WORK ${completion}% cumulative area completion`, photo: `/${id}.png`, photoAlt: 'Demonstration photo' };
}
function process(project, value) {
  const next = { ...project, whatsappMessages: [...project.whatsappMessages, value] };
  const result = processWhatsAppMessage(next, value.id);
  assert.equal(result.outcome, 'processed');
  return result;
}
const preserved = project => Object.fromEntries(['sourceItems', 'baselines', 'claimDrafts', 'claimTracking', 'contract', 'seed']
  .map(key => [key, structuredClone(project[key])]));

test('area messages retain separate evidence and quantity-weighted completion without duplicate counts', () => {
  const before = fixture(), frozen = structuredClone(before), financial = preserved(before);
  const a = process(before, message(before, 0, 'A-50', 50, day(10)));
  const b = process(a.project, message(a.project, 1, 'B-25', 25, day(12)));
  assert.equal(a.project.items[0].reported, 30, '50% of 600 is 300 out of the full 1000');
  assert.equal(b.project.items[0].reported, 40, '300 + 100, rather than a sum or simple mean of percentages');
  assert.equal(b.project.items[0].verified, null, 'old whole-item progress is never assigned to either area');
  assert.deepEqual(b.project.reports.find(report => report.id === 'LEGACY'), before.reports[0]);
  assert.equal(b.project.reports.find(report => report.id === a.reportId).status, 'pending');
  assert.equal(b.project.reports.find(report => report.id === b.reportId).status, 'pending');
  assert.deepEqual(b.project.reports.at(-1).areaProgress, getAreaAllocationSnapshot(b.project, areas(b.project)[1].id, 'WORK'));
  assert.equal(b.project.reports.at(-1).photo, '/B-25.png');
  assert.equal(getLatestProgressReports(b.project, 'WORK').length, 2);
  assert.deepEqual(preserved(b.project), financial);
  assert.deepEqual(before, frozen);
  const replay = processWhatsAppMessage(b.project, 'A-50');
  assert.equal(replay.outcome, 'duplicate'); assert.equal(replay.project, b.project);
});

test('supersession and chronology only compare the same allocated area', () => {
  let project = fixture();
  const b = process(project, message(project, 1, 'B-LATER', 25, day(13))); project = b.project;
  const a = process(project, message(project, 0, 'A-EARLIER', 50, day(10))); project = a.project;
  const next = process(project, message(project, 0, 'A-NEXT', 60, day(11)));
  assert.equal(next.project.items[0].reported, 46);
  assert.equal(next.project.reports.find(report => report.id === b.reportId).status, 'pending');
  assert.equal(next.project.reports.find(report => report.id === a.reportId).status, 'superseded');
  assert.equal(next.project.reports.find(report => report.id === a.reportId).supersededByReportId, next.reportId);
  const staleMessage = message(next.project, 0, 'A-STALE', 90, day(9));
  const stale = processWhatsAppMessage({ ...next.project, whatsappMessages: [...next.project.whatsappMessages, staleMessage] }, staleMessage.id);
  assert.equal(stale.outcome, 'clarification');
  assert.deepEqual(stale.project.items, next.project.items);
  assert.deepEqual(stale.project.reports, next.project.reports);
});

test('verification updates only its area and concurrent area tasks remain actionable', () => {
  let project = fixture();
  const a = process(project, message(project, 0, 'A-50', 50, day(10))); project = a.project;
  const b = process(project, message(project, 1, 'B-25', 25, day(12))); project = b.project;
  const financial = preserved(project);
  const checkedB = verifyProgressReport(project, b.reportId, '25', '', day(14));
  assert.equal(checkedB.outcome, 'updated', checkedB.error);
  assert.equal(checkedB.project.items[0].verified, 10);
  assert.equal(getItemProgressReview(checkedB.project, checkedB.project.items[0]).report.id, a.reportId,
    'the newer verified B report cannot hide the unverified A report');
  assert.equal(getItemProgressReview(checkedB.project, checkedB.project.items[0], areas(project)[1].id).key, 'verified');
  const checkedA = verifyProgressReport(checkedB.project, a.reportId, '50', '', day(15));
  assert.equal(checkedA.outcome, 'updated', checkedA.error);
  assert.equal(checkedA.project.items[0].verified, 40);
  assert.equal(checkedA.project.items[0].reported, 40);
  assert.equal(checkedA.project.reports.find(report => report.id === b.reportId).status, 'verified');
  assert.deepEqual(preserved(checkedA.project), financial);
  const replay = verifyProgressReport(checkedA.project, a.reportId, '50', '', day(16));
  assert.equal(replay.outcome, 'unchanged'); assert.equal(replay.project, checkedA.project);
});

test('missing, foreign, unallocated and mismatching areas cannot fall back to whole-item progress', () => {
  const project = fixture();
  for (const patch of [{ area: '', areaId: null }, { area: 'UNKNOWN', areaId: 'FOREIGN' },
    { area: areas(project)[0].code, areaId: 'FOREIGN' }, { area: getDrawingMapping(project).areas[2].code }]) {
    const update = { ...message(project, 0, 'BAD', 100), ...patch };
    const result = processWhatsAppMessage({ ...project, whatsappMessages: [update] }, 'BAD');
    assert.equal(result.outcome, 'clarification');
    assert.deepEqual(result.project.items, project.items); assert.deepEqual(result.project.reports, project.reports);
  }
  const legacy = verifyProgressReport(project, 'LEGACY', '80', '', day(15));
  assert.equal(legacy.outcome, 'invalid'); assert.equal(legacy.project, project);
  assert.deepEqual(getLatestProgressReports(project, 'WORK'), [], 'legacy evidence is retained as history rather than an impossible review task');
});

test('manual report entry follows the same allocation rules and preserves saved financial records', () => {
  const project = fixture(), financial = preserved(project);
  assert.equal(addProgressReport(project, { itemId: 'WORK', completion: '50', area: '', message: 'No area named' }, day()).outcome, 'invalid');
  const a = addProgressReport(project, { itemId: 'WORK', completion: '50', area: areas(project)[0].code,
    message: 'A1 half of allocated scaffold installed', photo: '/manual-a.png' }, day(10));
  assert.equal(a.outcome, 'updated', a.error);
  const b = addProgressReport(a.project, { itemId: 'WORK', completion: '25', area: areas(project)[1].code,
    message: 'A2 quarter of allocated scaffold installed' }, day(12));
  assert.equal(b.outcome, 'updated', b.error);
  assert.equal(b.project.items[0].reported, 40);
  assert.equal(b.project.reports.find(report => report.id === a.reportId).status, 'pending');
  assert.deepEqual(preserved(b.project), financial);
});

test('area reduction requires a reason but another area total does not', () => {
  let project = fixture();
  const a = process(project, message(project, 0, 'A-FULL', 100, day(10)));
  project = verifyProgressReport(a.project, a.reportId, '100', '', day(11)).project;
  const b = process(project, message(project, 1, 'B-LOW', 25, day(12)));
  const checkedB = verifyProgressReport(b.project, b.reportId, '25', '', day(13));
  assert.equal(checkedB.outcome, 'updated', checkedB.error);
  const reduced = process(checkedB.project, message(checkedB.project, 0, 'A-REDUCE', 90, day(14)));
  assert.equal(verifyProgressReport(reduced.project, reduced.reportId, '90', '', day(15)).outcome, 'invalid');
  const reviewed = verifyProgressReport(reduced.project, reduced.reportId, '90', 'Remeasured allocated scaffold on site.', day(15));
  assert.equal(reviewed.outcome, 'updated', reviewed.error);
  assert.equal(reviewed.project.items[0].verified, 64);
});

test('clarification replies retain an allocated-area scope and ignore another area’s newer report', () => {
  let project = fixture();
  const b = process(project, message(project, 1, 'B-FUTURE', 25, day(16))); project = b.project;
  const source = { ...message(project, 0, 'UNCLEAR', 50, '2026-10-19T10:00:00Z'), kind: 'clarification', completionBasis: 'unclear',
    text: 'Area done half.', itemId: null, photo: '/original-clarification.png' };
  project = { ...project, whatsappMessages: [...project.whatsappMessages, source] };
  const request = saveMessageClarificationRequest(project, source.id, { question: 'Confirm the work item, allocated area and cumulative completion.' }, day(10));
  assert.equal(request.outcome, 'updated', request.error);
  const area = areas(project)[0];
  const reply = saveMockClarificationReply(request.project, source.id, { text: 'A1 WORK 50% of allocated area quantity.', itemId: 'WORK',
    areaId: area.id, area: area.code, completion: 50 }, day(12));
  assert.equal(reply.outcome, 'updated', reply.error);
  const context = getMessageClarification(reply.project, source.id);
  assert.equal(context.stage, 'reply-received'); assert.equal(context.latestReport, null);
  assert.deepEqual(context.reply.areaProgress, getAreaAllocationSnapshot(reply.project, area.id, 'WORK'));
  const result = processWhatsAppMessage(reply.project, context.reply.id);
  assert.equal(result.outcome, 'processed');
  assert.equal(result.project.items[0].reported, 40);
  assert.equal(result.project.reports.find(report => report.id === b.reportId).status, 'pending');
  assert.equal(result.project.reports.at(-1).photo, source.photo);
  assert.deepEqual(preserved(result.project), preserved(project));
});

test('a saved reply cannot be silently reinterpreted after its allocation is changed or removed', () => {
  let project = fixture();
  const source = { ...message(project, 0, 'UNCLEAR', 50, '2026-10-19T10:00:00Z'), kind: 'clarification', completionBasis: 'unclear', itemId: null };
  project.whatsappMessages.push(source);
  project = saveMessageClarificationRequest(project, source.id, { question: 'Confirm item and area completion.' }, day(10)).project;
  const area = areas(project)[0];
  project = saveMockClarificationReply(project, source.id, { text: 'A1 WORK 50%.', itemId: 'WORK', areaId: area.id, area: area.code, completion: 50 }, day(12)).project;
  const reply = getMessageClarification(project, source.id).reply;
  const corrupted = structuredClone(project);
  corrupted.drawingMapping.areas[0].workItemQuantities.WORK = 500;
  const result = processWhatsAppMessage(corrupted, reply.id);
  assert.equal(result.outcome, 'clarification');
  assert.deepEqual(result.project.items, corrupted.items); assert.deepEqual(result.project.reports, corrupted.reports);
  assert.deepEqual(getMessageClarification(result.project, source.id).thread.original, source);
  assert.equal(getItemAreaRollup(result.project, 'WORK', 'verified').completion, null);
});

test('a normal message with a frozen area marker cannot become whole-item progress after allocation removal', () => {
  const project = fixture();
  const update = { ...message(project, 0, 'FROZEN-AREA', 75), areaProgress: getAreaAllocationSnapshot(project, areas(project)[0].id, 'WORK') };
  for (const kind of ['removed', 'reassigned']) {
    const changed = structuredClone(project);
    if (kind === 'removed') for (const area of changed.drawingMapping.areas) delete area.workItemQuantities;
    else changed.drawingMapping.areas[0].workItemQuantities.WORK = 500;
    changed.whatsappMessages = [update];
    const result = processWhatsAppMessage(changed, update.id);
    assert.equal(result.outcome, 'clarification', kind);
    assert.deepEqual(result.project.items, changed.items);
    assert.deepEqual(result.project.reports, changed.reports);
    assert.deepEqual(preserved(result.project), preserved(changed));
  }
});
