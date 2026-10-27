import { chooseDrawingArea } from './drawing-select-helpers.mjs';
import { chooseSelect } from './select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const value = workspace(); return value.projects.find(project => project.id === value.activeProjectId); };
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const areaPicker = () => screen.getByRole('button', { name: 'Choose site area', exact: true });
const areaSummary = area => screen.getByRole('region', { name: `Area ${area.code} completion`, exact: true });

function fixture() {
  const project = createSITContractDemo({ name: 'S.I.T. drawing links demo', code: 'DRAWING-LINKS' }, now);
  const other = createSITContractDemo({ name: 'Other drawing project', code: 'DRAWING-OTHER' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id), other: loaded.projects.find(entry => entry.id === other.id) };
}

function mount(hash = '#drawing') {
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

describe('drawing areas stay connected to their contract scope', () => {
  it('opens an exact linked item, retains the area through item changes and reload, and returns without saving records', async () => {
    const { project } = fixture();
    const area = getDrawingMapping(project).areas.find(entry => entry.code === 'W3-AMPH-A');
    const included = project.items.find(item => item.id === 'WI-012');
    const platform = project.items.find(item => item.id === 'WI-009');
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount(`#drawing?area=${encodeURIComponent(area.id)}`);
    expect(areaPicker().getAttribute('data-value')).toBe(area.id);
    await user.click(within(areaSummary(area)).getByRole('button', { name: `View contract item ${included.ref}`, exact: true }));
    await screen.findByRole('heading', { name: 'Contract review', exact: true });
    expect(params().get('item')).toBe(included.id);
    expect(params().get('area')).toBe(area.id);
    expect(document.querySelector('.contract-item-editor').textContent).toContain('Included in other rates. No separate charge.');
    expect(screen.getByRole('img', { name: /Original contract schedule/ }).getAttribute('alt')).toContain(included.ref);
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Choose contract item', exact: true }), platform.id);
    await waitFor(() => expect(params().get('item')).toBe(platform.id));
    expect(params().get('area')).toBe(area.id);
    view.unmount();
    render(<App />);
    expect(screen.getByRole('heading', { name: platform.description, exact: true })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to drawing', exact: true }));
    await screen.findByRole('heading', { name: 'Drawing & areas', exact: true });
    expect(params().get('area')).toBe(area.id);
    expect(areaPicker().getAttribute('data-value')).toBe(area.id);
    expect(areaSummary(area).textContent).toContain(platform.description);
    await user.click(screen.getByRole('button', { name: 'Back to contract', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    expect(screen.getByRole('button', { name: 'Work items', exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });

  it.each(['missing', 'foreign'])('does not substitute another area for an explicit %s link and recovers through the area picker', async kind => {
    const { project, other } = fixture();
    const area = getDrawingMapping(project).areas[0];
    const invalidId = kind === 'foreign' ? getDrawingMapping(other).areas[0].id : 'AREA-DOES-NOT-EXIST';
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(`#drawing?area=${encodeURIComponent(invalidId)}`);
    expect(screen.getByText('This site area is not available in the selected project.')).toBeTruthy();
    expect(areaPicker().getAttribute('data-value')).toBe('');
    expect(screen.queryByRole('region', { name: /^Area .+ completion$/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /^Site updates and photos for area/ })).toBeNull();
    expect(document.querySelector('.drawing-area-editor')).toBeNull();
    await chooseDrawingArea(user, areaPicker(), area.id);
    await waitFor(() => expect(params().get('area')).toBe(area.id));
    expect(screen.queryByText('This site area is not available in the selected project.')).toBeNull();
    expect(areaSummary(area)).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });

  it('keeps mapping edits buffered while choosing other areas and saves only after Save area links', async () => {
    const { project, other } = fixture();
    const [area, nextArea] = getDrawingMapping(project).areas;
    const extraItem = project.items.find(item => !area.workItemIds.includes(item.id));
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(`#drawing?area=${encodeURIComponent(area.id)}`);
    await user.click(within(areaSummary(area)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    const name = screen.getByRole('textbox', { name: /^Area name/ });
    await user.clear(name);
    await user.type(name, 'Demo west access working area');
    await user.click(screen.getByRole('button', { name: 'Add item', exact: true }));
    const workChoice = within(screen.getByRole('region', { name: 'Add contract items', exact: true })).getByRole('checkbox', { name: name => name.includes(extraItem.description) });
    await user.click(workChoice);
    expect(workspace().projects).toEqual(before);
    await chooseDrawingArea(user, areaPicker(), nextArea.id);
    expect(areaSummary(nextArea)).toBeTruthy();
    await chooseDrawingArea(user, areaPicker(), area.id);
    expect(areaSummary(area).textContent).not.toContain('Demo west access working area');
    await user.click(within(areaSummary(area)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    expect(screen.getByRole('textbox', { name: /^Area name/ }).value).toBe('Demo west access working area');
    expect(within(document.querySelector('.drawing-selected-work')).getByRole('checkbox', { name: name => name.includes(extraItem.description) }).getAttribute('aria-checked')).toBe('true');
    expect(workspace().projects).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    const saved = getDrawingMapping(selectedProject()).areas.find(entry => entry.id === area.id);
    expect(saved.name).toBe('Demo west access working area');
    expect(saved.workItemIds).toEqual([...area.workItemIds, extraItem.id]);
    expect(getDrawingMapping(selectedProject()).areas.find(entry => entry.id === nextArea.id)).toEqual(nextArea);
    for (const field of ['items', 'sourceItems', 'reports', 'voReviews', 'claimDrafts', 'baselines', 'whatsappMessages']) expect(selectedProject()[field]).toEqual(project[field]);
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
  });

  it('shows shared Included decking in both linked areas without creating area quantities or changing completion', async () => {
    const { project } = fixture();
    const areas = getDrawingMapping(project).areas.filter(area => area.workItemIds.includes('WI-012'));
    const included = project.items.find(item => item.id === 'WI-012');
    expect(areas).toHaveLength(2);
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(`#drawing?area=${encodeURIComponent(areas[0].id)}`);
    for (const area of areas) {
      await chooseDrawingArea(user, areaPicker(), area.id);
      const summary = areaSummary(area);
      expect(within(summary).getByRole('button', { name: `View contract item ${included.ref}`, exact: true })).toBeTruthy();
      expect(summary.textContent).toMatch(/Included/);
      expect(summary.textContent).toMatch(/shared/i);
      expect(summary.textContent).toMatch(/no separate claim value/i);
    }
    await user.click(screen.getByRole('button', { name: 'Reported', exact: true }));
    expect(screen.getByRole('button', { name: 'Reported', exact: true }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Verified', exact: true }));
    expect(workspace().projects).toEqual(before);
  });
});
