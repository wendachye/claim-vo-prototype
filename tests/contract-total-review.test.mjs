import assert from 'node:assert/strict';
import test from 'node:test';
import { getContractTotalReview, getContractVersionTotalReview, saveContractTotalReview } from '../src/data/contract-total-review.js';
import { confirmContractBaseline, createContractRevision, getContractVersions } from '../src/data/contract-versions.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.js';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.js';
import { resetProject, loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.js';

const at = '2026-10-24T01:00:00.000Z';
const later = '2026-10-24T02:00:00.000Z';
const row = (values = {}) => ({ id: 'WORK-01', ref: 'A.1', description: 'Fictional measured work',
  quantity: 10, rate: 2, amount: 20, unit: 'm²', pricingType: 'measured', sourcePage: 1,
  needsReview: false, reported: 40, verified: 30, ...values });
const project = (values = {}) => ({ id: 'TOTAL-01', code: 'TOTAL-01', name: 'Total review (Demo)',
  country: 'Singapore', version: 1, locked: false, items: [row()], sourceItems: [row()],
  history: [], reports: [], voReviews: [], claimDrafts: [], claimTracking: [], baselines: [],
  contract: { reference: 'TOTAL-DEMO', currency: 'SGD', totalAmount: 100, representativeSubset: false,
    sourceKind: 'illustrative', sourceFilename: 'Fictional measured schedule', scope: 'One measured scope' }, ...values });
const save = input => saveContractTotalReview(input, '  QS reviewed the stated lump-sum allowance outside these measured lines.  ', at);
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

test('a complete differing schedule requires a reason and records an independent exact review basis', () => {
  const before = freeze(project());
  const state = getContractTotalReview(before);
  assert.equal(state.required, true);
  assert.equal(state.status, 'required');
  assert.equal(state.review, null);
  assert.ok(state.scopeKey);
  const result = save(before);
  assert.equal(result.outcome, 'updated');
  const review = result.project.contractTotalReviews[0];
  assert.equal(review.reason, 'QS reviewed the stated lump-sum allowance outside these measured lines.');
  assert.equal(review.reviewedBy, 'Alex Tan · Demo QS reviewer');
  assert.equal(review.reviewedAt, at);
  assert.equal(review.projectId, before.id);
  assert.equal(review.baselineVersion, 1);
  assert.equal(review.recordedTotal, 20);
  assert.equal(review.calculatedTotal, 20);
  assert.equal(review.declaredTotal, 100);
  assert.equal(review.difference, -80);
  assert.equal(review.currency, 'SGD');
  assert.equal(review.scopeKey, state.scopeKey);
  assert.equal(getContractTotalReview(result.project).status, 'reviewed');
  assert.equal(getContractTotalReview(result.project).required, true);
  for (const field of ['contract', 'items', 'sourceItems', 'reports', 'claimDrafts', 'claimTracking', 'baselines']) {
    assert.equal(result.project[field], before[field], `${field} remains the same reference`);
  }
  assert.notEqual(review.itemSnapshot[0], before.items[0]);
  assert.equal(result.project.history[0].action, 'Contract total difference reviewed');
  assert.equal(Object.hasOwn(before, 'contractTotalReviews'), false);
});

test('confirmation enforces the current reason at the state boundary but never reopens a locked version', () => {
  const before = project();
  assert.equal(confirmContractBaseline(before, later).outcome, 'invalid');
  assert.match(confirmContractBaseline(before, later).error, /total difference/);
  const reviewed = save(before).project;
  const result = confirmContractBaseline(reviewed, later);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.project.locked, true);
  const futureReview = saveContractTotalReview(before, 'Known difference checked at the later review time.', later).project;
  assert.equal(confirmContractBaseline(futureReview, at).outcome, 'invalid');
  assert.match(confirmContractBaseline(futureReview, at).error, /review date/);
  const locked = project({ locked: true });
  assert.equal(confirmContractBaseline(locked, later).outcome, 'unchanged');
  assert.equal(confirmContractBaseline(locked, later).project, locked);
  assert.equal(save(locked).outcome, 'invalid');
});

test('matching, partial, unknown coverage or unknown totals cannot record a reason or gain a forced match', () => {
  const base = project();
  for (const contract of [
    { ...base.contract, totalAmount: 20 }, { ...base.contract, representativeSubset: true },
    { ...base.contract, representativeSubset: null }, { ...base.contract, representativeSubset: undefined },
    ...[null, '', 'unknown', -1, NaN, Infinity, true, {}, '100.001'].map(totalAmount => ({ ...base.contract, totalAmount })),
  ]) {
    const input = project({ contract });
    assert.equal(getContractTotalReview(input).required, false);
    assert.equal(getContractTotalReview(input).status, 'notRequired');
    assert.equal(save(input).outcome, 'invalid');
    assert.equal(confirmContractBaseline(input, at).outcome, 'updated');
  }
});

test('original S.I.T. remains a partial schedule and legacy confirmations do not demand a fabricated note', () => {
  const sit = createSITContractDemo({ name: 'S.I.T. total check', code: 'SIT-TOTAL' }, at);
  assert.equal(sit.contract.representativeSubset, true);
  const opened = createContractRevision(sit, 'Mock contract wording correction', later).project;
  assert.equal(getContractTotalReview(opened).status, 'notRequired');
  assert.equal(save(opened).outcome, 'invalid');
  assert.equal(confirmContractBaseline(opened, later).outcome, 'updated');
  assert.deepEqual(sit.claimDrafts, opened.claimDrafts);
});

test('item issues are resolved before a reason can be saved, even if recorded totals differ', () => {
  for (const changes of [{ needsReview: true }, { description: '' }, { unit: '' }, { quantity: null },
    { rate: null }, { amount: null }, { amount: 19 }, { rate: -1 }, { projectId: 'FOREIGN' },
    { quantity: true }, { rate: '0.00001' }]) {
    const input = project({ items: [row(changes)] });
    assert.equal(save(input).outcome, 'invalid', JSON.stringify(changes));
    assert.equal(save(input).project, input);
    assert.equal(confirmContractBaseline(input, later).outcome, 'invalid');
  }
});

test('zero is known and exact decimal half-up rounding retains signed cent differences', () => {
  const zero = project({ items: [row({ quantity: 0, rate: 0, amount: 0 })] });
  const result = save(zero);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.project.contractTotalReviews[0].recordedTotal, 0);
  assert.equal(result.project.contractTotalReviews[0].difference, -100);
  const fractional = project({ items: [row({ quantity: 1, rate: '1.005', amount: 1.01 })],
    contract: { ...project().contract, totalAmount: 1 } });
  assert.equal(save(fractional).project.contractTotalReviews[0].difference, 0.01);
  assert.equal(save(fractional).project.contractTotalReviews[0].calculatedTotal, 1.01);
  const negative = project({ contract: { ...project().contract, totalAmount: -1 } });
  assert.equal(getContractTotalReview(negative).required, false);
});

test('changed commercial values invalidate the note even if quantity times rate and total stay the same', () => {
  const reviewed = save(project()).project;
  const changes = [
    { items: [row({ quantity: 5, rate: 4 })] },
    ...['description', 'unit', 'location', 'ref', 'section', 'quantityBasis', 'sourceRef', 'sourceNote']
      .map(field => ({ items: [row({ [field]: 'Changed commercial value' })] })),
    { version: 2 },
    ...[{ currency: 'MYR' }, { totalAmount: 101 }, { scope: 'Changed scope' },
      { reference: 'NEW-REF' }, { sourceFilename: 'Revised schedule' }, { sourcePageCount: 2 }]
      .map(change => ({ contract: { ...reviewed.contract, ...change } })),
  ];
  for (const change of changes) {
    const input = { ...reviewed, ...change };
    const status = getContractTotalReview(input);
    assert.equal(status.required, true);
    assert.notEqual(status.status, 'reviewed', JSON.stringify(change));
    assert.equal(status.review, null);
    assert.notEqual(status.scopeKey, getContractTotalReview(reviewed).scopeKey);
    assert.equal(confirmContractBaseline(input, later).outcome, 'invalid');
  }
  assert.equal(getContractTotalReview({ ...reviewed, items: [row({ quantity: 5, rate: 4 })] }).status, 'stale');
});

test('physical progress, extraction markers, review timestamps and row order are not a changed commercial basis', () => {
  const input = project({ items: [row(), row({ id: 'WORK-02', ref: 'A.2', amount: 20 })] });
  const reviewed = save(input).project;
  const changed = { ...reviewed, items: [...reviewed.items].reverse().map(item => ({ ...item,
    reported: 100, verified: 90, reviewedAt: later, reviewedBy: 'Another demo reviewer', rawExtractedQuantity: 999,
    extractionNote: 'Additional simulated OCR metadata' })) };
  assert.equal(getContractTotalReview(changed).status, 'reviewed');
  assert.equal(getContractTotalReview(changed).scopeKey, getContractTotalReview(reviewed).scopeKey);
  assert.equal(confirmContractBaseline(changed, later).outcome, 'updated');
});

test('repeated submissions deduplicate while amended reasons and new bases append independent notes', () => {
  const first = save(project()).project;
  const replay = saveContractTotalReview(first, first.contractTotalReviews[0].reason, later);
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.project, first);
  const amended = saveContractTotalReview(first, 'Additional measured allowances were checked in the demo.', later).project;
  assert.equal(amended.contractTotalReviews.length, 2);
  assert.equal(amended.contractTotalReviews[0], first.contractTotalReviews[0]);
  assert.equal(getContractTotalReview(amended).review.reason, 'Additional measured allowances were checked in the demo.');
  const changed = { ...amended, items: [row({ quantity: 5, rate: 4 })] };
  const again = saveContractTotalReview(changed, 'A new measurement basis was independently checked.', later).project;
  assert.equal(again.contractTotalReviews.length, 3);
  assert.equal(getContractTotalReview(again).status, 'reviewed');
  assert.equal(getContractTotalReview({ ...again, items: first.items }).status, 'reviewed');
  assert.equal(getContractTotalReview({ ...again, items: first.items }).review.reason, amended.contractTotalReviews[1].reason);
});

test('invalid reasons, dates, scope and malformed state never create a note', () => {
  const input = project();
  for (const reason of ['', '  ', 'x'.repeat(501), 'Two\nlines', 'Control\u0000character', 1, null, {}]) {
    const result = saveContractTotalReview(input, reason, at);
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.field, 'reason');
    assert.equal(result.project, input);
  }
  assert.equal(saveContractTotalReview(input, 'x'.repeat(500), at).outcome, 'updated');
  for (const date of [null, false, Infinity, 'invalid']) assert.equal(saveContractTotalReview(input, 'Reason', date).outcome, 'invalid');
  for (const value of [null, {}, project({ id: '' }), project({ version: 0 }), project({ items: [row(), row()] }),
    project({ history: null }), project({ contractTotalReviews: {} }),
    project({ contractVersion: { projectId: 'FOREIGN', version: 1 } }),
    project({ contractVersion: { projectId: input.id, version: 2 } }),
    project({ contract: { ...input.contract, currency: '' } }),
    project({ contractVersion: { projectId: input.id, version: 1, createdAt: later } })]) {
    const result = save(value);
    assert.equal(result.outcome, 'invalid');
    assert.equal(result.project, value);
  }
});

test('foreign, stale, malformed and tampered records are never accepted as a current review', () => {
  const valid = save(project()).project.contractTotalReviews[0];
  for (const change of [{ projectId: 'FOREIGN' }, { baselineVersion: 2 }, { version: 2 },
    { reason: '' }, { reviewedAt: 'invalid' }, { reviewedBy: 'Invented reviewer' }, { difference: 0 },
    { recordedTotal: 0 }, { scopeKey: 'forged' }, { currency: 'MYR' },
    { itemSnapshot: [row({ projectId: 'FOREIGN' })] }, { contractSnapshot: { ...valid.contractSnapshot, totalAmount: 1 } }]) {
    const input = project({ contractTotalReviews: [{ ...structuredClone(valid), ...change }] });
    assert.notEqual(getContractTotalReview(input).status, 'reviewed', JSON.stringify(change));
    assert.equal(confirmContractBaseline(input, later).outcome, 'invalid');
  }
});

test('history retains the recorded reason with old values and never borrows current contract money', () => {
  const first = confirmContractBaseline(save(project()).project, at).project;
  const opened = createContractRevision(first, 'A new mock agreed measured rate', later).project;
  assert.equal(getContractTotalReview(opened).status, 'required');
  const changed = { ...opened, items: [row({ rate: 3, amount: 30 })], contract: { ...opened.contract, totalAmount: 120, currency: 'MYR' } };
  const second = saveContractTotalReview(changed, 'Review the revised MYR basis independently.', later).project;
  const versions = getContractVersions(second);
  assert.equal(versions[0].totalReview.currency, 'MYR');
  assert.equal(versions[0].totalReview.declaredTotal, 120);
  assert.equal(versions[1].totalReview.currency, 'SGD');
  assert.equal(versions[1].totalReview.declaredTotal, 100);
  assert.equal(versions[1].totalReview.recordedTotal, 20);
  assert.equal(versions[1].totalReview.reason, first.contractTotalReviews[0].reason);
  versions[1].totalReview.reason = 'Attempted mutation';
  versions[1].totalReview.itemSnapshot[0].amount = 999;
  assert.equal(getContractVersions(second)[1].totalReview.recordedTotal, 20);
  assert.equal(first.contractTotalReviews[0].itemSnapshot[0].amount, 20);
  assert.equal(getContractVersionTotalReview(second, 1, [row({ quantity: 2, rate: 10 })]), null);
});

test('legacy item-only history uses only an unambiguous saved review basis and rejects foreign matches', () => {
  const original = save(project()).project;
  const amended = saveContractTotalReview({ ...original, contract: { ...original.contract, totalAmount: 200 } }, 'A later declared value was checked.', later).project;
  assert.ok(getContractVersionTotalReview(original, 1, original.items));
  assert.equal(getContractVersionTotalReview(amended, 1, original.items), null);
  assert.equal(getContractVersionTotalReview(original, 1, original.items, { ...original.contract, totalAmount: 200 }), null);
  const foreign = { ...original, id: 'OTHER' };
  assert.equal(getContractVersionTotalReview(foreign, 1, original.items), null);
  assert.equal(getContractVersionTotalReview({ ...original, version: 2 }, 1, original.items), null);
  assert.equal(getContractVersionTotalReview({ ...original, version: 2,
    baselines: [{ version: 1, projectId: 'OTHER', items: original.items }] }, 1, original.items), null);
  assert.equal(getContractVersionTotalReview(original, 2, original.items), null);
  const absent = getContractVersions(project({ version: 2, baselines: [{ version: 1, items: [row()] }] }));
  assert.equal(absent[1].totalReview, null);
});

test('reviewing a revision preserves saved claim financial snapshots, evidence, CSV exports and tracking', () => {
  const original = createClaimExamplesDemo({ code: 'REVIEW-CLAIMS' }, new Date(at));
  const before = structuredClone(original);
  const packs = original.claimDrafts.map(draft => buildClaimPack(original, draft.id).pack);
  const exports = packs.map(pack => toClaimCSV(pack));
  const opened = createContractRevision(original, 'Mock quantity correction', at).project;
  const changed = { ...opened, contract: { ...opened.contract, representativeSubset: false },
    items: opened.items.map((item, index) => index === 0 ? { ...item, quantity: 1100, amount: 27500 } : item) };
  const reviewed = saveContractTotalReview(changed, 'Declared schedule value has not yet incorporated this agreed mock correction.', later);
  assert.equal(reviewed.outcome, 'updated');
  const confirmed = confirmContractBaseline(reviewed.project, later).project;
  assert.deepEqual(original, before);
  for (const field of ['sourceItems', 'reports', 'claimDrafts', 'claimTracking', 'whatsappMessages', 'voReviews']) {
    assert.deepEqual(confirmed[field], before[field], field);
  }
  assert.deepEqual(confirmed.claimDrafts.map(draft => buildClaimPack(confirmed, draft.id).pack), packs);
  assert.deepEqual(confirmed.claimDrafts.map(draft => toClaimCSV(buildClaimPack(confirmed, draft.id).pack)), exports);
});

test('local persistence retains only project-local notes and reset restores that project seed only', () => {
  const base = createClaimExamplesDemo({ code: 'REVIEW-RESET' }, new Date(at));
  const opened = createContractRevision(base, 'Mock reset example', at).project;
  const changed = { ...opened, contract: { ...opened.contract, representativeSubset: false, totalAmount: 46000 } };
  const reviewed = saveContractTotalReview(changed, 'Mock declared-value check for reset.', later).project;
  const state = { schemaVersion: 2, activeProjectId: reviewed.id, projects: [reviewed, { ...base, id: 'OTHER', code: 'OTHER' }] };
  const stored = new Map([[WORKSPACE_STORE, JSON.stringify(state)]]);
  const loaded = loadWorkspace({ getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) });
  assert.equal(getContractTotalReview(loaded.projects[0]).status, 'reviewed');
  assert.equal(Object.hasOwn(loaded.projects[1], 'contractTotalReviews'), false);
  const restored = resetProject(loaded.projects[0]);
  assert.equal(Object.hasOwn(restored, 'contractTotalReviews'), false);
  assert.equal(loaded.projects[0].contractTotalReviews.length, 1);
  const seeded = { ...reviewed, seed: { ...reviewed.seed, contractTotalReviews: structuredClone(reviewed.contractTotalReviews) } };
  assert.deepEqual(resetProject(seeded).contractTotalReviews, reviewed.contractTotalReviews);
});
