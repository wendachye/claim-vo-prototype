import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.jsx';
import { createProject, WORKSPACE_STORE } from '../src/data/projects.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.js';
import { getProjectOverview } from '../src/data/project-overview.js';
import { getVOCases } from '../src/data/vo.js';
import { markClaimPrepared } from '../src/data/claims.js';
import { recordClaimStage } from '../src/data/claim-tracking.js';
import { buildClaimPack } from '../src/data/claim-pack.js';
import { clearProjectFormBuffers } from '../src/data/form-buffer.js';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const recent = () => screen.getByRole('region', { name: 'Recent activity', exact: true });
const rows = () => within(recent()).getAllByRole('button');
const cards = () => screen.getByRole('navigation', { name: 'Project steps', exact: true });

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

function mount() {
  window.history.replaceState(null, '', '#projects');
  return render(<App />);
}

function activityFor(project, target) {
  const activities = getProjectOverview(project).activities;
  const index = activities.findIndex(entry => Object.entries(target).every(([key, value]) => entry.target[key] === value));
  expect(index).toBeGreaterThanOrEqual(0);
  return rows()[index];
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

describe('overview recent activity opens exact saved records without changing the project', () => {
  it('shows three latest activities and preserves exact message, report and saved-claim links across reload and return', async () => {
    const { project } = fixture({ change(value) {
      value.whatsappMessages.find(message => message.status === 'new').date = '2026-10-22T01:59:50.000Z';
      value.reports.find(report => !report.vo && report.status === 'verified').verifiedAt = '2026-10-22T01:59:40.000Z';
      value.claimDrafts[0].createdAt = '2026-10-22T01:59:30.000Z';
      return value;
    } });
    const message = project.whatsappMessages.find(entry => entry.date === '2026-10-22T01:59:50.000Z');
    const report = project.reports.find(entry => entry.verifiedAt === '2026-10-22T01:59:40.000Z');
    const draft = project.claimDrafts[0];
    const before = workspace().projects;
    const pack = buildClaimPack(project, draft.id);
    const user = userEvent.setup();
    let view = mount();
    expect(within(cards()).getAllByRole('button')).toHaveLength(4);
    expect(rows()).toHaveLength(3);
    await user.click(activityFor(project, { route: 'whatsapp', messageId: message.id }));
    await screen.findByRole('heading', { name: 'WhatsApp messages', exact: true });
    expect(params().get('message')).toBe(message.id);
    expect(params().get('from')).toBe('overview');
    expect(document.querySelector('.wa-review').textContent).toContain(message.text);
    view.unmount(); view = render(<App />);
    expect(document.querySelector('.wa-review').textContent).toContain(message.text);
    await backToOverview(user);
    expect(workspace().projects).toEqual(before);

    await user.click(activityFor(project, { route: 'completion', reportId: report.id, itemId: report.itemId }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(report.message);
    expect(params().get('report')).toBe(report.id);
    expect(params().get('item')).toBe(report.itemId);
    expect(params().get('from')).toBe('overview');
    expect(within(dialog).queryByRole('button', { name: 'Verify progress', exact: true })).toBeNull();
    view.unmount(); view = render(<App />);
    expect(screen.getByRole('dialog').textContent).toContain(report.message);
    await user.click(screen.getByRole('button', { name: 'Close site report', exact: true }));
    await screen.findByRole('heading', { name: 'Project overview', exact: true });
    expect(workspace().projects).toEqual(before);

    await user.click(activityFor(project, { route: 'claim-preview', draftId: draft.id }));
    await screen.findByRole('heading', { name: 'Claim preview', exact: true });
    expect(params().get('draft')).toBe(draft.id);
    expect(params().get('from')).toBe('overview');
    expect(document.querySelector('.claim-pack-document').textContent).toContain(draft.id);
    expect(document.querySelector('.claim-pack-document').textContent).toContain(`Revision ${draft.revision}`);
    view.unmount(); render(<App />);
    expect(document.querySelector('.claim-pack-document').textContent).toContain(draft.id);
    await backToOverview(user);
    expect(rows()).toHaveLength(3);
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), draft.id)).toEqual(pack);
  });

  it('opens the exact recorded VO decision while retaining its source evidence and separate claim eligibility', async () => {
    const { project } = fixture({ change(value) {
      const review = value.voReviews.find(entry => entry.status === 'approved');
      review.history.at(-1).date = '2026-10-22T01:59:59.000Z';
      review.updatedAt = review.history.at(-1).date;
      return value;
    } });
    const entry = getVOCases(project).find(value => value.status === 'approved');
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount();
    await user.click(activityFor(project, { route: 'vo', caseId: entry.id }));
    await screen.findByRole('heading', { name: entry.title, exact: true });
    expect(params().get('case')).toBe(entry.id);
    expect(params().get('from')).toBe('overview');
    expect(document.querySelector('.vo-detail').textContent).toContain(entry.report.message);
    view.unmount(); render(<App />);
    expect(screen.getByRole('heading', { name: entry.title, exact: true })).toBeTruthy();
    await backToOverview(user);
    expect(workspace().projects).toEqual(before);
  });

  it('opens the exact checked contract item and returns to the overview after reload', async () => {
    const { project } = fixture({ change(value) {
      value.items.find(item => item.id === 'WI-004').reviewedAt = '2026-10-22T01:59:59.000Z';
      return value;
    } });
    const item = project.items.find(entry => entry.id === 'WI-004');
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount();
    await user.click(activityFor(project, { route: 'contract', itemId: item.id }));
    await screen.findByRole('heading', { name: 'Contract review', exact: true });
    expect(params().get('item')).toBe(item.id);
    expect(params().get('from')).toBe('overview');
    expect(screen.getByRole('combobox', { name: 'Choose contract item', exact: true }).value).toBe(item.id);
    view.unmount(); render(<App />);
    expect(screen.getByRole('combobox', { name: 'Choose contract item', exact: true }).value).toBe(item.id);
    await backToOverview(user);
    expect(workspace().projects).toEqual(before);
  });

  it('opens the exact prepared claim tracking record without altering its saved assessment or lifecycle', async () => {
    const { project } = fixture({ change(value) {
      const id = value.claimDrafts[0].id;
      const prepared = updated(markClaimPrepared(value, id));
      return updated(recordClaimStage(prepared, id, 'submitted', { date: '2026-10-22', reference: 'OVERVIEW-SUBMISSION' }));
    } });
    const draft = project.claimDrafts[0];
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount();
    await user.click(activityFor(project, { route: 'claim-status', draftId: draft.id }));
    expect(params().get('draft')).toBe(draft.id);
    expect(params().get('from')).toBe('overview');
    expect(screen.getByRole('heading', { name: 'Record certification', exact: true })).toBeTruthy();
    view.unmount(); render(<App />);
    expect(screen.getByRole('heading', { name: 'Record certification', exact: true })).toBeTruthy();
    await backToOverview(user);
    expect(workspace().projects).toEqual(before);
  });

  it('refreshes cards and recent activities when switching projects and gives an empty project a truthful start', async () => {
    const { project, other } = fixture({ emptyOther: true });
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    expect(rows()).toHaveLength(3);
    for (const card of getProjectOverview(project).cards) expect(cards().textContent).toContain(card.summary);
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}`, exact: true }));
    await user.click(screen.getByRole('option', { name: new RegExp(other.name) }));
    await waitFor(() => expect(workspace().activeProjectId).toBe(other.id));
    expect(screen.getByRole('heading', { name: 'Project overview', exact: true })).toBeTruthy();
    expect(within(recent()).queryAllByRole('button')).toHaveLength(0);
    for (const card of getProjectOverview(other).cards) expect(cards().textContent).toContain(card.summary);
    expect(screen.getByText('Ready to get started', { exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
    await user.click(screen.getByRole('button', { name: `Project: ${other.name}`, exact: true }));
    await user.click(screen.getByRole('option', { name: new RegExp(project.name) }));
    await waitFor(() => expect(workspace().activeProjectId).toBe(project.id));
    expect(rows()).toHaveLength(3);
    expect(workspace().projects).toEqual(before);
  });
});
