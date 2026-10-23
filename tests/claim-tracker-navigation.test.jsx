import { chooseProjectOption } from './project-select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { markClaimPrepared, saveClaimDraft } from '../src/data/claims.ts';
import { getClaimTracking } from '../src/data/claim-tracking.ts';
import { buildClaimPack } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-21T10:00:00+08:00');
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const readWorkspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const draftParam = () => new URLSearchParams(location.hash.split('?')[1]).get('draft');
const financialRecords = (project) => Object.fromEntries(['claimDrafts', 'items', 'reports', 'voReviews', 'baselines', 'contract'].map((key) => [key, structuredClone(project[key])]));

function fixture() {
  let project = createSITContractDemo({ name: 'S.I.T. claim tracking demo', code: 'TRACK-SIT' }, now);
  let other = createSITContractDemo({ name: 'Other claim tracking project', code: 'TRACK-OTHER' }, now);
  project = markClaimPrepared(project, project.claimDrafts[0].id).project;
  const revision = saveClaimDraft(project, '2026-10', { ...project.claimDrafts[0].assessment, note: 'A separate saved revision for claim tracker navigation.' });
  if (revision.outcome !== 'updated') throw new Error('Expected a second saved claim revision.');
  const prepared = markClaimPrepared(revision.project, revision.draft.id);
  if (prepared.outcome !== 'updated') throw new Error(prepared.error);
  project = prepared.project;
  other = markClaimPrepared(other, other.claimDrafts[0].id).project;
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find((entry) => entry.id === project.id),
    other: loaded.projects.find((entry) => entry.id === other.id), draftId: prepared.draft.id };
}

function mount(hash) {
  window.history.replaceState(null, '', hash);
  return render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  clearProjectFormBuffers('TRACK-SIT');
  clearProjectFormBuffers('TRACK-OTHER');
  window.history.replaceState(null, '', '#projects');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn((query) => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('claim status navigation uses the selected project and exact saved revision', () => {
  it('connects the latest saved claim, tracker, exact preview and monthly claim list without saving again', async () => {
    const { project, draftId } = fixture();
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    const view = mount('#claims?tab=drafts');
    await user.click(screen.getByRole('button', { name: 'Track claim status' }));
    await screen.findByRole('heading', { name: 'Claim status' });
    expect(draftParam()).toBe(draftId);
    expect(screen.getByRole('region', { name: 'Claim status summary' }).textContent).toContain(draftId);
    expect(screen.getByText('October 2026 · Version 2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Preview saved claim' }));
    await screen.findByRole('heading', { name: 'Claim preview' });
    expect(draftParam()).toBe(draftId);
    expect(new URLSearchParams(location.hash.split('?')[1]).get('from')).toBe('status');
    expect(screen.getByRole('article', { name: 'October 2026 claim assessment revision 2' }).textContent).toContain(draftId);
    expect(screen.getByRole('button', { name: 'Track claim status' })).toBeTruthy();
    view.unmount();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Back to claim status' }));
    await screen.findByRole('heading', { name: 'Claim status' });
    expect(draftParam()).toBe(draftId);
    await user.click(screen.getAllByRole('button', { name: 'Back to monthly claims' })[0]);
    await screen.findByRole('heading', { name: 'Monthly claims' });
    expect(location.hash).toBe('#claims?tab=drafts');
    expect(readWorkspace().projects).toEqual(before);
    expect(readWorkspace().projects.find((entry) => entry.id === project.id).claimDrafts).toHaveLength(2);
  });

  it('records a mock submission and retains it after remount while snapshots and other projects stay unchanged', async () => {
    const { project, other, draftId } = fixture();
    const before = financialRecords(project);
    const originalPack = buildClaimPack(project, draftId);
    const user = userEvent.setup();
    const view = mount(`#claim-status?draft=${encodeURIComponent(draftId)}`);
    await user.type(screen.getByRole('textbox', { name: /Submission reference/ }), 'DEMO-SUB-NAV-002');
    await user.click(screen.getByRole('button', { name: 'Record submission', exact: true }));
    await screen.findByRole('heading', { name: 'Record certification' });
    const persisted = readWorkspace().projects.find((entry) => entry.id === project.id);
    expect(getClaimTracking(persisted, draftId).status).toBe('submitted');
    expect(getClaimTracking(persisted, draftId).submissionReference).toBe('DEMO-SUB-NAV-002');
    expect(financialRecords(persisted)).toEqual(before);
    expect(buildClaimPack(persisted, draftId)).toEqual(originalPack);
    expect(readWorkspace().projects.find((entry) => entry.id === other.id)).toEqual(other);
    view.unmount();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Record certification' })).toBeTruthy();
    expect(draftParam()).toBe(draftId);
    expect(screen.getByRole('spinbutton', { name: /Certified amount/ }).value).toBe('');
    await user.click(screen.getAllByRole('button', { name: 'Back to monthly claims' })[0]);
    await screen.findByRole('heading', { name: 'Monthly claims' });
    expect(document.querySelector('.claim-history-record .badge').textContent).toBe('Submitted · demo');
    expect(financialRecords(readWorkspace().projects.find((entry) => entry.id === project.id))).toEqual(before);
  });

  it('switches projects to their claim list and rejects foreign draft links without showing another claim', async () => {
    const { project, other, draftId } = fixture();
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    const view = mount(`#claim-status?draft=${encodeURIComponent(draftId)}`);
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}` }));
    await chooseProjectOption(user, other);
    await screen.findByRole('heading', { name: 'Monthly claims' });
    expect(location.hash).toBe('#claims');
    expect(readWorkspace().activeProjectId).toBe(other.id);
    view.unmount();
    mount(`#claim-status?draft=${encodeURIComponent(draftId)}`);
    expect(screen.getByRole('heading', { name: 'Claim tracking unavailable' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Claim status summary' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record submission', exact: true })).toBeNull();
    expect(readWorkspace().projects).toEqual(before);
  });

  it('clears the tracker return link when switching projects from its claim preview', async () => {
    const { project, other, draftId } = fixture();
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    mount(`#claim-status?draft=${encodeURIComponent(draftId)}`);
    await user.click(screen.getByRole('button', { name: 'Preview saved claim' }));
    await screen.findByRole('heading', { name: 'Claim preview' });
    expect(screen.getByRole('button', { name: 'Back to claim status' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}` }));
    await chooseProjectOption(user, other);
    await screen.findByRole('heading', { name: 'Monthly claims' });
    expect(location.hash).toBe('#claims');
    expect(screen.queryByRole('button', { name: 'Back to claim status' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Preview & export' }));
    await screen.findByRole('heading', { name: 'Claim preview' });
    expect(draftParam()).toBe(other.claimDrafts[0].id);
    expect(screen.getByRole('button', { name: 'Back to claims' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to claim status' })).toBeNull();
    expect(readWorkspace().projects).toEqual(before);
  });
});
