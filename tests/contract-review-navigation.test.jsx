import { chooseSelect } from './select-helpers.mjs';
import { chooseProjectOption } from './project-select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getWorkItemSiteMessage } from '../src/data/contract-work-links.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const value = workspace(); return value.projects.find(project => project.id === value.activeProjectId); };
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const picker = () => screen.getByRole('combobox', { name: 'Choose contract item', exact: true });
const editor = () => document.querySelector('.contract-item-editor');

function fixture({ pending = false, foreign = false, change = () => {} } = {}) {
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
  change(project);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id), other: loaded.projects.find(entry => entry.id === other.id) };
}

function mount(hash = '#contract') {
  window.history.replaceState(null, '', hash);
  return render(<App />);
}

const contractFilters = () => within(screen.getByRole('region', { name: 'Contract filters', exact: true }));

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
  it('keeps search and both filters visible above the five-column work list and applies them together immediately', async () => {
    const { project } = fixture();
    const before = workspace().projects;
    const frozenClaim = buildClaimPack(project, project.claimDrafts[0].id);
    const user = userEvent.setup();
    mount();
    const register = within(document.querySelector('.contract-register'));
    const headers = register.getAllByRole('columnheader').map(header => header.textContent);
    expect(headers).toHaveLength(5);
    expect(headers.join(' ')).toMatch(/Work item.*Quantity.*Rate.*Amount.*Review/);
    const filters = contractFilters();
    const search = filters.getByRole('textbox', { name: 'Search work items', exact: true });
    const location = filters.getByRole('combobox', { name: 'Filter by block', exact: true });
    const review = filters.getByRole('combobox', { name: 'Filter contract review status', exact: true });
    expect(location.getAttribute('data-value')).toBe('all');
    expect(review.getAttribute('data-value')).toBe('all');
    expect(screen.queryByRole('button', { name: /^Filter(?:\s*\(\d+\))?$/ })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Contract filters', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    expect(screen.queryByText(`${project.items.length} of ${project.items.length} work items`, { exact: true })).toBeNull();
    expect(document.querySelector('.table-footer').textContent).toContain(`of ${project.items.length} items`);
    expect(register.queryByRole('link', { name: /^View area/ })).toBeNull();
    expect(register.queryByRole('button', { name: /^Open site update for/ })).toBeNull();

    await chooseSelect(user, location, 'W5');
    await chooseSelect(user, review, 'verified');
    await user.type(search, 'ST5-1');
    expect(screen.getByText(`1 of ${project.items.length} work items`, { exact: true })).toBeTruthy();
    expect(register.queryByRole('button', { name: 'Review WI-001', exact: true })).toBeNull();
    expect(register.getAllByRole('button', { name: /^Review WI-/ })).toHaveLength(1);
    expect(register.getByRole('button', { name: 'Review WI-004', exact: true })).toBeTruthy();
    expect(location.getAttribute('data-value')).toBe('W5');
    expect(review.getAttribute('data-value')).toBe('verified');
    expect(screen.getByRole('button', { name: 'Clear all', exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(selectedProject(), project.claimDrafts[0].id)).toEqual(frozenClaim);
  });

  it('dismisses dropdown choices with Escape or an outside click while retaining selected filters', async () => {
    fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    const filters = contractFilters();
    const location = filters.getByRole('combobox', { name: 'Filter by block', exact: true });
    const review = filters.getByRole('combobox', { name: 'Filter contract review status', exact: true });
    const search = filters.getByRole('textbox', { name: 'Search work items', exact: true });
    await chooseSelect(user, location, 'W5');
    await chooseSelect(user, review, 'verified');
    await user.click(review);
    expect(await screen.findByRole('listbox')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(review);
    expect(review.getAttribute('data-value')).toBe('verified');
    await user.click(location);
    expect(await screen.findByRole('listbox')).toBeTruthy();
    // Radix temporarily hides the surrounding page while its Select is open.
    // Dispatch an outside pointer against the control captured before opening.
    fireEvent.pointerDown(search, { button: 0, pointerType: 'mouse' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(location.getAttribute('data-value')).toBe('W5');
    expect(review.getAttribute('data-value')).toBe('verified');
    const register = within(document.querySelector('.contract-register'));
    expect(register.queryByRole('button', { name: 'Review WI-001', exact: true })).toBeNull();
    expect(register.getByRole('button', { name: 'Review WI-004', exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });

  it('shows Clear all for active search or filters, resets all fields and focuses Search without changing frozen claims', async () => {
    const { project } = fixture();
    const before = workspace().projects;
    const frozenClaim = buildClaimPack(project, project.claimDrafts[0].id);
    const frozenCSV = toClaimCSV(frozenClaim.pack);
    const user = userEvent.setup();
    mount();
    const filters = contractFilters();
    const search = filters.getByRole('textbox', { name: 'Search work items', exact: true });
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    await user.type(search, 'Block');
    expect(screen.getByRole('button', { name: 'Clear all', exact: true })).toBeTruthy();
    await chooseSelect(user, filters.getByRole('combobox', { name: 'Filter by block', exact: true }), 'W5');
    await chooseSelect(user, filters.getByRole('combobox', { name: 'Filter contract review status', exact: true }), 'verified');
    await user.click(screen.getByRole('button', { name: 'Clear all', exact: true }));
    expect(search.value).toBe('');
    expect(filters.getByRole('combobox', { name: 'Filter by block', exact: true }).getAttribute('data-value')).toBe('all');
    expect(filters.getByRole('combobox', { name: 'Filter contract review status', exact: true }).getAttribute('data-value')).toBe('all');
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    expect(document.activeElement).toBe(search);
    expect(screen.queryByText(/^\d+ of \d+ work items$/)).toBeNull();
    expect(within(document.querySelector('.contract-register')).getByRole('button', { name: 'Review WI-001', exact: true })).toBeTruthy();
    await chooseSelect(user, filters.getByRole('combobox', { name: 'Filter by block', exact: true }), 'W5');
    expect(screen.getByRole('button', { name: 'Clear all', exact: true })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear all', exact: true }));
    expect(document.activeElement).toBe(search);
    expect(workspace().projects).toEqual(before);
    const saved = selectedProject();
    expect(buildClaimPack(saved, project.claimDrafts[0].id)).toEqual(frozenClaim);
    expect(toClaimCSV(buildClaimPack(saved, project.claimDrafts[0].id).pack)).toBe(frozenCSV);
  });

  it('keeps one clear action beside visible filters when no items match and restores the list without changing saved claims', async () => {
    const { project } = fixture();
    const before = workspace().projects;
    const frozenClaim = buildClaimPack(project, project.claimDrafts[0].id);
    const frozenCSV = toClaimCSV(frozenClaim.pack);
    const user = userEvent.setup();
    mount();
    const filters = contractFilters();
    const search = filters.getByRole('textbox', { name: 'Search work items', exact: true });
    await user.type(search, 'no-such-contract-work-item');
    expect(screen.getByRole('heading', { name: 'No matching items', exact: true })).toBeTruthy();
    expect(filters.getByRole('combobox', { name: 'Filter by block', exact: true })).toBeTruthy();
    expect(filters.getByRole('combobox', { name: 'Filter contract review status', exact: true })).toBeTruthy();
    expect(screen.getByText(`0 of ${project.items.length} work items`, { exact: true })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Clear all', exact: true })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Clear filters', exact: true })).toBeNull();
    expect(within(document.querySelector('.contract-register')).queryByRole('button', { name: /^Review WI-/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear all', exact: true }));
    expect(search.value).toBe('');
    expect(document.activeElement).toBe(search);
    expect(screen.queryByRole('heading', { name: 'No matching items', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    expect(within(document.querySelector('.contract-register')).getByRole('button', { name: 'Review WI-001', exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(selectedProject(), project.claimDrafts[0].id)).toEqual(frozenClaim);
    expect(toClaimCSV(buildClaimPack(selectedProject(), project.claimDrafts[0].id).pack)).toBe(frozenCSV);
  });

  it('resets the visible filter controls when switching projects without changing either project', async () => {
    const { project, other } = fixture();
    const before = workspace().projects;
    const frozenClaim = buildClaimPack(project, project.claimDrafts[0].id);
    const user = userEvent.setup();
    mount();
    const filters = contractFilters();
    await user.type(filters.getByRole('textbox', { name: 'Search work items', exact: true }), 'ST5');
    await chooseSelect(user, filters.getByRole('combobox', { name: 'Filter by block', exact: true }), 'W5');
    await chooseSelect(user, filters.getByRole('combobox', { name: 'Filter contract review status', exact: true }), 'verified');
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}`, exact: true }));
    await chooseProjectOption(user, other);
    expect(contractFilters().getByRole('textbox', { name: 'Search work items', exact: true }).value).toBe('');
    expect(contractFilters().getByRole('combobox', { name: 'Filter by block', exact: true }).getAttribute('data-value')).toBe('all');
    expect(contractFilters().getByRole('combobox', { name: 'Filter contract review status', exact: true }).getAttribute('data-value')).toBe('all');
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), project.claimDrafts[0].id)).toEqual(frozenClaim);
  });

  it('keeps unresolved items discoverable and clears unrelated filters without resolving items or changing claims', async () => {
    const { project } = fixture({ pending: true });
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    const filters = contractFilters();
    await user.type(filters.getByRole('textbox', { name: 'Search work items', exact: true }), 'ST5');
    await chooseSelect(user, filters.getByRole('combobox', { name: 'Filter by block', exact: true }), 'W5');
    await user.click(screen.getByRole('button', { name: 'Needs review (1)', exact: true }));
    const register = within(document.querySelector('.contract-register'));
    expect(register.getAllByRole('button', { name: /^Review WI-/ })).toHaveLength(1);
    expect(register.getByRole('button', { name: 'Review WI-001', exact: true }).textContent).toContain('Needs review');
    expect(filters.getByRole('textbox', { name: 'Search work items', exact: true }).value).toBe('');
    expect(filters.getByRole('combobox', { name: 'Filter by block', exact: true }).getAttribute('data-value')).toBe('all');
    expect(filters.getByRole('combobox', { name: 'Filter contract review status', exact: true }).getAttribute('data-value')).toBe('review');
    expect(selectedProject().items[0].needsReview).toBe(true);
    expect(selectedProject().claimDrafts).toEqual(project.claimDrafts);
    expect(workspace().projects).toEqual(before);
  });

  it('moves area and original-message links to the exact item review and keeps frozen claims unchanged', async () => {
    const { project } = fixture();
    const item = project.items[0];
    const area = getDrawingMapping(project).areas.find(entry => entry.workItemIds.includes(item.id));
    const message = getWorkItemSiteMessage(project, item.id);
    const before = workspace().projects;
    const frozenClaim = buildClaimPack(project, project.claimDrafts[0].id);
    const frozenCSV = toClaimCSV(frozenClaim.pack);
    const user = userEvent.setup();
    let view = mount();
    expect(screen.queryByRole('link', { name: `View area ${area.code} mapping`, exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: `Review ${item.id}`, exact: true }));
    const related = screen.getByRole('navigation', { name: 'Related site records', exact: true });
    const areaLink = within(related).getByRole('link', { name: `View area ${area.code} mapping`, exact: true });
    expect(areaLink.getAttribute('href')).toBe(`#drawing?area=${encodeURIComponent(area.id)}`);
    await user.click(areaLink);
    await screen.findByRole('heading', { name: 'Drawing & areas', exact: true });
    expect(params().get('area')).toBe(area.id);
    await user.click(screen.getByRole('button', { name: 'Back to contract', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    await user.click(screen.getByRole('button', { name: `Review ${item.id}`, exact: true }));
    await user.click(screen.getByRole('button', { name: `Open site update for ${item.ref}`, exact: true }));
    await screen.findByRole('heading', { name: 'WhatsApp messages', exact: true });
    expect(params().get('message')).toBe(message.id);
    expect(document.querySelector('.wa-review').textContent).toContain(message.text);
    view.unmount(); view = render(<App />);
    expect(params().get('message')).toBe(message.id);
    expect(document.querySelector('.wa-review').textContent).toContain(message.text);
    await user.click(screen.getByRole('button', { name: 'Contract', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    expect(workspace().projects).toEqual(before);
    const persisted = workspace().projects.find(entry => entry.id === project.id);
    expect(buildClaimPack(persisted, project.claimDrafts[0].id)).toEqual(frozenClaim);
    expect(toClaimCSV(buildClaimPack(persisted, project.claimDrafts[0].id).pack)).toBe(frozenCSV);
  });

  it('compares immutable source values with the saved work-list values in a confirmed item without enabling edits', () => {
    const { project } = fixture({ change(value) {
      Object.assign(value.items[0], { quantity: 2200, rate: 14.5, amount: 31900 });
    } });
    const before = workspace().projects;
    mount('#contract?item=WI-001');
    const comparison = within(screen.getByRole('table', { name: 'Contract value comparison', exact: true }));
    expect(comparison.getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Value', 'From contract', 'Work-list value']);
    const row = label => within(comparison.getByRole('rowheader', { name: new RegExp(`^${label}`) }).closest('tr'));
    const values = label => row(label).getAllByRole('cell').map(cell => cell.textContent);
    expect(values('Quantity')[0]).toContain('2,088 m²');
    expect(values('Quantity')[1]).toContain('2,200 m²');
    expect(values('Unit rate')).toEqual(['S$ 13.50', 'S$ 14.50']);
    expect(values('Line amount')[0]).toContain('S$ 28,188.00');
    expect(values('Line amount')[1]).toContain('S$ 31,900.00');
    expect(screen.queryByRole('spinbutton', { name: 'Contract quantity', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm item', exact: true })).toBeNull();
    expect(within(editor()).getAllByText('Contract confirmed', { exact: true })).toHaveLength(1);
    expect(editor().querySelector('.editor-footer').textContent).not.toContain(project.items[0].ref);
    expect(workspace().projects).toEqual(before);
    expect(project.sourceItems[0].quantity).toBe(2088);
  });

  it('keeps confirmed checks in Contract actions, closes with focus restored and never carries their project into another workspace', async () => {
    const { project, other } = fixture();
    const before = workspace().projects;
    const frozenClaim = buildClaimPack(project, project.claimDrafts[0].id);
    const unfinished = { note: 'Preserve the existing unfinished claim assessment.' };
    writeFormBuffer(project.id, 'compact-checks-existing-claim', unfinished);
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole('region', { name: 'Contract checks', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Contract checks:/ })).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Contract actions', exact: true });
    const openDetails = async () => {
      await user.click(screen.getByRole('button', { name: 'Contract actions', exact: true }));
      await user.click(screen.getByRole('menuitem', { name: 'Contract checks', exact: true }));
      return within(await screen.findByRole('dialog', { name: 'Contract checks', exact: true }));
    };
    const details = await openDetails();
    expect(details.getByText(new RegExp(project.code))).toBeTruthy();
    expect(details.getByText('Partial schedule', { exact: true })).toBeTruthy();
    expect(details.getByText('Selected work total', { exact: true })).toBeTruthy();
    expect(details.getByText('Current values; confirmed baseline unchanged.')).toBeTruthy();
    expect(details.queryByRole('button', { name: /^Contract checks:/ })).toBeNull();
    expect(details.queryByRole('button', { name: /Save reason|Review total difference|Confirm/ })).toBeNull();
    expect(details.queryByRole('textbox')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Contract checks', exact: true })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}`, exact: true }));
    await chooseProjectOption(user, other);
    expect(screen.queryByRole('dialog', { name: 'Contract checks', exact: true })).toBeNull();
    const otherDetails = await openDetails();
    expect(otherDetails.getByText(new RegExp(other.code))).toBeTruthy();
    expect(otherDetails.queryByText(new RegExp(project.code))).toBeNull();
    await user.keyboard('{Escape}');
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), project.claimDrafts[0].id)).toEqual(frozenClaim);
    expect(readFormBuffer(project.id, 'compact-checks-existing-claim')).toEqual(unfinished);
  });

  it('keeps tools and pending notifications reachable without a cross-module continuation shortcut', async () => {
    const { project } = fixture();
    const frozenClaim = buildClaimPack(project, project.claimDrafts[0].id);
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole('button', { name: 'Continue to site updates', exact: true })).toBeNull();
    const queue = getProjectAttention(project);
    await user.click(screen.getByRole('button', { name: `Needs attention, ${queue.length} pending tasks`, exact: true }));
    expect(screen.getByRole('dialog', { name: 'Project notifications', exact: true })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Export CSV', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Contract actions', exact: true }));
    expect(screen.getByRole('menuitem', { name: 'Export CSV', exact: true })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Contract versions', exact: true })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Edit contract', exact: true })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(workspace().projects).toEqual(before);
    expect(getProjectAttention(selectedProject())).toEqual(queue);
    expect(buildClaimPack(selectedProject(), project.claimDrafts[0].id)).toEqual(frozenClaim);
    await user.click(screen.getByRole('button', { name: 'Site updates', exact: true }));
    await screen.findByRole('heading', { name: 'WhatsApp messages', exact: true });
    expect(workspace().projects).toEqual(before);
  });

  it('opens the exact list item and changes the selected item without changing saved records', async () => {
    const { project } = fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Review WI-002', exact: true }));
    await screen.findByRole('heading', { name: 'Contract review', exact: true });
    expect(params().get('item')).toBe('WI-002');
    expect(picker().getAttribute('data-value')).toBe('WI-002');
    expect(within(editor()).getByRole('heading', { name: project.items[1].description })).toBeTruthy();
    await chooseSelect(user, picker(), 'WI-007');
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
    await chooseSelect(user, picker(), 'WI-002');
    await chooseSelect(user, picker(), 'WI-001');
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
    expect(screen.queryByRole('button', { name: 'Continue to site updates', exact: true })).toBeNull();
    expect(screen.getByText('Work list confirmed.', { exact: true })).toBeTruthy();
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
    await chooseSelect(user, picker(), rateOnly.id);
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
    expect(picker().getAttribute('data-value')).toBe('');
    await user.click(picker());
    expect(screen.queryByRole('option', { name: /Work belonging only to the other project/ })).toBeNull();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');
    expect(document.querySelector('.contract-item-editor')).toBeNull();
    expect(screen.queryByText('Work belonging only to the other project')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show work items', exact: true }));
    expect(location.hash).toBe('#contract');
    expect(workspace().projects).toEqual(before);
  });
});
