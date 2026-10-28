import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

const now = new Date('2026-10-28T10:00:00+08:00');
const ids = new Set();
const stored = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const active = () => { const workspace = stored(); return workspace.projects.find(project => project.id === workspace.activeProjectId); };
const savedClaims = project => project.claimDrafts.map(draft => ({ draft, pack: buildClaimPack(project, draft.id), csv: toClaimCSV(buildClaimPack(project, draft.id).pack) }));
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
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
  window.history.replaceState(null, '', '#dashboard');
});

it('dismisses and reopens one inbox original through the saved App flow, updating attention while retaining claims and all evidence', async () => {
  const workspace = loadShowcaseWorkspace(localStorage, now);
  workspace.projects.forEach(project => ids.add(project.id));
  const main = workspace.projects.find(project => project.id === workspace.sitShowcase.projectId);
  const source = main.whatsappMessages.find(message => message.photo);
  const message = { id: 'INBOX-DISMISS-WALKTHROUGH', projectId: main.id, projectCode: main.code,
    kind: 'progress', status: 'new', sender: 'Demo worker', senderRole: 'Worker (demo)',
    text: 'Wrong project: please ignore this duplicate delivery photo.', photo: source.photo, photoAlt: source.photoAlt,
    date: '2026-10-28T09:00:00+08:00', demo: true };
  main.whatsappMessages.push(message);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify(workspace));
  window.history.replaceState(null, '', `#whatsapp?message=${message.id}`);
  const user = userEvent.setup();
  let view = render(<App />);
  const before = structuredClone(active());
  const otherProjects = structuredClone(stored().projects.filter(project => project.id !== main.id));
  const claims = savedClaims(before);
  const count = getProjectAttention(before).length;
  expect(getProjectAttention(before).filter(task => task.target.messageId === message.id)).toHaveLength(1);
  expect(screen.getByRole('button', { name: `Needs attention, ${count} pending tasks` })).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Message actions', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Dismiss message', exact: true }));
  let form = within(screen.getByRole('dialog', { name: 'Dismiss message', exact: true }));
  await user.click(form.getByRole('button', { name: 'Dismiss message', exact: true }));
  expect(active()).toEqual(before);
  await user.type(form.getByRole('textbox', { name: /^Reason for dismissal/ }), 'Wrong project; keep the original delivery photo in history.');
  await user.click(form.getByRole('button', { name: 'Dismiss message', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dismiss message', exact: true })).toBeNull());
  expect(active().messageInboxDecisions).toHaveLength(1);
  expect(screen.getByText('Wrong project; keep the original delivery photo in history.', { exact: true })).toBeTruthy();
  expect(screen.getByRole('button', { name: `Needs attention, ${count - 1} pending tasks` })).toBeTruthy();
  expect(getProjectAttention(active()).some(task => task.target.messageId === message.id)).toBe(false);
  expect(screen.queryByRole('button', { name: 'Add progress update', exact: true })).toBeNull();
  expect(active().whatsappMessages).toEqual(before.whatsappMessages);
  expect(active().reports).toEqual(before.reports);
  expect(active().items).toEqual(before.items);
  expect(savedClaims(active())).toEqual(claims);
  expect(stored().projects.filter(project => project.id !== main.id)).toEqual(otherProjects);

  // Reload the exact record, then use the Dismissed filter to find it in retained history.
  view.unmount(); view = render(<App />);
  expect(screen.getByText('Wrong project; keep the original delivery photo in history.', { exact: true })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Back to messages', exact: true }));
  await chooseSelect(user, screen.getByRole('combobox', { name: 'Filter site updates', exact: true }), 'dismissed');
  await user.click(screen.getByRole('button', { name: /^Open message:/ }));
  await user.click(screen.getByRole('button', { name: 'Message actions', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Reopen', exact: true }));
  form = within(screen.getByRole('dialog', { name: 'Reopen message', exact: true }));
  await user.click(form.getByRole('button', { name: 'Reopen message', exact: true }));
  expect(active().messageInboxDecisions).toHaveLength(1);
  await user.type(form.getByRole('textbox', { name: /^Reason for reopening/ }), 'The project lead asked us to review this original again.');
  await user.click(form.getByRole('button', { name: 'Reopen message', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Reopen message', exact: true })).toBeNull());
  expect(active().messageInboxDecisions).toHaveLength(2);
  expect(screen.getByRole('button', { name: `Needs attention, ${count} pending tasks` })).toBeTruthy();
  expect(getProjectAttention(active()).filter(task => task.target.messageId === message.id)).toHaveLength(1);
  expect(active().whatsappMessages).toEqual(before.whatsappMessages);
  expect(active().reports).toEqual(before.reports);
  expect(active().items).toEqual(before.items);
  expect(active().voReviews).toEqual(before.voReviews);
  expect(active().baselines).toEqual(before.baselines);
  expect(active().seed).toEqual(before.seed);
  expect(savedClaims(active())).toEqual(claims);
  expect(stored().projects.filter(project => project.id !== main.id)).toEqual(otherProjects);
  view.unmount();
});
