import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getItemProgressReview } from '../src/data/progress-review.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { markClaimPrepared } from '../src/data/claims.ts';
import { recordClaimStage } from '../src/data/claim-tracking.ts';
import { buildClaimPack } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-24T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const value = workspace(); return value.projects.find(project => project.id === value.activeProjectId); };
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const sourceFields = ['itemId', 'projectId', 'projectCode', 'message', 'photo', 'photoAlt', 'sender', 'date', 'completion', 'completionBasis', 'sourceMessageId'];
const sourceEvidence = report => Object.fromEntries(sourceFields.map(field => [field, report[field]]));
const pendingReport = (project, itemId = 'WI-001') => getItemProgressReview(project, project.items.find(item => item.id === itemId)).report;
const reviewHash = (project, report, additional = {}) => `#supervisor-review?${new URLSearchParams({ project: project.id, report: report.id, ...additional })}`;
const progressTask = (project, report) => getProjectAttention(project).find(task => task.id === `progress:${report.id}`);

function updated(result) {
  if (result.outcome !== 'updated') throw new Error(result.error || `Expected updated, received ${result.outcome}`);
  return result.project;
}

function fixture() {
  let project = createSITContractDemo({ name: 'Mobile supervisor demo', code: 'MOBILE-REVIEW' }, now);
  const draftId = project.claimDrafts[0].id;
  project = updated(markClaimPrepared(project, draftId));
  project = updated(recordClaimStage(project, draftId, 'submitted', { date: '2026-10-24', reference: 'MOBILE-SAVED-SUBMISSION' }));
  const other = createSITContractDemo({ name: 'Other supervisor project', code: 'MOBILE-OTHER' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id), other: loaded.projects.find(entry => entry.id === other.id) };
}

function mount(hash) {
  window.history.replaceState(null, '', hash);
  return render(<App />);
}

function expectSavedRecordsUnchanged(project, before, other) {
  for (const field of ['sourceItems', 'baselines', 'claimDrafts', 'claimTracking', 'whatsappMessages', 'voReviews', 'drawingMapping']) {
    expect(project[field]).toEqual(before[field]);
  }
  expect(buildClaimPack(project, project.claimDrafts[0].id)).toEqual(buildClaimPack(before, before.claimDrafts[0].id));
  expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
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

describe('mobile supervisor review uses the existing project verification workflow', () => {
  it('opens one pending report from Site progress, hides workspace navigation and returns to its exact source without saving', async () => {
    const { project } = fixture(), report = pendingReport(project);
    const area = getDrawingMapping(project).areas.find(entry => entry.workItemIds.includes(report.itemId));
    const scope = { area: area.id, item: report.itemId, message: report.sourceMessageId, report: report.id, from: 'overview' };
    const user = userEvent.setup();
    mount(`#completion?${new URLSearchParams(scope)}`);
    const before = workspace().projects;
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Open mobile review', exact: true }));
    await waitFor(() => expect(location.hash.startsWith('#supervisor-review?')).toBe(true));
    expect(params().get('project')).toBe(project.id);
    expect(params().get('report')).toBe(report.id);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(report.message, { exact: true, normalizer: value => value })).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('src')).toBe(report.photo);
    expect(screen.queryByRole('button', { name: 'Choose project', exact: true })).toBeNull();
    expect(screen.queryByText('All projects', { exact: true })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Project steps', exact: true })).toBeNull();
    expect(screen.queryByText(/SGD|retention|claim amount/i)).toBeNull();
    expect(workspace().projects).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Back to Site progress', exact: true }));
    const returned = await screen.findByRole('dialog');
    expect(returned.textContent).toContain(report.message);
    for (const [key, value] of Object.entries(scope)) expect(params().get(key)).toBe(value);
    expect(workspace().projects).toEqual(before);
  });

  it('retains the originating WhatsApp message and drawing area when returning from mobile review through Site progress', async () => {
    const { project } = fixture(), report = pendingReport(project);
    const area = getDrawingMapping(project).areas.find(entry => entry.workItemIds.includes(report.itemId));
    const user = userEvent.setup();
    mount(`#whatsapp?${new URLSearchParams({ message: report.sourceMessageId, area: area.id })}`);
    const before = workspace().projects;
    await user.click(screen.getByRole('button', { name: 'Review progress', exact: true }));
    const drawer = await screen.findByRole('dialog');
    expect(drawer.textContent).toContain(report.message);
    await user.click(within(drawer).getByRole('button', { name: 'Open mobile review', exact: true }));
    await waitFor(() => expect(location.hash.startsWith('#supervisor-review?')).toBe(true));
    expect(params().get('message')).toBe(report.sourceMessageId);
    expect(params().get('area')).toBe(area.id);
    await user.click(screen.getByRole('button', { name: 'Back to Site progress', exact: true }));
    const returned = await screen.findByRole('dialog');
    for (const [key, value] of Object.entries({ report: report.id, item: report.itemId, message: report.sourceMessageId, area: area.id })) {
      expect(params().get(key)).toBe(value);
    }
    expect(returned.textContent).toContain(report.message);
    await user.click(within(returned).getByRole('button', { name: 'Close site report', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Back to message', exact: true }));
    await waitFor(() => expect(location.hash.startsWith('#whatsapp?')).toBe(true));
    expect(params().get('message')).toBe(report.sourceMessageId);
    expect(params().get('area')).toBe(area.id);
    expect(screen.getByRole('button', { name: 'Review progress', exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });

  it('confirms the original reported total once, clears its attention task and retains saved claims and tracking after reload', async () => {
    const { project, other } = fixture(), report = pendingReport(project);
    const beforeSource = sourceEvidence(report);
    const beforeTaskCount = getProjectAttention(project).length;
    expect(progressTask(project, report)?.kind).toBe('progress');
    const user = userEvent.setup(), view = mount(reviewHash(project, report));
    await user.click(screen.getByRole('button', { name: 'Confirm', exact: true }));
    await waitFor(() => expect(selectedProject().reports.find(entry => entry.id === report.id).status).toBe('verified'));
    let saved = selectedProject();
    const reviewed = saved.reports.find(entry => entry.id === report.id);
    expect(reviewed.approvedCompletion).toBe(report.completion);
    expect(sourceEvidence(reviewed)).toEqual(beforeSource);
    expect(saved.items.find(item => item.id === report.itemId).verified).toBe(report.completion);
    expect(saved.items.filter(item => item.id !== report.itemId)).toEqual(project.items.filter(item => item.id !== report.itemId));
    expect(progressTask(saved, report)).toBeUndefined();
    expect(getProjectAttention(saved).length).toBe(beforeTaskCount - 1);
    expectSavedRecordsUnchanged(saved, project, other);
    const after = structuredClone(workspace().projects);
    view.unmount(); render(<App />);
    expect(screen.getByText(report.message, { exact: true, normalizer: value => value })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Correct', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Can’t verify', exact: true })).toBeNull();
    expect(workspace().projects).toEqual(after);
  });

  it('stores an explicit correction reason without replacing the worker’s message, photo or reported percentage', async () => {
    const { project, other } = fixture(), report = pendingReport(project);
    const user = userEvent.setup();
    mount(reviewHash(project, report));
    await user.click(screen.getByRole('button', { name: 'Correct', exact: true }));
    const completion = screen.getByRole('spinbutton', { name: 'Correct cumulative completion (%)', exact: true });
    await user.clear(completion); await user.type(completion, '60');
    const reason = 'Supervisor measured 60% complete within the listed scaffold scope.';
    await user.type(screen.getByRole('textbox', { name: 'Correction reason', exact: true }), reason);
    await user.click(screen.getByRole('button', { name: 'Save correction', exact: true }));
    await waitFor(() => expect(selectedProject().reports.find(entry => entry.id === report.id).status).toBe('verified'));
    const saved = selectedProject(), reviewed = saved.reports.find(entry => entry.id === report.id);
    expect(reviewed.approvedCompletion).toBe(60);
    expect(reviewed.reviewReason).toBe(reason);
    expect(sourceEvidence(reviewed)).toEqual(sourceEvidence(report));
    expect(saved.items.find(item => item.id === report.itemId).verified).toBe(60);
    expect(saved.items.find(item => item.id === report.itemId).reported).toBe(65);
    expect(progressTask(saved, report)).toBeUndefined();
    expectSavedRecordsUnchanged(saved, project, other);
  });

  it('requests a clearer update without changing completion or financial records and keeps an actionable clarification task', async () => {
    const { project, other } = fixture(), report = pendingReport(project);
    const beforeTaskCount = getProjectAttention(project).length;
    const reason = 'Photo does not show the upper lift. Please confirm the cumulative total for this work area.';
    const user = userEvent.setup(), view = mount(reviewHash(project, report));
    await user.click(screen.getByRole('button', { name: 'Can’t verify', exact: true }));
    await user.type(screen.getByRole('textbox', { name: 'What needs checking?', exact: true }), reason);
    await user.click(screen.getByRole('button', { name: 'Request clearer update', exact: true }));
    await waitFor(() => expect(selectedProject().reports.find(entry => entry.id === report.id).status).toBe('needsClarification'));
    const saved = selectedProject(), reviewed = saved.reports.find(entry => entry.id === report.id);
    expect(reviewed.reviewReason).toBe(reason);
    expect(sourceEvidence(reviewed)).toEqual(sourceEvidence(report));
    expect(saved.items).toEqual(project.items);
    expect(progressTask(saved, report)).toMatchObject({ kind: 'clarification', statusLabel: 'Needs clarification', target: { route: 'completion', reportId: report.id, itemId: report.itemId } });
    expect(getProjectAttention(saved).length).toBe(beforeTaskCount);
    expectSavedRecordsUnchanged(saved, project, other);
    const after = structuredClone(workspace().projects);
    view.unmount(); render(<App />);
    expect(screen.getByText(reason, { exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request clearer update', exact: true })).toBeNull();
    expect(workspace().projects).toEqual(after);
  });

  it('does not switch projects or reveal evidence for a route scoped to another project', () => {
    const { project, other } = fixture(), report = pendingReport(project);
    mount(reviewHash(other, report));
    const before = workspace();
    expect(before.activeProjectId).toBe(project.id);
    expect(screen.queryByText(report.message, { exact: true, normalizer: value => value })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Correct', exact: true })).toBeNull();
    expect(workspace()).toEqual(before);
  });

  it('keeps the existing desktop verification action working for a report that was never opened in mobile review', async () => {
    const { project, other } = fixture(), report = pendingReport(project, 'WI-004');
    const user = userEvent.setup();
    mount(`#completion?report=${encodeURIComponent(report.id)}`);
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Verify progress', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = selectedProject();
    expect(saved.reports.find(entry => entry.id === report.id).status).toBe('verified');
    expect(saved.items.find(item => item.id === report.itemId).verified).toBe(report.completion);
    expectSavedRecordsUnchanged(saved, project, other);
  });
});
