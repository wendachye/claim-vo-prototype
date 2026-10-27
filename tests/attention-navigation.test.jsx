import { chooseProjectOption } from './project-select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { getItemProgressReview } from '../src/data/progress-review.ts';
import { getVOCases, updateVOReview } from '../src/data/vo.ts';
import { markClaimPrepared, saveClaimDraft } from '../src/data/claims.ts';
import { getClaimTracking, recordClaimStage } from '../src/data/claim-tracking.ts';
import { saveClaimRevision } from '../src/data/claim-revisions.ts';
import { buildClaimPack } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-21T10:00:00+08:00');
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const readWorkspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const value = readWorkspace(); return value.projects.find((entry) => entry.id === value.activeProjectId); };
const params = () => new URLSearchParams(location.hash.split('?')[1]);
const notifications = () => screen.queryByRole('dialog', { name: 'Project notifications' });
const bell = () => screen.getByRole('button', { name: /^Needs attention, \d+ pending tasks$/ });
const queue = () => within(notifications()).getByRole('region', { name: 'Needs attention' });
const mainNav = () => screen.getByRole('complementary', { name: 'Main navigation' });
const actionName = (task) => `${task.actionLabel}: ${task.reference || task.title}`;

function updated(result) {
  if (result.outcome !== 'updated') throw new Error(result.error || `Expected updated, received ${result.outcome}`);
  return result;
}

function fixture({ query = false, approval = false } = {}) {
  let project = createSITContractDemo({ name: 'S.I.T. attention demo', code: 'ATTENTION-SIT' }, now);
  const other = createSITContractDemo({ name: 'Other attention project', code: 'ATTENTION-OTHER' }, now);
  const sourceId = project.claimDrafts[0].id;
  if (query) {
    project = updated(markClaimPrepared(project, sourceId)).project;
    project = updated(recordClaimStage(project, sourceId, 'submitted', { date: '2026-10-21', reference: 'ATTENTION-SUB' })).project;
    project = updated(recordClaimStage(project, sourceId, 'query', { date: '2026-10-21', reference: 'ATTENTION-QUERY',
      note: 'Please recheck the submitted measurement.', targetType: 'work', targetId: 'WI-001' })).project;
  }
  let caseId;
  if (approval) {
    caseId = getVOCases(project).find((entry) => entry.status === 'flagged').id;
    project = updated(updateVOReview(project, caseId, 'submit', {
      title: 'Demo additional access awaiting approval', relatedItemId: 'WI-001',
      scopeAssessment: 'Separate mock access scope for queue navigation.', instructionReference: 'ATTENTION-SI', proposedValue: 700,
    })).project;
  }
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find((entry) => entry.id === project.id),
    other: loaded.projects.find((entry) => entry.id === other.id), sourceId, caseId };
}

function mount(hash = '#projects') { window.history.replaceState(null, '', hash); return render(<App />); }
async function openNotifications(user) {
  if (!notifications()) await user.click(bell());
  return screen.findByRole('dialog', { name: 'Project notifications' });
}
async function openTask(user, task) {
  await openNotifications(user);
  const region = queue();
  if (!within(region).queryByRole('button', { name: actionName(task), exact: true })) {
    const expand = within(notifications()).queryByRole('button', { name: /^View all/ });
    if (expand) await user.click(expand);
  }
  await user.click(within(region).getByRole('button', { name: actionName(task), exact: true }));
  expect(notifications()).toBeNull();
}

beforeEach(() => {
  localStorage.clear();
  clearProjectFormBuffers('ATTENTION-SIT');
  clearProjectFormBuffers('ATTENTION-OTHER');
  window.history.replaceState(null, '', '#projects');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn((query) => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});

afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('Needs attention opens exact selected-project records and reflects completed work', () => {
  it('opens the selected-project queue from the Dashboard bell with keyboard dismissal', async () => {
    const { project } = fixture({ query: true });
    const tasks = getProjectAttention(project);
    const task = tasks.find((entry) => entry.target.messageId);
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    mount();
    expect(notifications()).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filter attention tasks' })).toBeNull();
    expect(document.querySelector('.attention-list')).toBeNull();
    expect(bell().getAttribute('aria-label')).toBe(`Needs attention, ${tasks.length} pending tasks`);
    await user.click(bell());
    await screen.findByRole('dialog', { name: 'Project notifications' });
    expect(within(queue()).queryByRole('group', { name: 'Filter attention tasks' })).toBeNull();
    expect(tasks.filter((entry) => within(queue()).queryByRole('button', { name: actionName(entry), exact: true }))).toHaveLength(Math.min(3, tasks.length));
    expect(within(queue()).getByRole('button', { name: actionName(tasks[0]), exact: true })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(notifications()).toBeNull();
    expect(document.activeElement).toBe(bell());
    await openNotifications(user);
    expect(within(queue()).getByRole('button', { name: actionName(tasks[0]), exact: true })).toBeTruthy();
    await user.click(within(notifications()).getByRole('button', { name: `View all ${tasks.length} tasks`, exact: true }));
    for (const entry of tasks) expect(within(queue()).getByRole('button', { name: actionName(entry), exact: true })).toBeTruthy();
    await user.click(within(notifications()).getByRole('button', { name: 'Show fewer tasks', exact: true }));
    expect(tasks.filter((entry) => within(queue()).queryByRole('button', { name: actionName(entry), exact: true }))).toHaveLength(Math.min(3, tasks.length));
    await openTask(user, task);
    await screen.findByRole('heading', { name: 'WhatsApp messages' });
    expect(params().get('message')).toBe(task.target.messageId);
    expect(readWorkspace().projects).toEqual(before);
  });

  it('closes notifications during module and project navigation and shows the new project’s own pending count', async () => {
    const { project, other } = fixture();
    const otherProject = { ...other, whatsappMessages: [] };
    const workspace = readWorkspace();
    workspace.projects = workspace.projects.map((entry) => entry.id === other.id ? otherProject : entry);
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify(workspace));
    const ownTasks = getProjectAttention(project);
    const otherTasks = getProjectAttention(otherProject);
    expect(otherTasks.length).not.toBe(ownTasks.length);
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    mount('#contract');
    await openNotifications(user);
    await user.click(within(mainNav()).getByRole('button', { name: 'Dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(notifications()).toBeNull();
    await openNotifications(user);
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}` }));
    await chooseProjectOption(user, otherProject);
    expect(notifications()).toBeNull();
    expect(readWorkspace().activeProjectId).toBe(otherProject.id);
    expect(bell().getAttribute('aria-label')).toBe(`Needs attention, ${otherTasks.length} pending tasks`);
    await openNotifications(user);
    expect(within(queue()).getByRole('button', { name: actionName(otherTasks[0]), exact: true })).toBeTruthy();
    expect(within(queue()).queryByRole('button', { name: actionName(ownTasks[0]), exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close notifications', exact: true }));
    expect(notifications()).toBeNull();
    expect(readWorkspace().projects).toEqual(before);
  });

  it('retains the exact site report on reload and removes its task after supervisor verification', async () => {
    const { project, other } = fixture();
    const report = getItemProgressReview(project, project.items.find((entry) => entry.id === 'WI-001')).report;
    const task = getProjectAttention(project).find((entry) => entry.target.reportId === report.id);
    expect(task).toBeTruthy();
    const before = readWorkspace().projects;
    const claims = structuredClone(project.claimDrafts);
    const user = userEvent.setup();
    const view = mount();
    await openTask(user, task);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(report.message);
    expect(params().get('report')).toBe(report.id);
    expect(params().get('item')).toBe('WI-001');
    expect(params().get('from')).toBe('dashboard');
    expect(readWorkspace().projects).toEqual(before);
    view.unmount(); render(<App />);
    expect(screen.getByRole('dialog').textContent).toContain(report.message);
    await user.click(screen.getByRole('button', { name: 'Verify progress', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Back to dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(getProjectAttention(selectedProject()).some((entry) => entry.id === task.id)).toBe(false);
    await openNotifications(user);
    expect(within(queue()).queryByRole('button', { name: actionName(task), exact: true })).toBeNull();
    expect(selectedProject().items.find((entry) => entry.id === 'WI-001').verified).toBe(65);
    expect(selectedProject().claimDrafts).toEqual(claims);
    expect(readWorkspace().projects.find((entry) => entry.id === other.id)).toEqual(other);
  });

  it('opens the exact pending price approval and retains its separate claim check afterward', async () => {
    const { project, caseId } = fixture({ approval: true });
    const task = getProjectAttention(project).find((entry) => entry.target.caseId === caseId);
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    mount();
    await openTask(user, task);
    await screen.findByRole('heading', { name: 'Demo additional access awaiting approval' });
    expect(params().get('case')).toBe(caseId);
    expect(readWorkspace().projects).toEqual(before);
    await user.clear(screen.getByRole('spinbutton', { name: /^Approved value/ }));
    await user.type(screen.getByRole('spinbutton', { name: /^Approved value/ }), '700');
    await user.type(screen.getByRole('textbox', { name: 'Approval reference' }), 'ATTENTION-APPROVAL');
    await user.type(screen.getByRole('textbox', { name: 'Approved by' }), 'Demo approver');
    await user.click(screen.getByRole('button', { name: 'Record approval', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Back to dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(getProjectAttention(selectedProject()).find((entry) => entry.id === task.id)?.kind).toBe('vo-eligibility');
    expect(getVOCases(selectedProject()).find((entry) => entry.id === caseId).status).toBe('approved');
    expect(selectedProject().claimDrafts).toEqual(project.claimDrafts);
    expect(selectedProject().items).toEqual(project.items);
  });

  it('opens the original claim query, then follows its replacement payment task without changing the original assessment', async () => {
    const { project, sourceId } = fixture({ query: true });
    const queryTask = getProjectAttention(project).find((entry) => entry.target.draftId === sourceId);
    const original = structuredClone(project.claimDrafts[0]);
    const originalPack = buildClaimPack(project, sourceId);
    const user = userEvent.setup();
    let view = mount();
    await openTask(user, queryTask);
    await screen.findByRole('heading', { name: 'Query needs a revision' });
    expect(params().get('draft')).toBe(sourceId);
    expect(screen.getByRole('region', { name: 'Recorded claim query' }).textContent).toContain('ATTENTION-QUERY');
    expect(selectedProject().claimDrafts[0]).toEqual(original);

    // The wizard has separate end-to-end coverage. Use its real state actions
    // here to verify that the derived queue advances to the exact child record.
    const assessment = structuredClone(project.claimDrafts[0].assessment);
    assessment.work['WI-001'].assessedQuantity = 1000;
    const saved = updated(saveClaimRevision(project, sourceId, assessment, 'Measurement corrected to 1,000 m².'));
    const revisionWorkspace = readWorkspace();
    revisionWorkspace.projects = revisionWorkspace.projects.map((entry) => entry.id === saved.project.id ? saved.project : entry);
    view.unmount(); localStorage.setItem(WORKSPACE_STORE, JSON.stringify(revisionWorkspace));
    view = mount();
    const revisionTask = getProjectAttention(selectedProject()).find((entry) => entry.target.revisionSourceId === sourceId);
    const beforeRevisionOpen = readWorkspace().projects;
    await openTask(user, revisionTask);
    await screen.findByRole('heading', { name: 'Revise claim', exact: true });
    expect(params().get('revise')).toBe(sourceId);
    expect(screen.getByRole('spinbutton', { name: 'WI-001 QS cumulative quantity' }).value).toBe('1000');
    expect(screen.getByRole('textbox', { name: 'QS response' }).value).toBe('Measurement corrected to 1,000 m².');
    expect(readWorkspace().projects).toEqual(beforeRevisionOpen);

    let advanced = updated(markClaimPrepared(saved.project, saved.draft.id)).project;
    advanced = updated(recordClaimStage(advanced, saved.draft.id, 'submitted', { date: '2026-10-21', reference: 'ATTENTION-RESUB' })).project;
    advanced = updated(recordClaimStage(advanced, saved.draft.id, 'certified', { date: '2026-10-21', reference: 'ATTENTION-CERT', value: saved.draft.snapshot.totals.currentValue })).project;
    const workspace = readWorkspace();
    workspace.projects = workspace.projects.map((entry) => entry.id === advanced.id ? advanced : entry);
    view.unmount(); localStorage.setItem(WORKSPACE_STORE, JSON.stringify(workspace));
    view = mount();
    expect(getProjectAttention(selectedProject()).some((entry) => entry.id === queryTask.id)).toBe(false);
    const paymentTask = getProjectAttention(selectedProject()).find((entry) => entry.target.draftId === saved.draft.id);
    expect(paymentTask).toBeTruthy();
    await openTask(user, paymentTask);
    await screen.findByRole('heading', { name: 'Record payment' });
    expect(params().get('draft')).toBe(saved.draft.id);
    await user.click(screen.getByRole('button', { name: 'Use demo details', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Record payment', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Back to dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(getClaimTracking(selectedProject(), saved.draft.id).status).toBe('paid');
    expect(getProjectAttention(selectedProject()).some((entry) => [sourceId, saved.draft.id].includes(entry.target.draftId))).toBe(false);
    expect(selectedProject().claimDrafts.find((entry) => entry.id === sourceId)).toEqual(original);
    expect(buildClaimPack(selectedProject(), sourceId)).toEqual(originalPack);
  });

  it('opens the exact saved claim month without replacing another month’s unfinished form or opening foreign drafts', async () => {
    const { project, other } = fixture();
    const assessment = structuredClone(project.claimDrafts[0].assessment);
    assessment.work['WI-001'].assessedQuantity = 1111;
    const saved = updated(saveClaimDraft(project, '2026-11', assessment));
    const workspace = readWorkspace();
    workspace.projects = workspace.projects.map((entry) => entry.id === project.id ? saved.project : entry);
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify(workspace));
    const unfinished = { work: { 'WI-001': { include: true, assessedQuantity: 777, previousValue: 0 } },
      vos: {}, priorConfirmed: false, note: 'December measurements in progress', adjustmentReason: '' };
    writeFormBuffer(project.id, 'claims:period', '2026-12');
    writeFormBuffer(project.id, 'claims:forms', { '2026-12': unfinished });
    writeFormBuffer(project.id, 'claims:dirty', { '2026-12': true });
    writeFormBuffer(project.id, 'claims:step', 3);
    const before = readWorkspace().projects;
    const task = getProjectAttention(saved.project).find((entry) => entry.target.draftId === saved.draft.id);
    const user = userEvent.setup();
    const view = mount();
    await openTask(user, task);
    await screen.findByRole('heading', { name: 'Enter the totals for November 2026' });
    expect(params().get('draft')).toBe(saved.draft.id);
    expect(screen.getByRole('spinbutton', { name: 'WI-001 QS cumulative quantity' }).value).toBe('1111');
    expect(readFormBuffer(project.id, 'claims:forms')['2026-12']).toEqual(unfinished);
    expect(readFormBuffer(project.id, 'claims:dirty')['2026-12']).toBe(true);
    expect(readWorkspace().projects).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Back to choose work', exact: true }));
    expect(screen.getByLabelText('Claim period').value).toBe('2026-11');
    await user.click(screen.getByRole('button', { name: 'Back to dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(getProjectAttention(selectedProject()).some((entry) => entry.id === task.id)).toBe(true);
    expect(readWorkspace().projects).toEqual(before);

    view.unmount();
    mount(`#claims?${new URLSearchParams({ draft: other.claimDrafts[0].id, from: 'overview' })}`);
    expect(screen.getByRole('heading', { name: 'Claim draft unavailable' })).toBeTruthy();
    expect(screen.queryByRole('spinbutton', { name: 'WI-001 QS cumulative quantity' })).toBeNull();
    expect(readFormBuffer(project.id, 'claims:forms')['2026-12']).toEqual(unfinished);
    expect(readWorkspace().projects).toEqual(before);
  });

  it('clears a dashboard task link on project switch and never opens a foreign report', async () => {
    const { project, other } = fixture();
    const before = readWorkspace().projects;
    const foreign = getItemProgressReview(other, other.items.find((entry) => entry.id === 'WI-001')).report;
    const user = userEvent.setup();
    const view = mount(`#completion?${new URLSearchParams({ item: 'WI-001', report: foreign.id, from: 'overview' })}`);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(foreign.message)).toBeNull();
    expect(readWorkspace().projects).toEqual(before);
    view.unmount(); mount();
    const task = getProjectAttention(project).find((entry) => entry.target.messageId);
    await openTask(user, task);
    await screen.findByRole('heading', { name: 'WhatsApp messages' });
    expect(params().get('message')).toBe(task.target.messageId);
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}` }));
    await chooseProjectOption(user, other);
    await screen.findByRole('heading', { name: 'WhatsApp messages' });
    expect(params().has('message')).toBe(false);
    expect(params().has('from')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Back to dashboard', exact: true })).toBeNull();
    await user.click(within(mainNav()).getByRole('button', { name: 'Dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(readWorkspace().activeProjectId).toBe(other.id);
    expect(getProjectAttention(selectedProject()).every((entry) => entry.projectId === other.id)).toBe(true);
    expect(readWorkspace().projects).toEqual(before);
  });
});
