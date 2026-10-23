import assert from 'node:assert/strict';
import test from 'node:test';
import { getContractChecks } from '../src/data/contract-checks.js';
import { getSITContractSample } from '../src/data/provided-contract-demo.js';

const row = (values = {}) => ({ id: 'WI-1', ref: 'A.1', description: 'Fictional measured work',
  unit: 'm²', quantity: 10, rate: 2, amount: 20, pricingType: 'measured', needsReview: false, ...values });
const project = (items = [row()], contract = {}) => ({ id: 'P1', code: 'DEMO1', items,
  contract: { currency: 'SGD', totalAmount: 20, representativeSubset: false, ...contract },
  sourceItems: [row()], baselines: [{ version: 1, items: [row()] }],
  claimDrafts: [{ id: 'CLAIM-1', snapshot: { work: [row()], totals: { currentValue: 20 } } }],
});
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

test('a complete measured schedule exposes known totals and can be confirmed', () => {
  const checks = getContractChecks(project());
  assert.deepEqual(checks.issues, []);
  assert.equal(checks.issueCount, 0);
  assert.equal(checks.itemIssueCount, 0);
  assert.equal(checks.canConfirm, true);
  assert.deepEqual(checks.totals, { currency: 'SGD', recordedTotal: 20, calculatedTotal: 20,
    declaredTotal: 20, difference: 0, complete: true, partial: false, comparison: 'match' });
});

test('unknown measured values stay unknown while zero quantity, rate and amount are valid', () => {
  const zero = getContractChecks(project([row({ quantity: 0, rate: 0, amount: 0 })], { totalAmount: 0 }));
  assert.equal(zero.canConfirm, true);
  assert.equal(zero.totals.recordedTotal, 0);
  for (const value of [null, undefined, '', '   ']) {
    for (const field of ['quantity', 'rate', 'amount']) {
      const checks = getContractChecks(project([row({ [field]: value })]));
      assert.equal(checks.canConfirm, false, `${field} ${String(value)}`);
      assert.equal(checks.totals.complete, false);
      assert.equal(checks.totals.recordedTotal, null);
      assert.equal(checks.totals.calculatedTotal, null);
      assert.ok(checks.issues[0].fields.includes(field));
      assert.match(checks.issues[0].messages.join(' '), field === 'amount'
        ? /Save this item to record its calculated amount/ : new RegExp(`Enter the ${field}`));
    }
  }
});

test('row issues retain exact record links and aggregate several missing fields in one row', () => {
  const checks = getContractChecks(project([row({ description: ' ', unit: '', quantity: null, rate: null, amount: null })]));
  assert.equal(checks.itemIssueCount, 1);
  assert.equal(checks.issueCount, 3);
  assert.deepEqual(checks.issues[0], { id: 'contract-check-WI-1', itemId: 'WI-1', itemRef: 'A.1',
    description: 'Description missing', fields: ['description', 'unit', 'quantity', 'rate', 'amount'],
    messages: ['Enter the description.', 'Enter the unit.', 'Enter the quantity and rate; the amount is calculated on save.'] });
});

test('negative, invalid, unsafe and unsupported precision numbers cannot pass review', () => {
  const invalid = [-1, NaN, Infinity, true, {}, 'not a number', '1e30'];
  for (const field of ['quantity', 'rate', 'amount']) {
    for (const value of [...invalid, field === 'amount' ? '0.001' : '0.00001']) {
      const checks = getContractChecks(project([row({ [field]: value })]));
      assert.equal(checks.canConfirm, false, `${field} ${String(value)}`);
      assert.ok(checks.issues[0].fields.includes(field));
      assert.equal(checks.totals.complete, false);
      assert.equal(checks.totals.recordedTotal, null);
    }
  }
});

test('decimal multiplication rounds half up to cents without binary float differences', () => {
  const items = [
    row({ id: 'CENT', quantity: 1, rate: '1.005', amount: 1.01 }),
    row({ id: 'TINY', quantity: '0.1', rate: '0.05', amount: 0.01 }),
    row({ id: 'SOURCE', quantity: 3639.55, rate: 13.5, amount: 49133.93 }),
  ];
  const checks = getContractChecks(project(items, { totalAmount: 49134.95 }));
  assert.equal(checks.canConfirm, true);
  assert.equal(checks.totals.calculatedTotal, 49134.95);
  assert.equal(checks.totals.recordedTotal, 49134.95);
  assert.equal(checks.totals.difference, 0);
});

test('a line calculation difference is an item issue with recorded and calculated values', () => {
  const checks = getContractChecks(project([row({ amount: 19.99 })], { totalAmount: 19.99 }));
  assert.equal(checks.canConfirm, false);
  assert.equal(checks.totals.complete, true);
  assert.equal(checks.totals.recordedTotal, 19.99);
  assert.equal(checks.totals.calculatedTotal, 20);
  assert.equal(checks.totals.comparison, 'match');
  assert.deepEqual(checks.issues[0].fields, ['amount']);
  assert.match(checks.issues[0].messages[0], /20\.00; the recorded amount is 19\.99/);
});

test('unconfirmed extraction uses proposed quantity and keeps both arithmetic and source review issues', () => {
  const checks = getContractChecks(project([row({ needsReview: true, rawExtractedQuantity: 12 })]));
  assert.equal(checks.canConfirm, false);
  assert.equal(checks.itemIssueCount, 1);
  assert.equal(checks.issueCount, 2);
  assert.equal(checks.totals.recordedTotal, 20);
  assert.equal(checks.totals.calculatedTotal, 24);
  assert.deepEqual(checks.issues[0].fields, ['review', 'amount']);
  assert.match(checks.issues[0].messages.join(' '), /against the source/);
  const correctedButUnchecked = getContractChecks(project([row({ needsReview: true, rawExtractedQuantity: 10 })]));
  assert.equal(correctedButUnchecked.issueCount, 1);
  assert.equal(correctedButUnchecked.canConfirm, false);
  const oldExtraction = getContractChecks(project([row({ needsReview: false, rawExtractedQuantity: 12 })]));
  assert.equal(oldExtraction.canConfirm, true);
  assert.equal(oldExtraction.totals.calculatedTotal, 20);
});

test('manual recovery unknowns remain missing rather than silently becoming zero', () => {
  const checks = getContractChecks(project([row({ quantity: null, rawExtractedQuantity: null, rate: null, amount: null,
    needsReview: true, extractionRecovery: { method: 'manual', page: 1 } })]));
  assert.equal(checks.canConfirm, false);
  assert.deepEqual(checks.issues[0].fields, ['quantity', 'rate', 'amount', 'review']);
  assert.deepEqual(checks.issues[0].messages, ['Enter the quantity and rate; the amount is calculated on save.',
    'Check this item against the source and confirm it.']);
  assert.equal(checks.issueCount, 2);
  assert.equal(checks.totals.complete, false);
});

test('missing calculated amounts direct users to save rather than to a nonexistent amount input', () => {
  for (const [changes, fields, message] of [
    [{ quantity: null, amount: null }, ['quantity', 'amount'], 'Enter the quantity; the amount is calculated on save.'],
    [{ rate: null, amount: null }, ['rate', 'amount'], 'Enter the rate; the amount is calculated on save.'],
    [{ amount: null }, ['amount'], 'Save this item to record its calculated amount.'],
    [{ quantity: -1, amount: null }, ['amount', 'quantity'], 'Quantity must be a non-negative number with up to 4 decimal places.'],
  ]) {
    const checks = getContractChecks(project([row(changes)]));
    assert.equal(checks.canConfirm, false);
    assert.deepEqual(checks.issues[0].fields, fields);
    assert.deepEqual(checks.issues[0].messages, [message]);
    assert.doesNotMatch(checks.issues[0].messages.join(' '), /Enter the amount/);
  }
});

test('Included has no required rate or amount, Rate Only requires its rate, and neither contributes a separate total', () => {
  const included = row({ id: 'INC', pricingType: 'included', quantity: null, rate: null, amount: null });
  const rateOnly = row({ id: 'RATE', pricingType: 'rateOnly', unit: 'hr', quantity: null, rate: 35, amount: null });
  const checks = getContractChecks(project([row(), included, rateOnly]));
  assert.equal(checks.canConfirm, true);
  assert.equal(checks.totals.recordedTotal, 20);
  assert.equal(checks.totals.calculatedTotal, 20);
  const missingRate = getContractChecks(project([{ ...rateOnly, rate: null }]));
  assert.equal(missingRate.canConfirm, false);
  assert.deepEqual(missingRate.issues[0].fields, ['rate']);
  assert.equal(getContractChecks(project([{ ...included, rate: -1 }])).canConfirm, false);
  const references = getContractChecks(project([
    { ...included, quantity: 100, rate: 300, amount: 30000 },
    { ...rateOnly, quantity: 50, amount: 1750 },
  ], { totalAmount: 0 }));
  assert.equal(references.canConfirm, true);
  assert.equal(references.totals.recordedTotal, 0);
});

test('representative S.I.T. rows are a neutral partial schedule rather than a contract total error', () => {
  const sample = getSITContractSample();
  sample.items = sample.items.map(item => {
    const next = { ...item, needsReview: false }; delete next.rawExtractedQuantity; return next;
  });
  const checks = getContractChecks(sample);
  assert.equal(checks.partial, true);
  assert.equal(checks.totals.partial, true);
  assert.equal(checks.totals.comparison, 'partial');
  assert.equal(checks.totals.declaredTotal, 543887.61);
  assert.notEqual(checks.totals.difference, 0);
  assert.equal(checks.canConfirm, true);
  assert.match(checks.scopeNote, /Partial schedule/);
  assert.match(checks.scopeNote, /representative items/);
  assert.match(checks.scopeNote, /difference.*expected/);
});

test('declared value comparisons are a warning only and unknown coverage is never assumed complete', () => {
  const difference = getContractChecks(project([row()], { totalAmount: 100 }));
  assert.equal(difference.canConfirm, true);
  assert.equal(difference.totals.comparison, 'difference');
  assert.equal(difference.totals.difference, -80);
  const unspecified = project(); delete unspecified.contract.representativeSubset;
  assert.equal(getContractChecks(unspecified).totals.comparison, 'unknown');
  assert.match(getContractChecks(unspecified).scopeNote, /coverage is not specified/);
  for (const totalAmount of [null, '', -1, true, 'unknown', Infinity]) {
    const checks = getContractChecks(project([row()], { totalAmount }));
    assert.equal(checks.totals.declaredTotal, null);
    assert.equal(checks.totals.difference, null);
    assert.equal(checks.totals.comparison, 'unknown');
    assert.equal(checks.canConfirm, true);
  }
});

test('independent rows may repeat references and use different units without duplicating section totals', () => {
  const mixed = project([row(), row({ id: 'WI-2', ref: 'A.1', unit: 'set', quantity: 3, rate: 5, amount: 15 })],
    { totalAmount: 35, sourceSectionTotals: [{ id: 'A', amount: 35 }, { id: 'TOTAL', amount: 35 }] });
  const checks = getContractChecks(mixed);
  assert.equal(checks.canConfirm, true);
  assert.equal(checks.totals.recordedTotal, 35);
  assert.equal(checks.totals.calculatedTotal, 35);
});

test('agreed contract revisions are checked against their own arithmetic, never old source or claim values', () => {
  const revised = project([row({ rate: 3, amount: 30 })]);
  revised.version = 2;
  const checks = getContractChecks(revised);
  assert.equal(checks.canConfirm, true);
  assert.deepEqual(checks.issues, []);
  assert.equal(checks.totals.recordedTotal, 30);
  assert.equal(checks.totals.calculatedTotal, 30);
  assert.equal(checks.totals.difference, 10);
});

test('amount and total overflows become review issues rather than infinite or approximate totals', () => {
  const overflow = getContractChecks(project([row({ quantity: 100000000, rate: 100000000, amount: 20 })]));
  assert.equal(overflow.canConfirm, false);
  assert.match(overflow.issues[0].messages.join(' '), /supported amount limit/);
  assert.equal(overflow.totals.recordedTotal, null);
  const totalOverflow = getContractChecks(project([
    row({ quantity: 1, rate: 60000000000000, amount: 60000000000000 }),
    row({ id: 'WI-2', quantity: 1, rate: 60000000000000, amount: 60000000000000 }),
  ]));
  assert.equal(totalOverflow.canConfirm, false);
  assert.equal(totalOverflow.totals.complete, false);
  assert.equal(totalOverflow.totals.calculatedTotal, null);
  assert.equal(totalOverflow.issues[0].itemId, 'WI-2');
  assert.match(totalOverflow.issues[0].messages.join(' '), /work-list total exceeds/);
});

test('empty or malformed rows, duplicate IDs, foreign rows and unknown pricing cannot confirm', () => {
  for (const value of [undefined, null, {}, { items: [] }]) {
    const checks = getContractChecks(value);
    assert.equal(checks.canConfirm, false);
    assert.equal(checks.totals.complete, false);
    assert.equal(checks.totals.recordedTotal, null);
  }
  for (const items of [[null], [row({ id: null })], [row(), row()], [row({ projectId: 'OTHER' })], [row({ pricingType: 'unknown' })]]) {
    const checks = getContractChecks(project(items));
    assert.equal(checks.canConfirm, false);
    assert.ok(checks.itemIssueCount > 0);
    assert.equal(checks.totals.recordedTotal, null);
  }
});

test('checks are read-only and isolated even with shared work IDs, frozen sources and saved claims', () => {
  const first = freeze(project([row({ needsReview: true, rawExtractedQuantity: 12 })]));
  const second = freeze({ ...project([row({ amount: 20, projectId: 'P2' })]), id: 'P2' });
  const originalFirst = structuredClone(first);
  const originalSecond = structuredClone(second);
  const firstChecks = getContractChecks(first);
  assert.equal(firstChecks.canConfirm, false);
  assert.equal(getContractChecks(second).canConfirm, true);
  firstChecks.issues[0].messages.push('A UI-only edit');
  assert.equal(getContractChecks(first).issueCount, 2);
  assert.deepEqual(first, originalFirst);
  assert.deepEqual(second, originalSecond);
});
