import { chooseProjectOption } from './project-select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { createProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getVOCases } from '../src/data/vo.ts';
import { markClaimPrepared } from '../src/data/claims.ts';
import { buildClaimPack } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const params = () => new URLSearchParams(location.hash.split('?')[1]);
function updated(result) {
  if (result.outcome !== 'updated') throw new Error(result.error || `Expected updated, received ${result.outcome}`);
  return result.project;
}

function fixture({ change = project => project, emptyOther = false } = {}) {
  const project = change(createSITContractDemo({ name: 'S.I.T. overview demo', code: 'OVERVIEW-SIT' }, now));
  const other = emptyOther ? createProject({ name: 'Empty overview project', code: 'OVERVIEW-EMPTY' })
    : createSITContractDemo({ name: 'Other overview project', code: 'OVERVIEW-OTHER' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id), other: loaded.projects.find(entry => entry.id === other.id) };
}

function mount(hash = '#dashboard') {
  window.history.replaceState(null, '', hash);
  return render(<App />);
}

async function backToDashboard(user) {
  await user.click(screen.getByRole('button', { name: 'Back to dashboard', exact: true }));
  await screen.findByRole('heading', { name: 'Dashboard', exact: true });
  expect(location.hash).toBe('#dashboard');
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});

afterEach(() => {
  cleanup();
  for (const id of projectIds) clearProjectFormBuffers(id);
  projectIds.clear();
  vi.useRealTimers(); vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('removed Overview links return to Dashboard without changing saved project records', () => {
  it.each(['', '#unknown', '#projects', '#overview', '#projects?manage=0'])('makes Dashboard the default for %s', async hash => {
    const { project } = fixture();
    const before = workspace().projects;
    const frozen = buildClaimPack(project, project.claimDrafts[0].id);
    const view = mount(hash);
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    expect(location.hash).toBe('#dashboard');
    expect(screen.queryByRole('button', { name: 'Overview', exact: true })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Project overview', exact: true })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Other tasks', exact: true })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Recent activity', exact: true })).toBeNull();
    view.unmount(); render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), project.claimDrafts[0].id)).toEqual(frozen);
  });

  it('keeps All projects reachable and opens the showcase Dashboard without changing its data', async () => {
    fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount('#projects?manage=1');
    await screen.findByRole('heading', { name: 'All projects', exact: true });
    await user.click(screen.getByRole('button', { name: 'Back to dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    await user.click(screen.getByRole('button', { name: 'All projects', exact: true }));
    await screen.findByRole('heading', { name: 'All projects', exact: true });
    expect(location.hash).toBe('#projects?manage=1');
    await user.click(screen.getByRole('button', { name: 'Open showcase', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    expect(location.hash).toBe('#dashboard');
    expect(workspace().projects).toEqual(before);
  });

  it.each(['contract', 'whatsapp', 'completion', 'vo', 'claims', 'claim-preview', 'claim-status'])('preserves the exact legacy %s record and returns to Dashboard across reload', async route => {
    const { project } = fixture({ change: value => route === 'claim-status' ? updated(markClaimPrepared(value, value.claimDrafts[0].id)) : value });
    const message = project.whatsappMessages.find(entry => entry.status === 'new');
    const report = project.reports.find(entry => !entry.vo && entry.status === 'verified');
    const extra = getVOCases(project).find(entry => entry.status === 'approved');
    const draft = project.claimDrafts[0];
    const target = route === 'contract' ? { item: project.items[0].id }
      : route === 'whatsapp' ? { message: message.id }
      : route === 'completion' ? { report: report.id, item: report.itemId }
      : route === 'vo' ? { case: extra.id }
      : { draft: draft.id };
    const before = workspace().projects;
    const frozen = buildClaimPack(project, draft.id);
    const user = userEvent.setup();
    let view = mount(`#${route}?${new URLSearchParams({ ...target, from: 'overview' })}`);
    await waitFor(() => expect(params().get('from')).toBe('dashboard'));
    for (const [key, value] of Object.entries(target)) expect(params().get(key)).toBe(value);
    expect(screen.queryByRole('button', { name: 'Back to overview', exact: true })).toBeNull();
    const assertRecord = () => {
      if (route === 'contract') expect(screen.getByRole('heading', { name: project.items[0].description, exact: true })).toBeTruthy();
      else if (route === 'whatsapp') expect(document.querySelector('.wa-review').textContent).toContain(message.text);
      else if (route === 'completion') expect(screen.getByRole('dialog').textContent).toContain(report.message);
      else if (route === 'vo') expect(document.querySelector('.vo-detail').textContent).toContain(extra.report.message);
      else if (route === 'claim-preview') expect(document.querySelector('.claim-pack-document').textContent).toContain(draft.id);
      else if (route === 'claims') expect(screen.getByRole('heading', { name: /Prepare a monthly claim/ })).toBeTruthy();
      else expect(screen.getByRole('heading', { name: 'Claim status', exact: true })).toBeTruthy();
    };
    assertRecord();
    view.unmount(); view = render(<App />);
    assertRecord();
    expect(params().get('from')).toBe('dashboard');
    for (const [key, value] of Object.entries(target)) expect(params().get(key)).toBe(value);
    if (route === 'completion') {
      await user.click(screen.getByRole('button', { name: 'Close site report', exact: true }));
      await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    } else await backToDashboard(user);
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), draft.id)).toEqual(frozen);
  });

  it('clears old record context when switching projects and does not show a foreign report', async () => {
    const { project, other } = fixture();
    const report = project.reports.find(entry => !entry.vo && entry.status === 'verified');
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(`#completion?${new URLSearchParams({ item: report.itemId, report: report.id, from: 'overview' })}`);
    await user.click(screen.getByRole('button', { name: 'Close site report', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}`, exact: true }));
    await chooseProjectOption(user, other);
    expect(location.hash).toBe('#dashboard');
    expect(workspace().activeProjectId).toBe(other.id);
    expect(screen.queryByText(report.message)).toBeNull();
    expect(workspace().projects).toEqual(before);
  });

  it('redirects legacy Overview links during navigation while preserving a deep-linked original message', async () => {
    const { project } = fixture();
    const message = project.whatsappMessages.find(entry => entry.status === 'new');
    const before = workspace().projects;
    const user = userEvent.setup();
    mount('#contract');
    const changeHash = hash => act(() => {
      window.history.replaceState(null, '', hash);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    changeHash('#overview');
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    expect(location.hash).toBe('#dashboard');
    changeHash(`#whatsapp?${new URLSearchParams({ message: message.id, from: 'overview' })}`);
    await screen.findByRole('heading', { name: 'WhatsApp messages', exact: true });
    expect(params().get('message')).toBe(message.id);
    expect(params().get('from')).toBe('dashboard');
    expect(document.querySelector('.wa-review').textContent).toContain(message.text);
    await backToDashboard(user);
    expect(workspace().projects).toEqual(before);
  });
});
