import { chooseProjectOption } from './project-select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { createContractRevision } from '../src/data/contract-versions.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

const now = new Date('2026-10-24T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => {
  const value = workspace();
  return value.projects.find(project => project.id === value.activeProjectId);
};
const checksPanel = () => within(document.querySelector('#contract-checks'));
const reasonField = () => checksPanel().getByRole('textbox', { name: /Reason for total difference/ });
const frozenWorkflow = project => Object.fromEntries([
  'contract', 'sourceItems', 'items', 'reports', 'voReviews', 'whatsappMessages', 'drawingMapping',
  'messageClarifications', 'claimDrafts', 'claimTracking', 'baselines',
].map(key => [key, structuredClone(project[key])]));
const claims = project => project.claimDrafts.map(draft => ({
  result: buildClaimPack(project, draft.id),
  csv: toClaimCSV(buildClaimPack(project, draft.id).pack),
}));

function fixture({ mismatch = true, partial = false, confirmed = false } = {}) {
  let project = partial
    ? createSITContractDemo({ name: 'S.I.T. partial review demo', code: 'TOTAL-PARTIAL' }, now)
    : createClaimExamplesDemo({ name: 'Complete schedule review demo', code: 'TOTAL-REVIEW' }, now);
  if (!partial) project.contract.representativeSubset = false;
  if (!confirmed) {
    const result = createContractRevision(project, 'Review the current fictional schedule before confirmation.', now);
    if (result.outcome !== 'updated') throw new Error(result.error);
    project = result.project;
  }
  if (mismatch && !partial) {
    project.items[0].quantity = 1100;
    project.items[0].amount = 27500;
  }
  const other = createSITContractDemo({ name: 'Other total review project', code: 'TOTAL-OTHER' }, now);
  for (const value of [project, other]) projectIds.add(value.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: partial ? project.id : other.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return {
    project: loaded.projects.find(entry => entry.id === project.id),
    other: loaded.projects.find(entry => entry.id === other.id),
  };
}

function mount() {
  window.history.replaceState(null, '', '#contract');
  return render(<App />);
}

async function expandChecks(user) {
  const summary = checksPanel().getByRole('button', { name: /^Contract checks/ });
  if (summary.getAttribute('aria-expanded') !== 'true') await user.click(summary);
  return checksPanel();
}

async function openReview(user) {
  await user.click(screen.getAllByRole('button', { name: 'Review total difference', exact: true })[0]);
  return reasonField();
}

async function confirmWorkList(user) {
  await user.click(await screen.findByRole('button', { name: 'Confirm work list', exact: true }));
  const dialog = await screen.findByRole('dialog', { name: 'Confirm work list', exact: true });
  await user.click(within(dialog).getByRole('button', { name: 'Confirm work list', exact: true }));
  await waitFor(() => expect(selectedProject().locked).toBe(true));
}

async function moreOption(user, name) {
  const trigger = screen.getByRole('button', { name: 'More options', exact: true });
  if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name, exact: true }));
}

async function switchProject(user, from, to) {
  await user.click(screen.getByRole('button', { name: `Project: ${from.name}`, exact: true }));
  await chooseProjectOption(user, to);
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

describe('total difference review connects source checks to explicit baseline confirmation', () => {
  it('confirms a matching complete schedule without a reason form or changing saved claims', async () => {
    const { project, other } = fixture({ mismatch: false });
    const before = frozenWorkflow(project);
    const savedClaims = claims(project);
    const user = userEvent.setup();
    mount();
    const panel = await expandChecks(user);
    expect(panel.queryByRole('button', { name: 'Review total difference', exact: true })).toBeNull();
    expect(panel.queryByRole('textbox', { name: /Reason for total difference/ })).toBeNull();
    await confirmWorkList(user);
    expect(frozenWorkflow(selectedProject())).toEqual(before);
    expect(claims(selectedProject())).toEqual(savedClaims);
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
  });

  it('requires a saved reason for a mismatched full schedule and retains it with the confirmed version', async () => {
    const { project, other } = fixture();
    const before = frozenWorkflow(project);
    const savedClaims = claims(project);
    const pendingClaim = { note: 'Keep this unrelated unfinished claim assessment.' };
    writeFormBuffer(project.id, 'total-review-existing-claim-form', pendingClaim);
    const reason = 'QS checked both source rows. The declared value includes an allowance outside this priced work list.';
    const user = userEvent.setup();
    const view = mount();
    expect(screen.queryByRole('button', { name: 'Confirm work list', exact: true })).toBeNull();
    await openReview(user);
    await user.click(checksPanel().getByRole('button', { name: 'Save reason', exact: true }));
    expect(selectedProject().locked).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Confirm work list', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm work list', exact: true })).toBeNull();
    await user.type(reasonField(), reason);
    await user.click(checksPanel().getByRole('button', { name: 'Save reason', exact: true }));
    expect(selectedProject().locked).toBe(false);
    expect(frozenWorkflow(selectedProject())).toEqual(before);
    expect(claims(selectedProject())).toEqual(savedClaims);
    expect(checksPanel().getByText('Difference reviewed', { exact: true })).toBeTruthy();
    expect(checksPanel().getByText(reason, { exact: true })).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Confirm work list', exact: true }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm work list', exact: true });
    expect(within(dialog).getByText(reason, { exact: true })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel', exact: true }));
    expect(selectedProject().locked).toBe(false);
    view.unmount();
    mount();
    expect((await expandChecks(user)).getByText(reason, { exact: true })).toBeTruthy();
    await confirmWorkList(user);
    expect(frozenWorkflow(selectedProject())).toEqual(before);
    expect(claims(selectedProject())).toEqual(savedClaims);
    expect(readFormBuffer(project.id, 'total-review-existing-claim-form')).toEqual(pendingClaim);
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
    await moreOption(user, 'Contract versions');
    const history = within(screen.getByRole('dialog', { name: 'Contract versions', exact: true }));
    expect(history.getByText(reason, { exact: true })).toBeTruthy();
    await user.click(history.getByRole('button', { name: 'Close', exact: true }));
    await moreOption(user, 'Edit contract');
    const revision = within(screen.getByRole('dialog'));
    await user.type(revision.getByRole('textbox', { name: /Change reason/i }), 'Next mock correction needs a separate total review.');
    await user.click(revision.getByRole('button', { name: 'Create version', exact: true }));
    await waitFor(() => expect(selectedProject().version).toBe(3));
    expect(selectedProject().locked).toBe(false);
    expect(screen.getAllByRole('button', { name: 'Review total difference', exact: true }).length).toBeGreaterThan(0);
    expect(claims(selectedProject())).toEqual(savedClaims);
    await moreOption(user, 'Contract versions');
    const archived = within(screen.getByRole('dialog', { name: 'Contract versions', exact: true }));
    const versionTwo = archived.getByRole('heading', { name: 'Version 2', exact: true }).closest('li');
    expect(within(versionTwo).getByText(reason, { exact: true })).toBeTruthy();
  });

  it('invalidates a recorded explanation after a saved item change without revising source evidence or saved claims', async () => {
    const { project } = fixture();
    const savedClaims = claims(project);
    const sources = structuredClone(project.sourceItems);
    const user = userEvent.setup();
    mount();
    await openReview(user);
    await user.type(reasonField(), 'First review of the fictional schedule difference.');
    await user.click(checksPanel().getByRole('button', { name: 'Save reason', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Review WI-001', exact: true }));
    const quantity = screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true });
    await user.clear(quantity); await user.type(quantity, '1200');
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    expect(selectedProject().items[0].amount).toBe(30000);
    expect(selectedProject().locked).toBe(false);
    expect(screen.queryByRole('button', { name: 'Confirm work list', exact: true })).toBeNull();
    await openReview(user);
    const updatedReason = 'QS rechecked the changed quantity and the resulting new total difference.';
    await user.clear(reasonField()); await user.type(reasonField(), updatedReason);
    await user.click(checksPanel().getByRole('button', { name: 'Save reason', exact: true }));
    await confirmWorkList(user);
    expect(selectedProject().sourceItems).toEqual(sources);
    expect(selectedProject().items.map(item => [item.id, item.reported, item.verified])).toEqual(project.items.map(item => [item.id, item.reported, item.verified]));
    expect(claims(selectedProject())).toEqual(savedClaims);
  });

  it('keeps cancelled reasons isolated by project and bound to the same saved work-list basis', async () => {
    const { project, other } = fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    const unfinished = 'Unfinished explanation for this complete schedule only.';
    await openReview(user);
    await user.type(reasonField(), unfinished);
    await user.click(checksPanel().getByRole('button', { name: 'Cancel', exact: true }));
    expect(workspace().projects).toEqual(before);
    await switchProject(user, project, other);
    expect((await expandChecks(user)).queryByRole('textbox', { name: /Reason for total difference/ })).toBeNull();
    expect(checksPanel().queryByText(unfinished, { exact: true })).toBeNull();
    await switchProject(user, other, project);
    expect((await openReview(user)).value).toBe(unfinished);
    await user.click(checksPanel().getByRole('button', { name: 'Cancel', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Review WI-001', exact: true }));
    const quantity = screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true });
    await user.clear(quantity); await user.type(quantity, '1200');
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    expect((await openReview(user)).value).toBe('');
    expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
  });

  it('keeps unfinished item edits intact and refuses to record a reason against their older saved values', async () => {
    const { project } = fixture();
    const before = selectedProject();
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Review WI-001', exact: true }));
    const description = screen.getByRole('textbox', { name: 'Work description', exact: true });
    await user.clear(description);
    await user.type(description, 'Unfinished source correction: keep this local item edit.');
    await user.click(screen.getByRole('button', { name: 'Back to work items', exact: true }));
    await user.click(screen.getAllByRole('button', { name: 'Review total difference', exact: true })[0]);
    expect(screen.getByRole('textbox', { name: 'Work description', exact: true }).value).toBe('Unfinished source correction: keep this local item edit.');
    expect(screen.queryByRole('textbox', { name: /Reason for total difference/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to work items', exact: true }));
    const panel = await expandChecks(user);
    await user.click(panel.getByRole('button', { name: 'Review total difference', exact: true }));
    await user.type(reasonField(), 'Do not save this reason while the item form is unfinished.');
    await user.click(checksPanel().getByRole('button', { name: 'Save reason', exact: true }));
    expect(checksPanel().getByText(/Save or revert unfinished contract item edits before reviewing the total/)).toBeTruthy();
    expect(selectedProject()).toEqual(before);
    expect(claims(selectedProject())).toEqual(claims(project));
    await user.click(checksPanel().getByRole('button', { name: 'Cancel', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Review WI-001', exact: true }));
    expect(screen.getByRole('textbox', { name: 'Work description', exact: true }).value).toBe('Unfinished source correction: keep this local item edit.');
  });

  it('keeps the S.I.T. partial schedule exempt and confirms it without inventing a difference reason', async () => {
    const { project } = fixture({ partial: true });
    const before = frozenWorkflow(project);
    const savedClaims = claims(project);
    const user = userEvent.setup();
    mount();
    const panel = await expandChecks(user);
    expect(panel.getByText('Partial schedule', { exact: true })).toBeTruthy();
    expect(panel.queryByRole('button', { name: 'Review total difference', exact: true })).toBeNull();
    expect(panel.queryByRole('textbox', { name: /Reason for total difference/ })).toBeNull();
    await confirmWorkList(user);
    expect(frozenWorkflow(selectedProject())).toEqual(before);
    expect(claims(selectedProject())).toEqual(savedClaims);
  });

  it('opens an already confirmed legacy difference without requiring a new review or changing records', async () => {
    fixture({ confirmed: true });
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount();
    const panel = await expandChecks(user);
    expect(panel.queryByRole('button', { name: 'Review total difference', exact: true })).toBeNull();
    expect(panel.queryByRole('textbox', { name: /Reason for total difference/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue to site updates', exact: true })).toBeTruthy();
    view.unmount();
    mount();
    await expandChecks(user);
    expect(workspace().projects).toEqual(before);
  });
});
