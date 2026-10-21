import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.jsx';
import { WORKSPACE_STORE } from '../src/data/projects.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.js';
import { clearProjectFormBuffers } from '../src/data/form-buffer.js';
import { getMessageSummary } from '../src/data/message-summary.js';
import { getDrawingMapping } from '../src/data/drawing-mapping.js';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const value = workspace(); return value.projects.find(project => project.id === value.activeProjectId); };
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const review = () => document.querySelector('.wa-review');
const inbox = () => document.querySelector('.wa-inbox');

function fixture() {
  const project = createSITContractDemo({ name: 'S.I.T. WhatsApp review demo', code: 'WA-REVIEW' }, now);
  const other = createSITContractDemo({ name: 'Other WhatsApp project', code: 'WA-OTHER' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id), other: loaded.projects.find(entry => entry.id === other.id) };
}

function mount(messageId, context = {}) {
  window.history.replaceState(null, '', `#whatsapp?${new URLSearchParams({ message: messageId, ...context })}`);
  return render(<App />);
}

function messageButton(message) {
  return within(inbox()).getByRole('button', { name: name => name.includes(`Open message: ${message.area},`)
    && name.includes(getMessageSummary(message).title) });
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

describe('WhatsApp review retains the exact message and separates saved updates from current totals', () => {
  it('keeps a linked message open outside list filters until a visible inbox message is explicitly chosen', async () => {
    const { project } = fixture();
    const source = project.whatsappMessages.find(message => message.id.endsWith('-CASE-WA-001'));
    const next = project.whatsappMessages.find(message => message.kind === 'progress' && message.status === 'new');
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount(source.id);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter site updates', exact: true }), 'new');
    await user.type(screen.getByRole('textbox', { name: 'Search site updates', exact: true }), next.itemId);
    expect(screen.getByText('Selected message is outside these filters.', { exact: true })).toBeTruthy();
    expect(params().get('message')).toBe(source.id);
    expect(within(review()).getByRole('heading', { name: getMessageSummary(source).title, exact: true })).toBeTruthy();
    expect(review().textContent).toContain(source.text);
    await user.click(messageButton(next));
    await waitFor(() => expect(params().get('message')).toBe(next.id));
    expect(within(review()).getByRole('heading', { name: getMessageSummary(next).title, exact: true })).toBeTruthy();
    expect(screen.queryByText('Selected message is outside these filters.', { exact: true })).toBeNull();
    view.unmount();
    render(<App />);
    expect(within(review()).getByRole('heading', { name: getMessageSummary(next).title, exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });

  it('clears the exact-message route on Back to messages and retains its origin across remount', async () => {
    const { project } = fixture();
    const source = project.whatsappMessages.find(message => message.id.endsWith('-CASE-WA-001'));
    const area = getDrawingMapping(project).areas.find(entry => entry.workItemIds.includes(source.itemId));
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount(source.id, { area: area.id, from: 'overview' });
    await user.click(screen.getByRole('button', { name: 'Back to messages', exact: true }));
    expect(params().get('message')).toBeNull();
    expect(params().get('area')).toBe(area.id);
    expect(params().get('from')).toBe('overview');
    expect(document.querySelector('.whatsapp-view').classList.contains('wa-review-open')).toBe(false);
    view.unmount();
    render(<App />);
    expect(document.querySelector('.whatsapp-view').classList.contains('wa-review-open')).toBe(false);
    expect(screen.getByRole('button', { name: 'Back to overview', exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });

  it('shows the saved completion for an older report alongside current reported and verified totals without changing evidence', () => {
    const { project } = fixture();
    const source = project.whatsappMessages.find(message => message.id.endsWith('-CASE-WA-001'));
    const report = project.reports.find(entry => entry.sourceMessageId === source.id);
    const item = project.items.find(entry => entry.id === report.itemId);
    expect(report.completion).not.toBe(item.reported);
    const before = workspace().projects;
    mount(source.id);
    for (const [label, value] of [['This update', report.completion], ['Current reported total', item.reported], ['Verified total', item.verified]]) {
      const field = within(review()).getByText(label, { exact: true });
      expect(field.parentElement.textContent).toContain(`${value}%`);
    }
    expect(review().textContent).toContain(source.text);
    expect(workspace().projects).toEqual(before);
  });

  it('describes an approved VO as a price approval with a separate claim eligibility review', () => {
    const { project } = fixture();
    const report = project.reports.find(entry => entry.vo && entry.status === 'voApproved');
    const before = workspace().projects;
    mount(report.sourceMessageId);
    expect(within(review()).getByText('Price approved', { exact: true, selector: 'strong' })).toBeTruthy();
    expect(document.querySelector('.wa-result-vo').textContent).toMatch(/claim eligibility/i);
    expect(document.querySelector('.wa-result-vo').textContent).not.toContain('Extra work approved');
    expect(within(review()).getByRole('button', { name: 'Review extra work', exact: true })).toBeTruthy();
    expect(workspace().projects).toEqual(before);
  });

  it('adds a matched update only to reported progress and keeps supervisor verification as the next explicit action', async () => {
    const { project, other } = fixture();
    const source = project.whatsappMessages.find(message => message.kind === 'progress' && message.status === 'new');
    const item = project.items.find(entry => entry.id === source.itemId);
    const user = userEvent.setup();
    mount(source.id);
    await user.click(within(review()).getByRole('button', { name: 'Add progress update', exact: true }));
    await waitFor(() => expect(selectedProject().items.find(entry => entry.id === item.id).reported).toBe(source.completion));
    const saved = selectedProject();
    const report = saved.reports.find(entry => entry.sourceMessageId === source.id);
    expect(report.status).toBe('pending');
    expect(report.message).toBe(source.text);
    expect(report.photo).toBe(source.photo);
    expect(saved.items.find(entry => entry.id === item.id).verified).toBe(item.verified);
    expect(saved.items.filter(entry => entry.id !== item.id)).toEqual(project.items.filter(entry => entry.id !== item.id));
    expect(saved.claimDrafts).toEqual(project.claimDrafts);
    expect(saved.voReviews).toEqual(project.voReviews);
    expect(params().get('message')).toBe(source.id);
    await user.click(within(review()).getByRole('button', { name: 'Review progress', exact: true }));
    expect(screen.getByRole('dialog').textContent).toContain(source.text);
    expect(selectedProject().items.find(entry => entry.id === item.id).verified).toBe(item.verified);
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
  });
});
