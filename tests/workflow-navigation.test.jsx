import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { getProjectWorkflow } from '../src/data/workflow.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getVOCases, updateVOReview } from '../src/data/vo.ts';

const now = new Date('2026-10-21T10:00:00+08:00');
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const readWorkspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const params = () => new URLSearchParams(location.hash.split('?')[1]);

function fixture() {
  let project = createSITContractDemo({ name: 'S.I.T. navigation demo', code: 'NAV-SIT' }, now);
  const other = createSITContractDemo({ name: 'Other project', code: 'NAV-OTHER' }, now);
  const flagged = getVOCases(project).find((entry) => entry.status === 'flagged');
  project = updateVOReview(project, flagged.id, 'submit', {
    title: 'Separate escalator access (navigation demo)', relatedItemId: 'WI-007',
    scopeAssessment: 'Fictional additional work face for the navigation test.',
    instructionReference: 'NAV-INSTRUCTION', proposedValue: 777,
  }).project;
  project = updateVOReview(project, flagged.id, 'approve', {
    approvedValue: 777, approvalReference: 'NAV-APPROVAL', approver: 'Demo approver',
  }).project;
  project = updateVOReview(project, flagged.id, 'assessEligibility', { scopeDisposition: 'variation', instructionStatus: 'documented', executionStatus: 'verified', executionReference: 'NAV-WORK-CHECK', claimEligibility: 'eligible', eligibilityNote: 'Verified fictional extra access is eligible for QS assessment.', reviewNote: 'Fictional scope and instruction checks recorded separately from price.' }).project;
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({
    schemaVersion: 2, activeProjectId: project.id, projects: [project, other],
    sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id },
  }));
  // Compare with the normal app-load migrations already applied, so assertions
  // below measure navigation rather than expected storage normalization.
  const workspace = loadShowcaseWorkspace(localStorage, now);
  return { project: workspace.projects.find((entry) => entry.id === project.id), other, caseId: flagged.id };
}

function mount(hash) {
  window.history.replaceState(null, '', hash);
  return render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  clearProjectFormBuffers('NAV-SIT');
  clearProjectFormBuffers('NAV-OTHER');
  window.history.replaceState(null, '', '#projects');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn((query) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('S.I.T. workflow navigation retains source context without changing records', () => {
  it('overview next task opens its exact record and returns without changing saved project data', async () => {
    const { project } = fixture();
    const task = getProjectAttention(project)[0];
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    mount('#projects');
    await user.click(within(screen.getByRole('region', { name: /tasks need attention/ })).getByRole('button', { name: task.actionLabel, exact: true }));
    const target = task.target;
    expect(location.hash.split('?')[0]).toBe(`#${target.route}`);
    for (const [field, query] of [['messageId', 'message'], ['reportId', 'report'], ['caseId', 'case'], ['draftId', 'draft']]) {
      if (target[field]) expect(params().get(query)).toBe(target[field]);
    }
    expect(params().get('from')).toBe('overview');
    // A report task may open a dialog, which correctly hides the header from
    // the accessibility tree while leaving the shared tracker mounted.
    expect(document.querySelector('nav[aria-label="Project workflow"]')).toBeTruthy();
    if (target.route === 'completion') await user.click(screen.getByRole('button', { name: 'Close site report' }));
    else await user.click(screen.getByRole('button', { name: 'Back to overview' }));
    await screen.findByRole('heading', { name: 'Project overview' });
    expect(readWorkspace().projects).toEqual(before);
  });

  it('overview opens an exact pending message rather than only the general inbox', async () => {
    const { project } = fixture();
    const next = getProjectWorkflow(project, '2026-10').next;
    const task = getProjectAttention(project).find((entry) => entry.target.messageId === next.messageId);
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    mount('#projects');
    await user.click(screen.getByRole('button', { name: /^Needs attention, \d+ pending tasks$/ }));
    const notifications = screen.getByRole('dialog', { name: 'Project notifications' });
    const queue = within(notifications).getByRole('region', { name: 'Needs attention' });
    const action = `${task.actionLabel}: ${task.reference || task.title}`;
    if (!within(queue).queryByRole('button', { name: action, exact: true })) {
      await user.click(within(notifications).getByRole('button', { name: /^View all/ }));
    }
    await user.click(within(queue).getByRole('button', { name: action, exact: true }));
    expect(screen.queryByRole('dialog', { name: 'Project notifications' })).toBeNull();
    await screen.findByRole('heading', { name: 'WhatsApp messages' });
    expect(params().get('message')).toBe(next.messageId);
    expect(document.querySelector('.wa-review').textContent).toContain(next.messageId);
    expect(readWorkspace().projects).toEqual(before);
  });

  it('an exact progress link survives remount and returns to its original message and area', async () => {
    const { project } = fixture();
    const message = project.whatsappMessages.find((entry) => entry.itemId === 'WI-002');
    const area = getDrawingMapping(project).areas.find((entry) => entry.workItemIds.includes('WI-002'));
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    const view = mount(`#completion?${new URLSearchParams({ item: 'WI-002', area: area.id, message: message.id })}`);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(table.textContent).toContain(project.items.find(item=>item.id==='WI-002').ref);
    expect(table.textContent).not.toContain(project.items.find(item=>item.id==='WI-001').ref);
    view.unmount();
    render(<App />);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Back to message' }));
    await screen.findByRole('heading', { name: 'WhatsApp messages' });
    expect(params().get('message')).toBe(message.id);
    expect(params().get('area')).toBe(area.id);
    expect(readWorkspace().projects).toEqual(before);
  });

  it('VO review opens the related contract item, returns to the same case, and offers explicit claim selection', async () => {
    const { project, caseId } = fixture();
    const entry = getVOCases(project).find((record) => record.id === caseId);
    const areaId = entry.report.areaMapping.areaId;
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    const view = mount(`#vo?${new URLSearchParams({ case: caseId, area: areaId })}`);
    await user.click(screen.getByRole('button', { name: 'Check contract' }));
    await screen.findByRole('heading', { name: 'Contract review' });
    expect(params().get('item')).toBe('WI-007');
    expect(params().get('vo')).toBe(caseId);
    const description = project.items.find((item) => item.id === 'WI-007').description;
    expect(screen.getByRole('heading', { name: description })).toBeTruthy();
    await user.click(within(document.querySelector('.contract-item-editor')).getByRole('button', { name: 'Next item' }));
    await waitFor(() => expect(params().get('item')).toBe('WI-008'));
    const nextDescription = project.items.find((item) => item.id === 'WI-008').description;
    expect(screen.getByRole('heading', { name: nextDescription })).toBeTruthy();
    view.unmount();
    render(<App />);
    expect(screen.getByRole('heading', { name: nextDescription })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to extra work' }));
    await screen.findByRole('heading', { name: 'Separate escalator access (navigation demo)' });
    expect(params().get('area')).toBe(areaId);
    expect(screen.getByRole('button', { name: 'Back to drawing' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Review in monthly claim' }));
    await screen.findByRole('heading', { name: 'Prepare a monthly claim' });
    expect(params().get('vo')).toBe(caseId);
    expect(screen.getByRole('region', { name: 'Extra work from VO review' }).textContent).toContain('NAV-APPROVAL');
    expect(screen.getByRole('checkbox', { name: `Include ${entry.reference} in claim` }).getAttribute('aria-checked')).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Back to VO review' }));
    await screen.findByRole('heading', { name: 'Separate escalator access (navigation demo)' });
    expect(params().get('case')).toBe(caseId);
    expect(params().get('area')).toBe(areaId);
    expect(screen.getByRole('button', { name: 'Back to drawing' })).toBeTruthy();
    expect(readWorkspace().projects).toEqual(before);
  });

  it('switching projects clears a VO handoff and never shows another project’s case', async () => {
    const { project, other, caseId } = fixture();
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    mount(`#claims?vo=${encodeURIComponent(caseId)}`);
    await screen.findByRole('heading', { name: 'Prepare a monthly claim' });
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}` }));
    await user.click(screen.getByRole('option', { name: new RegExp(other.name) }));
    await screen.findByRole('heading', { name: 'Monthly claims' });
    expect(location.hash).toBe('#claims');
    expect(screen.queryByRole('region', { name: 'Extra work from VO review' })).toBeNull();
    expect(readWorkspace().activeProjectId).toBe(other.id);
    expect(readWorkspace().projects).toEqual(before);
  });

  it('foreign item, message and VO links show an unavailable state without falling back to unrelated evidence', async () => {
    const { other } = fixture();
    const before = readWorkspace().projects;
    const foreignMessage = other.whatsappMessages[0];
    const foreignArea = getDrawingMapping(other).areas[0];
    const user = userEvent.setup();
    const view = mount(`#completion?${new URLSearchParams({ item: 'FOREIGN-ITEM', area: foreignArea.id, message: foreignMessage.id })}`);
    expect(screen.getByText('This work item is not available in the selected project.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to message' })).toBeNull();
    expect(screen.queryByRole('button', { name: /View evidence for/ })).toBeNull();
    view.unmount();
    mount(`#contract?${new URLSearchParams({ item: 'FOREIGN-ITEM', vo: getVOCases(other)[0].id })}`);
    expect(screen.getByText('This contract item is not available in the selected project.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to extra work' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Work description' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show work items' }));
    await waitFor(() => expect(location.hash).toBe('#contract'));
    expect(readWorkspace().projects).toEqual(before);
  });

  it('highlights the owning workflow step on every module and keeps an exact record open when the current step is clicked', async () => {
    const { project, caseId } = fixture();
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    const draftId = project.claimDrafts[0].id;
    const messageId = project.whatsappMessages[0].id;
    const routes = [
      ['#contract?item=WI-007', 'Contract'],
      ['#drawing', 'Contract'],
      [`#whatsapp?message=${encodeURIComponent(messageId)}`, 'Site updates'],
      ['#completion?item=WI-002', 'Site updates'],
      [`#vo?case=${encodeURIComponent(caseId)}`, 'Extra work'],
      ['#claims?tab=drafts', 'Monthly claims'],
      [`#claim-preview?draft=${encodeURIComponent(draftId)}`, 'Monthly claims'],
      [`#claim-status?draft=${encodeURIComponent(draftId)}`, 'Monthly claims'],
    ];
    for (const [hash, currentLabel] of routes) {
      const view = mount(hash);
      const tracker = screen.getByRole('navigation', { name: 'Project workflow' });
      const buttons = within(tracker).getAllByRole('button');
      expect(buttons.map(button => button.getAttribute('aria-current'))).toEqual(
        ['Contract', 'Site updates', 'Extra work', 'Monthly claims'].map(label => label === currentLabel ? 'step' : null),
      );
      const current = within(tracker).getByRole('button', { name: currentLabel, exact: true });
      expect(current.disabled).toBe(true);
      const originalHash = location.hash;
      await user.click(current);
      expect(location.hash).toBe(originalHash);
      if (hash.startsWith('#claim-preview')) {
        expect(document.querySelector('.claim-pack-document')).toBeTruthy();
        expect(tracker.closest('.claim-pack-document')).toBeNull();
      }
      view.unmount();
    }
    for (const hash of ['#projects', '#projects?manage=1']) {
      const view = mount(hash);
      expect(screen.queryByRole('navigation', { name: 'Project workflow' })).toBeNull();
      view.unmount();
    }
    expect(readWorkspace().projects).toEqual(before);
  });

  it('uses the tracker to move between modules while retaining unfinished VO checks and saved records', async () => {
    const { project, caseId } = fixture();
    const entry = getVOCases(project).find(record => record.id === caseId);
    const before = readWorkspace().projects;
    const user = userEvent.setup();
    mount(`#vo?case=${encodeURIComponent(caseId)}`);
    await user.click(screen.getByRole('button', { name: 'Edit claim checks', exact: true }));
    const note = screen.getByRole('textbox', { name: /^QS scope assessment/ });
    await user.clear(note);
    await user.type(note, 'Unfinished scope check retained while navigating.');
    await user.click(within(screen.getByRole('navigation', { name: 'Project workflow' })).getByRole('button', { name: 'Contract', exact: true }));
    await screen.findByRole('heading', { name: 'Contract', exact: true });
    expect(location.hash).toBe('#contract');
    await user.click(within(screen.getByRole('navigation', { name: 'Project workflow' })).getByRole('button', { name: 'Extra work', exact: true }));
    await user.click(screen.getByRole('button', { name: `Open extra work: ${entry.reference}, ${entry.title}, Approved`, exact: true }));
    expect(screen.getByRole('textbox', { name: /^QS scope assessment/ }).value).toBe('Unfinished scope check retained while navigating.');
    expect(readWorkspace().activeProjectId).toBe(project.id);
    expect(readWorkspace().projects).toEqual(before);
  });

  it('shows the overview workflow statuses for the selected project and refreshes them on project switch', async () => {
    const { project, other, caseId } = fixture();
    const workspace = readWorkspace();
    const otherProject = workspace.projects.find(record => record.id === other.id);
    otherProject.locked = false;
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify(workspace));
    const before = readWorkspace().projects;
    const labels = ['Contract', 'Site updates', 'Extra work', 'Monthly claims'];
    const statuses = record => getProjectWorkflow(record).steps.map(step => step.status);
    const expectStatuses = record => {
      const tracker = screen.getByRole('navigation', { name: 'Project workflow' });
      statuses(record).forEach((status, index) => {
        const button = within(tracker).getByRole('button', { name: labels[index], exact: true });
        expect(within(button).getByText(status, { exact: true })).toBeTruthy();
      });
    };
    expect(statuses(project)).not.toEqual(statuses(otherProject));
    const user = userEvent.setup();
    mount(`#vo?case=${encodeURIComponent(caseId)}`);
    expectStatuses(project);
    await user.click(screen.getByRole('button', { name: `Project: ${project.name}` }));
    await user.click(screen.getByRole('option', { name: new RegExp(other.name) }));
    expectStatuses(otherProject);
    expect(location.hash).toBe('#vo');
    expect(readWorkspace().activeProjectId).toBe(other.id);
    expect(readWorkspace().projects).toEqual(before);
  });
});
