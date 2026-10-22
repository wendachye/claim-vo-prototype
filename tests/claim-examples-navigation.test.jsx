import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.jsx';
import { createProject, WORKSPACE_STORE } from '../src/data/projects.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.js';
import { buildClaimPack } from '../src/data/claim-pack.js';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.js';

const now = new Date('2026-10-22T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const rowFor = (month) => screen.getByRole('heading', { name: month, exact: true }).closest('article');

function setup() {
  const project = createSITContractDemo({ name: 'Original claims project', code: 'EXAMPLES-ORIGINAL' }, now);
  const other = createProject({ name: 'Other claims project', code: 'EXAMPLES-OTHER' });
  projectIds.add(project.id); projectIds.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  const original = loaded.projects.find(entry => entry.id === project.id);
  const buffer = { [original.claimDrafts[0].period]: { ...original.claimDrafts[0].assessment, note: 'Keep this unfinished original-project note.' } };
  writeFormBuffer(project.id, 'claims:forms', buffer);
  writeFormBuffer(project.id, 'claims:dirty', { [original.claimDrafts[0].period]: true });
  return { project: original, buffer };
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

describe('independent claim examples walkthrough', () => {
  it('opens incomplete, ready and paid examples without replacing the selected project or its unfinished work', async () => {
    const { project, buffer } = setup();
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#claims?tab=drafts');
    let view = render(<App />);
    await screen.findByRole('heading', { name: 'Monthly claims', exact: true });
    const before = workspace().projects;
    const originalPack = buildClaimPack(project, project.claimDrafts[0].id);
    await user.click(screen.getByRole('button', { name: 'Try claim examples', exact: true }));
    await waitFor(() => expect(workspace().projects).toHaveLength(before.length + 1));
    const exampleId = workspace().activeProjectId;
    expect(exampleId).not.toBe(project.id);
    projectIds.add(exampleId);
    const example = workspace().projects.find(entry => entry.id === exampleId);
    expect(example.claimExamplesDemo).toBe(true);
    expect(screen.queryByRole('button', { name: 'Try claim examples', exact: true })).toBeNull();
    expect(example.claimDrafts).toHaveLength(3);
    expect(workspace().projects.filter(entry => entry.id !== exampleId)).toEqual(before);
    expect(readFormBuffer(project.id, 'claims:forms')).toEqual(buffer);
    expect(screen.queryByText('Version details', { exact: true })).toBeNull();

    const incomplete = example.claimDrafts.find(entry => entry.period === '2026-10');
    const ready = example.claimDrafts.find(entry => entry.period === '2026-09');
    const paid = example.claimDrafts.find(entry => entry.period === '2026-08');
    expect(incomplete.snapshot.canPrepare).toBe(false);
    expect(ready.snapshot.canPrepare).toBe(true);
    const incompleteRow = rowFor('October 2026');
    expect(within(incompleteRow).getByRole('button', { name: 'Mark prepared' }).disabled).toBe(true);
    await user.click(within(incompleteRow).getByRole('button', { name: 'Continue editing', exact: true }));
    const unassessed = incomplete.snapshot.workRows.find(entry => entry.included && entry.assessedQuantity == null);
    expect(screen.getByRole('spinbutton', { name: `${unassessed.id} QS cumulative quantity` }).value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Back to claims', exact: true }));

    await user.click(within(rowFor('September 2026')).getByRole('button', { name: 'Preview & export' }));
    expect(screen.getByRole('article', { name: 'September 2026 claim assessment revision 1' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to claims', exact: true }));
    await user.click(within(rowFor('September 2026')).getByRole('button', { name: 'Mark prepared' }));
    const updated = workspace().projects.find(entry => entry.id === exampleId);
    expect(updated.claimDrafts).toHaveLength(3);
    expect(updated.claimDrafts.find(entry => entry.id === ready.id)).toEqual({ ...ready, status: 'prepared', preparedAt: expect.any(String) });
    const paidRow = rowFor('August 2026');
    expect(within(paidRow).queryByRole('button', { name: 'Edit claim', exact: true })).toBeNull();
    await user.click(within(paidRow).getByRole('button', { name: 'View payment history', exact: true }));
    expect(new URLSearchParams(location.hash.split('?')[1]).get('draft')).toBe(paid.id);
    expect(screen.getByRole('heading', { name: 'Payment fully recorded' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to monthly claims', exact: true }));

    view.unmount(); view = render(<App />);
    await screen.findByRole('heading', { name: 'Monthly claims', exact: true });
    expect(workspace().projects).toHaveLength(before.length + 1);
    expect(workspace().projects.filter(entry => entry.id !== exampleId)).toEqual(before);
    await user.click(screen.getByRole('button', { name: `Project: ${example.name}`, exact: true }));
    await user.click(screen.getByRole('option', { name: new RegExp(project.name) }));
    await waitFor(() => expect(workspace().activeProjectId).toBe(project.id));
    expect(readFormBuffer(project.id, 'claims:forms')).toEqual(buffer);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), project.claimDrafts[0].id)).toEqual(originalPack);
    expect(workspace().projects.filter(entry => entry.id !== exampleId)).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Back to claims', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Try claim examples', exact: true }));
    await waitFor(() => expect(workspace().activeProjectId).toBe(exampleId));
    expect(workspace().projects).toHaveLength(before.length + 1);
    expect(workspace().projects.find(entry => entry.id === exampleId).claimDrafts.find(entry => entry.id === ready.id).status).toBe('prepared');
    expect(workspace().projects.filter(entry => entry.id !== exampleId)).toEqual(before);
  });
});
