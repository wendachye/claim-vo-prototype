import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getVOCases, getVOClaimEligibility, updateVOReview } from '../src/data/vo.ts';
import { markClaimPrepared } from '../src/data/claims.ts';
import { recordClaimStage } from '../src/data/claim-tracking.ts';
import { buildClaimPack } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

const now = new Date('2026-10-24T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const scope = 'Separate access to a newly instructed work face outside the listed façade scope.';
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => {
  const value = workspace();
  return value.projects.find(project => project.id === value.activeProjectId);
};
const entryFor = (project, id) => getVOCases(project).find(entry => entry.id === id);
const requests = () => selectedProject().voConfirmationRequests || [];
const currentRequest = () => requests().at(-1);
const textbox = name => screen.getByRole('textbox', { name: new RegExp(`^${name}`) });
const approvalValue = () => screen.getByRole('spinbutton', { name: /^Approved value/ });

function updated(result) {
  if (result.outcome !== 'updated') throw new Error(result.error || `Expected updated, received ${result.outcome}`);
  return result.project;
}

function fixture(proposedValue = 650) {
  let project = createSITContractDemo({ name: 'Customer confirmation demo', code: 'CUSTOMER-VO' }, now);
  const caseId = getVOCases(project).find(entry => entry.status === 'flagged').id;
  const draftId = project.claimDrafts[0].id;
  project = updated(markClaimPrepared(project, draftId));
  project = updated(recordClaimStage(project, draftId, 'submitted', { date: '2026-10-24', reference: 'CUSTOMER-FROZEN-SUBMISSION' }));
  project = updated(updateVOReview(project, caseId, 'submit', {
    title: 'Separate access platform', relatedItemId: 'WI-001', scopeAssessment: scope,
    scopeDisposition: 'variation', instructionStatus: 'documented', instructionReference: 'DEMO-SI-01', proposedValue,
  }));
  const other = createSITContractDemo({ name: 'Other customer project', code: 'CUSTOMER-OTHER' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id),
    other: loaded.projects.find(entry => entry.id === other.id), caseId };
}

function mount(caseId) {
  window.history.replaceState(null, '', `#vo?${new URLSearchParams({ case: caseId })}`);
  return render(<App />);
}

async function openPanel(user) {
  const label = screen.getByText('Customer confirmation', { exact: true });
  const details = label.closest('details');
  if (!details.open) await user.click(details.querySelector('summary'));
  return details;
}

async function previewRequest(user) {
  const panel = await openPanel(user);
  await user.click(within(panel).getByRole('button', { name: 'Use demo contact', exact: true }));
  await user.click(within(panel).getByRole('button', { name: 'Preview request', exact: true }));
  return panel;
}

async function saveRequest(user) {
  const panel = await previewRequest(user);
  await user.click(within(panel).getByRole('button', { name: 'Save mock request', exact: true }));
  await waitFor(() => expect(requests().length).toBeGreaterThan(0));
  return panel;
}

async function saveReply(user, kind) {
  const panel = await openPanel(user);
  await chooseSelect(user, within(panel).getByRole('combobox', { name: /^Reply type/ }), kind);
  await user.click(within(panel).getByRole('button', { name: 'Use demo reply', exact: true }));
  const message = within(panel).getByRole('textbox', { name: /^Reply message/ }).value;
  await user.click(within(panel).getByRole('button', { name: 'Save mock reply', exact: true }));
  await waitFor(() => expect(currentRequest().reply?.kind).toBe(kind));
  return message;
}

function expectFrozenRecords(project, before, other) {
  for (const field of ['items', 'sourceItems', 'baselines', 'whatsappMessages', 'drawingMapping', 'claimDrafts', 'claimTracking']) {
    expect(project[field]).toEqual(before[field]);
  }
  const sourceFields = ['id', 'projectId', 'projectCode', 'itemId', 'message', 'photo', 'photoAlt', 'sender', 'date', 'area', 'areaMapping', 'sourceMessageId'];
  const sources = value => value.reports.map(report => Object.fromEntries(sourceFields.map(field => [field, report[field]])));
  expect(sources(project)).toEqual(sources(before));
  expect(buildClaimPack(project, project.claimDrafts[0].id)).toEqual(buildClaimPack(before, before.claimDrafts[0].id));
  expect(workspace().projects.find(entry => entry.id === other.id)).toEqual(other);
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

describe('customer confirmation stays separate from the existing QS approval workflow', () => {
  it('previews without saving, freezes the sent mock request and retains its scope and recipient after reload', async () => {
    const { project, other, caseId } = fixture();
    const user = userEvent.setup(), view = mount(caseId);
    const before = structuredClone(workspace().projects);
    let panel = await previewRequest(user);
    expect(panel.textContent).toContain(scope);
    expect(panel.textContent).toContain('650.00');
    expect(workspace().projects).toEqual(before);
    const recipient = within(panel).getByRole('textbox', { name: /^Recipient/ }).value;
    await user.click(within(panel).getByRole('button', { name: 'Save mock request', exact: true }));
    await waitFor(() => expect(requests()).toHaveLength(1));
    const saved = selectedProject(), request = currentRequest();
    expect(request).toMatchObject({ caseId, projectId: project.id, version: 1, recipient, channel: 'demo',
      snapshot: { scopeAssessment: scope, proposedValue: 650, instructionReference: 'DEMO-SI-01' } });
    expect(saved.voReviews).toEqual(project.voReviews);
    expect(saved.reports).toEqual(project.reports);
    expectFrozenRecords(saved, project, other);
    view.unmount(); render(<App />);
    panel = await openPanel(user);
    expect(panel.textContent).toContain(recipient);
    expect(panel.textContent).toContain(scope);
    expect(currentRequest()).toEqual(request);
    expect(screen.getByRole('button', { name: 'Record approval', exact: true })).toBeTruthy();
  });

  it.each(['scopeAcknowledged', 'changesRequested'])('records a %s reply without approving price or changing claim eligibility', async kind => {
    const { project, other, caseId } = fixture();
    const user = userEvent.setup(), view = mount(caseId);
    await saveRequest(user);
    const message = await saveReply(user, kind);
    const saved = selectedProject(), request = currentRequest();
    expect(request.reply.message).toBe(message);
    expect(saved.voReviews).toEqual(project.voReviews);
    expect(saved.reports).toEqual(project.reports);
    expect(entryFor(saved, caseId)).toMatchObject({ status: 'pendingApproval', approvedValue: null, claimEligibility: 'needsReview' });
    expect(getVOClaimEligibility(entryFor(saved, caseId)).eligible).toBe(false);
    expect(screen.queryByRole('button', { name: 'Use reply in approval form', exact: true })).toBeNull();
    expectFrozenRecords(saved, project, other);
    const beforeReload = structuredClone(workspace().projects);
    view.unmount(); render(<App />);
    await openPanel(user);
    expect(screen.getAllByText(message, { exact: true }).length).toBeGreaterThan(0);
    expect(workspace().projects).toEqual(beforeReload);
  });

  it.each([650, 0])('keeps unfinished approval fields while saving a reply for %s, then requires explicit prefill and Record approval', async value => {
    const { project, other, caseId } = fixture(value);
    const user = userEvent.setup();
    mount(caseId);
    await user.clear(approvalValue()); await user.type(approvalValue(), '77');
    await user.type(textbox('Approval reference'), 'UNFINISHED-QS-REFERENCE');
    await user.type(textbox('Approved by'), 'Unfinished QS approver');
    await user.type(textbox('Review note'), 'Keep this unrelated QS note.');
    await saveRequest(user);
    await saveReply(user, 'priceApproved');
    expect(approvalValue().value).toBe('77');
    expect(textbox('Approval reference').value).toBe('UNFINISHED-QS-REFERENCE');
    expect(textbox('Approved by').value).toBe('Unfinished QS approver');
    expect(textbox('Review note').value).toBe('Keep this unrelated QS note.');
    expect(entryFor(selectedProject(), caseId).status).toBe('pendingApproval');
    const useReply = screen.getByRole('button', { name: 'Use reply in approval form', exact: true });
    expect(useReply.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Reset approval fields', exact: true }));
    expect(textbox('Review note').value).toBe('Keep this unrelated QS note.');
    await user.click(screen.getByRole('button', { name: 'Use reply in approval form', exact: true }));
    expect(approvalValue().value).toBe(String(value));
    expect(textbox('Approval reference').value).toContain(currentRequest().reference);
    expect(textbox('Approved by').value).toContain(currentRequest().reply.respondent);
    expect(entryFor(selectedProject(), caseId).status).toBe('pendingApproval');
    expect(selectedProject().voReviews).toEqual(project.voReviews);
    await user.click(screen.getByRole('button', { name: 'Record approval', exact: true }));
    await waitFor(() => expect(entryFor(selectedProject(), caseId).status).toBe('approved'));
    const saved = selectedProject();
    expect(entryFor(saved, caseId).approvedValue).toBe(value);
    expect(getVOClaimEligibility(entryFor(saved, caseId)).eligible).toBe(false);
    expect(currentRequest().reply.kind).toBe('priceApproved');
    expect(saved.reports.find(report => report.id === caseId).message).toBe(project.reports.find(report => report.id === caseId).message);
    expect(saved.reports.find(report => report.id === caseId).photo).toBe(project.reports.find(report => report.id === caseId).photo);
    expect(saved.voReviews.filter(review => review.id !== caseId)).toEqual(project.voReviews.filter(review => review.id !== caseId));
    expectFrozenRecords(saved, project, other);
  });

  it('keeps an unknown quote distinct from zero and does not offer it as a price approval', async () => {
    const { project, other, caseId } = fixture('');
    const user = userEvent.setup();
    mount(caseId);
    await saveRequest(user);
    expect(currentRequest().snapshot.proposedValue).toBeNull();
    expect(approvalValue().value).toBe('');
    const panel = await openPanel(user);
    await chooseSelect(user, within(panel).getByRole('combobox', { name: /^Reply type/ }), 'scopeAcknowledged');
    await user.click(within(panel).getByRole('button', { name: 'Use demo reply', exact: true }));
    await user.click(within(panel).getByRole('button', { name: 'Save mock reply', exact: true }));
    await waitFor(() => expect(currentRequest().reply?.kind).toBe('scopeAcknowledged'));
    expect(screen.queryByRole('button', { name: 'Use reply in approval form', exact: true })).toBeNull();
    expect(entryFor(selectedProject(), caseId).approvedValue).toBeNull();
    expect(selectedProject().voReviews).toEqual(project.voReviews);
    expectFrozenRecords(selectedProject(), project, other);
  });

  it('keeps requests isolated to the exact case and project when navigating and reloading', async () => {
    const { project, other, caseId } = fixture();
    const user = userEvent.setup();
    let view = mount(caseId);
    await saveRequest(user); await saveReply(user, 'scopeAcknowledged');
    const request = structuredClone(currentRequest());
    const otherCase = getVOCases(project).find(entry => entry.id !== caseId);
    view.unmount(); view = mount(otherCase.id);
    const panel = await openPanel(user);
    expect(panel.textContent).not.toContain(request.reference);
    expect(within(panel).queryByRole('region', { name: 'Saved customer request', exact: true })).toBeNull();
    expect(requests()).toEqual([request]);
    view.unmount();
    const stored = workspace(); stored.activeProjectId = other.id;
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify(stored));
    view = mount(caseId);
    expect(screen.getByText('This extra-work case is not available in the selected project.', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Customer confirmation', { exact: true })).toBeNull();
    expect(selectedProject()).toEqual(other);
    view.unmount();
    const restored = workspace(); restored.activeProjectId = project.id;
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify(restored));
    mount(caseId); await openPanel(user);
    expect(currentRequest()).toEqual(request);
    expectFrozenRecords(selectedProject(), project, other);
  });

  it('retains the earlier reply after a scope and price change and creates a new request version for the revised quote', async () => {
    const { project, other, caseId } = fixture();
    const user = userEvent.setup();
    const view = mount(caseId);
    await saveRequest(user); await saveReply(user, 'priceApproved');
    const first = structuredClone(currentRequest());
    await user.type(textbox('Review note'), 'Customer clarified a larger separate work face.');
    await user.click(screen.getByRole('button', { name: 'Need information', exact: true }));
    await waitFor(() => expect(entryFor(selectedProject(), caseId).status).toBe('clarification'));
    await user.clear(textbox('QS scope assessment'));
    await user.type(textbox('QS scope assessment'), `${scope} A second access bay is now included.`);
    const proposed = screen.getByRole('spinbutton', { name: /^Proposed value/ });
    await user.clear(proposed); await user.type(proposed, '900');
    expect(requests()).toEqual([first]);
    await user.click(screen.getByRole('button', { name: 'Ready for approval', exact: true }));
    await waitFor(() => expect(entryFor(selectedProject(), caseId).status).toBe('pendingApproval'));
    const panel = await openPanel(user);
    expect(panel.textContent).toMatch(/changed|new request/i);
    expect(screen.queryByRole('button', { name: 'Use reply in approval form', exact: true })).toBeNull();
    await saveRequest(user);
    await waitFor(() => expect(requests()).toHaveLength(2));
    expect(requests()[0]).toEqual(first);
    expect(currentRequest()).toMatchObject({ caseId, version: 2, snapshot: { proposedValue: 900,
      scopeAssessment: `${scope} A second access bay is now included.` } });
    expect(currentRequest().reply).toBeUndefined();
    expect(entryFor(selectedProject(), caseId).approvedValue).toBeNull();
    expectFrozenRecords(selectedProject(), project, other);
    const after = structuredClone(requests());
    view.unmount(); render(<App />); await openPanel(user);
    expect(requests()).toEqual(after);
  });
});
