import assert from 'node:assert/strict';
import test from 'node:test';
import { getMessageSummary } from '../src/data/message-summary.js';

const progress = (values = {}) => ({
  projectCode: 'SIT-DEMO01', location: 'W3', area: 'Area W3-COLUMNS', itemId: 'WI-008',
  kind: 'progress', completionBasis: 'cumulative', completion: 35, status: 'new',
  text: 'SIT-DEMO01 | W3 | Area W3-COLUMNS | WI-008\nCONTRACT=A.3 / 1 | Block W3 columns\nSCOPE=A.3 · Circular column scaffold\nCOMPLETE=35% TOTAL\nReported cumulative physical progress for this whole contract work item. Supervisor verification is still required.\nSimulated site update with a generated demo photo; not actual site activity.',
  ...values,
});

test('S.I.T. list summary shows the saved total and meaningful body without changing evidence', () => {
  const message = progress();
  const original = structuredClone(message);
  assert.deepEqual(getMessageSummary(message), {
    title: '35% reported total',
    detail: 'Reported cumulative physical progress for this whole contract work item. Supervisor verification is still required.',
  });
  assert.deepEqual(message, original);
});

test('VO summary retains the scope question without implying approval, match or price', () => {
  const message = progress({ kind: 'vo', itemId: null, completion: null, completionBasis: 'unclear',
    text: 'SIT-DEMO01 | W3 | Area W3-COLUMNS\nCONTRACT CONTEXT=A.3 / 1 | Block W3 columns\nSCOPE=A.3 · Circular column scaffold\nA supervisor requested access to another column outside the four listed references.\nThe source row is context only. QS must confirm scope and entitlement.\nSimulated scenario message; generated demo photo attached.' });
  assert.deepEqual(getMessageSummary(message), {
    title: 'Possible extra work', detail: 'A supervisor requested access to another column outside the four listed references.',
  });
});

test('included-access and ambiguous messages do not become percentage summaries', () => {
  const included = progress({ kind: 'clarification', completion: 50,
    text: 'SIT-DEMO01 | W3 | Area W3-COLUMNS | WI-008\nCONTRACT=D.2 / 1 | Temporary access\nSCOPE=D.2 · Included\nTEMPORARY ACCESS: 2 of the 4 sets are reported installed.\nSimulated site update.' });
  assert.deepEqual(getMessageSummary(included), { title: 'Unclear site update', detail: 'TEMPORARY ACCESS: 2 of the 4 sets are reported installed.' });
  const unclear = progress({ kind: 'clarification', completionBasis: 'unclear',
    text: 'SIT-DEMO01 | W5 another 10%.\nPossible source context (not matched):\nOPTION 1=A.1 / 2a\nSimulated unclear message; confirm the total.' });
  assert.deepEqual(getMessageSummary(unclear), { title: 'Unclear site update', detail: 'W5 another 10%.' });
});

test('warehouse and campus one-line messages retain useful text after the project prefix', () => {
  assert.deepEqual(getMessageSummary(progress({ projectCode: 'WH02', location: 'Bay A', area: 'Area B', itemId: null,
    kind: 'clarification', completionBasis: 'unclear', text: 'WH02 | Area B done 50%.' })), {
    title: 'Unclear site update', detail: 'Area B done 50%.',
  });
  assert.equal(getMessageSummary(progress({ projectCode: 'SIT01', text: 'SIT01 | W3 | Area W3-COLUMNS | WI-008\nCOMPLETE=35% TOTAL\nScaffold installation progress to date. Photo attached.' })).detail,
    'Scaffold installation progress to date. Photo attached.');
});

test('zero stays valid while missing, invalid or unclear totals never imply a percentage', () => {
  assert.equal(getMessageSummary(progress({ completion: 0 })).title, '0% reported total');
  for (const completion of [null, undefined, '', '50', NaN, Infinity, -1, 101]) {
    assert.equal(getMessageSummary(progress({ completion })).title, 'Progress update');
  }
  assert.equal(getMessageSummary(progress({ completionBasis: 'unclear' })).title, 'Progress update');
  assert.equal(getMessageSummary(progress({ status: 'clarification' })).title, '35% reported total');
});

test('fallbacks remain neutral and ordinary pipe-separated prose is not stripped', () => {
  assert.deepEqual(getMessageSummary(), { title: 'Site update', detail: 'Open the original message and photo.' });
  assert.equal(getMessageSummary(progress({ text: 'SIT-DEMO01 | W3 | Area W3-COLUMNS | WI-008\nCOMPLETE=35% TOTAL\nSimulated demo.' })).detail,
    'Open the original message and photo.');
  assert.equal(getMessageSummary(progress({ text: 'Check the platform | ask the supervisor first.' })).detail,
    'Check the platform | ask the supervisor first.');
  assert.equal(getMessageSummary(progress({ text: 'DEMO ONLY: separate instruction adds temporary access.' })).detail,
    'DEMO ONLY: separate instruction adds temporary access.');
});
