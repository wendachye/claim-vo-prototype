import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.js';
import { saveClaimDraft } from '../src/data/claims.js';
import { createProject } from '../src/data/projects.js';

function fixture() {
  const base = createProject({ name: 'Mock retention example', code: 'BASIS-PACK', country: 'Singapore' });
  return { ...base, locked: true, lockedAt: '2026-09-01T12:00:00+08:00',
    contract: { ...base.contract, currency: 'SGD', name: 'Fictional measured works' },
    items: [{ id: 'A', ref: 'A.1 / 1a', description: 'Scaffold quantity fixture', unit: 'm²', quantity: 2088,
      rate: 13.5, amount: 28188, pricingType: 'measured', verified: 75, reported: 75 }],
    reports: [{ id: 'REPORT-A', projectId: base.id, itemId: 'A', status: 'verified', completion: 75,
      date: '2026-10-20T10:00:00+08:00', verifiedAt: '2026-10-21T10:00:00+08:00',
      verifiedBy: 'Demo supervisor', sender: 'Demo worker', message: 'Original mock site update',
      sourceMessageId: 'WA-A', photo: '/assets/demo-test-work.jpg' }],
    voReviews: [],
  };
}

function save(project, period, quantity, previousGross, previousNet, extra = {}) {
  const result = saveClaimDraft(project, period, {
    work: { A: { include: true, assessedQuantity: quantity, previousValue: previousGross } },
    vos: {}, priorConfirmed: true,
    claimBasis: { version: 1, billingMethod: 'quantityRate', retentionMode: 'rateCap', retentionRate: 5,
      retentionCap: 1000, previousNetValue: previousNet, priorReference: previousGross ? 'DEMO-PREVIOUS-SUBMISSION' : '', ...extra },
  });
  assert.equal(result.outcome, 'updated');
  const built = buildClaimPack(result.project, result.draft.id);
  assert.equal(built.outcome, 'ready');
  return { ...result, pack: built.pack };
}

function csvRows(csv) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\r' && csv[i + 1] === '\n' && !quoted) {
      row.push(cell); rows.push(row); row = []; cell = ''; i += 1;
    } else cell += c;
  }
  assert.equal(quoted, false);
  const [head, ...body] = rows;
  return body.map(cells => Object.fromEntries(head.map((key, i) => [key, cells[i]])));
}
const row = (rows, description) => rows.find(entry => entry.Description === description);

test('saved pack and CSV reconcile gross, cumulative capped retention and submitted net across periods', () => {
  const first = save(fixture(), '2026-10', 1044, 0, 0);
  assert.equal(first.pack.totals.cumulativeValue, 14094);
  assert.equal(first.pack.totals.retentionValue, 704.7);
  assert.equal(first.pack.totals.netCumulativeValue, 13389.3);
  assert.equal(first.pack.totals.previousNetValue, 0);
  assert.equal(first.pack.totals.currentValue, 13389.3);
  assert.equal(first.pack.workRows[0].currentValue, 14094);
  assert.equal(first.pack.claimBasis.retentionCap, 1000);
  assert.match(first.pack.prototypeNotice, /Retention is included/);

  const second = save(first.project, '2026-11', 1566, 14094, 13389.3);
  assert.equal(second.pack.totals.retentionValue, 1000);
  assert.equal(second.pack.totals.netCumulativeValue, 20141);
  assert.equal(second.pack.totals.currentValue, 6751.7);
  const secondCSV = csvRows(toClaimCSV(second.pack));
  assert.equal(row(secondCSV, 'Selected work and variations (gross)')['Assessed to date'], '21141');
  assert.equal(row(secondCSV, 'Selected work and variations (gross)')['Previous claimed'], '14094');
  assert.equal(row(secondCSV, 'Selected work and variations (gross)')['This period'], '7047');
  assert.equal(row(secondCSV, 'Retention held (cumulative)')['Assessed to date'], '1000');
  assert.equal(row(secondCSV, 'Cumulative net after retention')['Assessed to date'], '20141');
  assert.equal(row(secondCSV, 'Previously submitted net')['Previous claimed'], '13389.3');
  assert.equal(row(secondCSV, 'Net claim this period')['This period'], '6751.7');
  assert.equal(secondCSV.find(entry => entry.Section === 'Contract work')['This period'], '7047');

  const repeated = save(second.project, '2026-12', 1566, 21141, 20141);
  assert.equal(repeated.pack.totals.currentValue, 0);
  assert.equal(row(csvRows(toClaimCSV(repeated.pack)), 'Net claim this period')['This period'], '0');
});

test('saved claim basis, values and evidence never fall back to changed live project settings', () => {
  const saved = save(fixture(), '2026-10', 1044, 0, 0);
  const original = structuredClone(saved.pack);
  const originalCSV = toClaimCSV(saved.pack);
  saved.project.claimBasis = { retentionRate: 99, previousNetValue: 9000 };
  saved.project.contract.claimBasis = { retentionMode: 'none' };
  saved.project.contract.currency = 'MYR';
  saved.project.items = [];
  saved.project.reports = [];
  saved.project.voReviews = [];
  assert.deepEqual(buildClaimPack(saved.project, saved.draft.id).pack, original);
  assert.equal(toClaimCSV(buildClaimPack(saved.project, saved.draft.id).pack), originalCSV);
  const detached = buildClaimPack(saved.project, saved.draft.id).pack;
  detached.claimBasis.retentionRate = 90;
  detached.totals.currentValue = 999;
  assert.deepEqual(buildClaimPack(saved.project, saved.draft.id).pack, original);
  assert.equal(saved.project.claimDrafts[0].snapshot.claimBasis.retentionRate, 5);
});

test('legacy saved claims and CSV keep their original gross-only shape despite live basis settings', () => {
  const result = saveClaimDraft(fixture(), '2026-10', { work: { A: { include: true, assessedQuantity: 1044, previousValue: 0 } }, priorConfirmed: true });
  const before = buildClaimPack(result.project, result.draft.id).pack;
  const csv = toClaimCSV(before);
  assert.equal(Object.hasOwn(before, 'claimBasis'), false);
  assert.equal(Object.hasOwn(before.totals, 'retentionValue'), false);
  assert.equal(before.totals.currentValue, 14094);
  assert.match(before.prototypeNotice, /before tax, retention and other deductions/);
  result.project.claimBasis = { version: 1, retentionMode: 'rateCap', retentionRate: 50, retentionCap: 1000 };
  result.project.contract.claimBasis = result.project.claimBasis;
  assert.deepEqual(buildClaimPack(result.project, result.draft.id).pack, before);
  assert.equal(toClaimCSV(buildClaimPack(result.project, result.draft.id).pack), csv);
  assert.doesNotMatch(csv, /Claim basis version|Net claim this period|Reconciliation/);
  assert.equal(row(csvRows(csv), 'Selected work and variations')['This period'], '14094');
});

test('unknown submitted net exports blank while explicitly confirmed zero stays numeric', () => {
  const result = saveClaimDraft(fixture(), '2026-10', {
    work: { A: { include: true, assessedQuantity: 1044, previousValue: 0 } }, priorConfirmed: false,
    claimBasis: { version: 1, billingMethod: 'quantityRate', retentionMode: 'none', previousNetValue: '' },
  });
  assert.equal(result.outcome, 'updated');
  const pack = buildClaimPack(result.project, result.draft.id).pack;
  assert.equal(pack.totals.previousNetValue, null);
  assert.equal(pack.totals.currentValue, null);
  assert.equal(row(csvRows(toClaimCSV(pack)), 'Previously submitted net')['Previous claimed'], '');
  assert.equal(row(csvRows(toClaimCSV(pack)), 'Net claim this period')['This period'], '');
  const zero = save(fixture(), '2026-10', 1044, 0, 0, { retentionRate: 0, retentionCap: 0 });
  assert.equal(zero.pack.totals.retentionValue, 0);
  assert.equal(row(csvRows(toClaimCSV(zero.pack)), 'Retention held (cumulative)')['Assessed to date'], '0');
});

test('unrecognised saved basis cannot silently export as a legacy gross claim', () => {
  const saved = save(fixture(), '2026-10', 1044, 0, 0);
  for (const corrupt of ['invalid', { version: 2 }]) {
    const changed = structuredClone(saved.project);
    changed.claimDrafts[0].snapshot.claimBasis = corrupt;
    assert.equal(buildClaimPack(changed, saved.draft.id).outcome, 'invalid');
  }
});
