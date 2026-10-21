import assert from 'node:assert/strict';
import test from 'node:test';
import { getItemProgressReview } from '../src/data/progress-review.js';

const item = (values = {}) => ({ id: 'A', reported: 0, verified: 0, ...values });
const project = (reports = []) => ({ id: 'P', code: 'P01', reports });
const report = (id, status, date = '2026-10-20') => ({ id, itemId: 'A', projectId: 'P', projectCode: 'P01', status, date });

test('latest report drives review action and ignores an older pending report', () => {
  const value = project([report('OLD', 'pending', '2026-10-19'), report('NEW', 'verified')]);
  const before = structuredClone(value);
  const result = getItemProgressReview(value, item({ reported: 50, verified: 50 }));
  assert.equal(result.report.id, 'NEW');
  assert.equal(result.key, 'verified');
  assert.equal(result.label, 'Checked progress');
  assert.equal(result.checked, true);
  assert.equal(result.actionLabel, 'View evidence');
  assert.deepEqual(value, before);
});

test('pending and clarification stay unresolved despite recorded verified progress', () => {
  for (const status of ['pending', 'needsReview', 'clarification', 'needsClarification']) {
    const result = getItemProgressReview(project([report('R', status)]), item({ reported: 80, verified: 50 }));
    assert.equal(result.key, status === 'pending' || status === 'needsReview' ? 'review' : 'clarification');
    assert.equal(result.checked, false);
    assert.equal(result.tone, 'amber');
  }
});

test('rejected latest update remains visible instead of being called not started or checked', () => {
  for (const verified of [0, 50]) {
    const result = getItemProgressReview(project([report('R', 'rejected')]), item({ reported: 60, verified }));
    assert.equal(result.key, 'rejected');
    assert.equal(result.label, 'Update rejected');
    assert.equal(result.checked, false);
  }
});

test('explicit verified zero is checked while default zero without evidence is not', () => {
  for (const status of ['verified', 'approved']) {
    assert.equal(getItemProgressReview(project([report('R', status)]), item()).checked, true);
  }
  const empty = getItemProgressReview(project(), item());
  assert.equal(empty.label, 'No update yet');
  assert.equal(empty.checked, false);
  assert.equal(empty.actionLabel, 'View progress');
});

test('valid positive verified totals retain checked progress without a report', () => {
  const result = getItemProgressReview(project(), item({ verified: 35, reported: 50 }));
  assert.equal(result.key, 'verified');
  assert.equal(result.checked, true);
  assert.equal(result.actionLabel, 'View progress');
});

test('unknown and invalid totals remain distinct from zero or unreviewed positive progress', () => {
  for (const value of [null, undefined, '', '25', NaN, Infinity, -1, 101]) {
    const result = getItemProgressReview(project(), item({ reported: value, verified: value }));
    assert.equal(result.key, 'unknown');
    assert.equal(result.label, 'Not recorded');
    assert.equal(result.checked, false);
  }
  assert.equal(getItemProgressReview(project(), item({ reported: 25 })).label, 'Not checked');
  assert.equal(getItemProgressReview(project([report('R', 'superseded')]), item()).label, 'Not checked');
});

test('VO, foreign project IDs, foreign project codes and other items cannot drive review', () => {
  const value = project([
    { ...report('ID', 'pending'), projectId: 'OTHER' },
    { ...report('CODE', 'pending'), projectCode: 'OTHER' },
    { ...report('VO', 'pending'), vo: true },
    { ...report('ITEM', 'pending'), itemId: 'B' },
  ]);
  assert.equal(getItemProgressReview(value, item()).report, undefined);
  value.reports.push({ id: 'LEGACY', itemId: 'A', status: 'pending' });
  assert.equal(getItemProgressReview(value, item()).report.id, 'LEGACY');
});

test('dates and ties are deterministic without mutating report order', () => {
  const value = project([
    report('DATED', 'pending', '2026-10-20'),
    report('INVALID', 'rejected', 'unknown'),
    report('UNDATED', 'rejected', undefined),
    report('TIED-LAST', 'verified', '2026-10-20'),
  ]);
  // report() defaults an omitted date; make this legacy record genuinely undated.
  delete value.reports[2].date;
  const before = structuredClone(value);
  assert.equal(getItemProgressReview(value, item()).report.id, 'TIED-LAST');
  assert.deepEqual(value, before);
  assert.equal(getItemProgressReview(project([
    report('FIRST', 'pending', 'invalid'), report('LAST', 'rejected', ''),
  ]), item()).report.id, 'LAST');
});
