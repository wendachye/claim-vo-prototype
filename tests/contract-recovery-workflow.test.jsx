import { chooseProjectOption } from './project-select-helpers.mjs';
import { chooseSelect } from './select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { createProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { DEMO_CONTRACT_PDF } from '../src/data/contract-import.ts';

const now = new Date('2026-10-23T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const createObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => {
  const value = workspace();
  return value.projects.find(project => project.id === value.activeProjectId);
};
const uploadDialog = () => screen.getByRole('dialog', { name: 'Upload a contract', exact: true });

function fixture({ empty = false } = {}) {
  const original = createSITContractDemo({ name: 'Existing S.I.T. recovery project', code: 'RECOVERY-SIT' }, now);
  const blank = createProject({ name: 'Empty recovery project', code: 'RECOVERY-EMPTY', country: 'Singapore' });
  for (const project of [original, blank]) projectIds.add(project.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2,
    activeProjectId: empty ? blank.id : original.id, projects: [original, blank],
    sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: original.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return {
    original: loaded.projects.find(project => project.id === original.id),
    blank: loaded.projects.find(project => project.id === blank.id),
  };
}

function mount() {
  window.history.replaceState(null, '', '#contract');
  return render(<App />);
}

async function openUpload(user) {
  const trigger = screen.queryByRole('button', { name: 'Contract actions', exact: true });
  if (trigger && trigger.getAttribute('aria-expanded') !== 'true') {
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Upload contract', exact: true }));
  } else if (trigger) {
    await user.click(screen.getByRole('menuitem', { name: 'Upload contract', exact: true }));
  } else {
    await user.click(screen.getByRole('button', { name: 'Upload contract', exact: true }));
  }
  return uploadDialog();
}

async function startFailedDemo(user, { selectedFile = false } = {}) {
  await openUpload(user);
  if (selectedFile) {
    const file = new File(['%PDF-1.7\nBrowser-only original PDF'], 'Original recovery contract.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'slice', { value: () => ({ text: async () => '%PDF-1.7\nBrowser-only original PDF' }) });
    await user.upload(within(uploadDialog()).getByLabelText('Contract PDF', { exact: true }), file);
    await within(uploadDialog()).findByText(file.name, { exact: true });
  } else {
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Use demo PDF', exact: true }));
  }
  await user.click(within(uploadDialog()).getByRole('checkbox', { name: /^Try failed-page demo/ }));
  await user.click(within(uploadDialog()).getByRole('button', { name: 'Start demo extraction', exact: true }));
  await within(uploadDialog()).findByRole('button', { name: 'Retry page', exact: true }, { timeout: 4000 });
}

async function confirmItem(user, id, { useSource = false } = {}) {
  const selector = screen.queryByRole('combobox', { name: 'Choose contract item', exact: true });
  if (selector) await chooseSelect(user, selector, id);
  else await user.click(screen.getByRole('button', { name: `Review ${id}`, exact: true }));
  if (useSource) await user.click(screen.getByRole('button', { name: /^Use source value:/ }));
  await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
  await waitFor(() => expect(selectedProject().items.find(item => item.id === id).needsReview).toBe(false));
}

async function confirmWorkList(user) {
  await user.click(screen.getByRole('button', { name: 'Confirm work list', exact: true }));
  const dialog = screen.getByRole('dialog', { name: 'Confirm work list', exact: true });
  await user.click(within(dialog).getByRole('button', { name: 'Confirm work list', exact: true }));
  await waitFor(() => expect(selectedProject().locked).toBe(true));
}

async function switchProject(user, from, to) {
  await user.click(screen.getByRole('button', { name: `Project: ${from.name}`, exact: true }));
  await chooseProjectOption(user, to);
  await waitFor(() => expect(workspace().activeProjectId).toBe(to.id));
}

async function manualField(user, id, label, value) {
  const control = within(uploadDialog()).getByLabelText(`${label} · ${id}`, { exact: true });
  if (control.getAttribute('role') === 'combobox') await chooseSelect(user, control, value);
  else { await user.clear(control); await user.type(control, value); }
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  let objectUrlCount = 0;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:contract-recovery-source-${++objectUrlCount}`) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});

afterEach(() => {
  cleanup();
  for (const project of workspace()?.projects || []) projectIds.add(project.id);
  for (const id of projectIds) clearProjectFormBuffers(id);
  projectIds.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const [name, descriptor] of [['createObjectURL', createObjectURL], ['revokeObjectURL', revokeObjectURL]]) {
    if (descriptor) Object.defineProperty(URL, name, descriptor);
    else delete URL[name];
  }
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('mock extraction recovery keeps original sources and claims intact', () => {
  it('retries the unresolved part of page 1, retains the selected PDF and opens an independent review without changing saved claims', async () => {
    const { original, blank } = fixture();
    const originalPack = buildClaimPack(original, original.claimDrafts[0].id).pack;
    const originalCSV = toClaimCSV(originalPack);
    const unfinished = { note: 'Unfinished QS work stays in the original project.' };
    writeFormBuffer(original.id, 'recovery-test-existing-form', unfinished);
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    await startFailedDemo(user, { selectedFile: true });
    expect(within(uploadDialog()).getByRole('button', { name: 'Review work list', exact: true }).disabled).toBe(true);
    expect(within(uploadDialog()).getByRole('link', { name: 'Demo source PDF', exact: true }).getAttribute('href')).toBe(DEMO_CONTRACT_PDF);
    expect(within(uploadDialog()).getByRole('link', { name: 'Preview selected PDF', exact: true }).getAttribute('href')).toBe('blob:contract-recovery-source-1');
    expect(uploadDialog().textContent).toContain('1,320');
    expect(uploadDialog().textContent).toContain('floor finish');
    expect(workspace().projects).toEqual(before);
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Retry page', exact: true }));
    await waitFor(() => expect(within(uploadDialog()).getByRole('button', { name: 'Review work list', exact: true }).disabled).toBe(false), { timeout: 2000 });
    expect(uploadDialog().textContent).toContain('1,320');
    expect(within(uploadDialog()).getByRole('link', { name: 'Preview selected PDF', exact: true }).getAttribute('href')).toBe('blob:contract-recovery-source-1');
    expect(workspace().projects).toEqual(before);
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Review work list', exact: true }));
    await screen.findByRole('heading', { name: 'Contract review', exact: true });
    const imported = selectedProject();
    projectIds.add(imported.id);
    expect(imported.id).not.toBe(original.id);
    expect(imported.items).toHaveLength(6);
    expect(imported.sourceItems).toHaveLength(6);
    expect(imported.contract.sourcePageCount).toBe(1);
    expect(imported.contract.sourceFile).toBe(DEMO_CONTRACT_PDF);
    expect(imported.contract.demoImport.fileName).toBe('Original recovery contract.pdf');
    await user.click(document.querySelector('.contract-import-details > summary'));
    expect(screen.getByRole('link', { name: 'Preview selected PDF', exact: true }).getAttribute('href')).toBe('blob:contract-recovery-source-2');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:contract-recovery-source-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:contract-recovery-source-2');
    expect(imported.items.find(item => item.id === 'WI-001').rawExtractedQuantity).toBe(1320);
    expect(screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true }).value).toBe('1320');
    expect(imported.locked).toBe(false);
    const sources = structuredClone(imported.sourceItems);
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    expect(selectedProject().items.find(item => item.id === 'WI-001').needsReview).toBe(true);
    await confirmItem(user, 'WI-001', { useSource: true });
    await confirmWorkList(user);
    expect(selectedProject().sourceItems).toEqual(sources);
    expect(selectedProject().claimDrafts).toEqual([]);
    expect(workspace().projects.find(project => project.id === original.id)).toEqual(original);
    expect(workspace().projects.find(project => project.id === blank.id)).toEqual(blank);
    expect(toClaimCSV(buildClaimPack(workspace().projects.find(project => project.id === original.id), original.claimDrafts[0].id).pack)).toBe(originalCSV);
    expect(readFormBuffer(original.id, 'recovery-test-existing-form')).toEqual(unfinished);
  }, 12000);

  it('requires explicit manual fields, preserves successful rows and reviews entered items against the unchanged source before confirmation', async () => {
    const { original, blank } = fixture({ empty: true });
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    await startFailedDemo(user);
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Enter manually', exact: true }));
    await manualField(user, 'WI-002', 'Description', 'Block A — roof sheeting');
    await manualField(user, 'WI-002', 'Quantity', '850');
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Save manual entries', exact: true }));
    expect(screen.queryByRole('heading', { name: 'Contract review', exact: true })).toBeNull();
    expect(workspace().projects).toEqual(before);
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Back to results', exact: true }));
    expect(within(uploadDialog()).getByRole('button', { name: 'Review work list', exact: true }).disabled).toBe(true);
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Enter manually', exact: true }));
    expect(within(uploadDialog()).getByLabelText('Quantity · WI-002', { exact: true }).value).toBe('850');
    for (const [id, fields] of [
      ['WI-002', { Description: 'Block A — roof sheeting', Unit: 'm²', Quantity: '850', Rate: '42', Location: 'Block A' }],
      ['WI-004', { Description: 'Block B — loading-bay door installation', Unit: 'set', Quantity: '4', Rate: '3200', Location: 'Block B' }],
    ]) for (const [label, value] of Object.entries(fields)) await manualField(user, id, label, value);
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Save manual entries', exact: true }));
    await waitFor(() => expect(within(uploadDialog()).getByRole('button', { name: 'Review work list', exact: true }).disabled).toBe(false));
    expect(uploadDialog().textContent).toContain('1,320');
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Review work list', exact: true }));
    await screen.findByRole('heading', { name: 'Contract review', exact: true });
    const imported = selectedProject();
    expect(imported.id).toBe(blank.id);
    expect(imported.items).toHaveLength(6);
    expect(imported.items.filter(item => item.needsReview).map(item => item.id)).toEqual(['WI-001', 'WI-002', 'WI-004']);
    expect(imported.sourceItems.find(item => item.id === 'WI-002').quantity).toBe(900);
    expect(imported.items.find(item => item.id === 'WI-002').quantity).toBe(850);
    expect(imported.contract.sourceFile).toBe(DEMO_CONTRACT_PDF);
    const sources = structuredClone(imported.sourceItems);
    const successful = structuredClone(imported.items.filter(item => ['WI-003', 'WI-005', 'WI-006'].includes(item.id)));
    await confirmItem(user, 'WI-001', { useSource: true });
    expect(screen.queryByRole('button', { name: 'Confirm work list', exact: true })).toBeNull();
    expect(selectedProject().locked).toBe(false);
    await confirmItem(user, 'WI-002', { useSource: true });
    await confirmItem(user, 'WI-004');
    await confirmWorkList(user);
    expect(selectedProject().sourceItems).toEqual(sources);
    expect(selectedProject().items.filter(item => ['WI-003', 'WI-005', 'WI-006'].includes(item.id))).toEqual(successful);
    expect(selectedProject().claimDrafts).toEqual([]);
    expect(workspace().projects.find(project => project.id === original.id)).toEqual(original);
  }, 14000);

  it('cancels a failed extraction without changing records or sharing its selected PDF with another project', async () => {
    const { original, blank } = fixture();
    const before = workspace().projects;
    const user = userEvent.setup();
    mount();
    await startFailedDemo(user, { selectedFile: true });
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Close dialog', exact: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(workspace().projects).toEqual(before);
    await switchProject(user, original, blank);
    await openUpload(user);
    expect(within(uploadDialog()).queryByRole('link', { name: 'Preview selected PDF', exact: true })).toBeNull();
    expect(within(uploadDialog()).getByRole('button', { name: 'Start demo extraction', exact: true }).disabled).toBe(true);
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Close dialog', exact: true }));
    await switchProject(user, blank, original);
    expect(workspace().projects).toEqual(before);
  }, 10000);

  it('keeps unknown manual quantities and rates blank and blocks confirmation until both values are reviewed explicitly', async () => {
    const { original } = fixture({ empty: true });
    const user = userEvent.setup();
    mount();
    await startFailedDemo(user);
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Enter manually', exact: true }));
    for (const [id, fields] of [
      ['WI-002', { Description: 'Block A — roof sheeting', Unit: 'm²', Location: 'Block A' }],
      ['WI-004', { Description: 'Block B — loading-bay door installation', Unit: 'set', Quantity: '4', Rate: '3200', Location: 'Block B' }],
    ]) for (const [label, value] of Object.entries(fields)) await manualField(user, id, label, value);
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Save manual entries', exact: true }));
    expect(uploadDialog().textContent).toContain('Unknown');
    await user.click(within(uploadDialog()).getByRole('button', { name: 'Review work list', exact: true }));
    await screen.findByRole('heading', { name: 'Contract review', exact: true });
    await confirmItem(user, 'WI-001', { useSource: true });
    const entered = selectedProject().items.find(item => item.id === 'WI-002');
    expect(entered.quantity).toBeNull();
    expect(entered.rate).toBeNull();
    expect(entered.amount).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Review WI-002', exact: true }));
    expect(screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true }).value).toBe('');
    const rate = screen.getByRole('spinbutton', { name: /^Unit rate/ });
    expect(rate.value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    expect(selectedProject().items.find(item => item.id === 'WI-002').quantity).toBeNull();
    expect(selectedProject().items.find(item => item.id === 'WI-002').needsReview).toBe(true);
    expect(selectedProject().locked).toBe(false);
    await user.click(screen.getByRole('button', { name: /^Use source value:/ }));
    expect(screen.getByRole('spinbutton', { name: 'Contract quantity', exact: true }).value).toBe('900');
    expect(rate.value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    expect(selectedProject().items.find(item => item.id === 'WI-002').needsReview).toBe(true);
    await user.type(rate, '42');
    await user.click(screen.getByRole('button', { name: 'Confirm item', exact: true }));
    await waitFor(() => expect(selectedProject().items.find(item => item.id === 'WI-002').needsReview).toBe(false));
    await confirmItem(user, 'WI-004');
    await confirmWorkList(user);
    expect(selectedProject().items.find(item => item.id === 'WI-002').amount).toBe(37800);
    expect(selectedProject().sourceItems.find(item => item.id === 'WI-002').quantity).toBe(900);
    expect(workspace().projects.find(project => project.id === original.id)).toEqual(original);
  }, 12000);
});
