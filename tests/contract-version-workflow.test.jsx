import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.jsx';
import { WORKSPACE_STORE } from '../src/data/projects.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.js';
import { clearProjectFormBuffers } from '../src/data/form-buffer.js';
import { markClaimPrepared, saveClaimDraft } from '../src/data/claims.js';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.js';

const now = new Date('2026-10-23T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => {
  const value = workspace();
  return value.projects.find(project => project.id === value.activeProjectId);
};
const revisionDialog = () => screen.getByRole('dialog');
const reasonField = () => within(revisionDialog()).getByRole('textbox', { name: /Change reason/i });
const frozenWorkflow = project => Object.fromEntries([
  'sourceItems', 'reports', 'voReviews', 'whatsappMessages', 'drawingMapping', 'claimDrafts', 'claimTracking',
].map(key => [key, structuredClone(project[key])]));

function fixture() {
  let project = createSITContractDemo({ name: 'S.I.T. contract version demo', code: 'VERSION-SIT' }, now);
  const other = createSITContractDemo({ name: 'Other contract version project', code: 'VERSION-OTHER' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  const prepared = markClaimPrepared(project, project.claimDrafts[0].id);
  if (prepared.outcome !== 'updated') throw new Error(prepared.error);
  const saved = saveClaimDraft(prepared.project, '2026-10', {
    ...prepared.draft.assessment, note: 'Separate unfinished claim retained before a contract correction.',
  });
  if (saved.outcome !== 'updated') throw new Error(saved.error || 'Expected an independent saved draft.');
  project = saved.project;
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return {
    project: loaded.projects.find(entry => entry.id === project.id),
    other: loaded.projects.find(entry => entry.id === other.id),
    preparedId: prepared.draft.id, draftId: saved.draft.id,
  };
}

function mount(hash = '#contract') {
  window.history.replaceState(null, '', hash);
  return render(<App />);
}

async function moreOption(user, name) {
  const summary = screen.getByText('More options', { selector: 'summary' });
  if (!summary.parentElement.open) await user.click(summary);
  await user.click(screen.getByRole('button', { name, exact: true }));
}

async function switchProject(user, from, to) {
  await user.click(screen.getByRole('button', { name: `Project: ${from.name}`, exact: true }));
  await user.click(screen.getByRole('option', { name: new RegExp(to.name) }));
  await waitFor(() => expect(workspace().activeProjectId).toBe(to.id));
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

describe('contract changes stay explicit and saved claims remain frozen', () => {
  it('requires a reason, retains an unfinished reason through cancellation and keeps it isolated by project', async () => {
    const { project, other } = fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount();
    await moreOption(user, 'Edit contract');
    const create = within(revisionDialog()).getByRole('button', { name: 'Create version', exact: true });
    await user.click(create);
    expect(selectedProject().version).toBe(1);
    expect(selectedProject().locked).toBe(true);
    await user.type(reasonField(), 'QS corrected the measured scaffold quantity after checking the drawing.');
    await user.click(within(revisionDialog()).getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await switchProject(user, project, other);
    await moreOption(user, 'Edit contract');
    expect(reasonField().value).toBe('');
    await user.type(reasonField(), 'Separate unfinished reason for the other project.');
    await user.click(within(revisionDialog()).getByRole('button', { name: 'Cancel', exact: true }));
    await switchProject(user, other, project);
    await moreOption(user, 'Edit contract');
    expect(reasonField().value).toBe('QS corrected the measured scaffold quantity after checking the drawing.');
    await user.click(within(revisionDialog()).getByRole('button', { name: 'Cancel', exact: true }));
    view.unmount();
    mount();
    await moreOption(user, 'Edit contract');
    expect(reasonField().value).toBe('QS corrected the measured scaffold quantity after checking the drawing.');
    await user.click(within(revisionDialog()).getByRole('button', { name: 'Cancel', exact: true }));
    expect(workspace().projects).toEqual(before);
  });

  it('creates and confirms a reasoned correction while preserving source evidence and every saved claim', async () => {
    const { project, other, preparedId, draftId } = fixture();
    const before = frozenWorkflow(project);
    const packs = project.claimDrafts.map(draft => buildClaimPack(project, draft.id));
    const csvs = packs.map(result => toClaimCSV(result.pack));
    const first = project.items[0];
    const user = userEvent.setup();
    mount();
    await moreOption(user, 'Edit contract');
    await user.type(reasonField(), 'QS revised the scaffold quantity and rate for the mock correction.');
    await user.click(within(revisionDialog()).getByRole('button', { name: 'Create version', exact: true }));
    await waitFor(() => expect(selectedProject().version).toBe(2));
    expect(selectedProject().locked).toBe(false);
    expect(frozenWorkflow(selectedProject())).toEqual(before);
    expect(selectedProject().baselines.some(entry => entry.version === 1 && entry.items[0].quantity === first.quantity)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Review WI-001', exact: true }));
    const quantity = screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true });
    await user.clear(quantity); await user.type(quantity, '2200');
    const rate = screen.getByRole('spinbutton', { name: /^Unit rate/ });
    await user.clear(rate); await user.type(rate, '14.5');
    await user.click(screen.getByRole('button', { name: 'Back to work items', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Confirm work list', exact: true }));
    const unfinished = await screen.findByRole('dialog', { name: 'Confirm work list', exact: true });
    await user.click(within(unfinished).getByRole('button', { name: 'Confirm work list', exact: true }));
    expect(selectedProject().locked).toBe(false);
    expect(screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true }).value).toBe('2200');
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    expect(selectedProject().items[0].quantity).toBe(2200);
    expect(selectedProject().items[0].rate).toBe(14.5);
    expect(selectedProject().items[0].amount).toBe(31900);
    await user.click(screen.getByRole('button', { name: 'Confirm work list', exact: true }));
    const confirm = await screen.findByRole('dialog', { name: 'Confirm work list', exact: true });
    await user.click(within(confirm).getByRole('button', { name: 'Confirm work list', exact: true }));
    await waitFor(() => expect(selectedProject().locked).toBe(true));
    const persisted = selectedProject();
    expect(persisted.version).toBe(2);
    expect(persisted.items.map(item => [item.id, item.reported, item.verified])).toEqual(project.items.map(item => [item.id, item.reported, item.verified]));
    expect(frozenWorkflow(persisted)).toEqual(before);
    expect(persisted.claimDrafts.find(draft => draft.id === preparedId).status).toBe('prepared');
    expect(persisted.claimDrafts.find(draft => draft.id === draftId).status).toBe('draft');
    expect(markClaimPrepared(persisted, draftId).outcome).toBe('invalid');
    expect(markClaimPrepared(persisted, draftId).error).toMatch(/Source records changed/);
    persisted.claimDrafts.forEach((draft, index) => {
      expect(buildClaimPack(persisted, draft.id)).toEqual(packs[index]);
      expect(toClaimCSV(buildClaimPack(persisted, draft.id).pack)).toBe(csvs[index]);
    });
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
    await moreOption(user, 'Contract versions');
    const history = within(screen.getByRole('dialog', { name: 'Contract versions', exact: true }));
    expect(history.getByText('QS revised the scaffold quantity and rate for the mock correction.')).toBeTruthy();
    expect(history.getAllByText(/Alex Tan/).length).toBeGreaterThan(0);
    expect(history.getByText('Version 2', { exact: true })).toBeTruthy();
    expect(history.getByText('Version 1', { exact: true })).toBeTruthy();
    await user.click(history.getByText(/View changes/, { selector: 'summary' }));
    const differences = within(document.querySelector('.contract-version-changes'));
    const values = label => within(differences.getByText(label, { selector: 'dt', exact: true }).parentElement);
    expect(values('Quantity').getByText('2,088', { exact: true })).toBeTruthy();
    expect(values('Quantity').getByText('2,200', { exact: true })).toBeTruthy();
    expect(values('Unit rate').getByText('SGD 13.50', { exact: true })).toBeTruthy();
    expect(values('Unit rate').getByText('SGD 14.50', { exact: true })).toBeTruthy();
    expect(values('Amount').getByText('SGD 28,188.00', { exact: true })).toBeTruthy();
    expect(values('Amount').getByText('SGD 31,900.00', { exact: true })).toBeTruthy();
    expect(differences.queryByText('Verified', { exact: true })).toBeNull();
    expect(frozenWorkflow(selectedProject())).toEqual(before);
  });

  it('opens earlier demo versions without inventing reasons, reviewers or changes, or altering stored records', async () => {
    fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    await moreOption(user, 'Contract versions');
    const dialog = within(screen.getByRole('dialog', { name: 'Contract versions', exact: true }));
    expect(dialog.getByRole('heading', { name: 'Version 1', exact: true })).toBeTruthy();
    expect(dialog.getByText(/^Not recorded(?: for this earlier version)?\.$/)).toBeTruthy();
    expect(dialog.getByText(/Reviewer not recorded/)).toBeTruthy();
    expect(dialog.getByText('Initial version. No earlier snapshot to compare.', { exact: true })).toBeTruthy();
    expect(dialog.queryByText(/View changes/, { selector: 'summary' })).toBeNull();
    expect(dialog.queryByText(/Alex Tan/)).toBeNull();
    await user.click(dialog.getByRole('button', { name: 'Close', exact: true }));
    expect(workspace().projects).toEqual(before);
    expect(selectedProject().contractVersion).toBeUndefined();
  });
});
