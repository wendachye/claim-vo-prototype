import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { chooseProjectOption } from './project-select-helpers.mjs';
import { createProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { getVOCases } from '../src/data/vo.ts';
import { markClaimPrepared } from '../src/data/claims.ts';
import { recordClaimStage } from '../src/data/claim-tracking.ts';
import { buildClaimPack } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const claimPanel = () => screen.getByRole('region', { name: 'Recent claims', exact: true });
const card = name => screen.getByRole('article', { name, exact: true });
const amount = value => value.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function updated(result) {
  if (result.outcome !== 'updated') throw new Error(result.error || `Expected updated, received ${result.outcome}`);
  return result.project;
}

function fixture(change = value => value) {
  const project = change(createSITContractDemo({ name: 'S.I.T. dashboard demo', code: 'DASHBOARD-SIT' }, now));
  const other = createProject({ name: 'Empty dashboard project', code: 'DASHBOARD-EMPTY' });
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

describe('selected-project dashboard record links', () => {
  it('opens Dashboard by default and keeps it available from its sidebar module and direct link', async () => {
    fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    let view = mount('');
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    expect(location.hash).toBe('#dashboard');
    expect(screen.getByRole('button', { name: 'Dashboard', exact: true }).getAttribute('aria-current')).toBe('page');
    expect(claimPanel()).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(card('Extra work to review')).toBeTruthy();
    expect(card('Claim-eligible extra work')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Recent activity', exact: true })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Project modules', exact: true })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Project dashboard summary', exact: true })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Project workflow', exact: true })).toBeNull();
    view.unmount(); view = render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    expect(claimPanel()).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Extra work', exact: true })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Project dashboard summary', exact: true })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Project workflow', exact: true })).toBeNull();
    expect(workspace().projects).toEqual(before);
    expect(screen.queryByRole('button', { name: 'Overview', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Project overview', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Contract', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    await user.click(screen.getByRole('button', { name: 'Dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    expect(workspace().projects).toEqual(before);
  });

  it('opens a saved claim from recent claims and a flagged VO from notifications, preserving exact evidence through reload and return', async () => {
    const { project } = fixture(value => {
      value.whatsappMessages.filter(message => message.status === 'new').slice(0, 3).forEach((message, index) => {
        message.date = `2026-10-22T01:59:${59 - index}.000Z`;
      });
      return value;
    });
    const draft = project.claimDrafts[0];
    const extra = getVOCases(project).find(entry => entry.status === 'flagged');
    const task = getProjectAttention(project).find(entry => entry.target.caseId === extra.id);
    expect(task).toBeTruthy();
    const before = workspace().projects;
    const pack = buildClaimPack(project, draft.id);
    const user = userEvent.setup();
    let view = mount();
    await user.click(within(claimPanel()).getByRole('button', { name: /Open October 2026 claim, version 1, Draft/ }));
    await screen.findByRole('heading', { name: 'Claim preview', exact: true });
    expect(params().get('draft')).toBe(draft.id);
    expect(params().get('from')).toBe('dashboard');
    expect(document.querySelector('.claim-pack-document').textContent).toContain(draft.id);
    view.unmount(); view = render(<App />);
    expect(document.querySelector('.claim-pack-document').textContent).toContain(draft.id);
    await backToDashboard(user);

    await user.click(screen.getByRole('button', { name: /^Needs attention, \d+ pending tasks$/ }));
    const notifications = await screen.findByRole('dialog', { name: 'Project notifications' });
    const queue = within(notifications).getByRole('region', { name: 'Needs attention', exact: true });
    const expand = within(notifications).queryByRole('button', { name: /^View all/ });
    if (expand) await user.click(expand);
    await user.click(within(queue).getByRole('button', { name: `${task.actionLabel}: ${task.reference || task.title}`, exact: true }));
    await screen.findByRole('heading', { name: extra.title, exact: true });
    expect(params().get('case')).toBe(extra.id);
    expect(params().get('from')).toBe('dashboard');
    expect(document.querySelector('.vo-detail').textContent).toContain(extra.report.message);
    view.unmount(); render(<App />);
    expect(document.querySelector('.vo-detail').textContent).toContain(extra.report.message);
    await backToDashboard(user);
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), draft.id)).toEqual(pack);
  });

  it('keeps the saved amount and part-paid label in recent claims and opens the exact detailed certification and payment status', async () => {
    const { project } = fixture(value => {
      const id = value.claimDrafts[0].id;
      let result = updated(markClaimPrepared(value, id));
      result = updated(recordClaimStage(result, id, 'submitted', { date: '2026-10-22', reference: 'DASHBOARD-SUBMIT' }));
      result = updated(recordClaimStage(result, id, 'certified', { date: '2026-10-22', reference: 'DASHBOARD-CERT', value: 2000, note: 'Mock reduced certification for dashboard comparison.' }));
      return updated(recordClaimStage(result, id, 'payment', { date: '2026-10-22', reference: 'DASHBOARD-PAY', value: 500 }));
    });
    const draft = project.claimDrafts[0];
    const before = workspace().projects;
    const pack = buildClaimPack(project, draft.id);
    const user = userEvent.setup();
    let view = mount();
    const panel = claimPanel();
    expect(panel.textContent).toContain(`SGD ${amount(draft.snapshot.totals.currentValue)}`);
    expect(panel.textContent).toContain('Part paid');
    expect(panel.textContent).not.toContain('2,000.00');
    expect(panel.textContent).not.toContain('500.00');
    await user.click(within(panel).getByRole('button', { name: 'Open October 2026 claim, version 1, Part paid', exact: true }));
    await screen.findByRole('heading', { name: 'Record payment', exact: true });
    expect(params().get('draft')).toBe(draft.id);
    expect(params().get('from')).toBe('dashboard');
    const statusSummary = screen.getByRole('region', { name: 'Claim status summary', exact: true });
    expect(statusSummary.textContent).toContain('Certified amountSGD 2,000.00');
    expect(statusSummary.textContent).toContain('Total paid to dateSGD 500.00');
    view.unmount(); render(<App />);
    expect(screen.getByRole('heading', { name: 'Record payment', exact: true })).toBeTruthy();
    await backToDashboard(user);
    expect(claimPanel().textContent).toContain(`SGD ${amount(draft.snapshot.totals.currentValue)}`);
    expect(claimPanel().textContent).toContain('Part paid');
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), draft.id)).toEqual(pack);
  });

  it('opens all claims and the extra-work module from the summary cards without altering dashboard records', async () => {
    fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'View all monthly claims', exact: true }));
    await screen.findByRole('heading', { name: 'Monthly claims', exact: true });
    expect(location.hash.split('?')[0]).toBe('#claims');
    await user.click(screen.getByRole('button', { name: 'Dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    await user.click(within(card('Extra work to review')).getByRole('button', { name: 'Review extra work', exact: true }));
    await screen.findByRole('heading', { name: 'Extra work (VO)', exact: true });
    expect(location.hash.split('?')[0]).toBe('#vo');
    await user.click(screen.getByRole('button', { name: 'Dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    await user.click(within(card('Claim-eligible extra work')).getByRole('button', { name: 'View claim-eligible extra work', exact: true }));
    await screen.findByRole('heading', { name: 'Extra work (VO)', exact: true });
    expect(location.hash.split('?')[0]).toBe('#vo');
    expect(workspace().projects).toEqual(before);
  });

  it('switches dashboard summaries with the project and gives an empty project truthful next actions without losing saved records', async () => {
    const { project, other } = fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    expect(within(claimPanel()).getByRole('button', { name: /Open October 2026 claim/ })).toBeTruthy();
    expect(within(card('Extra work to review')).getByText('1', { exact: true })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}`, exact: true }));
    await chooseProjectOption(user, other);
    await waitFor(() => expect(workspace().activeProjectId).toBe(other.id));
    expect(location.hash).toBe('#dashboard');
    expect(screen.getByRole('button', { name: 'Dashboard', exact: true }).getAttribute('aria-current')).toBe('page');
    expect(claimPanel().textContent).toContain('No saved claims yet');
    expect(within(card('Extra work to review')).getByText('0', { exact: true })).toBeTruthy();
    expect(card('Claim-eligible extra work').textContent).toContain('0.00');
    expect(within(claimPanel()).queryByRole('button', { name: /Open October 2026 claim/ })).toBeNull();
    expect(within(card('Latest claim')).queryByRole('button', { name: /^Open latest claim:/ })).toBeNull();
    await user.click(within(card('Latest claim')).getByRole('button', { name: 'Open monthly claims', exact: true }));
    await screen.findByRole('heading', { name: 'Monthly claims', exact: true });
    expect(workspace().projects).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    await user.click(screen.getByRole('button', { name: `Project: ${other.name}`, exact: true }));
    await chooseProjectOption(user, project);
    await waitFor(() => expect(workspace().activeProjectId).toBe(project.id));
    expect(within(claimPanel()).getByRole('button', { name: /Open October 2026 claim/ })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });
});
