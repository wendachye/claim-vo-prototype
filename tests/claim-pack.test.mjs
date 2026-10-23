import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaimPack, claimPackFilename, toClaimCSV } from '../src/data/claim-pack.ts';
import { saveClaimDraft, markClaimPrepared, normalizeClaimDrafts } from '../src/data/claims.ts';
import { createProject } from '../src/data/projects.ts';

function project() {
  const base = createProject({ name: 'Example site', code: 'T01', country: 'Singapore' });
  return {
    ...base, locked: true, lockedAt: '2026-09-01T12:00:00+08:00',
    contract: { ...base.contract, name: 'Example measured works', reference: 'TEST-001',
      mainContractor: 'Example Main Contractor', subcontractor: 'Example Subcontractor',
      currency: 'SGD', totalAmount: 1000, sourceFilename: 'example.pdf', sourceKind: 'illustrative', demo: true },
    items: [{ id: 'A', ref: 'A/01', description: 'Example measured work', unit: 'm²', quantity: 100,
      rate: 10, amount: 1000, pricingType: 'measured', verified: 90, reported: 100, sourcePage: 4 }],
    reports: [
      { id: 'R-A', projectId: 'T01', itemId: 'A', status: 'verified', completion: 90,
        verifiedAt: '2026-10-16T12:00:00+08:00', verifiedBy: 'Example supervisor',
        date: '2026-10-15T09:00:00+08:00', sourceMessageId: 'WA-A', sender: 'Example worker',
        message: 'Area A | complete 90% total', photo: '/assets/example.jpg', photoAlt: 'Demo illustration', area: 'Area A', location: 'Block A' },
      { id: 'R-VO', projectId: 'T01', vo: true, status: 'voApproved', date: '2026-10-15T10:00:00+08:00',
        sourceMessageId: 'WA-VO', sender: 'Example worker', message: 'Additional platform requested', photo: '/assets/extra.jpg' },
    ],
    voReviews: [{ id: 'R-VO', reportId: 'R-VO', projectId: 'T01', status: 'approved', title: 'Extra platform',
      approvedValue: 200, approvalReference: 'APP-001', approver: 'Example approver',
      reviewChecksVersion: 1, scopeDisposition: 'variation', scopeAssessment: 'Fictional additional access outside the original scope.',
      instructionStatus: 'documented', instructionReference: 'DEMO-INSTRUCTION',
      executionStatus: 'verified', executionReference: 'DEMO-WORK-CHECK', executionVerifiedAt: '2026-10-18T12:00:00+08:00',
      claimEligibility: 'eligible', eligibilityNote: 'Explicit fictional QS claim eligibility check.', eligibilityReviewedAt: '2026-10-18T12:00:00+08:00',
      history: [{ id: 'APP-EVENT', action: 'approve', to: 'approved', date: '2026-10-17T12:00:00+08:00', actor: 'Example QS' }] }],
  };
}

const assessment = (extra = {}) => ({ work: { A: { include: true, assessedQuantity: 40, previousValue: 300 } },
  vos: { 'R-VO': { include: true, assessedValue: 120, previousValue: 50 } },
  priorConfirmed: true, note: 'QS measured quantity checked.', ...extra });
const saved = (input = assessment()) => saveClaimDraft(project(), '2026-10', input);
const packFor = (result) => buildClaimPack(result.project, result.draft.id).pack;

function parseCSV(csv) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && char === ',') { row.push(value); value = ''; }
    else if (!quoted && char === '\r' && csv[index + 1] === '\n') {
      row.push(value); rows.push(row); row = []; value = ''; index += 1;
    } else value += char;
  }
  assert.equal(quoted, false);
  return rows;
}

test('pack preserves saved values, evidence and project details after live sources change', () => {
  const result = saved();
  const original = packFor(result);
  assert.equal(original.metadataSource, 'snapshot');
  assert.equal(original.projectDetails.contract.reference, 'TEST-001');
  assert.equal(original.workRows[0].cumulativeValue, 400); // Explicit QS quantity, not 90% of 1,000.
  assert.equal(original.voRows[0].cumulativeValue, 120);
  assert.equal(original.totals.currentValue, 170);
  result.project.name = 'Renamed live project';
  result.project.contract.reference = 'CHANGED';
  result.project.contract.currency = 'MYR';
  result.project.items[0].rate = 99;
  result.project.items[0].verified = 1;
  result.project.reports[0].message = 'Changed message';
  result.project.reports[0].photo = '/changed.jpg';
  result.project.voReviews[0].status = 'rejected';
  assert.deepEqual(packFor(result), original);
  const detached = packFor(result);
  detached.workRows[0].currentValue = 5000;
  detached.projectDetails.name = 'Mutated result';
  assert.deepEqual(packFor(result), original);
});

test('new metadata revisions and legacy fallback preserve old drafts and prepare equality', () => {
  const first = saved();
  assert.equal(saveClaimDraft(first.project, '2026-10', assessment()).outcome, 'unchanged');
  const prepared = markClaimPrepared(first.project, first.draft.id);
  assert.equal(prepared.outcome, 'updated');
  const preparedPack = packFor(prepared);
  assert.equal(preparedPack.status, 'prepared');
  assert.ok(preparedPack.preparedAt);
  assert.match(preparedPack.prototypeNotice, /does not submit, certify or pay/);
  const renamed = { ...prepared.project, name: 'New display name', contract: { ...prepared.project.contract, reference: 'REF-002' } };
  const revision = saveClaimDraft(renamed, '2026-10', assessment());
  assert.equal(revision.draft.revision, 2);
  assert.equal(revision.draft.projectDetails.name, 'New display name');
  assert.deepEqual(revision.project.claimDrafts[0], prepared.draft);
  assert.deepEqual(normalizeClaimDrafts(JSON.parse(JSON.stringify(revision.project))), revision.project.claimDrafts);
  const legacy = structuredClone(prepared.project);
  delete legacy.claimDrafts[0].projectDetails;
  const legacyRecord = structuredClone(legacy.claimDrafts[0]);
  legacy.name = 'Current legacy metadata';
  const fallback = buildClaimPack(legacy, first.draft.id).pack;
  assert.equal(fallback.metadataSource, 'current-fallback');
  assert.match(fallback.metadataNotice, /current workspace details, not a saved metadata snapshot/);
  assert.equal(fallback.projectDetails.name, 'Current legacy metadata');
  assert.deepEqual(fallback.totals, preparedPack.totals);
  const captured = saveClaimDraft(legacy, '2026-10', assessment());
  assert.equal(captured.draft.revision, 2);
  assert.deepEqual(captured.project.claimDrafts[0], legacyRecord);
  assert.equal(captured.draft.projectDetails.name, 'Current legacy metadata');
});

test('pack rejects missing drafts, duplicate identifiers and cross-project snapshots or evidence', () => {
  const result = saved();
  assert.equal(buildClaimPack(result.project, 'missing').outcome, 'invalid');
  assert.equal(buildClaimPack({ ...result.project, id: 'OTHER' }, result.draft.id).outcome, 'invalid');
  for (const corrupt of [
    (draft) => { draft.projectId = 'OTHER'; },
    (draft) => { draft.snapshot.projectId = 'OTHER'; },
    (draft) => { draft.projectDetails.id = 'OTHER'; },
    (draft) => { draft.snapshot.workRows[0].evidence.projectId = 'OTHER'; },
    (draft) => { draft.snapshot.totals = null; },
  ]) {
    const changed = structuredClone(result.project);
    corrupt(changed.claimDrafts[0]);
    assert.equal(buildClaimPack(changed, result.draft.id).outcome, 'invalid');
  }
  assert.equal(buildClaimPack({ ...result.project, claimDrafts: [result.draft, result.draft] }, result.draft.id).outcome, 'invalid');
});

test('incomplete packs retain unknowns, explicit zero and negative corrections without recalculation', () => {
  const incomplete = packFor(saved({ work: { A: { include: true } } }));
  assert.equal(incomplete.status, 'draft');
  assert.equal(incomplete.canPrepare, false);
  assert.ok(incomplete.issues.length);
  assert.equal(incomplete.workRows[0].assessedQuantity, null);
  assert.equal(incomplete.workRows[0].previousValue, null);
  assert.equal(incomplete.totals.currentValue, null);
  const zero = packFor(saved({ work: { A: { include: true, assessedQuantity: 0, previousValue: 0 } }, priorConfirmed: true }));
  assert.equal(zero.canPrepare, true);
  assert.equal(zero.workRows[0].cumulativeValue, 0);
  assert.equal(zero.totals.currentValue, 0);
  const correction = packFor(saved(assessment({ work: { A: { include: true, assessedQuantity: 20, previousValue: 300 } }, vos: {}, adjustmentReason: 'Earlier quantity corrected.' })));
  assert.equal(correction.canPrepare, true);
  assert.equal(correction.totals.currentValue, -100);
  assert.equal(correction.assessment.adjustmentReason, 'Earlier quantity corrected.');
  const stored = saved();
  stored.project.claimDrafts[0].snapshot.totals.currentValue = 123.45;
  assert.equal(packFor(stored).totals.currentValue, 123.45); // Stored totals are copied, never revalued.
});

test('evidence references retain saved dates, reviewers, messages, photos and undated QS confirmation', () => {
  const original = project();
  delete original.reports[0].verifiedAt;
  const result = saveClaimDraft(original, '2026-10', assessment({ work: { A: { include: true, assessedQuantity: 40, evidenceDateConfirmed: true } } }));
  const pack = packFor(result);
  const [work, vo] = pack.evidenceRefs;
  assert.equal(work.reportId, 'R-A');
  assert.equal(work.sourceMessageId, 'WA-A');
  assert.equal(work.date, '2026-10-15T09:00:00+08:00');
  assert.equal(work.verifiedAt, null);
  assert.deepEqual(work.evidenceDateConfirmation, { asOf: '2026-10-31', confirmed: true });
  assert.equal(work.reviewer, 'Example supervisor');
  assert.equal(work.sender, 'Example worker');
  assert.equal(work.message, 'Area A | complete 90% total');
  assert.equal(work.photo, '/assets/example.jpg');
  assert.equal(work.sourcePage, 4);
  assert.equal(vo.reportId, 'R-VO');
  assert.equal(vo.sourceMessageId, 'WA-VO');
  assert.equal(vo.reviewer, 'Example QS');
  assert.equal(vo.approvalReference, 'APP-001');
  assert.equal(vo.approvalDate, '2026-10-17T12:00:00+08:00');
  assert.equal(vo.approver, 'Example approver');
});

test('CSV uses fixed columns, escapes text and formulas, preserves numeric negatives and safe filenames', () => {
  const original = project();
  original.name = '=HYPERLINK("https://example.test","Site")';
  original.contract.reference = 'Ref, "quoted"\nsecond line';
  original.reports[0].message = '\t=SUM(1,2)';
  original.items[0].description = '-Text is not a numeric adjustment';
  const result = saveClaimDraft(original, '2026-10', assessment({ work: { A: { include: true, assessedQuantity: 20, previousValue: 300 } }, vos: {}, adjustmentReason: '@review needed', note: '+SUM(1,2)' }));
  const pack = packFor(result);
  const csv = toClaimCSV(pack);
  const [header, ...rows] = parseCSV(csv);
  assert.equal(header.length, 16);
  assert.ok(rows.every((row) => row.length === header.length));
  const objects = rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));
  const meta = (field) => objects.find((row) => row.Section === 'Claim details' && row.Reference === field)?.Description;
  assert.equal(meta('Project'), `'${original.name}`);
  assert.equal(meta('Contract reference'), original.contract.reference);
  assert.equal(meta('QS note'), "'+SUM(1,2)");
  assert.equal(meta('Adjustment reason'), "'@review needed");
  assert.equal(objects.find((row) => row.Section === 'Work evidence')['Message / photo'], "'\t=SUM(1,2)\n/assets/example.jpg");
  assert.equal(objects.find((row) => row.Section === 'Contract work').Description, "'-Text is not a numeric adjustment");
  assert.equal(objects.find((row) => row.Section === 'Contract work')['This period'], '-100');
  assert.match(csv, /,-100,/); // A real number is not quoted or formula-prefixed.
  const incomplete = packFor(saved({ work: { A: { include: true } } }));
  const [unknownHeader, ...unknownRows] = parseCSV(toClaimCSV(incomplete));
  const unknownWork = unknownRows.find((row) => row[0] === 'Contract work');
  assert.equal(unknownWork[unknownHeader.indexOf('This period')], '');
  pack.evidenceRefs[0].photo = `data:image/png;base64,${'a'.repeat(10000)}`;
  assert.ok(!toClaimCSV(pack).includes('base64'));
  assert.match(toClaimCSV(pack), /Photo included in preview/);
  pack.evidenceRefs[0].photo = { url: '/photos/stored-photo.png' };
  assert.match(toClaimCSV(pack), /\/photos\/stored-photo.png/);
  assert.ok(!toClaimCSV(pack).includes('[object Object]'));
  assert.equal(claimPackFilename(pack), 'claim-T01-2026-10-r1.csv');
  assert.equal(claimPackFilename(pack, 'pdf'), 'claim-T01-2026-10-r1.pdf');
  const unsafe = { ...pack, projectDetails: { code: '../../bad\nname/=' }, period: '../2026-10', revision: '1/../../' };
  assert.match(claimPackFilename(unsafe, '../../exe'), /^claim-[A-Za-z0-9_-]+-[A-Za-z0-9_-]+-r[A-Za-z0-9_-]+\.csv$/);
});
