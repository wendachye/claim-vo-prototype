import { chooseSelect } from './select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getItemProgressReview } from '../src/data/progress-review.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const value = workspace(); return value.projects.find(project => project.id === value.activeProjectId); };
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const sourceFields = ['itemId', 'projectId', 'projectCode', 'message', 'photo', 'photoAlt', 'sender', 'date', 'completion', 'completionBasis', 'sourceMessageId'];
const sourceEvidence = report => Object.fromEntries(sourceFields.map(field => [field, report[field]]));
const reportFor = (project, itemId) => getItemProgressReview(project, project.items.find(item => item.id === itemId)).report;
const reviewButton = (project, itemId) => {
  const item = project.items.find(entry => entry.id === itemId);
  return screen.getByRole('button', { name: `${getItemProgressReview(project, item).actionLabel} for ${itemId}`, exact: true });
};
const rowFor = (project, itemId) => reviewButton(project, itemId).closest('tr');
const cardValue = (dialog, label) => within(dialog).getByText(label, { exact: true }).parentElement.textContent;

function fixture(change = () => {}) {
  const project = createSITContractDemo({ name: 'S.I.T. site progress demo', code: 'SITE-PROGRESS' }, now);
  const other = createSITContractDemo({ name: 'Other site progress project', code: 'PROGRESS-OTHER' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  change(project);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id), other: loaded.projects.find(entry => entry.id === other.id) };
}

function mount(hash = '#completion') {
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
  vi.useRealTimers(); vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('site progress separates worker reports from supervisor verification', () => {
  it('shows current totals and unknown values separately, and retains an older report’s saved observation without writing records', async () => {
    const { project } = fixture(value => {
      const unknown = value.items.find(item => item.id === 'WI-003');
      unknown.reported = null; unknown.verified = null;
    });
    const before = workspace().projects;
    const view = mount();
    const pendingRow = rowFor(project, 'WI-001');
    const pendingCells = within(pendingRow).getAllByRole('cell');
    expect(pendingCells).toHaveLength(4);
    expect(pendingCells[1].textContent).toContain('65%');
    expect(pendingCells[2].textContent).toContain('50%');
    expect(pendingCells[3].textContent).toContain('Needs verification');
    expect(pendingCells[0].textContent).toContain('A.1 / 1a');
    expect(screen.getByRole('table').textContent).not.toMatch(/WI-\d+/);
    const zeroCells = within(rowFor(project, 'WI-005')).getAllByRole('cell');
    expect(zeroCells[1].textContent).toContain('0%');
    expect(zeroCells[2].textContent).toContain('0%');
    const unknownCells = within(rowFor(project, 'WI-003')).getAllByRole('cell');
    expect(unknownCells[1].textContent).toContain('Not recorded');
    expect(unknownCells[2].textContent).toContain('Not recorded');
    const older = project.reports.find(report => report.itemId === 'WI-001' && report.status === 'verified');
    view.unmount();
    mount(`#completion?report=${encodeURIComponent(older.id)}`);
    const dialog = await screen.findByRole('dialog');
    expect(cardValue(dialog, 'This update')).toContain('50%');
    expect(cardValue(dialog, 'Current reported total')).toContain('65%');
    expect(cardValue(dialog, 'Current verified total')).toContain('50%');
    expect(dialog.textContent).toContain(older.message);
    expect(within(dialog).queryByRole('button', { name: 'Verify progress', exact: true })).toBeNull();
    expect(workspace().projects).toEqual(before);
  });

  it('filters pending work, opens its exact latest report after reload, and closes without losing the originating area or message', async () => {
    const { project } = fixture();
    const latest = reportFor(project, 'WI-001');
    const area = getDrawingMapping(project).areas.find(entry => entry.workItemIds.includes('WI-001'));
    const scope = { area: area.id, message: latest.sourceMessageId };
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount(`#completion?${new URLSearchParams(scope)}`);
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Review status', exact: true }), 'review');
    await user.click(reviewButton(project, 'WI-001'));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(params().get('report')).toBe(latest.id));
    expect(params().get('item')).toBeNull();
    expect(dialog.textContent).toContain(latest.message);
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe(latest.photo);
    view.unmount();
    render(<App />);
    const reopened = await screen.findByRole('dialog');
    expect(reopened.textContent).toContain(latest.message);
    expect(params().get('report')).toBe(latest.id);
    await user.click(within(reopened).getByRole('button', { name: 'Close site report', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(params().get('report')).toBeNull();
    for (const [key, value] of Object.entries(scope)) expect(params().get(key)).toBe(value);
    expect(workspace().projects).toEqual(before);
  });

  it('clears an unavailable report when opening an item without a saved report, preserving its area and records', async () => {
    const { project } = fixture();
    const item = project.items.find(entry => entry.id === 'WI-003');
    const area = getDrawingMapping(project).areas.find(entry => entry.workItemIds.includes(item.id));
    expect(reportFor(project, item.id)).toBeUndefined();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(`#completion?${new URLSearchParams({ report: 'MISSING', area: area.id })}`);
    const unavailable = 'This site report is not available in the selected project.';
    expect(screen.getByText(unavailable, { exact: true })).toBeTruthy();
    expect(params().get('item')).toBeNull();
    await user.click(reviewButton(project, item.id));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(item.description);
    expect(within(dialog).getByText('No attached update', { exact: true })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Verify progress', exact: true })).toBeNull();
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    await waitFor(() => expect(params().get('report')).toBeNull());
    expect(screen.queryByText(unavailable, { exact: true })).toBeNull();
    expect(params().get('area')).toBe(area.id);
    expect(params().get('item')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Close site report', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(params().get('report')).toBeNull();
    expect(params().get('area')).toBe(area.id);
    expect(workspace().projects).toEqual(before);
  });

  it('requires a focused reason before lowering verified completion, then saves only the explicit supervisor decision', async () => {
    const { project, other } = fixture(value => { value.items.find(item => item.id === 'WI-004').verified = 70; });
    const report = reportFor(project, 'WI-004');
    const originalEvidence = sourceEvidence(report);
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(`#completion?report=${encodeURIComponent(report.id)}`);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Confirm', exact: true }).getAttribute('aria-pressed')).toBe('true');
    await user.click(within(dialog).getByRole('button', { name: 'Verify progress', exact: true }));
    const note = within(dialog).getByRole('textbox', { name: 'Review note or correction reason', exact: true });
    expect(document.activeElement).toBe(note);
    expect(note.getAttribute('aria-invalid')).toBe('true');
    expect(workspace().projects).toEqual(before);
    await user.type(note, 'Supervisor measured a lower total after the access scope was checked.');
    await user.click(within(dialog).getByRole('button', { name: 'Verify progress', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = selectedProject();
    expect(saved.items.find(item => item.id === 'WI-004').reported).toBe(50);
    expect(saved.items.find(item => item.id === 'WI-004').verified).toBe(50);
    expect(saved.items.filter(item => item.id !== 'WI-004')).toEqual(project.items.filter(item => item.id !== 'WI-004'));
    const reviewed = saved.reports.find(entry => entry.id === report.id);
    expect(reviewed.status).toBe('verified');
    expect(reviewed.approvedCompletion).toBe(50);
    expect(reviewed.reviewReason).toBe(note.value);
    expect(sourceEvidence(reviewed)).toEqual(originalEvidence);
    for (const field of ['sourceItems', 'baselines', 'claimDrafts', 'whatsappMessages', 'voReviews']) expect(saved[field]).toEqual(project[field]);
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
  });

  it('does not offer usable verification before the contract baseline is confirmed', async () => {
    const { project } = fixture(value => { value.locked = false; });
    const report = reportFor(project, 'WI-001');
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(`#completion?report=${encodeURIComponent(report.id)}`);
    const dialog = await screen.findByRole('dialog');
    const verify = within(dialog).getByRole('button', { name: 'Verify progress', exact: true });
    expect(verify.disabled).toBe(true);
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Correct', exact: true }).disabled).toBe(true);
    expect(dialog.textContent).toMatch(/contract/i);
    await user.click(verify);
    expect(workspace().projects).toEqual(before);
  });

  it('keeps final and clarification reports read-only instead of making them directly verifiable again', async () => {
    const { project } = fixture(value => {
      const report = reportFor(value, 'WI-001');
      report.status = 'needsClarification';
      report.reviewReason = 'Confirm the work area and cumulative completion.';
    });
    const before = workspace().projects;
    const user = userEvent.setup();
    const reports = [reportFor(project, 'WI-002'), reportFor(project, 'WI-001')];
    for (const report of reports) {
      const view = mount(`#completion?report=${encodeURIComponent(report.id)}`);
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByRole('button', { name: 'Verify progress', exact: true })).toBeNull();
      expect(within(dialog).queryByRole('spinbutton', { name: 'Verified cumulative completion (%)', exact: true })).toBeNull();
      expect(dialog.textContent).toContain(report.message);
      if (report.status === 'needsClarification') {
        expect(dialog.textContent).toContain(report.reviewReason);
        expect(within(dialog).getByRole('button', { name: 'Add clarified demo update', exact: true })).toBeTruthy();
      }
      await user.click(within(dialog).getByRole('button', { name: 'Close site report', exact: true }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      view.unmount();
    }
    expect(workspace().projects).toEqual(before);
  });

  it('shows original evidence before totals and decision, with simple confirmation fields hidden', async () => {
    const { project } = fixture();
    const report = reportFor(project, 'WI-004');
    const before = workspace().projects;
    mount(`#completion?report=${encodeURIComponent(report.id)}`);
    const dialog = await screen.findByRole('dialog');
    const evidence = dialog.querySelector('.site-report-evidence');
    const totals = within(dialog).getByRole('region', { name: 'Completion totals', exact: true });
    const decision = within(dialog).getByRole('region', { name: 'Supervisor decision', exact: true });
    expect(evidence.open).toBe(true);
    expect(evidence.compareDocumentPosition(totals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(totals.compareDocumentPosition(decision) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dialog.textContent).toContain('Whole work item total');
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    expect(within(dialog).queryByRole('textbox', { name: 'Review note or correction reason', exact: true })).toBeNull();
    expect(workspace().projects).toEqual(before);
  });

  it('requires a reason for Can’t verify and retains source evidence, progress and saved claims', async () => {
    const { project, other } = fixture();
    const report = reportFor(project, 'WI-004');
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(`#completion?report=${encodeURIComponent(report.id)}`);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Can’t verify', exact: true }));
    const note = within(dialog).getByRole('textbox', { name: 'Review note or correction reason', exact: true });
    expect(document.activeElement).toBe(note);
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Verify progress', exact: true })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Save clarification', exact: true }));
    expect(document.activeElement).toBe(note);
    expect(note.getAttribute('aria-invalid')).toBe('true');
    expect(workspace().projects).toEqual(before);
    await user.type(note, 'Need a wider photo of the stair bay and its cumulative total.');
    await user.click(within(dialog).getByRole('button', { name: 'Save clarification', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = selectedProject();
    expect(saved.items).toEqual(project.items);
    const changed = saved.reports.find(entry => entry.id === report.id);
    expect(changed.status).toBe('needsClarification');
    expect(changed.reviewReason).toBe(note.value);
    expect(sourceEvidence(changed)).toEqual(sourceEvidence(report));
    for (const key of ['claimDrafts', 'claimTracking', 'whatsappMessages', 'voReviews', 'baselines']) expect(saved[key]).toEqual(project[key]);
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
  });

  it('requires a reason for an explicit correction and resets the hidden total when returning to Confirm', async () => {
    const { project } = fixture();
    const report = reportFor(project, 'WI-004');
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(`#completion?report=${encodeURIComponent(report.id)}`);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Correct', exact: true }));
    const completion = within(dialog).getByRole('spinbutton', { name: 'Verified cumulative completion (%)', exact: true });
    expect(document.activeElement).toBe(completion);
    await user.click(within(dialog).getByRole('button', { name: 'Verify progress', exact: true }));
    expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Review note or correction reason', exact: true }));
    expect(workspace().projects).toEqual(before);
    await user.clear(completion);
    await user.type(completion, '35');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm', exact: true }));
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    expect(within(dialog).queryByRole('textbox', { name: 'Review note or correction reason', exact: true })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Verify progress', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = selectedProject();
    expect(saved.reports.find(entry => entry.id === report.id).approvedCompletion).toBe(report.completion);
    expect(saved.claimDrafts).toEqual(project.claimDrafts);
  });

});
