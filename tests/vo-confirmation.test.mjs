import assert from 'node:assert/strict';
import test from 'node:test';
import { seedWorkspace } from '../src/data/projects.ts';
import { getVOCases, getVOClaimEligibility, updateVOReview } from '../src/data/vo.ts';
import { createVOConfirmationRequest, getVOConfirmationApprovalValues, getVOConfirmationContext, normalizeVOConfirmationRequests, recordVOConfirmationReply } from '../src/data/vo-confirmation.ts';

const id = 'DEMO-REPORT-003';
const at = '2026-11-01T09:00:00.000Z';
const later = '2026-11-01T10:00:00.000Z';
const draft = { title: 'Additional platform', scopeAssessment: 'Additional access beyond the original scaffold scope.', instructionReference: 'DEMO-SI-03',
  proposedValue: '2400.25', scopeDisposition: 'variation', instructionStatus: 'documented', relatedItemId: 'WI-001', reviewNote: 'Demo QS scope assessment.' };
const pending = (values = {}) => updateVOReview(seedWorkspace().projects[0], id, 'submit', { ...draft, ...values }).project;
const requestValues = (project, changes = {}) => ({ recipient: 'Jamie Lee', authority: 'Client QS (demo)', sourceKey: getVOConfirmationContext(project, id).key, ...changes });
const requested = (project = pending()) => createVOConfirmationRequest(project, id, requestValues(project), at).project;
const current = project => getVOConfirmationContext(project, id).currentRequest;
const reply = (project, kind = 'priceApproved', message = 'Approved the exact scope and price in this request.') => recordVOConfirmationReply(project, id, current(project).id, { kind, message }, later);
const protectedFields = ['voReviews', 'reports', 'items', 'sourceItems', 'contract', 'baselines', 'claimDrafts', 'claimTracking', 'whatsappMessages', 'drawingMapping', 'seed'];
const protectedSnapshot = project => Object.fromEntries(protectedFields.map(field => [field, structuredClone(project[field])]));

test('request preview is read-only and binds saved scope, instruction, currency, price and review cycle', () => {
  const project = pending();
  const before = structuredClone(project);
  const context = getVOConfirmationContext(project, id);
  assert.equal(context.canCreate, true);
  assert.equal(context.entry.status, 'pendingApproval');
  assert.equal(context.snapshot.proposedValue, 2400.25);
  assert.equal(context.snapshot.currency, 'SGD');
  assert.equal(context.snapshot.instructionStatus, 'documented');
  assert.equal(context.snapshot.relatedItemId, 'WI-001');
  assert.equal(context.snapshot.baselineVersion, project.version);
  assert.equal(context.currentRequest, null);
  assert.deepEqual(context.requests, []);
  assert.deepEqual(project, before);
  assert.equal(getVOConfirmationContext(seedWorkspace().projects[0], id).canCreate, false);
  assert.equal(getVOConfirmationContext(pending({ scopeDisposition: 'existingScope' }), id).canCreate, false);
});

test('creating a mock request retains every existing workflow and saved evidence field', () => {
  const project = pending();
  project.claimDrafts = [{ id: 'KEEP-CLAIM', snapshot: { marker: 'Frozen claim' } }];
  project.claimTracking = [{ id: 'KEEP-TRACKING', status: 'paid', value: 900 }];
  const preserved = protectedSnapshot(project);
  const before = structuredClone(project);
  const result = createVOConfirmationRequest(project, id, requestValues(project), at);
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(protectedSnapshot(result.project), preserved);
  assert.deepEqual(project, before);
  const record = current(result.project);
  assert.equal(record.version, 1);
  assert.equal(record.projectId, project.id);
  assert.equal(record.caseId, id);
  assert.equal(record.reference, 'SIT01-VO-001-REQUEST-V1');
  assert.equal(record.channel, 'demo');
  assert.equal(record.requestedBy, 'Alex Tan · Demo QS reviewer');
  assert.equal(record.snapshot.scopeAssessment, draft.scopeAssessment);
  assert.equal(record.snapshot.proposedValue, 2400.25);
  assert.equal(record.reply, undefined);
  assert.equal(result.project.history.length, project.history.length + 1);
  assert.deepEqual(normalizeVOConfirmationRequests(result.project), result.project.voConfirmationRequests);
});

test('identical create replay is unchanged and cannot replace a waiting recipient or request', () => {
  const project = requested();
  const original = current(project);
  const repeated = createVOConfirmationRequest(project, id, requestValues(project), later);
  assert.equal(repeated.outcome, 'unchanged');
  assert.equal(repeated.project, project);
  assert.equal(repeated.requestId, original.id);
  assert.equal(createVOConfirmationRequest(project, id, requestValues(project, { recipient: 'Other client' }), later).outcome, 'invalid');
  assert.equal(getVOConfirmationContext(project, id).canCreate, true);
});

test('each simulated reply is immutable, append-only and never approves the VO or changes claims', () => {
  for (const kind of ['scopeAcknowledged', 'priceApproved', 'changesRequested']) {
    const project = requested();
    const before = structuredClone(project);
    const result = reply(project, kind, 'This is a simulated customer response.');
    assert.equal(result.outcome, 'updated');
    assert.deepEqual(protectedSnapshot(result.project), protectedSnapshot(project));
    assert.deepEqual(project, before);
    const request = current(result.project);
    assert.equal(request.reply.kind, kind);
    assert.equal(request.reply.respondent, request.recipient);
    assert.equal(request.reply.channel, 'demo');
    assert.deepEqual(request.snapshot, current(project).snapshot);
    assert.equal(getVOCases(result.project)[0].status, 'pendingApproval');
    assert.equal(getVOClaimEligibility(getVOCases(result.project)[0]).eligible, false);
    const replay = recordVOConfirmationReply(result.project, id, request.id, { kind, message: request.reply.message }, later);
    assert.equal(replay.outcome, 'unchanged');
    assert.equal(replay.project, result.project);
    assert.equal(recordVOConfirmationReply(result.project, id, request.id, { kind, message: 'Overwrite response' }, later).outcome, 'invalid');
    assert.equal(recordVOConfirmationReply(result.project, id, request.id, { kind: kind === 'priceApproved' ? 'scopeAcknowledged' : 'priceApproved', message: request.reply.message }, later).outcome, 'invalid');
    assert.equal(getVOConfirmationApprovalValues(result.project, id, request.id) !== null, kind === 'priceApproved');
  }
});

test('price reply can only explicitly fill the existing QS approval fields; QS action remains separate', () => {
  const project = reply(requested()).project;
  const fields = getVOConfirmationApprovalValues(project, id, current(project).id);
  assert.deepEqual(fields, { approvedValue: 2400.25, approvalReference: 'SIT01-VO-001-REQUEST-V1 · Simulated price approval', approver: 'Jamie Lee · Demo reply' });
  assert.equal(getVOCases(project)[0].approvedValue, null);
  const decision = updateVOReview(project, id, 'approve', fields);
  assert.equal(decision.outcome, 'updated');
  assert.equal(getVOCases(decision.project)[0].status, 'approved');
  assert.equal(getVOCases(decision.project)[0].approvedValue, 2400.25);
  assert.deepEqual(decision.project.voConfirmationRequests, project.voConfirmationRequests);
  assert.equal(getVOConfirmationApprovalValues(decision.project, id, current(project).id), null);
  assert.equal(getVOClaimEligibility(getVOCases(decision.project)[0]).eligible, false);
  assert.deepEqual(decision.project.claimDrafts, project.claimDrafts);
});

test('a new request version is available after any reply and only its current reply can be used', () => {
  for (const kind of ['scopeAcknowledged', 'priceApproved', 'changesRequested']) {
    const first = reply(requested(), kind).project;
    const oldRequest = structuredClone(current(first));
    const next = createVOConfirmationRequest(first, id, requestValues(first), '2026-11-01T11:00:00Z');
    assert.equal(next.outcome, 'updated');
    assert.equal(current(next.project).version, 2);
    assert.equal(current(next.project).reply, undefined);
    assert.deepEqual(next.project.voConfirmationRequests[0], oldRequest);
    assert.equal(getVOConfirmationApprovalValues(next.project, id, oldRequest.id), null);
    assert.equal(recordVOConfirmationReply(next.project, id, oldRequest.id, { kind, message: oldRequest.reply.message }, later).outcome, 'invalid');
  }
});

test('changed saved commercial or instruction context invalidates old replies without rewriting history', () => {
  const first = reply(requested()).project;
  const originalRequest = structuredClone(current(first));
  const fields = [ ['title', 'Other work'], ['scopeAssessment', 'Revised scope'], ['instructionReference', 'OTHER-SI'],
    ['proposedValue', 2410.25], ['scopeDisposition', 'existingScope'], ['instructionStatus', 'reported'], ['relatedItemId', 'WI-002'] ];
  for (const [field, value] of fields) {
    const changed = structuredClone(first);
    changed.voReviews[0][field] = value;
    const context = getVOConfirmationContext(changed, id);
    assert.equal(context.currentRequest, null, field);
    assert.deepEqual(context.latestRequest, originalRequest);
    assert.equal(getVOConfirmationApprovalValues(changed, id, originalRequest.id), null, field);
    assert.equal(recordVOConfirmationReply(changed, id, originalRequest.id, { kind: 'priceApproved', message: originalRequest.reply.message }, later).outcome, 'invalid', field);
  }
  for (const mutate of [p => { p.contract.currency = 'MYR'; }, p => { p.version += 1; }, p => { p.name = 'Renamed project'; }]) {
    const changed = structuredClone(first); mutate(changed);
    assert.equal(getVOConfirmationContext(changed, id).currentRequest, null);
    assert.equal(getVOConfirmationApprovalValues(changed, id, originalRequest.id), null);
  }
});

test('unrelated physical progress and work eligibility checks leave the exact commercial request current', () => {
  const project = reply(requested()).project;
  const changed = structuredClone(project);
  changed.items[0].reported = 80;
  changed.items[0].verified = 60;
  changed.voReviews[0].executionStatus = 'verified';
  changed.voReviews[0].executionReference = 'DEMO-INSPECT-9';
  changed.voReviews[0].claimEligibility = 'eligible';
  changed.voReviews[0].eligibilityNote = 'Independent eligibility check';
  changed.voReviews[0].reviewNote = 'Notes unrelated to the request';
  assert.equal(getVOConfirmationContext(changed, id).key, getVOConfirmationContext(project, id).key);
  assert.equal(current(changed).id, current(project).id);
  assert.deepEqual(getVOConfirmationApprovalValues(changed, id, current(changed).id), getVOConfirmationApprovalValues(project, id, current(project).id));
});

test('reopening and resubmitting identical scope starts a new review cycle and invalidates the old price reply', () => {
  const first = reply(requested()).project;
  const request = current(first);
  const approved = updateVOReview(first, id, 'approve', getVOConfirmationApprovalValues(first, id, request.id)).project;
  const reopened = updateVOReview(approved, id, 'reopen', { reviewNote: 'Recheck this decision.' }).project;
  const resubmitted = updateVOReview(reopened, id, 'submit', draft).project;
  assert.equal(getVOConfirmationContext(resubmitted, id).currentRequest, null);
  assert.equal(getVOConfirmationApprovalValues(resubmitted, id, request.id), null);
  assert.deepEqual(resubmitted.voConfirmationRequests, first.voConfirmationRequests);
  const next = createVOConfirmationRequest(resubmitted, id, requestValues(resubmitted), '2026-11-02');
  assert.equal(next.outcome, 'updated');
  assert.equal(current(next.project).version, 2);
  assert.notEqual(current(next.project).sourceKey, request.sourceKey);
  const awaiting = requested();
  const clarified = updateVOReview(awaiting, id, 'clarify', { reviewNote: 'Need further scope review.' }).project;
  const again = updateVOReview(clarified, id, 'submit', draft).project;
  assert.equal(getVOConfirmationContext(again, id).currentRequest, null);
});

test('unknown prices remain unknown, zero can be approved, and sub-cent or unsafe prices are rejected', () => {
  const unknown = requested(pending({ proposedValue: '' }));
  assert.equal(current(unknown).snapshot.proposedValue, null);
  assert.equal(reply(unknown, 'scopeAcknowledged').outcome, 'updated');
  assert.equal(reply(unknown, 'priceApproved').outcome, 'invalid');
  const zero = reply(requested(pending({ proposedValue: '0' }))).project;
  assert.equal(current(zero).snapshot.proposedValue, 0);
  assert.equal(getVOConfirmationApprovalValues(zero, id, current(zero).id).approvedValue, 0);
  for (const proposedValue of [0.001, 1.234, Infinity, 90071992547409.92]) {
    const project = pending(); project.voReviews[0].proposedValue = proposedValue;
    assert.equal(getVOConfirmationContext(project, id).canCreate, false, String(proposedValue));
    assert.equal(createVOConfirmationRequest(project, id, requestValues(project), at).outcome, 'invalid');
  }
});

test('foreign, duplicate and non-VO records never become actionable customer confirmations', () => {
  const project = requested();
  const request = current(project);
  const foreign = seedWorkspace().projects[1];
  foreign.voConfirmationRequests = structuredClone(project.voConfirmationRequests);
  assert.deepEqual(normalizeVOConfirmationRequests(foreign), []);
  assert.equal(createVOConfirmationRequest(foreign, id, requestValues(project), at).outcome, 'invalid');
  assert.equal(recordVOConfirmationReply(foreign, id, request.id, { kind: 'priceApproved', message: 'Foreign reply' }, later).outcome, 'invalid');
  assert.equal(getVOConfirmationContext(project, 'DEMO-REPORT-001').entry, null);
  for (const field of ['reports', 'voReviews', 'voConfirmationRequests']) {
    const changed = structuredClone(project);
    changed[field].push(structuredClone(changed[field].find(value => value.id === (field === 'voConfirmationRequests' ? request.id : id))));
    assert.equal(getVOConfirmationContext(changed, id).currentRequest, null, field);
    assert.equal(recordVOConfirmationReply(changed, id, request.id, { kind: 'priceApproved', message: 'Ambiguous reply' }, later).outcome, 'invalid', field);
    assert.equal(getVOConfirmationApprovalValues(changed, id, request.id), null, field);
  }
});

test('malformed stored request or reply records are rejected and cannot revive an older price approval after normalization', () => {
  const first = reply(requested()).project;
  const old = structuredClone(current(first));
  const second = createVOConfirmationRequest(first, id, requestValues(first), '2026-11-02').project;
  const mutators = [
    request => { request.projectId = 'OTHER'; }, request => { request.snapshot.caseId = 'OTHER'; },
    request => { request.snapshot.proposedValue = 1.234; }, request => { request.sourceKey = 'changed'; },
    request => { request.channel = 'whatsapp'; }, request => { request.requestedAt = 'invalid'; },
    request => { request.version = 0; }, request => { request.recipient = false; },
    request => { request.reply = { kind: 'priceApproved', message: 'Bad source', repliedAt: '2026-11-03', respondent: 'Other', channel: 'demo' }; },
  ];
  for (const mutate of mutators) {
    const changed = structuredClone(second); mutate(changed.voConfirmationRequests[1]);
    assert.equal(getVOConfirmationApprovalValues(changed, id, old.id), null);
    const normalized = normalizeVOConfirmationRequests(changed);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].historyInvalid, true);
    assert.deepEqual(normalized[0].snapshot, old.snapshot);
    assert.deepEqual(normalized[0].reply, old.reply);
    const loaded = { ...changed, voConfirmationRequests: structuredClone(normalized) };
    assert.deepEqual(normalizeVOConfirmationRequests(loaded), normalized);
    assert.equal(getVOConfirmationContext(loaded, id).currentRequest, null);
    assert.equal(getVOConfirmationContext(loaded, id).canCreate, false);
    assert.equal(getVOConfirmationApprovalValues(loaded, id, old.id), null);
    assert.equal(createVOConfirmationRequest(loaded, id, requestValues(loaded), '2026-11-04').outcome, 'invalid');
  }
});

test('invalid inputs, stale previews and backwards dates return the original project', () => {
  const project = pending();
  for (const values of [null, {}, requestValues(project, { recipient: '' }), requestValues(project, { authority: '' }), requestValues(project, { sourceKey: 'old-key' })]) {
    const result = createVOConfirmationRequest(project, id, values, at);
    assert.equal(result.outcome, 'invalid'); assert.equal(result.project, project);
  }
  assert.equal(createVOConfirmationRequest(project, id, requestValues(project), Symbol('invalid-date')).outcome, 'invalid');
  const saved = requested(project);
  for (const values of [null, {}, { kind: 'unknown', message: 'Reply' }, { kind: 'scopeAcknowledged', message: '' }]) {
    const result = recordVOConfirmationReply(saved, id, current(saved).id, values, later);
    assert.equal(result.outcome, 'invalid'); assert.equal(result.project, saved);
  }
  assert.equal(recordVOConfirmationReply(saved, id, current(saved).id, { kind: 'priceApproved', message: 'Reply before request' }, '2026-10-01').outcome, 'invalid');
  assert.equal(recordVOConfirmationReply(saved, id, current(saved).id, { kind: 'priceApproved', message: 'Reply' }, Symbol('bad-date')).outcome, 'invalid');
  const replied = reply(saved).project;
  assert.equal(createVOConfirmationRequest(replied, id, requestValues(replied), '2026-10-01').outcome, 'invalid');
});
