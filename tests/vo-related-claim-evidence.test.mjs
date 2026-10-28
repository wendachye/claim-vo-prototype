import assert from 'node:assert/strict';
import test from 'node:test';
import { createProject } from '../src/data/projects.ts';
import { buildClaimReview, saveClaimDraft, markClaimPrepared } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { getVOCases, linkVOEvidence, updateVOReview } from '../src/data/vo.ts';

const period = '2060-12';
const reason = 'Both updates concern the same instructed access platform.';
function fixture() {
  const base = createProject({ name: 'Related VO evidence', code: 'RELATED-CLAIM', country: 'Singapore' });
  return { ...base, items: [], sourceItems: [], locked: true, lockedAt: '2026-01-01T00:00:00Z',
    reports: [
      { id: 'VO-MAIN', projectId: base.id, vo: true, status: 'needsReview', date: '2026-10-01T08:00:00Z', sender: 'Demo worker A', sourceMessageId: 'WA-MAIN', message: 'Original request for the additional platform.', photo: '/assets/demo-platform.jpg' },
      { id: 'VO-RELATED', projectId: base.id, vo: true, status: 'needsReview', date: '2026-10-02T08:00:00Z', sender: 'Demo worker B', sourceMessageId: 'WA-RELATED', message: 'A second view of the same additional platform.', photo: '/assets/demo-related-platform.jpg', photoAlt: 'Related platform demo photo' },
    ], voReviews: [], claimDrafts: [], claimTracking: [] };
}
function approve(project) {
  const actions = [
    ['submit', { title: 'Additional platform', scopeDisposition: 'variation', scopeAssessment: 'Additional instructed platform outside the original scope.', instructionStatus: 'documented', instructionReference: 'DEMO-INSTRUCTION', proposedValue: 200 }],
    ['approve', { approvedValue: 200, approvalReference: 'DEMO-APPROVAL', approver: 'Demo customer' }],
    ['assessEligibility', { executionStatus: 'verified', executionReference: 'DEMO-INSPECTION', claimEligibility: 'eligible', eligibilityNote: 'QS reviewed both original updates and the separate work.' }],
  ];
  for (const [action, values] of actions) {
    const result = updateVOReview(project, 'VO-MAIN', action, values);
    assert.equal(result.outcome, 'updated', result.error);
    project = result.project;
  }
  return project;
}
const assessment = { work: {}, vos: { 'VO-MAIN': { include: true, assessedValue: 120, previousValue: 0 } }, priorConfirmed: true };

test('related originals support one assessed VO without adding a second claim amount', () => {
  const original = fixture();
  const source = structuredClone(original.reports[1]);
  const linked = linkVOEvidence(original, 'VO-RELATED', 'VO-MAIN', reason);
  assert.equal(linked.outcome, 'updated', linked.error);
  const approved = approve(linked.project);
  assert.deepEqual(approved.reports[1], source);
  assert.equal(getVOCases(approved).find(entry => entry.id === 'VO-RELATED').status, 'linked');
  const review = buildClaimReview(approved, period, assessment);
  assert.equal(review.canPrepare, true, review.issues.join(' '));
  assert.equal(review.selectedCount, 1);
  assert.equal(review.totals.currentValue, 120);
  assert.equal(review.voRows.find(row => row.id === 'VO-RELATED').eligible, false);
  const row = review.voRows.find(row => row.id === 'VO-MAIN');
  assert.equal(row.relatedEvidence.length, 1);
  assert.equal(row.relatedEvidence[0].link.reason, reason);
  assert.deepEqual(row.relatedEvidence[0].report, source);
  const saved = saveClaimDraft(approved, period, assessment);
  const pack = buildClaimPack(saved.project, saved.draft.id).pack;
  assert.equal(pack.voRows.length, 1);
  assert.equal(pack.evidenceRefs.length, 2);
  assert.equal(pack.totals.currentValue, 120);
  const related = pack.evidenceRefs[1];
  assert.equal(related.reportId, 'VO-RELATED');
  assert.equal(related.sourceMessageId, 'WA-RELATED');
  assert.equal(related.sender, 'Demo worker B');
  assert.equal(related.photo, source.photo);
  assert.equal(related.relatedVO.reason, reason);
  assert.notEqual(pack.evidenceRefs[0].id, related.id);
  const csv = toClaimCSV(pack);
  assert.match(csv, /A second view of the same additional platform/);
  assert.match(csv, /Related evidence from RELATED-CLAIM-VO-002/);
  assert.match(csv, /Supporting evidence only; no additional claim value/);
  assert.equal((csv.match(/^"Variation",/gm) || []).length, 1);
  assert.equal(markClaimPrepared(saved.project, saved.draft.id).outcome, 'updated');
});

test('later linking and source edits never retrofit an earlier saved assessment or export', () => {
  const original = fixture();
  const before = saveClaimDraft(original, period, { work: {}, vos: {}, priorConfirmed: true });
  const earlier = structuredClone(before.draft);
  const earlierPack = buildClaimPack(before.project, earlier.id).pack;
  const earlierCSV = toClaimCSV(earlierPack);
  assert.equal(earlier.snapshot.voRows.some(row => Object.hasOwn(row, 'relatedEvidence')), false);
  const linked = linkVOEvidence(before.project, 'VO-RELATED', 'VO-MAIN', reason);
  assert.equal(linked.outcome, 'updated');
  const approved = approve(linked.project);
  assert.deepEqual(approved.claimDrafts[0], earlier);
  assert.deepEqual(buildClaimPack(approved, earlier.id).pack, earlierPack);
  assert.equal(toClaimCSV(buildClaimPack(approved, earlier.id).pack), earlierCSV);
  const saved = saveClaimDraft(approved, period, assessment);
  const frozen = structuredClone(saved.draft);
  const pack = buildClaimPack(saved.project, saved.draft.id).pack;
  const csv = toClaimCSV(pack);
  const changed = structuredClone(saved.project);
  changed.reports[1].message = 'Later live edits must not replace a saved original.';
  changed.reports[1].photo = '/changed-photo.jpg';
  changed.voEvidenceLinks[0].reason = 'Changed live linking note.';
  assert.deepEqual(buildClaimPack(changed, saved.draft.id).pack, pack);
  assert.equal(toClaimCSV(buildClaimPack(changed, saved.draft.id).pack), csv);
  assert.deepEqual(changed.claimDrafts[1], frozen);
  const prepare = markClaimPrepared(changed, saved.draft.id);
  assert.equal(prepare.outcome, 'invalid');
  assert.match(prepare.error, /Source records changed/);
  assert.deepEqual(changed.claimDrafts[0], earlier);
});

test('saved related evidence rejects foreign and conflicting originals without borrowing live reports', () => {
  const linked = linkVOEvidence(fixture(), 'VO-RELATED', 'VO-MAIN', reason);
  const saved = saveClaimDraft(approve(linked.project), period, assessment);
  for (const corrupt of [
    entry => { entry.link.projectId = 'OTHER'; },
    entry => { entry.report.projectId = 'OTHER'; },
    entry => { entry.link.targetCaseId = 'OTHER-CASE'; },
    entry => { entry.link.sourceCaseId = 'VO-MAIN'; },
    entry => { entry.report.message = 'Conflicting saved original'; },
    entry => { entry.link.reason = ''; },
  ]) {
    const project = structuredClone(saved.project);
    corrupt(project.claimDrafts[0].snapshot.voRows.find(row => row.id === 'VO-MAIN').relatedEvidence[0]);
    assert.equal(buildClaimPack(project, saved.draft.id).outcome, 'invalid');
  }
  const doubled = structuredClone(saved.project);
  const row = doubled.claimDrafts[0].snapshot.voRows.find(row => row.id === 'VO-MAIN');
  row.relatedEvidence.push(structuredClone(row.relatedEvidence[0]));
  assert.equal(buildClaimPack(doubled, saved.draft.id).outcome, 'invalid');
});
