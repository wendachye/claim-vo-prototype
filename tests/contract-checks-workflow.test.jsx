import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { createContractRevision } from '../src/data/contract-versions.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

const now = new Date('2026-10-24T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => {
  const value = workspace();
  return value.projects.find(project => project.id === value.activeProjectId);
};
const checks = () => document.querySelector('#contract-checks');
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const frozenWorkflow = project => Object.fromEntries([
  'sourceItems', 'reports', 'voReviews', 'whatsappMessages', 'drawingMapping', 'claimDrafts', 'claimTracking', 'baselines',
].map(key => [key, structuredClone(project[key])]));

function fixture({ issues = true } = {}) {
  const original = createSITContractDemo({ name: 'S.I.T. contract checks demo', code: 'CHECKS-SIT' }, now);
  const revision = createContractRevision(original, 'QS reviews the current mock contract entries.', now);
  if (revision.outcome !== 'updated') throw new Error(revision.error);
  const project = revision.project;
  if (issues) {
    // These are already reviewed records. Completeness and calculation checks
    // must catch them independently of extraction flags or historic snapshots.
    project.items[0].quantity = null;
    project.items[0].amount = null;
    project.items[1].amount = 1;
  }
  const other = createSITContractDemo({ name: 'Other contract checks project', code: 'CHECKS-OTHER' }, now);
  for (const value of [project, other]) projectIds.add(value.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return {
    project: loaded.projects.find(entry => entry.id === project.id),
    other: loaded.projects.find(entry => entry.id === other.id),
  };
}

function mount() {
  window.history.replaceState(null, '', '#contract');
  return render(<App />);
}

async function expandChecks(user) {
  const summary = within(checks()).getByRole('button', { name: /^Contract checks/ });
  if (summary.getAttribute('aria-expanded') !== 'true') await user.click(summary);
  return within(checks());
}

async function openCheckedItem(user, id) {
  const panel = await expandChecks(user);
  await user.click(panel.getByRole('button', { name: `Review checks for ${id}`, exact: true }));
  await screen.findByRole('heading', { name: 'Contract review', exact: true });
  expect(params().get('item')).toBe(id);
  expect(screen.getByRole('combobox', { name: 'Choose contract item', exact: true }).getAttribute('data-value')).toBe(id);
}

async function switchProject(user, from, to) {
  await user.click(screen.getByRole('button', { name: `Project: ${from.name}`, exact: true }));
  await user.click(screen.getByRole('option', { name: new RegExp(to.name) }));
  await waitFor(() => expect(workspace().activeProjectId).toBe(to.id));
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('contract checks connect saved issues to source review before confirmation', () => {
  it('finds missing values and calculation differences, corrects exact items and confirms a partial S.I.T. schedule without changing saved claims', async () => {
    const { project, other } = fixture();
    const before = frozenWorkflow(project);
    const originalPacks = project.claimDrafts.map(draft => buildClaimPack(project, draft.id));
    const originalCSVs = originalPacks.map(result => toClaimCSV(result.pack));
    const pendingClaim = { note: 'Keep this unfinished monthly claim form.' };
    writeFormBuffer(project.id, 'contract-checks-existing-claim-form', pendingClaim);
    const user = userEvent.setup();
    mount();
    expect(within(checks()).getByText('Partial schedule', { exact: true })).toBeTruthy();
    const panel = await expandChecks(user);
    expect(panel.getByRole('button', { name: 'Review checks for WI-001', exact: true })).toBeTruthy();
    expect(panel.getByRole('button', { name: 'Review checks for WI-002', exact: true })).toBeTruthy();
    expect(panel.queryByRole('button', { name: 'Review checks for WI-017', exact: true })).toBeNull();
    expect(panel.queryByRole('button', { name: 'Review checks for WI-012', exact: true })).toBeNull();
    const reviewFilter = screen.getByRole('combobox', { name: 'Filter contract review status', exact: true });
    await user.click(reviewFilter);
    await user.click(await screen.findByRole('option', { name: 'Needs review (2)', exact: true }));
    const filteredRegister = within(document.querySelector('.contract-register'));
    expect(filteredRegister.getByRole('button', { name: 'Review WI-001', exact: true }).textContent).toContain('Needs review');
    expect(filteredRegister.getByRole('button', { name: 'Review WI-002', exact: true }).textContent).toContain('Needs review');
    expect(filteredRegister.queryByRole('button', { name: 'Review WI-003', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear filters', exact: true }));
    expect(reviewFilter.getAttribute('data-value')).toBe('all');
    expect(selectedProject().locked).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Review 2 items', exact: true }));
    expect(params().get('item')).toBe('WI-001');
    expect(screen.getByText('Check saved values', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Confirm work list', exact: true })).toBeNull();
    const quantity = screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true });
    expect(quantity.value).toBe('');
    await user.type(quantity, String(project.sourceItems[0].quantity));
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    expect(selectedProject().items[0].quantity).toBe(project.sourceItems[0].quantity);
    expect(selectedProject().items[0].amount).toBe(project.sourceItems[0].amount);
    await user.click(screen.getByRole('combobox', { name: 'Filter contract review status', exact: true }));
    expect(await screen.findByRole('option', { name: 'Needs review (1)', exact: true })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(within(document.querySelector('.contract-register')).getByRole('button', { name: 'Review WI-001', exact: true }).textContent).toContain('Reviewed');
    expect((await expandChecks(user)).queryByRole('button', { name: 'Review checks for WI-001', exact: true })).toBeNull();
    await openCheckedItem(user, 'WI-002');
    expect(screen.getByText('Check saved values', { exact: true })).toBeTruthy();
    // Saving the existing quantity and rate recomputes the incorrect row amount.
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    expect(selectedProject().items[1].amount).toBe(project.sourceItems[1].amount);
    await user.click(screen.getByRole('combobox', { name: 'Filter contract review status', exact: true }));
    expect(await screen.findByRole('option', { name: 'Needs review (0)', exact: true })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(within(checks()).getByText('No item issues', { exact: true })).toBeTruthy();
    expect(selectedProject().locked).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirm work list', exact: true }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm work list', exact: true });
    expect(dialog.textContent).toMatch(/Partial schedule/i);
    expect(selectedProject().locked).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Confirm work list', exact: true }));
    await waitFor(() => expect(selectedProject().locked).toBe(true));
    const saved = selectedProject();
    expect(saved.version).toBe(2);
    expect(frozenWorkflow(saved)).toEqual(before);
    saved.claimDrafts.forEach((draft, index) => {
      expect(buildClaimPack(saved, draft.id)).toEqual(originalPacks[index]);
      expect(toClaimCSV(buildClaimPack(saved, draft.id).pack)).toBe(originalCSVs[index]);
    });
    expect(readFormBuffer(project.id, 'contract-checks-existing-claim-form')).toEqual(pendingClaim);
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
  });

  it('keeps unfinished contract edits through check links and project changes without marking an issue resolved', async () => {
    const { project, other } = fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    await openCheckedItem(user, 'WI-001');
    const description = screen.getByRole('textbox', { name: 'Work description', exact: true });
    await user.clear(description);
    await user.type(description, 'Unfinished description for the first checked item.');
    await user.click(screen.getByRole('button', { name: 'Back to work items', exact: true }));
    await openCheckedItem(user, 'WI-002');
    expect(screen.getByRole('textbox', { name: 'Work description', exact: true }).value).toBe(project.items[1].description);
    await user.click(screen.getByRole('button', { name: 'Back to work items', exact: true }));
    await switchProject(user, project, other);
    expect(within(checks()).getByText('No item issues', { exact: true })).toBeTruthy();
    expect((await expandChecks(user)).queryByRole('button', { name: /^Review checks for/ })).toBeNull();
    await switchProject(user, other, project);
    await openCheckedItem(user, 'WI-001');
    expect(screen.getByRole('textbox', { name: 'Work description', exact: true }).value).toBe('Unfinished description for the first checked item.');
    expect(screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true }).value).toBe('');
    expect(workspace().projects).toEqual(before);
  });
});
