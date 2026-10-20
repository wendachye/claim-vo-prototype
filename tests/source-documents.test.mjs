import assert from 'node:assert/strict';
import test from 'node:test';
import { getSourceDocuments } from '../src/data/source-documents.js';
import { seedWorkspace } from '../src/data/projects.js';

const provided = () => ({
  id: 'SOURCE-DEMO', sourceKind: 'provided', sourceProfile: 'sit-loa-2021',
  sourceFile: 'China Con (LOA S.I.T Project).pdf', sourceFilename: 'China Con (LOA S.I.T Project).pdf',
  sourcePageCount: 115, hasDrawing: true,
});

test('the explicit provided source profile resolves only its fixed schedule and drawing assets', () => {
  const value = provided();
  const before = structuredClone(value);
  const documents = getSourceDocuments({ ...value, asset: 'https://example.com/other.png',
    schedule: { asset: 'blob:session-only' }, drawing: { asset: '/assets/foreign.png' } });
  assert.deepEqual(documents, {
    schedule: { asset: '/assets/contract-schedule.jpg', label: 'Schedule', ratio: 1697 / 2400 },
    drawing: { asset: '/assets/site-plan.png', label: 'Site drawing', ratio: 1.414 },
  });
  assert.deepEqual(value, before);
  assert.equal(getSourceDocuments({ ...value, hasDrawing: false }).drawing, null);
  assert.equal(getSourceDocuments({ ...value, hasDrawing: undefined }).drawing, null);
  assert.equal(getSourceDocuments({ ...value, hasDrawing: 'true' }).drawing, null);
});

test('missing, malformed and foreign source metadata cannot show the bundled provided documents', () => {
  const value = provided();
  for (const patch of [
    { sourceKind: 'illustrative' }, { sourceKind: 'none' }, { sourceKind: null },
    { sourceProfile: undefined }, { sourceProfile: null }, { sourceProfile: [] },
    { sourceProfile: 'SIT-LOA-2021' }, { sourceProfile: 'other-project' },
    { sourceFile: undefined }, { sourceFile: null }, { sourceFile: 'other.pdf' },
    { sourceFilename: undefined }, { sourceFilename: null }, { sourceFilename: 'other.pdf' },
    { sourceFile: '/assets/contract-schedule.jpg' },
    { sourceFilename: 'https://example.com/China Con (LOA S.I.T Project).pdf' },
    { sourceFilename: 'China Con (LOA S.I.T Project).pdf?source=other' },
  ]) assert.equal(getSourceDocuments({ ...value, ...patch }), null, JSON.stringify(patch));
  for (const malformed of [null, undefined, [], 'sit-loa-2021', 1, {}]) {
    assert.equal(getSourceDocuments(malformed), null);
  }
});

test('fictional and empty projects never inherit the original source through a null filename fallback', () => {
  for (const project of seedWorkspace().projects) {
    assert.equal(getSourceDocuments(project.contract), null);
    assert.equal(getSourceDocuments({ ...project.contract, sourceKind: 'provided', sourceFile: null, sourceFilename: null }), null);
  }
  // Keeping the same project identity does not grant a stale profile access to
  // the prior source when its metadata changes during project review.
  const value = provided();
  assert.ok(getSourceDocuments(value).schedule);
  assert.equal(getSourceDocuments({ ...value, sourceProfile: 'another-source' }), null);
  assert.equal(getSourceDocuments({ ...value, sourceKind: 'illustrative' }), null);
});

test('returned document descriptors are independent between projects and reads', () => {
  const first = getSourceDocuments(provided());
  first.schedule.asset = '/assets/foreign.png';
  first.schedule.label = 'Another source';
  first.drawing.ratio = 9;
  const next = getSourceDocuments({ ...provided(), id: 'OTHER-SOURCE-DEMO' });
  assert.equal(next.schedule.asset, '/assets/contract-schedule.jpg');
  assert.equal(next.schedule.label, 'Schedule');
  assert.equal(next.drawing.ratio, 1.414);
  assert.notEqual(first.schedule, next.schedule);
  assert.notEqual(first.drawing, next.drawing);
});
