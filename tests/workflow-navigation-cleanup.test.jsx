import { selectOptions } from './select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { createProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getVOCases } from '../src/data/vo.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const params = () => new URLSearchParams(location.hash.split('?')[1]);

function fixture(target) {
  const showcase = createSITContractDemo({ name: 'Navigation cleanup demo', code: 'CLEANUP-NAV' }, now);
  const other = target || createProject({ name: 'Other cleanup project', code: 'CLEANUP-OTHER' });
  projectIds.add(showcase.id); projectIds.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: target?.id || showcase.id,
    projects: [showcase, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: showcase.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return loaded.projects.find(entry => entry.id === loaded.activeProjectId);
}

function mount(hash) {
  window.history.replaceState(null, '', hash);
  return render(<App />);
}

function changeHash(hash) {
  act(() => {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
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

describe('workflow navigation cleanup', () => {
  it('opens legacy extra-work links in the VO review on load and hash changes while preserving exact context and records', async () => {
    const user = userEvent.setup();
    const project = fixture();
    const cases = getVOCases(project);
    const areas = getDrawingMapping(project).areas;
    const linkFor = entry => `#completion?${new URLSearchParams({ filter: 'vo', case: entry.id, area: areas.find(area => `Area ${area.code}` === entry.report.area).id, from: 'overview', item: 'old-progress-only' })}`;
    const before = workspace().projects;
    mount(linkFor(cases[0]));
    await screen.findByRole('heading', { name: 'Extra work (VO)', exact: true });
    expect(location.hash.split('?')[0]).toBe('#vo');
    expect(params().get('case')).toBe(cases[0].id);
    expect(params().get('area')).toBe(areas.find(area => `Area ${area.code}` === cases[0].report.area).id);
    expect(params().get('from')).toBe('dashboard');
    expect(params().has('filter')).toBe(false);
    expect(params().has('item')).toBe(false);
    expect(screen.getByRole('region', { name: cases[0].title }).textContent).toContain(cases[0].report.message);
    expect(screen.queryByRole('heading', { name: 'Site progress', exact: true })).toBeNull();

    changeHash('#completion');
    await screen.findByRole('heading', { name: 'Site progress', exact: true });
    const statuses = await selectOptions(user, screen.getByRole('combobox', { name: 'Review status', exact: true }));
    expect(statuses.some(option => option.getAttribute('data-value') === 'vo' || /extra work/i.test(option.textContent))).toBe(false);
    await user.keyboard('{Escape}');
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: /Reported total/ })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Extra-work cases', exact: true })).toBeNull();

    changeHash(linkFor(cases[1]));
    await screen.findByRole('heading', { name: 'Extra work (VO)', exact: true });
    expect(location.hash.split('?')[0]).toBe('#vo');
    expect(params().get('case')).toBe(cases[1].id);
    expect(params().get('area')).toBe(areas.find(area => `Area ${area.code}` === cases[1].report.area).id);
    expect(params().get('from')).toBe('dashboard');
    expect(params().has('filter')).toBe(false);
    expect(screen.getByRole('region', { name: cases[1].title }).textContent).toContain(cases[1].report.message);
    expect(workspace().projects).toEqual(before);
  });

  it('enables drawing zoom reset only after the zoom changes and keeps area records unchanged', async () => {
    const user = userEvent.setup();
    fixture();
    const before = workspace().projects;
    mount('#drawing');
    const reset = screen.getByRole('button', { name: 'Reset drawing zoom', exact: true });
    const tools = reset.parentElement;
    expect(reset.disabled).toBe(true);
    expect(within(tools).getByText('100%', { exact: true })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Zoom drawing in', exact: true }));
    expect(reset.disabled).toBe(false);
    expect(within(tools).getByText('125%', { exact: true })).toBeTruthy();
    await user.click(reset);
    expect(reset.disabled).toBe(true);
    expect(within(tools).getByText('100%', { exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });

  it.each([false, true])('offers a useful first action for an empty VO register with contract items=%s', async hasItems => {
    const user = userEvent.setup();
    const target = createProject({ name: 'Empty extra-work project', code: hasItems ? 'VO-HAS-CONTRACT' : 'VO-NO-CONTRACT' });
    if (hasItems) {
      target.items = [{ id: 'WI-A', ref: 'A/01', description: 'Fictional measured work', location: 'Block A', unit: 'm²', quantity: 100, rate: 10, amount: 1000, pricingType: 'measured', needsReview: true, reported: 0, verified: 0 }];
      target.sourceItems = structuredClone(target.items);
    }
    fixture(target);
    const before = workspace().projects;
    mount('#vo');
    expect(screen.getByRole('heading', { name: 'No flagged extra work for this project' })).toBeTruthy();
    const action = hasItems ? 'Open site updates' : 'Add a contract';
    expect(screen.queryByRole('button', { name: hasItems ? 'Add a contract' : 'Open site updates', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: action, exact: true }));
    await waitFor(() => expect(location.hash.split('?')[0]).toBe(hasItems ? '#whatsapp' : '#contract'));
    expect(screen.getByRole('heading', { name: hasItems ? 'WhatsApp messages' : 'Contract', exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });
});
