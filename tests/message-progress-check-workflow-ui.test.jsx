import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { addProgressCheckExamples } from '../src/data/message-progress-check-demo.ts';
import { getMessageProgressCheck } from '../src/data/message-progress-check.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-24T10:00:00+08:00');
const ids = new Set();
const stored = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const active = () => { const data = stored(); return data.projects.find(project => project.id === data.activeProjectId); };
const protectedState = project => ({ items: project.items, reports: project.reports, claimDrafts: project.claimDrafts,
  claimTracking: project.claimTracking, baselines: project.baselines, drawingMapping: project.drawingMapping, seed: project.seed,
  exports: project.claimDrafts.map(claim => toClaimCSV(buildClaimPack(project, claim.id).pack)) });
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
beforeEach(() => {
  localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup(); ids.forEach(clearProjectFormBuffers); ids.clear(); localStorage.clear();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (scrollDescriptor) Object.defineProperty(Element.prototype, 'scrollTo', scrollDescriptor);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});
function fixture(withExamples = false) {
  const workspace = loadShowcaseWorkspace(localStorage, now);
  workspace.projects.forEach(project => ids.add(project.id));
  let main = workspace.projects.find(project => project.id === workspace.sitShowcase.projectId);
  if (withExamples) {
    main = addProgressCheckExamples(main, now).project;
    workspace.projects = workspace.projects.map(project => project.id === main.id ? main : project);
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify(workspace));
  }
  return { workspace, main };
}
function mount(messageId) {
  window.history.replaceState(null, '', `#whatsapp${messageId ? `?message=${encodeURIComponent(messageId)}` : ''}`);
  return render(<App />);
}
function classified(project, kind) {
  for (const source of project.whatsappMessages.filter(message => message.status === 'new')) {
    const context = getMessageMatchContext(project, source.id);
    if (!context.eligible || !context.fields) continue;
    const reviewed = saveMessageMatchReview(project, source.id, { itemId: context.fields.itemId, areaId: context.fields.areaId, reason: '' }, now);
    if (getMessageProgressCheck(reviewed.project, source.id)?.kind === kind) return source;
  }
  throw new Error(`No ${kind} mock message available`);
}

it('adds reusable inbox examples, opens the exact latest report across reload and returns to the incoming message without changing claims or progress', async () => {
  const { workspace, main } = fixture();
  const before = structuredClone(protectedState(main));
  const others = structuredClone(workspace.projects.filter(project => project.id !== main.id));
  const user = userEvent.setup();
  let view = mount();
  await user.click(screen.getByRole('button', { name: 'Demo options', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Try progress checks', exact: true }));
  await waitFor(() => expect(active().whatsappMessages).toHaveLength(main.whatsappMessages.length + 3));
  const sourceId = new URLSearchParams(location.hash.split('?')[1]).get('message');
  expect(screen.queryByRole('region', { name: 'Progress check', exact: true })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
  const panel = within(screen.getByRole('region', { name: 'Progress check', exact: true }));
  expect(panel.getByText('Already reported at 65% · total stays 65%.', { exact: true })).toBeTruthy();
  expect(protectedState(active())).toEqual(before);
  const check = getMessageProgressCheck(active(), sourceId);
  const latest = main.reports.find(report => report.id === check.latestReportId);
  await user.click(panel.getByRole('button', { name: 'View latest report', exact: true }));
  await waitFor(() => expect(new URLSearchParams(location.hash.split('?')[1]).get('report')).toBe(latest.id));
  expect(new URLSearchParams(location.hash.split('?')[1]).get('message')).toBe(sourceId);
  expect((await screen.findByRole('dialog')).querySelector('blockquote')?.textContent).toBe(latest.message);
  view.unmount(); view = render(<App />);
  expect((await screen.findByRole('dialog')).querySelector('blockquote')?.textContent).toBe(latest.message);
  await user.click(screen.getByRole('button', { name: 'Close site report', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Back to message', exact: true }));
  await waitFor(() => expect(new URLSearchParams(location.hash.split('?')[1]).get('message')).toBe(sourceId));
  expect(screen.getByRole('region', { name: 'Progress check', exact: true })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Back to messages', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Demo options', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Try progress checks', exact: true }));
  expect(active().whatsappMessages).toHaveLength(main.whatsappMessages.length + 3);
  expect(protectedState(active())).toEqual(before);
  expect(stored().projects.filter(project => project.id !== main.id)).toEqual(others);
}, 20000);

it('shows older and lower guidance while retaining the existing chronology and supervisor-reason guards and frozen saved claims', async () => {
  const { main } = fixture(true);
  const before = structuredClone(protectedState(main));
  const originalMessages = structuredClone(main.whatsappMessages);
  const older = classified(main, 'older');
  const lower = classified(main, 'lower');
  const user = userEvent.setup();
  let view = mount(older.id);
  await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
  expect(within(screen.getByRole('region', { name: 'Progress check' })).getByText('A newer report exists.', { exact: true })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add progress update', exact: true })).toBeNull();
  expect(screen.getByText('This earlier update needs clarification. Current progress stays unchanged.', { exact: true })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Needs clarification', exact: true }));
  await waitFor(() => expect(active().whatsappMessages.find(message => message.id === older.id).status).toBe('clarification'));
  expect(screen.getByRole('region', { name: 'Progress check' })).toBeTruthy();
  expect(protectedState(active())).toEqual(before);
  view.unmount(); view = mount(lower.id);
  await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
  const panel = within(screen.getByRole('region', { name: 'Progress check' }));
  expect(panel.getByText('Below the verified total of 50%.', { exact: true })).toBeTruthy();
  expect(panel.getByText(/record a reason/)).toBeTruthy();
  expect(protectedState(active())).toEqual(before);
  await user.click(screen.getByRole('button', { name: 'Add progress update', exact: true }));
  const report = active().reports.find(entry => entry.sourceMessageId === lower.id);
  expect(active().items.find(item => item.id === report.itemId).verified).toBe(50);
  await user.click(screen.getByRole('button', { name: 'Review progress', exact: true }));
  const dialog = within(await screen.findByRole('dialog'));
  await user.click(dialog.getByRole('button', { name: 'Verify progress', exact: true }));
  expect(dialog.getByText('Explain the lower verified total before verifying progress.', { exact: true })).toBeTruthy();
  expect(active().items.find(item => item.id === report.itemId).verified).toBe(50);
  expect(active().claimDrafts).toEqual(before.claimDrafts);
  expect(active().claimDrafts.map(claim => toClaimCSV(buildClaimPack(active(), claim.id).pack))).toEqual(before.exports);
  for (const original of originalMessages) {
    const current = active().whatsappMessages.find(message => message.id === original.id);
    for (const field of ['text', 'photo', 'photoAlt', 'sender', 'date']) expect(current[field]).toEqual(original[field]);
  }
}, 20000);
