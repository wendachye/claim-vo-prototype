import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.jsx';
import { WORKSPACE_STORE } from '../src/data/projects.js';
import { createSITContractDemo } from '../src/data/provided-contract-demo.js';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.js';
import { markClaimPrepared } from '../src/data/claims.js';
import { getClaimTracking, recordClaimStage } from '../src/data/claim-tracking.js';
import { saveClaimRevision } from '../src/data/claim-revisions.js';
import { buildClaimPack } from '../src/data/claim-pack.js';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.js';

const now = new Date('2026-10-21T10:00:00+08:00');
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const readWorkspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const workspace = readWorkspace(); return workspace.projects.find((project) => project.id === workspace.activeProjectId); };
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const mainNav = () => screen.getByRole('complementary', { name: 'Main navigation' });
const quantityInput = () => screen.getByRole('spinbutton', { name: 'WI-001 QS cumulative quantity' });
const responseInput = () => screen.getByRole('textbox', { name: 'QS response' });

function fixture({ query = true, child = false } = {}) {
  let project = createSITContractDemo({ name: 'S.I.T. query navigation', code: 'QUERY-NAV' }, now);
  const other = createSITContractDemo({ name: 'Other query project', code: 'QUERY-OTHER' }, now);
  const sourceId = project.claimDrafts[0].id;
  const prepared = markClaimPrepared(project, sourceId);
  if (prepared.outcome !== 'updated') throw new Error(prepared.error);
  const sent = recordClaimStage(prepared.project, sourceId, 'submitted', { date: '2026-10-21', reference: 'DEMO-SUB-NAV' });
  if (sent.outcome !== 'updated') throw new Error(sent.error);
  project = sent.project;
  if (query) {
    const result = recordClaimStage(project, sourceId, 'query', { date: '2026-10-21', reference: 'DEMO-QUERY-NAV', note: 'Please check the measured scaffold quantity.', targetType: 'work', targetId: 'WI-001' });
    if (result.outcome !== 'updated') throw new Error(result.error);
    project = result.project;
  }
  if (child) {
    const result = saveClaimRevision(project, sourceId, project.claimDrafts[0].assessment, 'Initial measurement clarification.');
    if (result.outcome !== 'updated') throw new Error(result.error);
    project = result.project;
  }
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find((entry) => entry.id === project.id), other: loaded.projects.find((entry) => entry.id === other.id), sourceId };
}
function mount(hash) { window.history.replaceState(null, '', hash); return render(<App />); }

beforeEach(() => {
  localStorage.clear();
  clearProjectFormBuffers('QUERY-NAV');
  clearProjectFormBuffers('QUERY-OTHER');
  window.history.replaceState(null, '', '#projects');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn((query) => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('claim queries revise and resubmit an independent project-scoped version', () => {
  it('records a query, requires a QS response, saves and resubmits a new version while retaining the original assessment', async () => {
    const { project, other, sourceId } = fixture({ query: false });
    const original = structuredClone(project.claimDrafts[0]);
    const originalPack = buildClaimPack(project, sourceId);
    const user = userEvent.setup();
    const view = mount(`#claim-status?draft=${encodeURIComponent(sourceId)}`);
    await user.click(screen.getByRole('button', { name: 'Record a query' }));
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Related work' }), 'work:WI-001');
    await user.click(screen.getByRole('button', { name: 'Record query', exact: true }));
    await screen.findByRole('heading', { name: 'Query needs a revision' });
    expect(getClaimTracking(selectedProject(), sourceId).query.targetId).toBe('WI-001');
    await user.click(screen.getByRole('button', { name: 'Revise claim' }));
    await screen.findByRole('heading', { name: 'Revise claim' });
    expect(params().get('revise')).toBe(sourceId);
    expect(quantityInput().value).toBe(String(original.assessment.work['WI-001'].assessedQuantity));
    expect(screen.getByRole('spinbutton', { name: 'WI-001 previously claimed value' }).value).toBe('0');
    await user.click(screen.getByRole('button', { name: 'Find queried item' }));
    expect(document.activeElement).toBe(quantityInput());
    await user.click(screen.getByRole('button', { name: 'Review claim', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Save revised claim' }));
    expect(screen.getByRole('alert').textContent).toContain('QS response');
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(selectedProject().claimDrafts).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Back to enter totals' }));
    await user.clear(quantityInput());
    await user.type(quantityInput(), '1000');
    await user.type(responseInput(), 'Measurement rechecked and corrected to 1,000 m².');
    await user.click(screen.getByRole('button', { name: 'Review claim', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Save revised claim' }));
    await screen.findByRole('heading', { name: 'Claim revision saved' });
    const revised = selectedProject().claimDrafts.find((draft) => draft.revisionOf === sourceId);
    expect(revised.revision).toBe(2);
    expect(revised.snapshot.totals.currentValue).toBe(15300);
    expect(revised.revisionResponse).toContain('1,000 m²');
    expect(selectedProject().claimDrafts[0]).toEqual(original);
    expect(buildClaimPack(selectedProject(), sourceId)).toEqual(originalPack);
    await user.click(screen.getByRole('button', { name: 'Mark prepared' }));
    await screen.findByRole('heading', { name: 'Claim prepared' });
    await user.click(screen.getByRole('button', { name: 'Track claim status' }));
    await screen.findByRole('heading', { name: 'Record resubmission' });
    expect(params().get('draft')).toBe(revised.id);
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    await user.click(screen.getByRole('button', { name: 'Record resubmission', exact: true }));
    await screen.findByRole('heading', { name: 'Record certification' });
    expect(getClaimTracking(selectedProject(), revised.id).status).toBe('submitted');
    expect(getClaimTracking(selectedProject(), sourceId).status).toBe('queried');
    view.unmount();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Record certification' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'View original query' }));
    await screen.findByRole('heading', { name: 'Query addressed in version 2' });
    expect(params().get('draft')).toBe(sourceId);
    await user.click(screen.getByRole('button', { name: 'Open revised claim' }));
    await screen.findByRole('heading', { name: 'Record certification' });
    expect(params().get('draft')).toBe(revised.id);
    expect(selectedProject().claimDrafts[0]).toEqual(original);
    expect(buildClaimPack(selectedProject(), sourceId)).toEqual(originalPack);
    expect(readWorkspace().projects.find((entry) => entry.id === other.id)).toEqual(other);
  });

  it('keeps unfinished revision values across browsing and project switches without replacing normal claim buffers', async () => {
    const { project, other, sourceId } = fixture({ child: true });
    const before = structuredClone(project.claimDrafts);
    const normalForm = { '2026-10': { work: {}, vos: {}, note: 'An unrelated unfinished normal claim.' } };
    writeFormBuffer(project.id, 'claims:forms', normalForm);
    const user = userEvent.setup();
    mount(`#claims?revise=${encodeURIComponent(sourceId)}`);
    await user.clear(quantityInput());
    await user.type(quantityInput(), '999');
    await user.clear(responseInput());
    await user.type(responseInput(), 'Unfinished revised measurement response.');
    await user.click(within(mainNav()).getByRole('button', { name: /^1\s*Contract$/ }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    await user.click(within(mainNav()).getByRole('button', { name: /^4\s*Monthly claims$/ }));
    await screen.findByRole('heading', { name: 'Monthly claims' });
    expect(screen.getByRole('button', { name: 'Mark prepared' }).disabled).toBe(true);
    expect(screen.getByText('Unsaved edits')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue revision' }));
    await screen.findByRole('heading', { name: 'Revise claim' });
    expect(quantityInput().value).toBe('999');
    expect(responseInput().value).toBe('Unfinished revised measurement response.');
    await user.click(screen.getByRole('button', { name: 'Back to claims', exact: true }));
    await screen.findByRole('heading', { name: 'Monthly claims' });
    expect(location.hash).toBe('#claims?tab=drafts');
    expect(screen.getByRole('button', { name: 'Mark prepared' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Continue revision' }));
    await screen.findByRole('heading', { name: 'Revise claim' });
    expect(quantityInput().value).toBe('999');
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}` }));
    await user.click(screen.getByRole('option', { name: new RegExp(other.name) }));
    await screen.findByRole('heading', { name: 'Monthly claims' });
    expect(location.hash).toBe('#claims');
    expect(screen.queryByRole('textbox', { name: 'QS response' })).toBeNull();
    await user.click(screen.getByRole('button', { name: `Project: ${other.name}` }));
    await user.click(screen.getByRole('option', { name: new RegExp(project.name) }));
    await screen.findByRole('heading', { name: 'Monthly claims' });
    await user.click(screen.getByRole('button', { name: 'Continue revision' }));
    await screen.findByRole('heading', { name: 'Revise claim' });
    expect(quantityInput().value).toBe('999');
    expect(responseInput().value).toContain('Unfinished revised measurement');
    expect(readFormBuffer(project.id, 'claims:forms')).toEqual(normalForm);
    expect(selectedProject().claimDrafts).toEqual(before);
  });

  it('explains an excluded queried item and returns to work selection without including it automatically', async () => {
    const { project, sourceId } = fixture();
    const original = structuredClone(project.claimDrafts[0]);
    const originalPack = buildClaimPack(project, sourceId);
    const user = userEvent.setup();
    mount(`#claims?revise=${encodeURIComponent(sourceId)}`);
    await user.click(screen.getByRole('button', { name: /^(?:1\s*)?Choose work$/ }));
    const choice = screen.getByRole('checkbox', { name: 'Include WI-001 in claim' });
    expect(choice.getAttribute('aria-checked')).toBe('true');
    await user.click(choice);
    const context = screen.getByRole('region', { name: 'Claim query to address' });
    expect(context.textContent).toContain('This item is not included in this revision.');
    expect(within(context).queryByRole('button', { name: 'Find queried item' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enter totals', exact: true }));
    expect(screen.queryByRole('spinbutton', { name: 'WI-001 QS cumulative quantity' })).toBeNull();
    await user.click(within(context).getByRole('button', { name: 'Review work selection' }));
    expect(screen.getByRole('button', { name: /^(?:1\s*)?Choose work$/ }).getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('checkbox', { name: 'Include WI-001 in claim' }).getAttribute('aria-checked')).toBe('false');
    expect(selectedProject().claimDrafts).toHaveLength(1);
    expect(selectedProject().claimDrafts[0]).toEqual(original);
    expect(buildClaimPack(selectedProject(), sourceId)).toEqual(originalPack);
  });

  it('rejects foreign revision source links without opening another claim assessment', async () => {
    const { project, other } = fixture();
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    mount(`#claims?revise=${encodeURIComponent(other.claimDrafts[0].id)}`);
    expect(screen.getByRole('heading', { name: 'Claim revision unavailable' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'QS response' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: /QS cumulative quantity/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to monthly claims' }));
    await screen.findByRole('heading', { name: 'Monthly claims' });
    await waitFor(() => expect(location.hash).toBe('#claims?tab=drafts'));
    expect(readWorkspace().activeProjectId).toBe(project.id);
    expect(readWorkspace().projects).toEqual(before);
  });
});
