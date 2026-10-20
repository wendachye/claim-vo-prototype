import assert from 'node:assert/strict';
import test from 'node:test';
import { getProjectWorkflow } from '../src/data/workflow.js';

function project() {
  return { id: 'TEST', code: 'TEST', contract: { sourceKind: 'illustrative' }, version: 1,
    items: [{ id: 'A', description: 'Example work', pricingType: 'measured', verified: 0 }],
    reports: [], whatsappMessages: [], voReviews: [], claimDrafts: [], locked: true };
}
const workflow = (value) => getProjectWorkflow(value, '2026-10');
const report = (id, date, status = 'pending') => ({ id, projectId: 'TEST', itemId: 'A', date, status, completion: 50 });
const draft = (id, period, revision, status = 'draft') => ({ id, projectId: 'TEST', period, revision, status,
  snapshot: { projectId: 'TEST', period, canPrepare: true } });

test('contract setup guides empty, flagged and unconfirmed projects before site work', () => {
  const value = project();
  assert.equal(workflow({ ...value, items: [] }).next.label, 'Set up contract');
  value.items[0].needsReview = true;
  assert.equal(workflow(value).next.label, 'Review contract items');
  assert.equal(workflow(value).steps[0].status, 'Needs review');
  value.items[0].needsReview = false;
  value.locked = false;
  assert.equal(workflow(value).next.label, 'Confirm contract');
  value.locked = true;
  assert.equal(workflow(value).steps[0].status, 'Confirmed');
  assert.equal(workflow(value).next.label, 'Add a site update');
  assert.deepEqual(workflow(value).steps.map((step) => step.id), ['contract', 'site', 'vo', 'claims']);
});

test('new messages lead to latest pending reports, then assessment without stale report loops', () => {
  const value = project();
  value.whatsappMessages = [
    { id: 'OLD', projectId: 'TEST', projectCode: 'TEST', status: 'new', date: '2026-10-01' },
    { id: 'NEW', projectId: 'TEST', projectCode: 'TEST', status: 'new', date: '2026-10-02' },
  ];
  assert.equal(workflow(value).next.messageId, 'NEW');
  value.reports.push({ ...report('R1', '2026-10-02'), sourceMessageId: 'NEW' });
  assert.equal(workflow(value).counts.newMessages, 1); // Already processed evidence is not suggested twice.
  value.whatsappMessages.forEach((message) => { message.status = 'processed'; });
  assert.equal(workflow(value).next.route, 'completion');
  assert.equal(workflow(value).counts.pendingReports, 1);
  value.reports.push(report('OLDER', '2026-10-01'), report('LATEST', '2026-10-03', 'verified'));
  value.items[0].verified = 50;
  assert.equal(workflow(value).counts.pendingReports, 0);
  assert.equal(workflow(value).steps[1].status, 'Up to date');
  assert.equal(workflow(value).next.route, 'claims');
  assert.equal(workflow(value).steps[3].status, 'Not started'); // Physical progress is not financial readiness.
});

test('extra work review remains optional and does not alter completion or claim status', () => {
  const value = project();
  value.items[0].verified = 40;
  value.reports = [{ id: 'VO', projectId: 'TEST', vo: true, status: 'needsReview', message: 'Additional work' }];
  const open = workflow(value);
  assert.equal(open.next.caseId, 'VO');
  assert.match(open.next.description, /still claim verified work separately/);
  assert.equal(open.counts.pendingReports, 0);
  assert.equal(open.counts.verifiedItems, 1);
  assert.equal(open.steps[3].status, 'Not started');
  value.voReviews = [{ id: 'VO', reportId: 'VO', projectId: 'TEST', status: 'approved', approvedValue: 100, history: [] }];
  assert.equal(workflow(value).counts.approvedVOs, 1);
  assert.equal(workflow(value).next.route, 'claims');
  value.voReviews[0].status = 'rejected';
  assert.equal(workflow(value).counts.openVOs, 0);
  assert.equal(workflow(value).steps[2].status, 'Optional');
  assert.equal(workflow(value).counts.verifiedItems, 1);
});

test('only the latest saved revision for the selected month determines claim guidance', () => {
  const value = project();
  value.claimDrafts = [draft('SEPT', '2026-09', 8, 'prepared')];
  assert.equal(workflow(value).steps[3].status, 'Not started');
  assert.equal(workflow(value).next.label, 'Add a site update');
  value.claimDrafts.push(draft('OCT-1', '2026-10', 1, 'prepared'), draft('OCT-2', '2026-10', 2));
  assert.equal(workflow(value).steps[3].status, 'Draft saved');
  assert.equal(workflow(value).next.route, 'claims');
  assert.equal(workflow(value).next.draftId, undefined);
  value.claimDrafts[2].status = 'prepared';
  assert.equal(workflow(value).steps[3].status, 'Prepared locally');
  assert.equal(workflow(value).next.draftId, 'OCT-2');
  assert.equal(workflow(value).next.route, 'claim-preview');
  assert.match(workflow(value).next.description, /not been submitted/);
});

test('project-scoped guidance ignores foreign records and does not mutate inputs', () => {
  const value = project();
  value.items[0].verified = 25;
  value.reports = [{ ...report('FOREIGN', '2026-10-01'), projectId: 'OTHER' },
    { id: 'OTHER-VO', projectId: 'OTHER', vo: true, status: 'needsReview' }];
  value.claimDrafts = [{ ...draft('FOREIGN-DRAFT', '2026-10', 9, 'prepared'), projectId: 'OTHER' }];
  value.voReviews = [{ id: 'OTHER-VO', reportId: 'OTHER-VO', projectId: 'OTHER', status: 'approved' }];
  const before = structuredClone(value);
  const result = workflow(value);
  assert.equal(result.counts.pendingReports, 0);
  assert.equal(result.counts.openVOs, 0);
  assert.equal(result.counts.savedClaims, 0);
  assert.equal(result.next.route, 'claims');
  assert.deepEqual(value, before);
  result.steps[0].detail = 'Changed output';
  result.counts.verifiedItems = 100;
  assert.deepEqual(value, before);
  assert.match(getProjectWorkflow(value).period, /^\d{4}-\d{2}$/);
});
