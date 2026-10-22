import assert from 'node:assert/strict';
import test from 'node:test';
import { getProjectOverview } from '../src/data/project-overview.js';
import { createProject } from '../src/data/projects.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { saveClaimDraft, markClaimPrepared } from '../src/data/claims.js';
import { recordClaimStage } from '../src/data/claim-tracking.js';
import { saveMessageClarificationRequest } from '../src/data/whatsapp-clarification.js';

const now = new Date('2026-10-22T10:00:00+08:00');
function fixture() {
  const project = createProject({ name: 'Overview project', code: 'OVERVIEW', country: 'Singapore' });
  Object.assign(project, { locked: true, lockedAt: '2026-10-19T12:00:00+08:00', version: 1,
    items: [{ id: 'A', ref: 'A/01', description: 'Scaffold work', needsReview: false,
      unit: 'm²', quantity: 100, rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 50 }],
    reports: [], whatsappMessages: [], voReviews: [], claimDrafts: [], claimTracking: [], messageClarifications: [], history: [],
  });
  project.sourceItems = structuredClone(project.items);
  return project;
}
const card = (project, id) => getProjectOverview(project).cards.find(entry => entry.id === id);
const message = (project, id, date, fields = {}) => ({ id, projectId: project.id, projectCode: project.code,
  kind: 'progress', status: 'new', itemId: 'A', area: 'Area A', sender: 'Demo worker', date, ...fields });
const report = (project, id, date, fields = {}) => ({ id, projectId: project.id, projectCode: project.code,
  itemId: 'A', area: 'Area A', status: 'pending', completion: 50, date, ...fields });

function savedClaim(project, period = '2026-10', quantity = 50) {
  const result = saveClaimDraft(project, period, { priorConfirmed: true,
    work: { A: { include: true, assessedQuantity: quantity, previousValue: 0 } } });
  assert.equal(result.outcome, 'updated', result.error);
  return result;
}

test('original S.I.T. scenario supplies four useful cards and three exact, read-only record links', () => {
  const project = createSITContractDemo({ name: 'Overview demo', code: 'OVERVIEW-DEMO' }, now);
  const before = structuredClone(project);
  const overview = getProjectOverview(project);
  assert.deepEqual(overview.cards.map(entry => entry.id), ['contract', 'site', 'vo', 'claims']);
  assert.equal(overview.cards[0].summary, 'Confirmed');
  assert.equal(overview.cards[1].summary, '2 awaiting verification');
  assert.equal(overview.cards[3].summary, 'Oct 2026 · v1');
  assert.equal(overview.cards[3].detail, 'Draft saved');
  assert.equal(overview.activities.length, 3);
  assert.equal(overview.activities[0].target.draftId, project.claimDrafts[0].id);
  for (const activity of overview.activities) {
    assert.ok(Number.isFinite(Date.parse(activity.date)));
    if (activity.target.messageId) assert.ok(project.whatsappMessages.some(entry => entry.id === activity.target.messageId));
    if (activity.target.draftId) assert.ok(project.claimDrafts.some(entry => entry.id === activity.target.draftId));
  }
  assert.deepEqual(project, before);
});

test('activities are the latest three dated saved events, not arbitrary audit text or priority tasks', () => {
  const project = fixture();
  project.items[0].reviewedAt = '2026-10-22T07:00:00Z';
  project.whatsappMessages = [message(project, 'LATEST', '2026-10-22T10:00:00Z'), message(project, 'OLDER', '2026-10-22T05:00:00Z')];
  project.reports = [report(project, 'CHECKED', '2026-10-22T06:00:00Z', { status: 'verified', verifiedAt: '2026-10-22T09:00:00Z' }),
    report(project, 'UNKNOWN-DATE', 'not-a-date')];
  project.history = [{ id: 'FAKE-LINK', action: 'Claim paid', detail: 'claim id belongs to another project', date: '2099-01-01' }];
  const activities = getProjectOverview(project).activities;
  assert.deepEqual(activities.map(entry => entry.title), ['Site message received', 'Site progress verified', 'Contract item checked']);
  assert.deepEqual(activities.map(entry => entry.target), [
    { route: 'whatsapp', messageId: 'LATEST' }, { route: 'completion', itemId: 'A', reportId: 'CHECKED' }, { route: 'contract', itemId: 'A' },
  ]);
  assert.ok(activities.every(entry => !entry.id.includes('FAKE-LINK') && !entry.id.includes('UNKNOWN-DATE')));
});

test('paired message/report processing produces one processing event and one source receipt', () => {
  const project = fixture();
  project.whatsappMessages = [message(project, 'PAIRED', '2026-10-22T08:00:00Z', { status: 'processed', processedAt: '2026-10-22T09:00:00Z', reportId: 'REPORT' })];
  project.reports = [report(project, 'REPORT', '2026-10-22T08:00:00Z', { sourceMessageId: 'PAIRED' })];
  const activities = getProjectOverview(project).activities;
  assert.deepEqual(activities.map(entry => entry.title), ['Reported progress updated', 'Site message received']);
  assert.equal(activities.filter(entry => entry.target.reportId === 'REPORT').length, 1);
  assert.equal(card(project, 'site').summary, '1 awaiting verification');
  assert.equal(card(project, 'site').detail, 'Review the latest report and photo');
  project.whatsappMessages[0].processedAt = project.whatsappMessages[0].date;
  assert.deepEqual(getProjectOverview(project).activities.map(entry => entry.title), ['Reported progress updated']);
});

test('foreign, duplicate and missing record IDs cannot leak into cards or links', () => {
  const project = fixture();
  project.whatsappMessages = [message(project, 'FOREIGN', '2099-01-01', { projectId: 'OTHER' }),
    message(project, 'WRONG-CODE', '2099-01-02', { projectCode: 'OTHER' }),
    message(project, 'DUPLICATE', '2099-01-03'), message(project, 'DUPLICATE', '2099-01-04'),
    message(project, 'VALID', '2026-10-21')];
  project.reports = [report(project, 'FOREIGN', '2099-01-01', { projectId: 'OTHER', vo: true }),
    report(project, 'MISSING-ITEM', '2099-01-02', { itemId: 'OTHER' }),
    report(project, 'DUPLICATE', '2099-01-03'), report(project, 'DUPLICATE', '2099-01-04')];
  project.voReviews = [{ id: 'FOREIGN', reportId: 'FOREIGN', projectId: 'OTHER', status: 'approved' }];
  project.claimDrafts = [{ id: 'FOREIGN', projectId: 'OTHER', period: '2026-10', revision: 1, status: 'draft', createdAt: '2099-01-01', assessment: {}, snapshot: { projectId: 'OTHER', period: '2026-10' } }];
  const before = structuredClone(project);
  const overview = getProjectOverview(project);
  assert.deepEqual(overview.activities.map(entry => entry.target), [{ route: 'whatsapp', messageId: 'VALID' }]);
  assert.equal(card(project, 'site').summary, 'No updates awaiting verification');
  assert.equal(card(project, 'site').detail, '1 new message');
  assert.equal(card(project, 'vo').detail, 'No extra work flagged');
  assert.equal(card(project, 'claims').summary, 'No saved claims yet');
  assert.deepEqual(project, before);
});

test('zero and unknown physical totals are preserved without inventing activity or claim money', () => {
  const project = fixture();
  project.items[0].reported = 0; project.items[0].verified = null;
  project.reports = [report(project, 'UNDATED', '', { completion: 0 })];
  const before = structuredClone(project);
  const overview = getProjectOverview(project);
  assert.equal(card(project, 'site').summary, '1 awaiting verification');
  assert.deepEqual(overview.activities, []);
  assert.deepEqual(project, before);
  assert.ok(overview.cards.every(entry => !/\$|SGD|claimed value/.test(`${entry.summary} ${entry.detail}`)));
  assert.equal(card(null, 'contract').summary, 'No contract items yet');
});

test('latest saved claim card selects the latest revision of the most recently saved month, with exact revision links', () => {
  const project = fixture();
  project.claimDrafts = [
    { id: 'OCT-R1', projectId: project.id, period: '2026-10', revision: 1, status: 'draft', createdAt: '2026-10-21T09:00:00Z', assessment: {}, snapshot: { projectId: project.id, period: '2026-10' } },
    { id: 'OCT-R2', projectId: project.id, period: '2026-10', revision: 2, status: 'draft', createdAt: '2026-10-22T09:00:00Z', assessment: {}, snapshot: { projectId: project.id, period: '2026-10' }, revisionOf: 'OCT-R1' },
    { id: 'NOV-R1', projectId: project.id, period: '2026-11', revision: 1, status: 'draft', createdAt: '2026-10-20T09:00:00Z', assessment: {}, snapshot: { projectId: project.id, period: '2026-11' } },
  ];
  const before = structuredClone(project);
  assert.equal(card(project, 'claims').summary, 'Oct 2026 · v2');
  assert.equal(getProjectOverview(project).activities[0].target.draftId, 'OCT-R2');
  assert.equal(getProjectOverview(project).activities[1].target.draftId, 'OCT-R1');
  assert.deepEqual(project, before);
});

test('claim tracking activity sorts by recording time rather than a backdated business date', () => {
  let project = fixture();
  project.reports = [report(project, 'VERIFIED', '2026-10-20T09:00:00+08:00', { status: 'verified', verifiedAt: '2026-10-20T12:00:00+08:00' })];
  const saved = savedClaim(project);
  const prepared = markClaimPrepared(saved.project, saved.draft.id);
  assert.equal(prepared.outcome, 'updated', prepared.error);
  project = prepared.project;
  project.claimDrafts[0].createdAt = '2026-10-20T03:00:00Z';
  project.claimDrafts[0].preparedAt = '2026-10-21T03:00:00Z';
  const recorded = recordClaimStage(project, saved.draft.id, 'submitted', { date: '2026-10-22', reference: 'DEMO-SUBMIT' });
  assert.equal(recorded.outcome, 'updated', recorded.error);
  project = recorded.project;
  project.claimTracking[0].history[0].recordedAt = '2026-10-24T03:00:00Z';
  project.whatsappMessages = [message(project, 'RECENT', '2026-10-23T03:00:00Z')];
  const before = structuredClone(project);
  const activities = getProjectOverview(project).activities;
  assert.equal(activities[0].title, 'Claim submission recorded');
  assert.equal(activities[0].date, '2026-10-24T03:00:00Z');
  assert.deepEqual(activities[0].target, { route: 'claim-status', draftId: saved.draft.id });
  assert.equal(activities[1].target.messageId, 'RECENT');
  assert.equal(card(project, 'claims').detail, 'Submitted');
  assert.deepEqual(project, before);
});


test('clarification request links its validated original message and invalid claim months are ignored', () => {
  let project = fixture();
  project.whatsappMessages = [message(project, 'UNCLEAR', '2026-10-20T09:00:00+08:00', {
    kind: 'clarification', status: 'clarification', itemId: null, text: 'Another 10%', completion: 10, completionBasis: 'unclear',
  })];
  const result = saveMessageClarificationRequest(project, 'UNCLEAR', { question: 'Confirm the work item and total completion.' }, now);
  assert.equal(result.outcome, 'updated', result.error);
  project = result.project;
  project.claimDrafts = [{ id: 'BAD-MONTH', projectId: project.id, period: '2026-99', revision: 1, status: 'draft', createdAt: '2099-01-01', assessment: {}, snapshot: { projectId: project.id, period: '2026-99' } }];
  const before = structuredClone(project);
  const overview = getProjectOverview(project);
  assert.equal(overview.activities[0].title, 'Clarification requested');
  assert.deepEqual(overview.activities[0].target, { route: 'whatsapp', messageId: 'UNCLEAR' });
  assert.equal(card(project, 'claims').summary, 'No saved claims yet');
  assert.deepEqual(project, before);
});
