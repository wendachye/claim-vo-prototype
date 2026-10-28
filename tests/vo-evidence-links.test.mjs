import assert from 'node:assert/strict';
import test from 'node:test';
import { seedWorkspace, loadWorkspace, resetProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { getVOCases, getVOEvidenceLink, getVOLinkTargets, getVORelatedEvidence, linkVOEvidence, updateVOReview } from '../src/data/vo.ts';

const fixture = () => {
  const project = seedWorkspace().projects[0];
  const original = project.reports.find(report => report.vo);
  project.reports.push(...['RELATED-REPORT-A', 'RELATED-REPORT-B'].map((id, index) => ({
    ...structuredClone(original), id, projectId: project.id, projectCode: project.code,
    sourceMessageId: `SOURCE-${index}`, message: `Another original photo and message ${index}.`,
  })));
  return project;
};
const reason = 'Two reports describe the same additional access platform.';
const sourceId = 'RELATED-REPORT-A', targetId = 'DEMO-REPORT-003';
const reload = project => {
  const entries = new Map([[WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id, projects: [project] })]]);
  return loadWorkspace({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }).projects[0];
};
const submit = project => updateVOReview(project, targetId, 'submit', {
  title: 'One extra platform', scopeAssessment: 'Separate platform outside listed scope.',
  instructionReference: 'SI-DEMO-01', scopeDisposition: 'variation', instructionStatus: 'documented',
}).project;

test('explicit linking freezes related evidence once and preserves every original and saved claim', () => {
  const project = fixture(), before = structuredClone(project);
  project.claimDrafts = [{ id: 'UNRELATED', projectId: project.id, assessment: { vos: {} }, snapshot: { voRows: [] }, status: 'prepared' }];
  const claims = structuredClone(project.claimDrafts);
  const result = linkVOEvidence(project, sourceId, targetId, ` ${reason} `);
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(result.project.reports, before.reports);
  assert.deepEqual(result.project.voReviews, before.voReviews);
  assert.deepEqual(result.project.whatsappMessages, before.whatsappMessages);
  assert.deepEqual(result.project.items, before.items);
  assert.deepEqual(result.project.baselines, before.baselines);
  assert.deepEqual(result.project.seed, before.seed);
  assert.deepEqual(result.project.claimDrafts, claims);
  assert.equal(getVOCases(result.project).find(entry => entry.id === sourceId).status, 'linked');
  assert.equal(getVOCases(result.project).find(entry => entry.id === targetId).status, 'flagged');
  const link = getVOEvidenceLink(result.project, sourceId);
  assert.equal(link.reason, reason);
  assert.equal(link.targetReference, 'SIT01-VO-001');
  assert.deepEqual(getVORelatedEvidence(result.project, targetId), [{ link, report: project.reports.find(report => report.id === sourceId) }]);
  const replay = linkVOEvidence(result.project, sourceId, targetId, reason);
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.project, result.project);
  assert.equal(result.project.history.length, project.history.length + 1);
  getVORelatedEvidence(result.project, targetId)[0].report.message = 'Must be an independent read-only copy';
  assert.equal(getVORelatedEvidence(result.project, targetId)[0].report.message, project.reports.find(report => report.id === sourceId).message);
});

test('only a leaf can link to a root; the root may hold multiple independent originals', () => {
  let project = linkVOEvidence(fixture(), sourceId, targetId, reason).project;
  assert.deepEqual(getVOLinkTargets(project, sourceId), []);
  assert.deepEqual(getVOLinkTargets(project, targetId), []);
  for (const [from, to] of [[sourceId, 'RELATED-REPORT-B'], [targetId, sourceId], [targetId, 'RELATED-REPORT-B'], ['RELATED-REPORT-B', sourceId]]) {
    assert.equal(linkVOEvidence(project, from, to, reason).outcome, 'invalid');
  }
  const second = linkVOEvidence(project, 'RELATED-REPORT-B', targetId, 'A third supporting original.');
  assert.equal(second.outcome, 'updated');
  assert.equal(getVORelatedEvidence(second.project, targetId).length, 2);
  for (const action of ['save', 'clarify', 'submit', 'approve', 'reject', 'reopen', 'assessEligibility']) {
    assert.equal(updateVOReview(second.project, sourceId, action, { reviewNote: 'Cannot revive linked duplicate.' }).outcome, 'invalid');
  }
});

test('link guards reject absent, foreign, duplicate, pending, final, formerly approved or claimed sources and targets', () => {
  const project = fixture();
  for (const [from, to, why] of [[sourceId, sourceId, reason], ['MISSING', targetId, reason], [sourceId, 'MISSING', reason], [sourceId, targetId, ' '], [sourceId, targetId, 'a'.repeat(2001)]]) {
    const result = linkVOEvidence(project, from, to, why);
    assert.equal(result.outcome, 'invalid');assert.equal(result.project, project);
  }
  for (const id of [sourceId, targetId]) {
    for (const status of ['pendingApproval', 'approved', 'rejected']) {
      const copy = structuredClone(project);
      copy.voReviews = [{ ...getVOCases(copy).find(entry => entry.id === id), status }];
      assert.equal(linkVOEvidence(copy, sourceId, targetId, reason).outcome, 'invalid');
    }
    const formerlyApproved = structuredClone(project);
    formerlyApproved.voReviews = [{ ...getVOCases(project).find(entry => entry.id === id), history: [{ action: 'approve', to: 'approved', date: '2026-10-01T00:00:00.000Z' }] }];
    assert.equal(linkVOEvidence(formerlyApproved, sourceId, targetId, reason).outcome, 'invalid');
    const malformedHistory = structuredClone(project);
    malformedHistory.voReviews = [{ ...getVOCases(project).find(entry => entry.id === id), history: [null] }];
    assert.equal(linkVOEvidence(malformedHistory, sourceId, targetId, reason).outcome, 'invalid');
    const legacyApproval = structuredClone(project);
    legacyApproval.reports.find(report => report.id === id).status = 'voApproved';
    assert.equal(linkVOEvidence(legacyApproval, sourceId, targetId, reason).outcome, 'invalid');
    for (const source of ['assessment', 'snapshot']) {
      const copy = structuredClone(project);
      copy.claimDrafts = [{ id: 'SAVED', projectId: copy.id, ...(source === 'assessment' ? { assessment: { vos: { [id]: { include: true } } } } : { snapshot: { voRows: [{ caseId: id, included: true }] } }) }];
      assert.equal(linkVOEvidence(copy, sourceId, targetId, reason).outcome, 'invalid');
    }
    const foreign = structuredClone(project);
    foreign.reports.find(report => report.id === id).projectId = 'OTHER';
    assert.equal(linkVOEvidence(foreign, sourceId, targetId, reason).outcome, 'invalid');
    const duplicate = structuredClone(project);
    duplicate.reports.push(structuredClone(duplicate.reports.find(report => report.id === id)));
    assert.equal(linkVOEvidence(duplicate, sourceId, targetId, reason).outcome, 'invalid');
  }
});

test('linked evidence remains frozen and linked after target approval and a workspace reload', () => {
  const original = fixture();
  const linked = linkVOEvidence(original, sourceId, targetId, reason).project;
  const pending = submit(linked);
  const approved = updateVOReview(pending, targetId, 'approve', { approvedValue: '900', approvalReference: 'APP-01', approver: 'Client QS' }).project;
  const restored = reload(approved);
  assert.equal(getVOCases(restored).find(entry => entry.id === sourceId).status, 'linked');
  assert.equal(getVOCases(restored).find(entry => entry.id === targetId).status, 'approved');
  assert.equal(getVORelatedEvidence(restored, targetId).length, 1);
  assert.deepEqual(getVORelatedEvidence(restored, targetId), getVORelatedEvidence(linked, targetId));
  const reset = resetProject(restored);
  assert.equal(reset.voEvidenceLinks, undefined);
  assert.equal(reset.voEvidenceLinkIssues, undefined);
  assert.deepEqual(reset.claimDrafts, original.seed.claimDrafts);
});

test('a later live demo-photo refresh never replaces or invalidates the frozen linked original', () => {
  const linked = linkVOEvidence(fixture(), sourceId, targetId, reason).project;
  const frozen = structuredClone(getVORelatedEvidence(linked, targetId));
  linked.reports = linked.reports.map(report => report.id === sourceId ? {
    ...report, photo: '/assets/demo-scaffold.jpg', photoAlt: 'A newer generated illustration',
    demoPhotoHistory: [{ photo: report.photo, photoAlt: report.photoAlt }],
  } : report);
  const restored = reload(linked);
  assert.equal(getVOCases(restored).find(entry => entry.id === sourceId).status, 'linked');
  assert.equal(getVOCases(restored).find(entry => entry.id === sourceId).evidenceLinkIssue, undefined);
  assert.deepEqual(getVORelatedEvidence(restored, targetId), frozen);
});

test('malformed and competing saved link histories cannot revive a source after normalization and repeated reload', () => {
  const linked = linkVOEvidence(fixture(), sourceId, targetId, reason).project;
  for (const mutate of [
    copy => { copy.voEvidenceLinks[0].reason = ''; },
    copy => { copy.voEvidenceLinks[0].sourceReport.message = { malformed: true }; },
    copy => { copy.voEvidenceLinks.push(structuredClone(copy.voEvidenceLinks[0])); },
    copy => { copy.voEvidenceLinks.push({ ...structuredClone(copy.voEvidenceLinks[0]), id: 'COMPETING', targetCaseId: 'RELATED-REPORT-B' }); },
    copy => { copy.voEvidenceLinks.push({ ...structuredClone(copy.voEvidenceLinks[0]), id: 'CYCLE', sourceCaseId: targetId, targetCaseId: sourceId, sourceReference: 'SIT01-VO-001', targetReference: 'SIT01-VO-002', sourceReport: structuredClone(copy.reports.find(report => report.id === targetId)) }); },
  ]) {
    const copy = structuredClone(linked);mutate(copy);
    const restored = reload(reload(copy));
    const entry = getVOCases(restored).find(value => value.id === sourceId);
    assert.equal(entry.status, 'linked');assert.equal(entry.evidenceLinkIssue, true);
    assert.equal(getVOEvidenceLink(restored, sourceId), null);
    assert.equal(updateVOReview(restored, sourceId, 'submit', {}).outcome, 'invalid');
    assert.deepEqual(getVOLinkTargets(restored, sourceId), []);
  }
});

test('foreign stored links and spoofed review metadata cannot suppress local work', () => {
  const original = fixture(), linked = linkVOEvidence(original, sourceId, targetId, reason).project;
  const copy = structuredClone(original);
  copy.voEvidenceLinks = [{ ...structuredClone(linked.voEvidenceLinks[0]), projectId: 'OTHER' }];
  copy.voReviews = [{ ...getVOCases(original).find(entry => entry.id === sourceId), linkedTo: linked.voEvidenceLinks[0], evidenceLinkIssue: true }];
  const restored = reload(copy), entry = getVOCases(restored).find(value => value.id === sourceId);
  assert.equal(entry.status, 'flagged');assert.equal(entry.linkedTo, undefined);assert.equal(entry.evidenceLinkIssue, undefined);
  assert.ok(getVOLinkTargets(restored, sourceId).some(value => value.id === targetId));
});
