import assert from 'node:assert/strict';
import test from 'node:test';
import { getMessageReviewStatus, isNewInboxMessage, matchesInboxFilter } from '../src/data/message-inbox.ts';

const message = (values = {}) => ({ id: 'M', kind: 'progress', status: 'new', ...values });
const report = (values = {}) => ({ id: 'R', status: 'pending', vo: false, ...values });

test('new messages remain distinct from reports awaiting supervisor review', () => {
  const value = message();
  assert.equal(isNewInboxMessage(value, null), true);
  assert.equal(matchesInboxFilter('new', value, null), true);
  assert.equal(matchesInboxFilter('review', value, null), false);
  assert.deepEqual(getMessageReviewStatus(value, null), { label: 'New', tone: 'blue' });
  for (const status of ['pending', 'needsReview']) {
    const linked = report({ status });
    assert.equal(isNewInboxMessage(value, linked), false);
    assert.equal(matchesInboxFilter('new', value, linked), false);
    assert.equal(matchesInboxFilter('review', value, linked), true);
    assert.equal(matchesInboxFilter('processed', value, linked), true);
    assert.deepEqual(getMessageReviewStatus(value, linked), { label: 'To check', tone: 'amber' });
  }
});

test('attached verified and legacy approved reports override stale inbox statuses', () => {
  for (const messageStatus of ['new', 'clarification', 'processed']) {
    const value = message({ status: messageStatus, kind: 'clarification' });
    for (const status of ['verified', 'approved']) {
      const linked = report({ status });
      assert.deepEqual(getMessageReviewStatus(value, linked), { label: 'Checked progress', tone: 'green' });
      assert.equal(matchesInboxFilter('clarification', value, linked), false);
      assert.equal(matchesInboxFilter('review', value, linked), false);
      assert.equal(matchesInboxFilter('processed', value, linked), true);
      assert.equal(isNewInboxMessage(value, linked), false);
    }
  }
});

test('rejected and superseded reports do not appear as new or awaiting verification', () => {
  for (const [status, label] of [['rejected', 'Dismissed'], ['superseded', 'Superseded']]) {
    const value = message();
    const linked = report({ status });
    assert.deepEqual(getMessageReviewStatus(value, linked), { label, tone: 'slate' });
    assert.equal(matchesInboxFilter('new', value, linked), false);
    assert.equal(matchesInboxFilter('review', value, linked), false);
    assert.equal(matchesInboxFilter('processed', value, linked), true);
  }
});

test('clarification remains visible without inventing a processed progress report', () => {
  const awaiting = message({ kind: 'clarification', status: 'new' });
  assert.equal(isNewInboxMessage(awaiting, null), true);
  assert.deepEqual(getMessageReviewStatus(awaiting, null), { label: 'Needs clarification', tone: 'amber' });
  assert.equal(matchesInboxFilter('clarification', awaiting, null), true);
  assert.equal(matchesInboxFilter('processed', awaiting, null), false);
  const saved = message({ status: 'clarification' });
  assert.equal(isNewInboxMessage(saved, null), false);
  assert.equal(matchesInboxFilter('clarification', saved, null), true);
  assert.equal(matchesInboxFilter('processed', saved, null), false);
  for (const status of ['needsClarification', 'clarification']) {
    const linked = report({ status });
    assert.deepEqual(getMessageReviewStatus(message(), linked), { label: 'Needs clarification', tone: 'amber' });
    assert.equal(matchesInboxFilter('clarification', message(), linked), true);
    assert.equal(matchesInboxFilter('review', message(), linked), false);
  }
});

test('a pending report takes precedence over the inbox clarification label', () => {
  const value = message({ kind: 'clarification', status: 'clarification' });
  assert.deepEqual(getMessageReviewStatus(value, report()), { label: 'To check', tone: 'amber' });
  assert.equal(matchesInboxFilter('clarification', value, report()), false);
  assert.equal(matchesInboxFilter('review', value, report()), true);
});

test('VO lifecycle labels stay distinct from checked physical progress', () => {
  const value = message({ kind: 'vo' });
  const linked = report({ vo: true });
  const labels = { flagged: 'Needs extra-work review', clarification: 'Needs information', pendingApproval: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected' };
  for (const [status, label] of Object.entries(labels)) {
    assert.deepEqual(getMessageReviewStatus(value, linked, { id: 'R', status }), {
      label, tone: status === 'approved' ? 'green' : status === 'rejected' ? 'slate' : 'amber',
    });
    assert.equal(matchesInboxFilter('vo', value, linked), true);
    assert.equal(matchesInboxFilter('review', value, linked), false);
  }
  assert.deepEqual(getMessageReviewStatus(value, report({ vo: true, status: 'approved' })), { label: 'Needs extra-work review', tone: 'amber' });
  assert.deepEqual(getMessageReviewStatus(value, report({ vo: true, status: 'rejected' })), { label: 'Rejected', tone: 'slate' });
});

test('filters retain saved messages without a report and reject unsupported filters', () => {
  assert.equal(matchesInboxFilter('processed', message({ status: 'processed' }), null), true);
  assert.equal(matchesInboxFilter('all', message(), null), true);
  assert.equal(matchesInboxFilter('unsupported', message(), null), false);
  assert.equal(matchesInboxFilter('all', null, null), false);
});

test('presentation helpers do not mutate messages, reports or VO reviews', () => {
  const value = message({ text: 'Original worker message', completion: 0 });
  const linked = report({ vo: true, status: 'needsReview', photo: '/assets/demo-photo.jpg' });
  const vo = { id: 'R', status: 'approved', approvedValue: 0 };
  const before = structuredClone({ value, linked, vo });
  getMessageReviewStatus(value, linked, vo);
  isNewInboxMessage(value, linked);
  for (const filter of ['all', 'new', 'review', 'processed', 'vo', 'clarification']) matchesInboxFilter(filter, value, linked);
  assert.deepEqual({ value, linked, vo }, before);
});
