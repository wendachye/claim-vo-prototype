import test from 'node:test';
import assert from 'node:assert/strict';
import { clearFormBuffer, clearProjectFormBuffers, contractFormScope, contractFormValues, findUnfinishedContractItem, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.ts';

test('unfinished forms survive view remount reads without mutating saved records', () => {
  const saved = { work: { 'WI-001': { assessedQuantity: 200 } } };
  writeFormBuffer('BUFFER-A', 'claims:forms', saved);
  saved.work['WI-001'].assessedQuantity = 400;
  const resumed = readFormBuffer('BUFFER-A', 'claims:forms');
  assert.equal(resumed.work['WI-001'].assessedQuantity, 200);
  resumed.work['WI-001'].assessedQuantity = 800;
  assert.equal(readFormBuffer('BUFFER-A', 'claims:forms').work['WI-001'].assessedQuantity, 200);
  clearProjectFormBuffers('BUFFER-A');
});

test('project, form, case and record version keys remain independent', () => {
  writeFormBuffer('BUFFER-A', 'vo:case-1:flagged:0', { note: 'Check drawing' });
  writeFormBuffer('BUFFER-B', 'vo:case-1:flagged:0', { note: 'Other project' });
  writeFormBuffer('BUFFER-A', 'claims:forms', { month: '2026-10' });
  assert.equal(readFormBuffer('BUFFER-A', 'vo:case-1:flagged:0').note, 'Check drawing');
  assert.equal(readFormBuffer('BUFFER-B', 'vo:case-1:flagged:0').note, 'Other project');
  assert.equal(readFormBuffer('BUFFER-A', 'vo:case-1:pendingApproval:1'), undefined);
  assert.equal(readFormBuffer('BUFFER-A', 'claims:forms').month, '2026-10');
  clearProjectFormBuffers('BUFFER-A');
  clearProjectFormBuffers('BUFFER-B');
});

test('explicit record clearing and project reset preserve unrelated unfinished edits', () => {
  writeFormBuffer('BUFFER-A', 'contract:WI-001:v1', { quantity: '1200' });
  writeFormBuffer('BUFFER-A', 'claims:forms', { previousValue: '0' });
  writeFormBuffer('BUFFER-B', 'claims:forms', { previousValue: '300' });
  clearFormBuffer('BUFFER-A', 'contract:WI-001:v1');
  assert.equal(readFormBuffer('BUFFER-A', 'contract:WI-001:v1'), undefined);
  assert.deepEqual(readFormBuffer('BUFFER-A', 'claims:forms'), { previousValue: '0' });
  clearProjectFormBuffers('BUFFER-A');
  assert.equal(readFormBuffer('BUFFER-A', 'claims:forms'), undefined);
  assert.deepEqual(readFormBuffer('BUFFER-B', 'claims:forms'), { previousValue: '300' });
  clearProjectFormBuffers('BUFFER-B');
});

const projectFor = (id = 'BUFFER-CONTRACT-A') => ({
  id, version: 1, locked: false,
  items: [{ id: 'WI-001', description: 'Demo wall', quantity: 1200, rate: 28, unit: 'm²', location: 'Block A', reviewedAt: '2026-10-21T09:00:00Z' }],
});

test('confirmation guard finds only changed current contract forms without modifying project data', () => {
  const project = projectFor();
  const item = project.items[0];
  const original = structuredClone(project);
  const scope = contractFormScope(item, project.version, false);
  writeFormBuffer(project.id, scope, contractFormValues(item));
  assert.equal(findUnfinishedContractItem(project), null);
  writeFormBuffer(project.id, scope, { ...contractFormValues(item), quantity: '1250' });
  assert.equal(findUnfinishedContractItem(project), 'WI-001');
  assert.deepEqual(project, original);
  clearProjectFormBuffers(project.id);
});

test('confirmation guard ignores another project, old revisions, updated source rows and locked contracts', () => {
  const project = projectFor();
  const item = project.items[0];
  writeFormBuffer(project.id, contractFormScope(item, 1, false), { ...contractFormValues(item), quantity: '1250' });
  assert.equal(findUnfinishedContractItem(projectFor('BUFFER-CONTRACT-B')), null);
  assert.equal(findUnfinishedContractItem({ ...project, version: 2 }), null);
  assert.equal(findUnfinishedContractItem({ ...project, items: [{ ...item, quantity: 1250 }] }), null);
  assert.equal(findUnfinishedContractItem({ ...project, items: [{ ...item, reviewedAt: '2026-10-21T10:00:00Z' }] }), null);
  assert.equal(findUnfinishedContractItem({ ...project, locked: true }), null);
  assert.equal(findUnfinishedContractItem(project), 'WI-001');
  clearProjectFormBuffers(project.id);
});

test('project reset clears confirmation blockers without dropping another project or record buffer', () => {
  const first = projectFor();
  const second = projectFor('BUFFER-CONTRACT-B');
  for (const project of [first, second]) writeFormBuffer(project.id, contractFormScope(project.items[0], 1, false), { ...contractFormValues(project.items[0]), description: 'Unfinished scope edit' });
  writeFormBuffer(second.id, 'claims:forms', { period: '2026-10' });
  clearProjectFormBuffers(first.id);
  assert.equal(findUnfinishedContractItem(first), null);
  assert.equal(findUnfinishedContractItem(second), 'WI-001');
  assert.deepEqual(readFormBuffer(second.id, 'claims:forms'), { period: '2026-10' });
  clearProjectFormBuffers(second.id);
});
