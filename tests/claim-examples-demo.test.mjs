import assert from 'node:assert/strict';
import test from 'node:test';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.js';
import { buildClaimReview, markClaimPrepared, saveClaimDraft } from '../src/data/claims.js';
import { getClaimTracking } from '../src/data/claim-tracking.js';
import { loadWorkspace, resetProject, seedWorkspace, WORKSPACE_STORE } from '../src/data/projects.js';

const now = new Date('2026-10-22T05:00:00Z');
const example = (code = 'EXAMPLES01') => createClaimExamplesDemo({ name: 'Claim examples (Demo)', code, country: 'Singapore' }, now);

test('fictional examples show incomplete, ready and paid records with valid cutoff evidence', () => {
  const project = example();
  assert.equal(project.claimExamplesDemo, true);
  assert.equal(project.contract.sourceKind, 'illustrative');
  assert.equal(project.contract.sourceFile, null);
  assert.equal(project.claimDrafts.length, 3);
  const [paid, ready, incomplete] = project.claimDrafts;
  assert.deepEqual(project.claimDrafts.map((draft) => draft.period), ['2026-08', '2026-09', '2026-10']);
  assert.equal(getClaimTracking(project, paid.id).status, 'paid');
  assert.equal(paid.snapshot.totals.currentValue, 5000);
  assert.equal(getClaimTracking(project, paid.id).paidValue, 5000);
  assert.equal(ready.status, 'draft');
  assert.equal(ready.snapshot.canPrepare, true);
  assert.equal(ready.snapshot.totals.currentValue, 5625);
  assert.equal(ready.snapshot.totals.previousValue, 5000);
  assert.equal(incomplete.status, 'draft');
  assert.equal(incomplete.snapshot.canPrepare, false);
  assert.equal(incomplete.snapshot.totals.currentValue, null);
  assert.equal(incomplete.assessment.priorConfirmed, false);
  assert.equal(incomplete.assessment.work['WI-001'].previousValue, 5000); // Ready drafts are never prior issued claims.
  assert.equal(incomplete.assessment.work['WI-002'].assessedQuantity, null);
  assert.equal(markClaimPrepared(project, incomplete.id).outcome, 'invalid');
  for (const draft of project.claimDrafts) {
    assert.deepEqual(buildClaimReview(project, draft.period, draft.assessment), draft.snapshot);
    assert.ok(draft.snapshot.workRows.filter((row) => row.included).every((row) => row.verifiedAt && Date.parse(row.verifiedAt) <= Date.parse(`${draft.snapshot.cutoff}T23:59:59+08:00`)));
  }
  assert.equal(markClaimPrepared(project, ready.id).outcome, 'updated');
});

test('examples are independent and explicit edits save a new version without changing paid claims', () => {
  const project = example();
  const original = structuredClone(project);
  const other = example('EXAMPLES02');
  other.items[0].quantity = 1;
  other.claimDrafts[0].snapshot.totals.currentValue = 1;
  assert.deepEqual(project, original);
  const current = project.claimDrafts.at(-1);
  const assessment = structuredClone(current.assessment);
  assessment.priorConfirmed = true;
  assessment.work['WI-002'] = { include: true, assessedQuantity: 150, previousValue: 0 };
  const edited = saveClaimDraft(project, current.period, assessment);
  assert.equal(edited.outcome, 'updated');
  assert.equal(edited.draft.revision, 2);
  assert.equal(edited.draft.snapshot.canPrepare, true);
  assert.equal(edited.draft.snapshot.totals.currentValue, 16000);
  assert.deepEqual(edited.project.claimDrafts.slice(0, 3), original.claimDrafts);
  assert.deepEqual(edited.project.claimTracking, original.claimTracking);
  assert.deepEqual(project, original);
});

test('examples persist and reset independently while ordinary project tracking is cleared', () => {
  const project = example();
  const workspace = seedWorkspace();
  const ordinaryBefore = structuredClone(workspace.projects);
  workspace.projects.push(project);
  workspace.activeProjectId = project.id;
  const storage = { getItem: (key) => key === WORKSPACE_STORE ? JSON.stringify(workspace) : null, setItem() {} };
  const loaded = loadWorkspace(storage);
  assert.deepEqual(loaded.projects.slice(0, ordinaryBefore.length), ordinaryBefore);
  const restored = loaded.projects.find((entry) => entry.id === project.id);
  assert.equal(restored.claimExamplesDemo, true);
  assert.equal(getClaimTracking(restored, project.claimDrafts[0].id).status, 'paid');
  restored.claimDrafts.at(-1).assessment.note = 'Unrelated local edit';
  const reset = resetProject(restored);
  assert.equal(reset.lockedAt, project.lockedAt);
  assert.deepEqual(reset.claimDrafts, project.claimDrafts);
  assert.deepEqual(reset.claimTracking, project.claimTracking);
  assert.equal(getClaimTracking(reset, project.claimDrafts[0].id).status, 'paid');
  const ordinary = { ...structuredClone(project), claimExamplesDemo: false };
  assert.deepEqual(resetProject(ordinary).claimTracking, []);
});

test('claim months follow Kuala Lumpur time across year boundaries and honour currency', () => {
  const project = createClaimExamplesDemo({ name: 'MY examples', code: 'MYEX', country: 'Malaysia' }, new Date('2026-12-31T17:00:00Z'));
  assert.deepEqual(project.claimDrafts.map((draft) => draft.period), ['2026-11', '2026-12', '2027-01']);
  assert.equal(project.contract.currency, 'MYR');
  assert.ok(project.claimDrafts.every((draft) => draft.snapshot.currency === 'MYR'));
});
