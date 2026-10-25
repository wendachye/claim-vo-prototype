import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { chooseProjectOption } from './project-select-helpers.mjs';
import { createProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getProjectOverview } from '../src/data/project-overview.ts';
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
const claimPanel = () => screen.getByRole('region', { name: 'Monthly claims', exact: true });
const voPanel = () => screen.getByRole('region', { name: 'Extra work', exact: true });
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

function mount() {
  window.history.replaceState(null, '', '#projects');
  return render(<App />);
}

async function backToOverview(user) {
  await user.click(screen.getByRole('button', { name: 'Back to overview', exact: true }));
  await screen.findByRole('heading', { name: 'Project overview', exact: true });
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
  it('opens saved claim and VO records beyond the last three activities, preserving exact evidence through reload and return', async () => {
    const { project } = fixture(value => {
      value.whatsappMessages.filter(message => message.status === 'new').slice(0, 3).forEach((message, index) => {
        message.date = `2026-10-22T01:59:${59 - index}.000Z`;
      });
      return value;
    });
    const draft = project.claimDrafts[0];
    const extra = getVOCases(project).find(entry => entry.status === 'approved');
    expect(getProjectOverview(project).activities.every(entry => entry.target.draftId !== draft.id && entry.target.caseId !== extra.id)).toBe(true);
    const before = workspace().projects;
    const pack = buildClaimPack(project, draft.id);
    const user = userEvent.setup();
    let view = mount();
    await user.click(within(claimPanel()).getByRole('button', { name: /Open October 2026 claim, version 1, Draft/ }));
    await screen.findByRole('heading', { name: 'Claim preview', exact: true });
    expect(params().get('draft')).toBe(draft.id);
    expect(params().get('from')).toBe('overview');
    expect(document.querySelector('.claim-pack-document').textContent).toContain(draft.id);
    view.unmount(); view = render(<App />);
    expect(document.querySelector('.claim-pack-document').textContent).toContain(draft.id);
    await backToOverview(user);

    await user.click(within(voPanel()).getByRole('button', { name: `Open extra work: ${extra.title}`, exact: true }));
    await screen.findByRole('heading', { name: extra.title, exact: true });
    expect(params().get('case')).toBe(extra.id);
    expect(params().get('from')).toBe('overview');
    expect(document.querySelector('.vo-detail').textContent).toContain(extra.report.message);
    view.unmount(); render(<App />);
    expect(document.querySelector('.vo-detail').textContent).toContain(extra.report.message);
    await backToOverview(user);
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), draft.id)).toEqual(pack);
  });

  it('shows certified and received amounts separately from the saved claim and opens that exact part-paid status', async () => {
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
    expect(panel.textContent).toContain('Certified SGD 2,000.00');
    expect(panel.textContent).toContain('Received SGD 500.00');
    expect(panel.textContent).toContain('Balance SGD 1,500.00');
    await user.click(within(panel).getByRole('button', { name: 'Open October 2026 claim, version 1, Part paid', exact: true }));
    await screen.findByRole('heading', { name: 'Record payment', exact: true });
    expect(params().get('draft')).toBe(draft.id);
    expect(params().get('from')).toBe('overview');
    view.unmount(); render(<App />);
    expect(screen.getByRole('heading', { name: 'Record payment', exact: true })).toBeTruthy();
    await backToOverview(user);
    expect(claimPanel().textContent).toContain('Balance SGD 1,500.00');
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), draft.id)).toEqual(pack);
  });

  it('switches dashboard summaries with the project and gives an empty project truthful next actions without losing saved records', async () => {
    const { project, other } = fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    expect(within(claimPanel()).getByRole('button', { name: /Open October 2026 claim/ })).toBeTruthy();
    expect(within(voPanel()).getAllByRole('button', { name: /Open extra work:/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}`, exact: true }));
    await chooseProjectOption(user, other);
    await waitFor(() => expect(workspace().activeProjectId).toBe(other.id));
    expect(claimPanel().textContent).toContain('No saved claims yet');
    expect(voPanel().textContent).toContain('No extra work recorded');
    expect(within(claimPanel()).queryByRole('button', { name: /Open October 2026 claim/ })).toBeNull();
    expect(within(voPanel()).queryByRole('button', { name: /Open extra work:/ })).toBeNull();
    await user.click(within(claimPanel()).getByRole('button', { name: 'Prepare a claim', exact: true }));
    await screen.findByRole('heading', { name: 'Monthly claims', exact: true });
    expect(workspace().projects).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Overview', exact: true }));
    await user.click(screen.getByRole('button', { name: `Project: ${other.name}`, exact: true }));
    await chooseProjectOption(user, project);
    await waitFor(() => expect(workspace().activeProjectId).toBe(project.id));
    expect(within(claimPanel()).getByRole('button', { name: /Open October 2026 claim/ })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });
});
