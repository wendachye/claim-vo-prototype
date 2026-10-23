import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { createProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { createAreaSplitDemo } from '../src/data/area-split-demo.ts';
import { createAreaAliasDemo } from '../src/data/area-alias-demo.ts';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { createVoiceNoteDemo } from '../src/data/voice-note-demo.ts';
import { createDrawingProgressDemo } from '../src/data/drawing-progress-demo.ts';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.ts';
import { getVoiceNoteContext, saveVoiceTranscriptReview } from '../src/data/voice-notes.ts';
import { saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-24T10:00:00+08:00');
const ids = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const stored = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selected = () => stored().projects.find(project => project.id === stored().activeProjectId);
const applied = result => {
  if (result.outcome !== 'updated') throw new Error(result.error || result.outcome);
  return result.project;
};
const exportsFor = project => project.claimDrafts.map(draft => toClaimCSV(buildClaimPack(project, draft.id).pack));

function progressAndClaim(project, kind) {
  if (kind === 'claim-examples') return project;
  if (kind !== 'drawing-progress') {
    const source = project.whatsappMessages[0];
    const west = project.drawingMapping.areas.find(area => area.code === 'WEST');
    if (kind === 'voice-note') project = applied(saveVoiceTranscriptReview(project, source.id, {
      transcript: 'Block A west wall cladding is 50% complete in total.', reason: 'Keep my reviewed transcription.',
      sourceKey: getVoiceNoteContext(project, source.id).sourceKey,
    }, now));
    if (kind === 'voice-note' || kind === 'message-match') project = applied(saveMessageMatchReview(project, source.id, {
      itemId: 'WI-001', areaId: west.id, reason: '',
    }, now));
    const result = processWhatsAppMessage(project, source.id);
    if (result.outcome !== 'processed') throw new Error(result.error || result.outcome);
    project = applied(verifyProgressReport(result.project, result.reportId, 50, '', now));
  }
  return applied(saveClaimDraft(project, '2026-10', {
    priorConfirmed: true, work: { 'WI-001': { include: true, assessedQuantity: 200, previousValue: 0 } },
    note: 'Keep this saved assessment when reopening a demo.',
  }));
}

function setup(kind, factory, { duplicates = false, activeExample = false } = {}) {
  const opener = createProject({ name: 'My project', code: 'REOPEN-OWNER' });
  opener.whatsappMessages = [{ id: 'REOPEN-OWNER-WA-1', projectId: opener.id, projectCode: opener.code,
    kind: 'clarification', status: 'new', text: 'Keep this unrelated original message.', sender: 'Demo worker',
    date: now.toISOString(), completion: null, completionBasis: 'unclear', demo: true, origin: 'simulated' }];
  opener.seed.whatsappMessages = structuredClone(opener.whatsappMessages);
  let workspace = { schemaVersion: 2, activeProjectId: opener.id, projects: [opener] };
  const created = kind === 'claim-examples'
    ? { outcome: 'updated', project: createClaimExamplesDemo({ code: 'REUSE-CLAIMS' }, now) }
    : factory(workspace, now);
  if (!['updated', 'created'].includes(created.outcome)) throw new Error(created.error);
  const project = progressAndClaim(created.project, kind);
  workspace = { ...workspace, projects: [...workspace.projects, project] };
  let duplicate = null;
  if (duplicates) {
    const result = factory(workspace, now);
    if (!['updated', 'created'].includes(result.outcome)) throw new Error(result.error);
    duplicate = progressAndClaim(result.project, kind);
    workspace.projects.push(duplicate);
  }
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify(workspace));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  const activeId = activeExample ? duplicate?.id || project.id : opener.id;
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ ...loaded, activeProjectId: activeId }));
  loaded.projects.forEach(entry => ids.add(entry.id));
  writeFormBuffer(project.id, 'reuse-proof', { note: 'Keep this unfinished work.' });
  return { opener, project, duplicate };
}

async function switchTo(user, project) {
  await user.click(screen.getByRole('button', { name: `Project: ${selected().name}`, exact: true }));
  await user.click(screen.getByRole('option', { name: new RegExp(project.name) }));
  await waitFor(() => expect(stored().activeProjectId).toBe(project.id));
}

async function openExample(user, route, label) {
  if (route === 'drawing') {
    const summary = screen.getByText('Try another demo', { exact: true });
    if (!summary.closest('details').open) await user.click(summary);
    await user.click(screen.getByRole('button', { name: label, exact: true }));
  } else if (route === 'whatsapp') {
    const back = screen.queryByRole('button', { name: 'Back to messages', exact: true });
    if (back) await user.click(back);
    await user.click(screen.getByRole('button', { name: 'Demo options', exact: true }));
    await user.click(screen.getByRole('menuitem', { name: label, exact: true }));
  } else await user.click(screen.getByRole('button', { name: label, exact: true }));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup(); ids.forEach(clearProjectFormBuffers); ids.clear();
  vi.useRealTimers(); vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('demo actions reopen stored examples instead of multiplying projects', () => {
  it.each([
    ['drawing-progress', createDrawingProgressDemo, 'drawing', 'Try completion demo'],
    ['area-split', createAreaSplitDemo, 'drawing', 'Try area split demo'],
    ['area-alias', createAreaAliasDemo, 'drawing', 'Try area name demo'],
    ['message-match', createMessageMatchDemo, 'whatsapp', 'Try match review demo'],
    ['voice-note', createVoiceNoteDemo, 'whatsapp', 'Try voice-note demo'],
    ['claim-examples', null, 'claims', 'Try claim examples'],
  ])('reuses %s twice with progress, saved evidence, other projects and unfinished forms unchanged', async (kind, factory, route, label) => {
    const { opener, project } = setup(kind, factory);
    window.history.replaceState(null, '', `#${route}`);
    const view = render(<App />), user = userEvent.setup();
    const before = structuredClone(stored().projects);
    const original = before.find(entry => entry.id === project.id);
    const csv = exportsFor(original);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await openExample(user, route, label);
      await waitFor(() => expect(stored().activeProjectId).toBe(project.id));
      expect(stored().projects).toEqual(before);
      expect(exportsFor(selected())).toEqual(csv);
      expect(readFormBuffer(project.id, 'reuse-proof')).toEqual({ note: 'Keep this unfinished work.' });
      await switchTo(user, opener);
    }
    view.unmount(); render(<App />);
    expect(stored().projects).toEqual(before);
  });

  it.each([false, true])('retains legacy duplicate voice demos and reopens the selected or first stored one (active example: %s)', async activeExample => {
    const { project, duplicate } = setup('voice-note', createVoiceNoteDemo, { duplicates: true, activeExample });
    window.history.replaceState(null, '', '#whatsapp');
    render(<App />);
    const before = structuredClone(stored().projects), user = userEvent.setup();
    await openExample(user, 'whatsapp', 'Try voice-note demo');
    const expected = activeExample ? duplicate : project;
    await waitFor(() => expect(stored().activeProjectId).toBe(expected.id));
    expect(stored().projects).toEqual(before);
    expect(selected().reports).toEqual(before.find(entry => entry.id === expected.id).reports);
    expect(selected().claimDrafts).toEqual(before.find(entry => entry.id === expected.id).claimDrafts);
    expect(stored().projects.some(entry => entry.id === project.id)).toBe(true);
    expect(stored().projects.some(entry => entry.id === duplicate.id)).toBe(true);
  });
});
