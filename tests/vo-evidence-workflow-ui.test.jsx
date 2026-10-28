import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseSelect } from './select-helpers.mjs';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getVOCases } from '../src/data/vo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-28T10:00:00Z');
const projectIds = new Set();
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const activeProject = () => workspace().projects.find(project => project.id === workspace().activeProjectId);
function fixture() {
  const project = createSITContractDemo({ name: 'Related evidence UI fixture', code: 'VO-LINK24' }, now);
  const other = createSITContractDemo({ name: 'Separate project', code: 'VO-OTHER24' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  const target = getVOCases(project).find(entry => entry.status === 'flagged');
  const report = { ...structuredClone(target.report), id: 'VO-LINK24-SECOND-REPORT', sourceMessageId: 'VO-LINK24-SECOND-MESSAGE',
    message: 'Second photo showing the same additional access platform.', date: now.toISOString() };
  const message = project.whatsappMessages.find(entry => entry.id === target.report.sourceMessageId);
  project.reports.push(report);
  project.whatsappMessages.push({ ...structuredClone(message), id: report.sourceMessageId, reportId: report.id,
    projectId: project.id, projectCode: project.code, text: report.message, status: 'processed', date: report.date });
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  loadShowcaseWorkspace(localStorage, now);
  return { project: activeProject(), sourceId: report.id, targetId: target.id, targetReference: target.reference };
}
function mount(hash) {
  window.history.replaceState(null, '', hash);
  return render(<App />);
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup(); for (const id of projectIds) clearProjectFormBuffers(id); projectIds.clear();
  vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '#claims');
});

it('links and reloads original evidence with exact source/target navigation and no saved-claim changes', async () => {
  const { project, sourceId, targetId, targetReference } = fixture();
  const otherBefore = structuredClone(workspace().projects.find(entry => entry.id !== project.id));
  const before = structuredClone(project);
  const user = userEvent.setup();
  let app = mount(`#vo?case=${encodeURIComponent(sourceId)}`);
  await user.click(screen.getByRole('button', { name: 'Review actions', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Link to existing VO', exact: true }));
  const form = screen.getByRole('form', { name: 'Link to existing VO', exact: true });
  await chooseSelect(user, within(form).getByRole('combobox', { name: 'Existing VO' }), targetId);
  await user.type(within(form).getByRole('textbox', { name: 'Reason for linking' }), 'Second view of the same access platform.');
  await user.click(within(form).getByRole('button', { name: 'Save link', exact: true }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Linked VO', exact: true })).toBeTruthy());
  const saved = activeProject();
  expect(saved.voEvidenceLinks).toHaveLength(1);
  expect(saved.reports).toEqual(before.reports);
  expect(saved.whatsappMessages).toEqual(before.whatsappMessages);
  expect(saved.voReviews).toEqual(before.voReviews);
  expect(saved.items).toEqual(before.items);
  expect(saved.claimDrafts).toEqual(before.claimDrafts);
  expect(saved.seed).toEqual(before.seed);
  expect(workspace().projects.find(entry => entry.id === otherBefore.id)).toEqual(otherBefore);
  app.unmount(); app = mount(`#vo?case=${encodeURIComponent(sourceId)}`);
  expect(screen.queryByRole('button', { name: 'Ready for approval', exact: true })).toBeNull();
  await user.click(screen.getByRole('button', { name: `Open ${targetReference}`, exact: true }));
  await waitFor(() => expect(new URLSearchParams(location.hash.split('?')[1]).get('case')).toBe(targetId));
  await user.click(screen.getByText('Related evidence', { exact: true }));
  expect(screen.getByText('Second photo showing the same additional access platform.')).toBeTruthy();
  expect(screen.getByText('Second view of the same access platform.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Open record', exact: true }));
  await waitFor(() => expect(new URLSearchParams(location.hash.split('?')[1]).get('case')).toBe(sourceId));
  expect(activeProject().claimDrafts).toEqual(before.claimDrafts);
  app.unmount();
});
