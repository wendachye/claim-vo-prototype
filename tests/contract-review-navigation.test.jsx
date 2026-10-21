import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.jsx';
import { WORKSPACE_STORE } from '../src/data/projects.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.js';
import { clearProjectFormBuffers } from '../src/data/form-buffer.js';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const value = workspace(); return value.projects.find(project => project.id === value.activeProjectId); };
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const picker = () => screen.getByRole('combobox', { name: 'Choose contract item', exact: true });
const editor = () => document.querySelector('.contract-item-editor');

function fixture({ pending = false, foreign = false } = {}) {
  const project = createSITContractDemo({ name: 'S.I.T. contract review demo', code: 'CONTRACT-REVIEW' }, now);
  const other = createSITContractDemo({ name: 'Other contract review project', code: 'CONTRACT-OTHER' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  if (pending) {
    project.locked = false;
    const first = project.items[0];
    first.needsReview = true;
    first.rawExtractedQuantity = 2880;
  }
  if (foreign) {
    const item = { ...structuredClone(other.items[0]), id: 'OTHER-ONLY-ITEM', ref: 'FOREIGN / 01', description: 'Work belonging only to the other project' };
    other.items.push(item);
    other.sourceItems.push(structuredClone(item));
  }
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id), other: loaded.projects.find(entry => entry.id === other.id) };
}

function mount(hash = '#contract') {
  window.history.replaceState(null, '', hash);
  return render(<App />);
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

describe('contract work list and source review stay connected', () => {
  it('opens the exact list item and changes the selected item without changing saved records', async () => {
    const { project } = fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Review WI-002', exact: true }));
    await screen.findByRole('heading', { name: 'Contract review', exact: true });
    expect(params().get('item')).toBe('WI-002');
    expect(picker().value).toBe('WI-002');
    expect(within(editor()).getByRole('heading', { name: project.items[1].description })).toBeTruthy();
    await user.selectOptions(picker(), 'WI-007');
    await waitFor(() => expect(params().get('item')).toBe('WI-007'));
    expect(within(editor()).getByRole('heading', { name: project.items.find(item => item.id === 'WI-007').description })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to work items', exact: true }));
    expect(location.hash).toBe('#contract');
    expect(workspace().projects).toEqual(before);
  });

  it('retains an unconfirmed source correction through panel and item changes without saving it', async () => {
    const { project } = fixture({ pending: true });
    const before = workspace().projects;
    const user = userEvent.setup();
    mount('#contract?item=WI-001');
    expect(screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true }).value).toBe('2880');
    await user.click(screen.getByRole('button', { name: /^Use source value:/ }));
    expect(screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true }).value).toBe('2088');
    await user.click(screen.getByRole('button', { name: 'Source document', exact: true }));
    expect(document.querySelector('.contract-comparison').getAttribute('data-panel')).toBe('source');
    expect(screen.getByRole('region', { name: 'Contract source document', exact: true }).textContent).toContain(project.items[0].ref);
    await user.click(screen.getByRole('button', { name: 'Work item', exact: true }));
    await user.selectOptions(picker(), 'WI-002');
    await user.selectOptions(picker(), 'WI-001');
    expect(screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true }).value).toBe('2088');
    await user.click(screen.getByRole('button', { name: 'Back to work items', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Review WI-001', exact: true }));
    expect(screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true }).value).toBe('2088');
    expect(selectedProject().items[0].needsReview).toBe(true);
    expect(workspace().projects).toEqual(before);
  });

  it('checks a mismatch only after explicit item confirmation and confirms the work list separately', async () => {
    const { project, other } = fixture({ pending: true });
    const unchanged = Object.fromEntries(['sourceItems', 'reports', 'voReviews', 'claimDrafts', 'baselines'].map(key => [key, structuredClone(project[key])]));
    const user = userEvent.setup();
    mount('#contract?item=WI-001');
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    expect(screen.getByText('The quantity and rate still do not reconcile with the source amount.')).toBeTruthy();
    expect(selectedProject().items[0].needsReview).toBe(true);
    await user.click(screen.getByRole('button', { name: /^Use source value:/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    expect(selectedProject().items[0].quantity).toBe(2088);
    expect(selectedProject().items[0].rawExtractedQuantity).toBeUndefined();
    expect(selectedProject().items[0].needsReview).toBe(false);
    expect(selectedProject().locked).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirm work list', exact: true }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm work list', exact: true });
    expect(selectedProject().locked).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Confirm work list', exact: true }));
    expect(selectedProject().locked).toBe(true);
    expect(screen.getByRole('button', { name: 'Continue to site updates', exact: true })).toBeTruthy();
    for (const [key, value] of Object.entries(unchanged)) expect(selectedProject()[key]).toEqual(value);
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
  });

  it('keeps a confirmed contract read-only and distinguishes Included scope from Rate-only work', async () => {
    const { project } = fixture();
    const before = workspace().projects;
    const included = project.items.find(item => item.pricingType === 'included');
    const rateOnly = project.items.find(item => item.pricingType === 'rateOnly');
    const user = userEvent.setup();
    mount(`#contract?item=${included.id}`);
    expect(screen.queryByRole('spinbutton', { name: 'Contract quantity', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm item', exact: true })).toBeNull();
    expect(editor().textContent).toContain('Included in other rates. No separate charge.');
    expect(screen.getByRole('img', { name: /Original contract schedule/ }).getAttribute('alt')).toContain(included.ref);
    await user.selectOptions(picker(), rateOnly.id);
    expect(editor().textContent).toContain('Rate only');
    expect(editor().textContent).toContain('Rate-reference quantity; not actual hours.');
    expect(editor().textContent).not.toContain('S$ 0.00');
    expect(screen.getByRole('img', { name: /Original contract schedule/ }).getAttribute('alt')).toContain(rateOnly.ref);
    expect(workspace().projects).toEqual(before);
  });

  it('shows an unavailable state for another project’s item instead of opening an unrelated source comparison', async () => {
    fixture({ foreign: true });
    const before = workspace().projects;
    const user = userEvent.setup();
    mount('#contract?item=OTHER-ONLY-ITEM');
    expect(screen.getByText('This contract item is not available in the selected project.')).toBeTruthy();
    expect(picker().value).toBe('');
    expect(within(picker()).queryByRole('option', { name: /Work belonging only to the other project/ })).toBeNull();
    expect(document.querySelector('.contract-item-editor')).toBeNull();
    expect(screen.queryByText('Work belonging only to the other project')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show work items', exact: true }));
    expect(location.hash).toBe('#contract');
    expect(workspace().projects).toEqual(before);
  });
});
