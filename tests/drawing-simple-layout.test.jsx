import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { chooseDrawingArea } from './drawing-select-helpers.mjs';
import { chooseProjectOption } from './project-select-helpers.mjs';

const now = new Date('2026-10-26T10:00:00+08:00');
const ids = new Set();
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const picker = () => screen.getByRole('button', { name: 'Choose site area', exact: true });
const summary = area => screen.getByRole('region', { name: `Area ${area.code} completion`, exact: true });
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const quantityValue = (row, label) => within(row).getByText(label, { exact: true }).nextElementSibling.textContent;

function fixture(change = () => {}) {
  const project = createSITContractDemo({ name: 'Drawing layout demo', code: 'DRAW-SIMPLE' }, now);
  const other = createSITContractDemo({ name: 'Other drawing layout', code: 'DRAW-OTHER' }, now);
  change(project);
  ids.add(project.id); ids.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id, projects: [project, other],
    sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id), other: loaded.projects.find(entry => entry.id === other.id) };
}
function mount(area) {
  window.history.replaceState(null, '', `#drawing${area ? `?area=${encodeURIComponent(area.id)}` : ''}`);
  return render(<App />);
}
function frozen(project) {
  const pack = buildClaimPack(project, project.claimDrafts[0].id);
  return { pack, csv: toClaimCSV(pack.pack) };
}
function expectUntouched(before, project, saved) {
  expect(workspace().projects).toEqual(before);
  expect(frozen(workspace().projects.find(entry => entry.id === project.id))).toEqual(saved);
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup(); for (const id of ids) clearProjectFormBuffers(id); ids.clear();
  vi.useRealTimers(); vi.unstubAllGlobals();
  window.history.replaceState(null, '', '#dashboard');
});

describe('simple drawing and area layout', () => {
  it('searches an unplaced area and shows its existing contract and allocated quantities without changing records or saved claims', async () => {
    const { project } = fixture();
    const area = getDrawingMapping(project).areas.find(entry => entry.code === 'BRACKET-A');
    expect(area).toBeTruthy();
    const before = workspace().projects, saved = frozen(project);
    const user = userEvent.setup(); mount();
    expect(screen.queryByText(/^Browse all/)).toBeNull();
    await user.click(picker());
    const search = screen.getByRole('combobox', { name: 'Search site areas', exact: true });
    await user.type(search, 'bracket-a');
    const options = within(screen.getByRole('listbox', { name: 'Site areas', exact: true })).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].getAttribute('data-value')).toBe(area.id);
    expect(options[0].textContent).toMatch(/Pin not placed/i);
    await user.click(options[0]);
    await waitFor(() => expect(params().get('area')).toBe(area.id));
    expect(picker().getAttribute('data-value')).toBe(area.id);
    const row = within(summary(area)).getByRole('button', { name: 'View contract item D.5', exact: true }).closest('li');
    expect(quantityValue(row, 'Contract quantity')).toBe('180 pc');
    expect(quantityValue(row, 'Quantity in this area')).toBe('90 pc');
    expectUntouched(before, project, saved);
  });

  it('keeps empty area searches read-only, closes with Escape and synchronizes pin selection with area details', async () => {
    const { project } = fixture();
    const [first, second] = getDrawingMapping(project).areas.filter(entry => entry.position);
    const before = workspace().projects, saved = frozen(project);
    const user = userEvent.setup(); mount(first);
    fireEvent.load(document.querySelector('.drawing-image-stage > img'));
    const trigger = picker();
    await user.click(trigger);
    const search = screen.getByRole('combobox', { name: 'Search site areas', exact: true });
    await user.type(search, 'does-not-exist');
    expect(within(screen.getByRole('listbox', { name: 'Site areas', exact: true })).queryAllByRole('option')).toHaveLength(0);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose site area', exact: true })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(picker().getAttribute('data-value')).toBe(first.id);
    await user.click(screen.getByRole('button', { name: name => name.startsWith(`Select area ${second.code}:`) }));
    expect(picker().getAttribute('data-value')).toBe(second.id);
    expect(summary(second)).toBeTruthy();
    expect(params().get('area')).toBe(second.id);
    expectUntouched(before, project, saved);
  });

  it('shows zero and unknown contract quantities distinctly and never presents Included or rate-only scope as an allocation', () => {
    const { project } = fixture(value => {
      value.items.find(item => item.id === 'WI-001').quantity = 0;
      value.items.find(item => item.id === 'WI-002').quantity = null;
      const area = value.drawingMapping.areas[0];
      area.workItemIds = ['WI-001', 'WI-002', 'WI-012', 'WI-017'];
      area.workItemQuantities = {};
    });
    const area = getDrawingMapping(project).areas[0];
    const before = workspace().projects, saved = frozen(project); mount(area);
    const rows = itemId => {
      const item = project.items.find(entry => entry.id === itemId);
      return within(summary(area)).getByRole('button', { name: `View contract item ${item.ref}`, exact: true }).closest('li');
    };
    expect(quantityValue(rows('WI-001'), 'Contract quantity')).toBe('0 m²');
    expect(quantityValue(rows('WI-002'), 'Contract quantity')).toBe('—');
    expect(quantityValue(rows('WI-001'), 'Quantity in this area')).toBe('Not allocated');
    expect(quantityValue(rows('WI-012'), 'Quantity in this area')).toBe('Link only');
    expect(quantityValue(rows('WI-017'), 'Quantity in this area')).toBe('Link only');
    expectUntouched(before, project, saved);
  });

  it('keeps selected items and unfinished area quantities visible while searching additional items, without silently saving them', async () => {
    const { project } = fixture();
    const area = getDrawingMapping(project).areas[0];
    const item = project.items.find(entry => entry.id === area.workItemIds[0]);
    const before = workspace().projects, saved = frozen(project);
    const user = userEvent.setup(); mount(area);
    await user.click(within(summary(area)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    expect(screen.queryByRole('searchbox', { name: 'Find contract work', exact: true })).toBeNull();
    const input = screen.getByRole('spinbutton', { name: `Quantity in this area for ${item.ref}`, exact: true });
    await user.type(input, '120');
    await user.click(screen.getByRole('button', { name: 'Add item', exact: true }));
    const additional = screen.getByRole('region', { name: 'Add contract items', exact: true });
    await user.type(within(additional).getByRole('searchbox', { name: 'Find contract work', exact: true }), 'nothing-matches');
    expect(within(additional).queryAllByRole('checkbox')).toHaveLength(0);
    expect(input.value).toBe('120');
    expect(within(document.querySelector('.drawing-selected-work')).getByRole('checkbox', { name: name => name.includes(item.description) }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Close item search', exact: true }));
    expect(screen.queryByRole('region', { name: 'Add contract items', exact: true })).toBeNull();
    expect(input.value).toBe('120');
    expectUntouched(before, project, saved);
  });

  it('moves keyboard focus into the active mobile pane after pin selection, editing and cancelled placement without saving', async () => {
    const { project } = fixture();
    const area = getDrawingMapping(project).areas.filter(entry => entry.position)[1];
    const before = workspace().projects, saved = frozen(project);
    vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: query === '(max-width: 1100px)', media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
    const user = userEvent.setup(); mount();
    fireEvent.load(document.querySelector('.drawing-image-stage > img'));
    const drawing = screen.getByRole('tab', { name: 'Drawing', exact: true });
    const details = screen.getByRole('tab', { name: 'Area details', exact: true });
    await user.click(screen.getByRole('button', { name: name => name.startsWith(`Select area ${area.code}:`) }));
    expect(details.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(summary(area)));
    await user.click(within(summary(area)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    const form = document.querySelector('.drawing-area-editor');
    await waitFor(() => expect(document.activeElement).toBe(form));
    expect(details.getAttribute('aria-selected')).toBe('true');
    await user.click(screen.getByRole('button', { name: /^(Move|Place) pin$/, exact: true }));
    const stage = screen.getByRole('button', { name: /Drawing pin placement/ });
    expect(drawing.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(stage));
    await user.click(screen.getByRole('button', { name: 'Cancel placement', exact: true }));
    expect(details.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(form));
    await user.click(within(form).getByRole('button', { name: 'Back to area status', exact: true }));
    expect(details.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(summary(area)));
    expect(document.querySelector('.drawing-area-editor')).toBeNull();
    expectUntouched(before, project, saved);
  });

  it('switches Drawing and Area details without saving, and resets an open area search when changing project', async () => {
    const { project, other } = fixture();
    const before = workspace().projects, saved = frozen(project);
    const user = userEvent.setup(); mount();
    const drawing = screen.getByRole('tab', { name: 'Drawing', exact: true });
    const details = screen.getByRole('tab', { name: 'Area details', exact: true });
    await user.click(details); expect(details.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById(details.getAttribute('aria-controls'))).toBeTruthy();
    await user.click(drawing); expect(drawing.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById(drawing.getAttribute('aria-controls'))).toBeTruthy();
    await user.click(picker());
    await user.type(screen.getByRole('combobox', { name: 'Search site areas', exact: true }), 'BRACKET');
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}`, exact: true }));
    await chooseProjectOption(user, other);
    expect(screen.queryByRole('dialog', { name: 'Choose site area', exact: true })).toBeNull();
    expect(picker().getAttribute('data-value')).not.toBe(getDrawingMapping(project).areas[0].id);
    expect(workspace().projects).toEqual(before);
    expect(frozen(workspace().projects.find(entry => entry.id === project.id))).toEqual(saved);
  });
});
