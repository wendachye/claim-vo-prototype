import assert from 'node:assert/strict';
import test from 'node:test';
import { getProjectDashboard } from '../src/data/project-dashboard.ts';
import { getProjectOverview } from '../src/data/project-overview.ts';
import { createProject } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { saveClaimDraft, markClaimPrepared } from '../src/data/claims.ts';
import { recordClaimStage } from '../src/data/claim-tracking.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { defaultClaimBasis } from '../src/data/claim-basis.ts';
import { getDrawingMapping, installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { getAreaAllocationSnapshot } from '../src/data/area-allocations.ts';

const now = new Date('2026-10-25T01:00:00Z');
function fixture() {
  const project = createProject({ name: 'Dashboard example', code: 'DASH', country: 'Singapore' });
  Object.assign(project, { locked: true, lockedAt: '2026-09-01T12:00:00+08:00', version: 1,
    contract: { ...project.contract, currency: 'SGD', totalAmount: 1000, representativeSubset: false },
    items: [{ id: 'A', ref: 'A/01', description: 'Measured scaffold', unit: 'm²', quantity: 100, rate: 10,
      amount: 1000, pricingType: 'measured', verified: 50, reported: 65 }],
    reports: [{ id: 'RA', projectId: project.id, projectCode: project.code, itemId: 'A', status: 'verified', completion: 50,
      date: '2026-10-15T09:00:00+08:00', verifiedAt: '2026-10-15T10:00:00+08:00' }],
    whatsappMessages: [], voReviews: [], claimDrafts: [], claimTracking: [], messageClarifications: [], history: [],
  });
  project.sourceItems = structuredClone(project.items);
  return project;
}
function saved(project, period = '2026-10', quantity = 50, previous = 0, changes = {}) {
  const result = saveClaimDraft(project, period, { priorConfirmed: true, work: { A: { include: true, assessedQuantity: quantity, previousValue: previous } },
    adjustmentReason: previous > quantity * 10 ? 'Demo measurement correction' : '', ...changes });
  assert.equal(result.outcome, 'updated', result.error);
  return result;
}
function prepared(project = fixture(), previous = 0) {
  const result = saved(project, '2026-10', 50, previous);
  const ready = markClaimPrepared(result.project, result.draft.id);
  assert.equal(ready.outcome, 'updated', ready.error);
  ready.project.claimDrafts[0].preparedAt = '2026-10-20T12:00:00+08:00';
  return { project: ready.project, id: result.draft.id };
}
function stage(project, id, action, fields) {
  const result = recordClaimStage(project, id, action, fields);
  assert.equal(result.outcome, 'updated', result.error);
  return result.project;
}
function approve(project, id, price, eligible = false) {
  project.reports.push({ id, projectId: project.id, projectCode: project.code, vo: true, status: 'pending', scopeLabel: id, date: '2026-10-20' });
  project.voReviews.push({ id, reportId: id, projectId: project.id, status: 'approved', approvedValue: price,
    approvalReference: `APP-${id}`, approver: 'Demo QS',
    history: [{ action: 'approve', to: 'approved', date: '2026-10-21T00:00:00Z' }],
    ...(eligible ? { reviewChecksVersion: 1, scopeDisposition: 'variation', scopeAssessment: 'Changed access required',
      instructionStatus: 'documented', instructionReference: 'DEMO-INSTRUCTION', executionStatus: 'verified', executionReference: 'DEMO-EVIDENCE',
      executionVerifiedAt: '2026-10-21T00:00:00Z', claimEligibility: 'eligible', eligibilityNote: 'Demo QS assessed evidence', eligibilityReviewedAt: '2026-10-22T00:00:00Z' } : {}),
  });
}

test('S.I.T. dashboard distinguishes declared contract value from partial schedule and stays read-only', () => {
  const project = createSITContractDemo({ name: 'Dashboard S.I.T.', code: 'DASH-SIT' }, now);
  const before = structuredClone(project);
  const packs = project.claimDrafts.map(entry => buildClaimPack(project, entry.id).pack);
  const csv = packs.map(toClaimCSV);
  const result = getProjectDashboard(project);
  assert.equal(result.contract.partialSchedule, true);
  assert.equal(result.contract.declaredValue, project.contract.totalAmount);
  assert.equal(result.contract.itemCount, 18);
  assert.equal(result.latestClaim.id, project.claimDrafts[0].id);
  assert.equal(result.latestClaim.amount, project.claimDrafts[0].snapshot.totals.currentValue);
  assert.deepEqual(result.latestClaim.target, { route: 'claim-preview', draftId: result.latestClaim.id });
  assert.deepEqual(project, before);
  assert.deepEqual(project.claimDrafts.map(entry => buildClaimPack(project, entry.id).pack), packs);
  assert.deepEqual(project.claimDrafts.map(entry => toClaimCSV(buildClaimPack(project, entry.id).pack)), csv);
});

test('verified work counts keep zero and unknown separate, exclude nonmeasured scope and do not average progress', () => {
  const project = fixture();
  project.items = [100, 25, 0, null, NaN, -1, 101].map((verified, index) => ({ ...project.items[0], id: `I${index}`, verified }));
  project.items.push({ ...project.items[0], id: 'INCLUDED', pricingType: 'included', verified: 100 });
  project.items.push({ ...project.items[0], id: 'RATE', pricingType: 'rateOnly', verified: 100 });
  const { site } = getProjectDashboard(project);
  assert.deepEqual([site.total, site.completed, site.inProgress, site.notStarted, site.unknown, site.excluded], [7, 1, 1, 1, 4, 2]);
  assert.equal(Object.hasOwn(site, 'percent'), false);
  const empty = fixture(); empty.items = []; empty.reports = [];
  assert.equal(getProjectDashboard(empty).site.total, 0);
  assert.equal(getProjectDashboard(empty).latestClaim, null);
});

test('explicit area completion is weighted against full item quantity and ignores stale whole-item totals', () => {
  let project = installDrawing(fixture(), { inputKind: 'sample' }, now).project;
  project.items[0].verified = 100;
  const areas = getDrawingMapping(project).areas.slice(0, 2);
  for (const [index, area] of areas.entries()) {
    const result = saveAreaMapping(project, { ...area, areaId: area.id, workItemIds: ['A'], workItemQuantities: { A: index ? 40 : 60 } }, now);
    assert.equal(result.outcome, 'updated', result.error);
    project = result.project;
  }
  const add = (area, completion) => project.reports.push({ id: `SCOPE-${area.id}`, projectId: project.id, projectCode: project.code,
    itemId: 'A', status: 'verified', completion, approvedCompletion: completion, date: '2026-10-25', verifiedAt: '2026-10-25',
    areaProgress: getAreaAllocationSnapshot(project, area.id, 'A') });
  assert.equal(getProjectDashboard(project).site.unknown, 1);
  add(areas[0], 100);
  assert.equal(getProjectDashboard(project).site.inProgress, 1);
  assert.equal(getProjectDashboard(project).site.completed, 0);
  add(areas[1], 100);
  assert.equal(getProjectDashboard(project).site.completed, 1);
  project.drawingMapping.areas.find(entry => entry.id === areas[1].id).workItemQuantities.A = 41;
  assert.equal(getProjectDashboard(project).site.unknown, 1);
});

test('claim rows use only latest saved revision per month and exact saved net amount, never sum revisions', () => {
  const first = saved(fixture());
  const second = saved(first.project, '2026-10', 40, 0, { claimBasis: { ...defaultClaimBasis(), retentionMode: 'rateCap', retentionRate: 5,
    retentionCap: 100, previousNetValue: 0 } });
  const later = saved(second.project, '2026-11', 50, 400);
  const dashboard = getProjectDashboard(later.project);
  assert.equal(dashboard.claims.length, 2);
  assert.deepEqual(dashboard.claims.map(entry => entry.id), [later.draft.id, second.draft.id]);
  assert.equal(dashboard.claims[1].amount, 380);
  assert.equal(dashboard.claims[1].netAmount, true);
  assert.equal(dashboard.claims[0].netAmount, false);
  assert.equal(dashboard.claims[1].amount, second.draft.snapshot.totals.currentValue);
  assert.equal(dashboard.claims[1].revision, 2);
  assert.equal(dashboard.claims[1].certifiedValue, null);
  assert.equal(dashboard.claims[1].paidValue, null);
  assert.equal(dashboard.claims[1].balanceValue, null);
  assert.equal(Object.hasOwn(dashboard, 'claimTotal'), false);
  later.project.contract.currency = 'MYR';
  assert.equal(getProjectDashboard(later.project).claims[0].currency, 'SGD');
  later.project.claimDrafts.find(entry => entry.id === later.draft.id).snapshot.totals.currentValue = '100';
  assert.equal(getProjectDashboard(later.project).latestClaim.amount, null);
  later.project.claimDrafts.find(entry => entry.id === later.draft.id).snapshot.totals.currentValue = null;
  assert.equal(getProjectDashboard(later.project).latestClaim.amount, null);
});

test('certified, paid and balance values remain separate from saved claimed amount', () => {
  let { project, id } = prepared();
  assert.equal(getProjectDashboard(project).latestClaim.balanceValue, null);
  project = stage(project, id, 'submitted', { date: '2026-10-21', reference: 'DEMO-SUBMIT' });
  assert.equal(getProjectDashboard(project).latestClaim.paidValue, null);
  project = stage(project, id, 'certified', { date: '2026-10-22', reference: 'DEMO-CERT', value: 450, note: 'QS measurement adjustment' });
  assert.equal(getProjectDashboard(project).latestClaim.balanceValue, null);
  const original = structuredClone(project.claimDrafts);
  const csv = toClaimCSV(buildClaimPack(project, id).pack);
  project = stage(project, id, 'payment', { date: '2026-10-23', reference: 'DEMO-PART', value: 200 });
  let row = getProjectDashboard(project).latestClaim;
  assert.deepEqual([row.amount, row.certifiedValue, row.paidValue, row.balanceValue, row.statusLabel], [500, 450, 200, 250, 'Part paid']);
  assert.deepEqual(row.target, { route: 'claim-status', draftId: id });
  project = stage(project, id, 'payment', { date: '2026-10-24', reference: 'DEMO-FINAL', value: 450 });
  row = getProjectDashboard(project).latestClaim;
  assert.deepEqual([row.amount, row.paidValue, row.balanceValue, row.statusLabel], [500, 450, 0, 'Paid']);
  assert.deepEqual(project.claimDrafts, original);
  assert.equal(toClaimCSV(buildClaimPack(project, id).pack), csv);
});

test('zero and signed credit claims survive dashboard summaries', () => {
  for (const [prior, expected] of [[500, 0], [600, -100]]) {
    let { project, id } = prepared(fixture(), prior);
    project = stage(project, id, 'submitted', { date: '2026-10-21', reference: 'SUBMIT' });
    project = stage(project, id, 'certified', { date: '2026-10-22', reference: 'CERT', value: expected });
    project = stage(project, id, 'payment', { date: '2026-10-23', reference: 'PAID', value: expected });
    const row = getProjectDashboard(project).latestClaim;
    assert.deepEqual([row.amount, row.certifiedValue, row.paidValue, row.balanceValue], [expected, expected, expected, 0]);
  }
});

test('VO summaries separate price approval, claim eligibility and unknown prices using exact money totals', () => {
  const project = fixture();
  approve(project, 'VO-A', .1, true);
  approve(project, 'VO-B', .2);
  approve(project, 'VO-UNKNOWN', null);
  approve(project, 'VO-ZERO', 0, true);
  project.reports.push({ id: 'VO-FLAG', projectId: project.id, vo: true, status: 'pending' });
  const result = getProjectDashboard(project).vo;
  assert.deepEqual([result.total, result.approvedCount, result.approvedValue, result.approvedUnknownCount, result.eligibleCount, result.eligibleValue], [5, 4, .3, 1, 2, .1]);
  assert.equal(result.reviewCount, 3);
  assert.equal(result.items.length, 3);
  assert.ok(result.items.every(entry => entry.target.route === 'vo' && entry.target.caseId === entry.id));
  const noPrice = fixture(); approve(noPrice, 'UNKNOWN', null);
  assert.equal(getProjectDashboard(noPrice).vo.approvedValue, null);
  assert.equal(getProjectDashboard(fixture()).vo.approvedValue, 0);
});

test('foreign and duplicate records do not contribute to dashboard figures or exact record links', () => {
  const savedResult = saved(fixture());
  const project = savedResult.project;
  const baseline = getProjectDashboard(project);
  project.items.push({ ...project.items[0], id: 'FOREIGN', projectId: 'OTHER', verified: 100 });
  project.reports.push({ id: 'FOREIGN-VO', projectId: 'OTHER', vo: true, status: 'pending' });
  project.claimDrafts.push({ ...structuredClone(project.claimDrafts[0]), id: 'FOREIGN-CLAIM', period: '2027-01', projectId: 'OTHER' });
  project.claimDrafts.push({ ...structuredClone(project.claimDrafts[0]), id: 'FOREIGN-METADATA', period: '2027-02', projectDetails: { id: 'OTHER', contract: {} } });
  project.voReviews.push({ id: 'FOREIGN-VO', reportId: 'FOREIGN-VO', projectId: 'OTHER', status: 'approved', approvedValue: 1e8 });
  assert.deepEqual(getProjectDashboard(project), baseline);
  project.claimDrafts.push(structuredClone(project.claimDrafts[0]));
  assert.equal(getProjectDashboard(project).claims.length, 0);
  const duplicate = fixture(); duplicate.items.push(structuredClone(duplicate.items[0]));
  assert.equal(getProjectDashboard(duplicate).site.total, 0);
});


test('latest saved claim follows overview recency while claim rows remain ordered by month', () => {
  const october = saved(fixture(), '2026-10', 50);
  const november = saved(october.project, '2026-11', 40);
  const backdated = saved(november.project, '2026-09', 20);
  backdated.project.claimDrafts.find(entry => entry.id === october.draft.id).createdAt = '2026-10-21T01:00:00Z';
  backdated.project.claimDrafts.find(entry => entry.id === november.draft.id).createdAt = '2026-10-22T01:00:00Z';
  backdated.project.claimDrafts.find(entry => entry.id === backdated.draft.id).createdAt = '2026-10-25T01:00:00Z';
  const before = structuredClone(backdated.project);
  const dashboard = getProjectDashboard(backdated.project);
  const overview = getProjectOverview(backdated.project);
  assert.deepEqual(dashboard.claims.map(entry => entry.period), ['2026-11', '2026-10', '2026-09']);
  assert.equal(dashboard.latestClaim.id, backdated.draft.id);
  assert.equal(dashboard.latestClaim.period, '2026-09');
  assert.equal(dashboard.latestClaim.amount, 200);
  assert.equal(overview.cards.find(entry => entry.id === 'claims').summary, 'Sep 2026 · v1');
  assert.deepEqual(backdated.project, before);
});

test('analytics counts every latest saved month once and compares only recorded months without adding claim values', () => {
  let project = fixture();
  project.lockedAt = '2026-01-01T00:00:00Z';
  project.reports[0].date = '2026-01-15T01:00:00Z';
  project.reports[0].verifiedAt = '2026-01-15T02:00:00Z';
  const states = ['draft', 'prepared', 'submitted', 'queried', 'certified', 'paid', 'draft', 'draft'];
  for (const [index, status] of states.entries()) {
    const month = String(index + 1).padStart(2, '0');
    const period = `2026-${month}`;
    const result = saved(project, period, 40 + index);
    project = result.project;
    if (status === 'draft') continue;
    const ready = markClaimPrepared(project, result.draft.id);
    assert.equal(ready.outcome, 'updated', ready.error);
    project = ready.project;
    project.claimDrafts.find(entry => entry.id === result.draft.id).preparedAt = `2026-${month}-17T01:00:00Z`;
    if (status === 'prepared') continue;
    project = stage(project, result.draft.id, 'submitted', { date: `2026-${month}-18`, reference: `SUB-${month}` });
    if (status === 'queried') project = stage(project, result.draft.id, 'query', { date: `2026-${month}-19`, reference: `QUERY-${month}`, note: 'Mock clarification of this saved assessment.' });
    if (status === 'certified' || status === 'paid') project = stage(project, result.draft.id, 'certified', { date: `2026-${month}-19`, reference: `CERT-${month}`, value: (40 + index) * 10 });
    if (status === 'paid') project = stage(project, result.draft.id, 'payment', { date: `2026-${month}-20`, reference: `PAY-${month}`, value: (40 + index) * 10 });
  }
  project = saved(project, '2026-01', 35).project;
  // Unknown amount and historical currencies are retained, not guessed from a
  // later project profile or converted into a zero-height monthly observation.
  project.claimDrafts.find(entry => entry.period === '2026-08').snapshot.totals.currentValue = null;
  project.claimDrafts.find(entry => entry.period === '2026-03').snapshot.currency = 'MYR';
  const before = structuredClone(project);
  const dashboard = getProjectDashboard(project);
  assert.equal(dashboard.claims.length, 3);
  assert.equal(dashboard.analytics.claimCount, 8);
  assert.deepEqual(dashboard.analytics.claimStatuses, { draft: 3, prepared: 1, submitted: 1, queried: 1, certified: 1, paid: 1 });
  assert.deepEqual(dashboard.analytics.claimHistory.map(entry => entry.period), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  assert.equal(dashboard.analytics.claimHistory[0].currency, 'MYR');
  assert.equal(dashboard.analytics.claimHistory.at(-1).amount, null);
  assert.equal(dashboard.analytics.claimHistory.find(entry => entry.period === '2026-06').paidValue, 450);
  assert.equal(dashboard.analytics.claimHistory.find(entry => entry.period === '2026-05').paidValue, null);
  assert.equal(Object.hasOwn(dashboard.analytics, 'claimTotal'), false);
  assert.deepEqual(project, before);
});

test('analytics attention is bounded to genuine selected-project claim and VO follow-ups, excluding site work', () => {
  const result = saved(fixture());
  const project = result.project;
  project.reports.push({ id: 'SITE-PENDING', projectId: project.id, projectCode: project.code, itemId: 'A', status: 'pending', completion: 75, date: '2026-10-24' });
  approve(project, 'VO-CHECKS', 100);
  approve(project, 'VO-READY', 200, true);
  let analytics = getProjectDashboard(project).analytics;
  assert.equal(analytics.attentionTotal, 2);
  assert.deepEqual(analytics.attention.map(entry => entry.target), [
    { route: 'vo', caseId: 'VO-CHECKS' }, { route: 'claims', draftId: result.draft.id },
  ]);
  for (let index = 0; index < 5; index++) project.reports.push({ id: `VO-FLAG-${index}`, projectId: project.id, vo: true, status: 'pending' });
  const before = structuredClone(project);
  const exports = project.claimDrafts.map(entry => toClaimCSV(buildClaimPack(project, entry.id).pack));
  analytics = getProjectDashboard(project).analytics;
  assert.equal(analytics.attentionTotal, 7);
  assert.equal(analytics.attention.length, 4);
  assert.ok(analytics.attention.every(entry => entry.projectId === project.id && ['claims', 'vo'].includes(entry.category)));
  assert.ok(analytics.attention.every(entry => entry.target.route === 'vo'));
  assert.deepEqual(analytics.voStatuses, { flagged: 5, clarification: 0, pendingApproval: 0, approved: 2, rejected: 0 });
  assert.deepEqual(project, before);
  assert.deepEqual(project.claimDrafts.map(entry => toClaimCSV(buildClaimPack(project, entry.id).pack)), exports);
});

test('analytics excludes ambiguous duplicate revisions, invalid statuses and foreign sources instead of inventing a draft state', () => {
  const result = saved(fixture());
  const project = result.project;
  const baseline = getProjectDashboard(project).analytics;
  project.claimDrafts.push({ ...structuredClone(project.claimDrafts[0]), id: 'UNKNOWN-STATUS', status: 'pending', period: '2026-11', snapshot: { ...structuredClone(project.claimDrafts[0].snapshot), period: '2026-11' } });
  project.claimDrafts.push({ ...structuredClone(project.claimDrafts[0]), id: 'FOREIGN-ANALYTICS', projectId: 'OTHER' });
  project.reports.push({ id: 'FOREIGN-VO-ANALYTICS', projectId: 'OTHER', vo: true, status: 'pending' });
  assert.deepEqual(getProjectDashboard(project).analytics, baseline);
  project.claimDrafts.push({ ...structuredClone(project.claimDrafts[0]), id: 'AMBIGUOUS-SAME-REVISION' });
  const analytics = getProjectDashboard(project).analytics;
  assert.equal(analytics.claimCount, 0);
  assert.equal(analytics.claimHistory.length, 0);
  assert.deepEqual(analytics.claimStatuses, { draft: 0, prepared: 0, submitted: 0, queried: 0, certified: 0, paid: 0 });
});
