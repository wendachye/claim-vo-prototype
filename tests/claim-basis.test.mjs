import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaimReview, saveClaimDraft, markClaimPrepared } from '../src/data/claims.ts';
import { defaultClaimBasis, claimBasisNumber, claimBasisProduct, claimBasisSum } from '../src/data/claim-basis.ts';
import { createProject } from '../src/data/projects.ts';

function fixture() {
  const base = createProject({ name: 'Claim basis examples', code: 'BASIS', country: 'Singapore' });
  return { ...base, locked: true, lockedAt: '2026-09-01T12:00:00+08:00',
    contract: { ...base.contract, currency: 'SGD', totalAmount: 28188 },
    items: [{ id: 'A', ref: 'A.1 / 1a', description: 'Example measured scaffold', unit: 'm²', quantity: 2088,
      rate: 13.5, amount: 28188, pricingType: 'measured', reported: 75, verified: 75 }],
    reports: [{ id: 'R-A', projectId: base.id, itemId: 'A', status: 'verified', completion: 75, approvedCompletion: 75,
      date: '2026-10-15T09:00:00+08:00', verifiedAt: '2026-10-15T10:00:00+08:00', verifiedBy: 'Demo supervisor',
      message: 'A complete 75% total', photo: '/assets/example.jpg' }], voReviews: [], claimDrafts: [], claimTracking: [],
  };
}
const terms = (changes = {}) => ({ ...defaultClaimBasis(), retentionMode: 'rateCap', retentionRate: '5', retentionCap: '1000', previousNetValue: '0', ...changes });
const input = (quantity = 1044, priorGross = 0, basis = terms(), changes = {}) => ({ work: { A: { include: true, assessedQuantity: quantity, previousValue: priorGross } }, vos: {}, priorConfirmed: true, claimBasis: basis, ...changes });
const review = (assessment, project = fixture(), period = '2026-10') => buildClaimReview(project, period, assessment);

// All rates and balances in these tests are synthetic inputs, not S.I.T. contract terms.
test('cumulative retention reaches its cap and prior submitted net is subtracted exactly once', () => {
  const project = fixture();
  const original = structuredClone(project);
  const first = review(input(), project);
  assert.equal(first.canPrepare, true);
  assert.deepEqual(first.totals, { previousValue: 0, cumulativeValue: 14094, currentValue: 13389.3,
    workCurrentValue: 14094, voCurrentValue: 0, retentionValue: 704.7, netCumulativeValue: 13389.3, previousNetValue: 0, grossCurrentValue: 14094 });
  const second = review(input(1566, 14094, terms({ previousNetValue: '13389.30', priorReference: 'DEMO-OCT-SUBMISSION' })), project, '2026-11');
  assert.equal(second.canPrepare, true);
  assert.equal(second.totals.retentionValue, 1000);
  assert.equal(second.totals.netCumulativeValue, 20141);
  assert.equal(second.totals.grossCurrentValue, 7047);
  assert.equal(second.totals.currentValue, 6751.7);
  const repeated = review(input(1566, 21141, terms({ previousNetValue: '20141', priorReference: 'DEMO-NOV-SUBMISSION' })), project, '2026-12');
  assert.equal(repeated.canPrepare, true);
  assert.equal(repeated.totals.retentionValue, 1000);
  assert.equal(repeated.totals.currentValue, 0);
  assert.deepEqual(project, original);
});

test('legacy gross assessments keep their schema, totals and preparation equality', () => {
  const legacy = input(); delete legacy.claimBasis;
  const gross = review(legacy);
  assert.deepEqual(gross.totals, { previousValue: 0, cumulativeValue: 14094, currentValue: 14094, workCurrentValue: 14094, voCurrentValue: 0 });
  assert.equal(Object.hasOwn(gross, 'claimBasis'), false);
  assert.equal(Object.hasOwn(gross.assessment, 'claimBasis'), false);
  assert.deepEqual(Object.keys(gross.assessment), ['work', 'vos', 'priorConfirmed', 'adjustmentReason', 'note']);
  const saved = saveClaimDraft(fixture(), '2026-10', legacy);
  const snapshot = structuredClone(saved.draft);
  assert.equal(markClaimPrepared(saved.project, saved.draft.id).outcome, 'updated');
  const newTerms = saveClaimDraft(saved.project, '2026-10', input());
  assert.equal(newTerms.draft.revision, 2);
  assert.equal(newTerms.draft.snapshot.totals.currentValue, 13389.3);
  assert.deepEqual(newTerms.project.claimDrafts[0], snapshot);
});

test('blank prior net remains unknown until the existing QS confirmation explicitly permits zero', () => {
  const blank = input(1044, '', terms({ previousNetValue: '' }), { priorConfirmed: false });
  const unknown = review(blank);
  assert.equal(unknown.assessment.claimBasis.previousNetValue, null);
  assert.equal(unknown.totals.previousNetValue, null);
  assert.equal(unknown.totals.currentValue, null);
  assert.equal(unknown.canPrepare, false);
  const confirmed = review({ ...blank, priorConfirmed: true });
  assert.equal(confirmed.claimBasis.previousNetValue, 0);
  assert.equal(confirmed.totals.currentValue, 13389.3);
  assert.equal(confirmed.canPrepare, true);
  const noTax = review(input(1044, 0, { ...defaultClaimBasis(), previousNetValue: 0 }));
  assert.equal(noTax.totals.retentionValue, 0);
  assert.equal(noTax.totals.currentValue, 14094);
});

test('zero retention rate and zero cap are real values; missing terms can be saved but not prepared', () => {
  for (const basis of [terms({ retentionRate: 0 }), terms({ retentionCap: 0 })]) {
    const checked = review(input(1044, 0, basis));
    assert.equal(checked.canPrepare, true);
    assert.equal(checked.totals.retentionValue, 0);
    assert.equal(checked.totals.currentValue, 14094);
  }
  for (const basis of [terms({ retentionRate: '' }), terms({ retentionCap: '' })]) {
    const saved = saveClaimDraft(fixture(), '2026-10', input(1044, 0, basis));
    assert.equal(saved.outcome, 'updated');
    assert.equal(saved.draft.snapshot.canPrepare, false);
    assert.equal(saved.draft.snapshot.totals.retentionValue, null);
    assert.equal(markClaimPrepared(saved.project, saved.draft.id).outcome, 'invalid');
  }
});

test('unsupported methods, currencies, prior basis and releases block preparation without inventing ledger balances', () => {
  const unsupported = review(input(1044, 0, terms({ billingMethod: 'unsupported' })));
  assert.match(unsupported.issues.join(' '), /billing methods need review/);
  const otherCurrency = fixture(); otherCurrency.contract.currency = 'MYR';
  const foreign = review(input(), otherCurrency);
  assert.match(foreign.issues.join(' '), /supports SGD only/);
  for (const checked of [unsupported, foreign]) {
    assert.equal(checked.totals.cumulativeValue, 14094);
    assert.equal(checked.totals.grossCurrentValue, 14094);
    assert.equal(checked.totals.retentionValue, null);
    assert.equal(checked.totals.netCumulativeValue, null);
    assert.equal(checked.totals.currentValue, null);
    assert.equal(checked.canPrepare, false);
    assert.deepEqual(checked.validationErrors, []);
  }
  assert.equal(saveClaimDraft(fixture(), '2026-10', input(1044, 0, terms({ billingMethod: 'unsupported' }))).outcome, 'updated');
  const prior = review(input(1566, 14094, terms({ previousNetValue: 13389.3 })));
  assert.match(prior.issues.join(' '), /reference for previous submitted/);
  const tooMuchNet = review(input(1566, 14094, terms({ previousNetValue: 15000, priorReference: 'DEMO-PRIOR' })));
  assert.match(tooMuchNet.issues.join(' '), /net exceeds gross/);
  const releasing = review(input(1566, 14094, terms({ retentionCap: 100, previousNetValue: 13389.3, priorReference: 'DEMO-PRIOR' })));
  assert.match(releasing.issues.join(' '), /release previously held retention/);
  const saved = saveClaimDraft(fixture(), '2026-10', input());
  saved.project.claimTracking = [{ draftId: saved.draft.id, status: 'paid', claimedValue: 13389.3, certifiedValue: 12000, paidValue: 12000 }];
  const future = review(input(1566, 0, terms({ previousNetValue: 0 })), saved.project, '2026-11');
  assert.equal(future.totals.previousValue, 0);
  assert.equal(future.totals.previousNetValue, 0);
  assert.equal(future.totals.currentValue, 20141);
});

test('malformed, negative, imprecise and unsafe numeric inputs cannot be saved as financial settings', () => {
  for (const value of [-1, Infinity, NaN, false, 'oops', '1.001', '100000000000000']) {
    assert.equal(saveClaimDraft(fixture(), '2026-10', input(1044, 0, terms({ previousNetValue: value }))).outcome, 'invalid');
    assert.equal(saveClaimDraft(fixture(), '2026-10', input(1044, 0, terms({ retentionCap: value }))).outcome, 'invalid');
  }
  for (const rate of [-1, 101, '1.00001', Infinity, false]) assert.equal(saveClaimDraft(fixture(), '2026-10', input(1044, 0, terms({ retentionRate: rate }))).outcome, 'invalid');
  for (const quantity of [-1, '1.00001', '10000000000000000']) assert.equal(saveClaimDraft(fixture(), '2026-10', input(quantity)).outcome, 'invalid');
  assert.equal(saveClaimDraft(fixture(), '2026-10', input(1044, 0, { ...terms(), retentionRelease: 10 })).outcome, 'invalid');
  assert.equal(saveClaimDraft(fixture(), '2026-10', input(1044, 0, null)).outcome, 'invalid');
  assert.equal(Number.isNaN(claimBasisNumber('0.10000000000000001')), true);
});

test('new profile rounds each decimal product half-up before summing and rejects aggregate overflow', () => {
  const project = fixture();
  project.items = ['A', 'B'].map(id => ({ ...project.items[0], id, ref: id, quantity: 1, rate: 0.1, amount: 0.1 }));
  project.reports = ['A', 'B'].map(id => ({ ...project.reports[0], id: `R-${id}`, itemId: id }));
  const assessment = { work: Object.fromEntries(['A', 'B'].map(id => [id, { include: true, assessedQuantity: '0.05', previousValue: 0 }])),
    vos: {}, priorConfirmed: true, claimBasis: { ...defaultClaimBasis(), previousNetValue: 0 } };
  const checked = review(assessment, project);
  assert.equal(checked.canPrepare, true);
  assert.deepEqual(checked.workRows.map(row => row.cumulativeValue), [0.01, 0.01]);
  assert.equal(checked.totals.cumulativeValue, 0.02);
  assert.equal(checked.totals.currentValue, 0.02);
  assert.equal(claimBasisProduct('2.675', 1), 2.68);
  assert.equal(claimBasisSum([0.1, 0.2]), 0.3);
  const huge = fixture();
  huge.items = ['A', 'B'].map(id => ({ ...huge.items[0], id, ref: id, quantity: 100, rate: 1000000000000, amount: 100000000000000 }));
  huge.reports = ['A', 'B'].map(id => ({ ...huge.reports[0], id: `R-${id}`, itemId: id }));
  const overflow = review({ ...assessment, work: Object.fromEntries(['A', 'B'].map(id => [id, { include: true, assessedQuantity: 50, previousValue: 0 }])) }, huge);
  assert.equal(overflow.totals.cumulativeValue, null);
  assert.equal(overflow.canPrepare, false);
  assert.match(overflow.issues.join(' '), /supported amount limit/);
  const priorOverflow = review({ ...assessment, adjustmentReason: 'Synthetic gross correction.',
    work: Object.fromEntries(['A', 'B'].map(id => [id, { include: true, assessedQuantity: 0, previousValue: 50000000000000 }])) }, project);
  assert.equal(priorOverflow.totals.previousValue, null);
  assert.equal(priorOverflow.totals.workCurrentValue, null);
  assert.equal(priorOverflow.totals.currentValue, null);
  assert.equal(priorOverflow.canPrepare, false);
  assert.match(priorOverflow.issues.join(' '), /supported amount limit/);
});

test('net reductions need an explanation even when the individual gross increments are nonnegative', () => {
  const assessment = input(1044, 13000, terms({ retentionRate: 100, retentionCap: 14094, previousNetValue: 13000, priorReference: 'DEMO-PRIOR' }));
  const withoutReason = review(assessment);
  assert.equal(withoutReason.workRows[0].currentValue, 1094);
  assert.equal(withoutReason.totals.currentValue, -13000);
  assert.match(withoutReason.issues.join(' '), /negative net adjustment/);
  assert.equal(review({ ...assessment, adjustmentReason: 'Synthetic basis correction checked by QS.' }).canPrepare, true);
});

test('saved basis settings are detached, versioned and preparation remains an explicit exact-snapshot action', () => {
  const project = fixture(), original = structuredClone(project);
  const assessment = input();
  const saved = saveClaimDraft(project, '2026-10', assessment);
  assert.equal(saved.outcome, 'updated');
  assert.equal(saved.draft.snapshot.claimBasis.retentionRate, 5);
  assert.equal(saved.draft.assessment.claimBasis.retentionCap, 1000);
  assert.equal(saveClaimDraft(saved.project, '2026-10', assessment).outcome, 'unchanged');
  const frozen = structuredClone(saved.draft);
  const prepared = markClaimPrepared(saved.project, saved.draft.id);
  assert.equal(prepared.outcome, 'updated');
  assert.deepEqual(prepared.draft.snapshot, frozen.snapshot);
  const next = saveClaimDraft(prepared.project, '2026-10', input(1044, 0, terms({ retentionRate: 10 })));
  assert.equal(next.draft.revision, 2);
  assert.deepEqual(next.project.claimDrafts[0], prepared.draft);
  assert.equal(next.draft.snapshot.totals.currentValue, 13094);
  assessment.claimBasis.retentionCap = 0;
  assert.equal(saved.project.claimDrafts[0].snapshot.claimBasis.retentionCap, 1000);
  assert.deepEqual(project, original);
});
