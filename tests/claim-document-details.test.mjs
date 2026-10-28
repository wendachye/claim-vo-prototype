import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { createProject, loadWorkspace, updateProjectState, WORKSPACE_STORE } from '../src/data/projects.ts';
import { saveClaimDraft, markClaimPrepared, normalizeClaimDrafts } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { getClaimDocumentDetails, isClaimDocumentDetails, validateClaimDocumentDetails, claimDocumentFieldLimits } from '../src/data/claim-document-details.ts';
import { getClaimDocumentEditContext, saveClaimDocumentDetails } from '../src/data/claim-document-revisions.ts';
import { recordClaimStage } from '../src/data/claim-tracking.ts';
import { saveClaimRevision } from '../src/data/claim-revisions.ts';

beforeEach(t => t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-20T04:00:00Z') }));

function fixture(code = 'DOC') {
  const base = createProject({ code, name: 'Frozen project name', country: 'Singapore' });
  const project = { ...base, locked: true, lockedAt: '2026-10-01T04:00:00Z',
    contract: { ...base.contract, reference: 'FROZEN-CONTRACT', mainContractor: 'Saved recipient', subcontractor: 'Saved company' },
    items: [{ id: 'A', ref: 'A/01', description: 'Measured scaffold', unit: 'm²', quantity: 100,
      rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 50 }],
    reports: [{ id: 'R-A', projectId: base.id, itemId: 'A', status: 'verified', completion: 50,
      date: '2026-10-19T09:00:00+08:00', verifiedAt: '2026-10-19T12:00:00+08:00',
      message: 'Original message', photo: '/assets/original.jpg', sourceMessageId: 'WA-A' }],
  };
  project.sourceItems = structuredClone(project.items);
  return saveClaimDraft(project, '2026-10', { work: { A: { include: true, assessedQuantity: 50, previousValue: 100 } }, priorConfirmed: true });
}
const pack = (project, id) => {
  const result = buildClaimPack(project, id);
  assert.equal(result.outcome, 'ready', result.error);
  return result.pack;
};
const edit = (project, id, changes, now) => {
  const context = getClaimDocumentEditContext(project, id);
  return saveClaimDocumentDetails(project, id, { details: { ...context.details, ...changes }, sourceKey: context.sourceKey }, now);
};

test('document details create an independent Draft without changing any saved amounts, evidence or prior exports', () => {
  const saved = fixture();
  const prepared = markClaimPrepared(saved.project, saved.draft.id);
  const original = structuredClone(prepared.project);
  const originalPack = pack(prepared.project, saved.draft.id);
  const originalCSV = toClaimCSV(originalPack);
  // Live changes after saving are deliberately not recaptured into this revision.
  prepared.project.name = 'Live name'; prepared.project.items[0].rate = 999;
  prepared.project.reports[0].message = 'Changed live message'; prepared.project.reports[0].photo = '/changed.jpg';
  const beforeEdit = structuredClone(prepared.project);
  const result = edit(prepared.project, saved.draft.id, { recipientCompany: 'New recipient', printedProjectCode: 'PRINT-001',
    companyAddress: 'Line one\nLine two', claimReference: 'APPLICATION-001' });
  assert.equal(result.outcome, 'updated');
  assert.equal(result.draft.status, 'draft');
  assert.equal(result.draft.revision, 2);
  assert.equal(result.draft.documentRevisionOf, saved.draft.id);
  for (const field of ['preparedAt', 'revisionOf', 'queryId', 'revisionResponse']) assert.equal(Object.hasOwn(result.draft, field), false);
  for (const field of ['snapshot', 'assessment', 'projectDetails']) assert.deepEqual(result.draft[field], original.claimDrafts[0][field]);
  assert.deepEqual(result.project.claimDrafts[0], original.claimDrafts[0]);
  assert.deepEqual(prepared.project, beforeEdit);
  for (const field of ['id', 'code', 'name', 'contract', 'items', 'reports', 'claimTracking', 'voReviews', 'whatsappMessages', 'baselines']) {
    assert.deepEqual(result.project[field], beforeEdit[field]);
  }
  assert.deepEqual(pack(result.project, saved.draft.id), originalPack);
  assert.equal(toClaimCSV(pack(result.project, saved.draft.id)), originalCSV);
  const newPack = pack(result.project, result.draft.id);
  assert.deepEqual(newPack.totals, originalPack.totals);
  assert.deepEqual(newPack.evidenceRefs, originalPack.evidenceRefs);
  assert.equal(newPack.documentDetails.recipientCompany, 'New recipient');
  assert.match(toClaimCSV(newPack), /"Printed project code","PRINT-001"/);
  assert.match(toClaimCSV(newPack), /"Printed claim reference","APPLICATION-001"/);
});

test('defaults use frozen metadata and saved date; explicit blanks stay blank and internal references are not copied', () => {
  const result = fixture();
  const oldPack = pack(result.project, result.draft.id);
  assert.equal(Object.hasOwn(oldPack, 'documentDetails'), false);
  const defaults = getClaimDocumentDetails(oldPack);
  assert.equal(defaults.recipientCompany, 'Saved recipient');
  assert.equal(defaults.companyName, 'Saved company');
  assert.equal(defaults.contractReference, 'FROZEN-CONTRACT');
  assert.equal(defaults.claimReference, '');
  assert.equal(defaults.claimDate, '2026-10-20');
  for (const field of ['recipientAttention', 'recipientAddress', 'companyAddress', 'companyRegistration', 'companyPhone', 'companyEmail']) assert.equal(defaults[field], '');
  result.project.name = 'Live project'; result.project.contract.mainContractor = 'Live recipient';
  assert.deepEqual(getClaimDocumentDetails(pack(result.project, result.draft.id)), defaults);
  const edited = edit(result.project, result.draft.id, { recipientCompany: '', projectName: '', contractReference: '', claimDate: '', companyName: '' });
  const current = getClaimDocumentDetails(pack(edited.project, edited.draft.id));
  for (const field of ['recipientCompany', 'projectName', 'contractReference', 'claimDate', 'companyName', 'claimReference']) assert.equal(current[field], '');
  assert.match(toClaimCSV(pack(edited.project, edited.draft.id)), new RegExp(`"Printed claim reference","${edited.draft.id}"`));
});

test('legacy fallback is labelled and freezes complete printed fields only after an explicit save', () => {
  const result = fixture();
  delete result.project.claimDrafts[0].projectDetails;
  const old = structuredClone(result.project.claimDrafts[0]);
  const legacy = pack(result.project, result.draft.id);
  assert.equal(legacy.metadataSource, 'current-fallback');
  assert.match(legacy.metadataNotice, /Legacy draft/);
  assert.equal(getClaimDocumentDetails(legacy).projectName, result.project.name);
  const saved = edit(result.project, result.draft.id, { recipientAttention: 'QS team' });
  assert.equal(saved.outcome, 'updated');
  assert.deepEqual(saved.project.claimDrafts[0], old);
  assert.equal(Object.hasOwn(saved.draft, 'projectDetails'), false);
  saved.project.name = 'Later live project';
  assert.equal(getClaimDocumentDetails(pack(saved.project, saved.draft.id)).projectName, 'Frozen project name');
});

test('no-op and replay saves never append duplicate revisions; stale sources and older versions are rejected', () => {
  const result = fixture();
  const context = getClaimDocumentEditContext(result.project, result.draft.id);
  const unchanged = saveClaimDocumentDetails(result.project, result.draft.id, { details: context.details, sourceKey: context.sourceKey });
  assert.equal(unchanged.outcome, 'unchanged'); assert.equal(unchanged.project, result.project);
  const input = { details: { ...context.details, recipientAttention: 'Demo QS' }, sourceKey: context.sourceKey };
  const changed = saveClaimDocumentDetails(result.project, result.draft.id, input);
  const replay = saveClaimDocumentDetails(changed.project, result.draft.id, input);
  assert.equal(replay.outcome, 'unchanged'); assert.equal(replay.draft.id, changed.draft.id);
  assert.equal(replay.project, changed.project); assert.equal(replay.project.claimDrafts.length, 2);
  assert.equal(getClaimDocumentEditContext(changed.project, result.draft.id).eligible, false);
  assert.equal(saveClaimDocumentDetails(changed.project, result.draft.id, { ...input, details: { ...input.details, recipientAttention: 'Different change' } }).outcome, 'invalid');
  const third = edit(changed.project, changed.draft.id, { recipientAttention: 'Third version' });
  assert.equal(saveClaimDocumentDetails(third.project, result.draft.id, input).outcome, 'invalid');
  const stale = structuredClone(result.project); stale.claimDrafts[0].assessment.note = 'Changed since open';
  assert.equal(saveClaimDocumentDetails(stale, result.draft.id, input).outcome, 'invalid');
});

test('invalid fields, impossible dates and unsupported metadata are rejected without altering financial records', () => {
  const result = fixture();
  const details = getClaimDocumentEditContext(result.project, result.draft.id).details;
  assert.equal(isClaimDocumentDetails(details), true);
  assert.equal(validateClaimDocumentDetails({ ...details, claimDate: '2028-02-29' }).details.claimDate, '2028-02-29');
  for (const changes of [{ version: 2 }, { recipientCompany: null }, { claimDate: '2026-02-29' },
    { claimDate: '2026-04-31' }, { claimDate: '20/10/2026' }, { companyEmail: 'invalid' },
    { recipientAttention: 'QS\nTeam' }, { recipientAddress: 'Bad\u0000address' }, { projectId: 'OTHER' }]) {
    assert.equal(validateClaimDocumentDetails({ ...details, ...changes }).details, null, JSON.stringify(changes));
    assert.equal(edit(result.project, result.draft.id, changes).outcome, 'invalid');
  }
  for (const [field, limit] of Object.entries(claimDocumentFieldLimits)) {
    assert.equal(validateClaimDocumentDetails({ ...details, [field]: 'X'.repeat(limit + 1) }).details, null, field);
  }
  const normalized = validateClaimDocumentDetails({ ...details, companyName: '  Company  ', companyAddress: 'Line 1\r\nLine 2' }).details;
  assert.equal(normalized.companyName, 'Company'); assert.equal(normalized.companyAddress, 'Line 1\nLine 2');
  assert.equal(edit(result.project, result.draft.id, { companyName: 'Company' }, 'bad-date').outcome, 'invalid');
  assert.equal(result.project.claimDrafts.length, 1);
});

test('duplicate IDs/revisions, foreign sources and malformed tracking cannot bypass the selected project boundary', () => {
  const result = fixture();
  const source = result.draft;
  const corruptions = [
    project => project.claimDrafts.push(structuredClone(source)),
    project => project.claimDrafts.push({ ...structuredClone(source), id: 'DUPLICATE-REVISION' }),
    project => { project.claimDrafts[0].projectId = 'OTHER'; },
    project => { project.claimDrafts[0].snapshot.projectId = 'OTHER'; },
    project => { project.claimTracking = {}; },
    project => { project.claimTracking = [{ projectId: project.id, draftId: source.id, status: 'submitted', history: [] }]; },
  ];
  for (const corrupt of corruptions) {
    const changed = structuredClone(result.project); corrupt(changed);
    assert.equal(getClaimDocumentEditContext(changed, source.id).eligible, false);
  }
  const other = fixture('OTHER');
  const context = getClaimDocumentEditContext(result.project, source.id);
  assert.equal(saveClaimDocumentDetails(other.project, source.id, { details: context.details, sourceKey: context.sourceKey }).outcome, 'invalid');
});

test('issued, queried, certified and paid months require the existing query flow', () => {
  const saved = fixture();
  const prepared = markClaimPrepared(saved.project, saved.draft.id);
  const submitted = recordClaimStage(prepared.project, saved.draft.id, 'submitted', { date: '2026-10-21', reference: 'SUB-1' });
  assert.equal(submitted.outcome, 'updated');
  const queried = recordClaimStage(submitted.project, saved.draft.id, 'query', { date: '2026-10-22', reference: 'QUERY-1', note: 'Check the quantity.' });
  const certified = recordClaimStage(submitted.project, saved.draft.id, 'certified', { date: '2026-10-22', reference: 'CERT-1', value: 400 });
  const paid = recordClaimStage(certified.project, saved.draft.id, 'payment', { date: '2026-10-23', reference: 'PAY-1', value: 400 });
  const context = getClaimDocumentEditContext(prepared.project, saved.draft.id);
  for (const stage of [submitted, queried, certified, paid]) {
    assert.equal(stage.outcome, 'updated', stage.error);
    assert.equal(getClaimDocumentEditContext(stage.project, saved.draft.id).eligible, false);
    assert.equal(saveClaimDocumentDetails(stage.project, saved.draft.id, { details: { ...context.details, recipientAttention: 'New QS' }, sourceKey: context.sourceKey }).outcome, 'invalid');
  }
  const revised = saveClaimRevision(queried.project, saved.draft.id, queried.project.claimDrafts[0].assessment, 'Confirmed quantity.');
  assert.equal(revised.outcome, 'updated');
  assert.equal(getClaimDocumentEditContext(revised.project, revised.draft.id).eligible, false);
});

test('invalid new metadata blocks export/preparation but remains a saved record after normalization and reload', () => {
  const saved = fixture();
  saved.project.claimDrafts[0].documentDetails = { version: 2, recipientCompany: 'Unsupported future metadata' };
  const original = structuredClone(saved.project.claimDrafts[0]);
  assert.deepEqual(normalizeClaimDrafts(saved.project)[0], original);
  assert.equal(buildClaimPack(saved.project, saved.draft.id).outcome, 'invalid');
  assert.equal(markClaimPrepared(saved.project, saved.draft.id).outcome, 'invalid');
  assert.equal(saveClaimDraft(saved.project, '2026-10', saved.draft.assessment).outcome, 'invalid');
  let stored = JSON.stringify({ schemaVersion: 2, projects: [saved.project], activeProjectId: saved.project.id });
  const storage = { getItem: key => key === WORKSPACE_STORE ? stored : null, setItem: (_, value) => { stored = value; } };
  const loaded = loadWorkspace(storage);
  const loadedProject = loaded.projects.find(project => project.id === saved.project.id);
  assert.deepEqual(loadedProject.claimDrafts[0], original);
  assert.equal(buildClaimPack(loadedProject, saved.draft.id).outcome, 'invalid');
});

test('later monetary saves and query responses retain explicit document details without affecting preparation equality', () => {
  const saved = fixture();
  const edited = edit(saved.project, saved.draft.id, { recipientAttention: 'QS recipient', claimReference: '' });
  assert.equal(markClaimPrepared(edited.project, edited.draft.id).outcome, 'updated');
  const assessment = { ...edited.draft.assessment, work: { A: { include: true, assessedQuantity: 40, previousValue: 100 } } };
  const next = saveClaimDraft(edited.project, '2026-10', assessment);
  assert.deepEqual(next.draft.documentDetails, edited.draft.documentDetails);
  assert.equal(next.draft.documentRevisionOf, undefined);
  const prepared = markClaimPrepared(next.project, next.draft.id);
  assert.equal(prepared.outcome, 'updated');
  const submitted = recordClaimStage(prepared.project, next.draft.id, 'submitted', { date: '2026-10-21', reference: 'SUB-1' });
  const queried = recordClaimStage(submitted.project, next.draft.id, 'query', { date: '2026-10-22', reference: 'QUERY-1', note: 'Confirm details.' });
  const revised = saveClaimRevision(queried.project, next.draft.id, next.draft.assessment, 'Details confirmed.');
  assert.equal(revised.outcome, 'updated');
  assert.deepEqual(revised.draft.documentDetails, edited.draft.documentDetails);
  assert.equal(revised.draft.revisionOf, next.draft.id);
  assert.equal(revised.draft.documentDetails.claimReference, '');
  assert.match(toClaimCSV(pack(revised.project, revised.draft.id)), new RegExp(`"Printed claim reference","${revised.draft.id}"`));
});

test('updates stay scoped to selected project and valid metadata survives the normal workspace reload', () => {
  const saved = fixture(); const other = fixture('OTHER');
  const workspace = { schemaVersion: 2, activeProjectId: saved.project.id, projects: [saved.project, other.project] };
  const original = structuredClone(other.project);
  const next = updateProjectState(workspace, saved.project.id, project => edit(project, saved.draft.id, { companyPhone: '+65 6123 4567' }).project);
  assert.deepEqual(next.projects[1], original);
  let stored = JSON.stringify(next);
  const loaded = loadWorkspace({ getItem: key => key === WORKSPACE_STORE ? stored : null, setItem: (_, value) => { stored = value; } });
  const project = loaded.projects.find(entry => entry.id === saved.project.id);
  const latest = project.claimDrafts.at(-1);
  assert.equal(latest.documentDetails.companyPhone, '+65 6123 4567');
  assert.equal(latest.documentRevisionOf, saved.draft.id);
  assert.deepEqual(latest.snapshot, saved.draft.snapshot);
  assert.deepEqual(loaded.projects.find(entry => entry.id === other.project.id).claimDrafts, original.claimDrafts);
});
