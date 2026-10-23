import { chooseSelect } from './select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getMessageClarification } from '../src/data/whatsapp-clarification.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';
import { getVOCases } from '../src/data/vo.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-21T10:00:00+08:00');
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const readWorkspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const value = readWorkspace(); return value.projects.find((entry) => entry.id === value.activeProjectId); };
const questionInput = () => screen.getByRole('textbox', { name: 'Clarification question' });
const replyInput = () => screen.getByRole('textbox', { name: 'Worker reply' });
const completionInput = () => screen.getByRole('spinbutton', { name: 'Total completion (%)' });
const sourceMessage = (project) => project.whatsappMessages.find((entry) => entry.id === `${project.id}-CASE-WA-006`);
const messageEvidence = (message) => Object.fromEntries(['id', 'text', 'photo', 'photoAlt', 'date', 'itemId', 'completion', 'completionBasis'].map((field) => [field, message[field]]));

function fixture() {
  const project = createSITContractDemo({ name: 'S.I.T. clarification demo', code: 'CLARIFY-SIT' }, now);
  const other = createSITContractDemo({ name: 'Other clarification project', code: 'CLARIFY-OTHER' }, now);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const workspace = loadShowcaseWorkspace(localStorage, now);
  return { project: workspace.projects.find((entry) => entry.id === project.id),
    other: workspace.projects.find((entry) => entry.id === other.id) };
}

function mount(messageId) {
  window.history.replaceState(null, '', `#whatsapp?message=${encodeURIComponent(messageId)}`);
  return render(<App />);
}

async function saveRequest(user, question) {
  await user.clear(questionInput());
  await user.type(questionInput(), question);
  await user.click(screen.getByRole('button', { name: 'Save clarification request', exact: true }));
}

async function enterReply(user, project, text, completion) {
  const itemId = 'WI-004';
  const area = getDrawingMapping(project).areas.find((entry) => entry.workItemIds.includes(itemId));
  await user.click(screen.getByRole('button', { name: 'Use demo reply', exact: true }));
  await chooseSelect(user, screen.getByRole('combobox', { name: 'Contract work item' }), itemId);
  await chooseSelect(user, screen.getByRole('combobox', { name: 'Site area' }), area.id);
  await user.clear(completionInput());
  await user.type(completionInput(), String(completion));
  await user.clear(replyInput());
  await user.type(replyInput(), text);
  return { itemId, area };
}

async function switchProject(user, current, next) {
  await user.click(screen.getByRole('button', { name: `Project: ${current.name}` }));
  await user.click(screen.getByRole('option', { name: new RegExp(next.name) }));
}

async function chooseUnclearMessage(user) {
  await user.type(screen.getByRole('textbox', { name: 'Search site updates' }), 'another 10%');
  await user.click(screen.getByRole('button', { name: /^Open message:/ }));
}

beforeEach(() => {
  localStorage.clear();
  clearProjectFormBuffers('CLARIFY-SIT');
  clearProjectFormBuffers('CLARIFY-OTHER');
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

describe('mock WhatsApp clarification replies stay linked to the original and require explicit verification', () => {
  // This journey spans forms, notifications, reload and supervisor review; allow
  // for contention when the other App workflows run in parallel on CI.
  it('retains the request and original evidence after reload, replaces its attention task and verifies only the clarified report', { timeout: 15000 }, async () => {
    const { project, other } = fixture();
    const source = sourceMessage(project);
    const originalEvidence = messageEvidence(source);
    const originalItems = structuredClone(project.items);
    const originalReports = structuredClone(project.reports);
    const claims = structuredClone(project.claimDrafts);
    const vos = getVOCases(project);
    const sourceTask = getProjectAttention(project).find((entry) => entry.target.messageId === source.id);
    const user = userEvent.setup();
    const view = mount(source.id);
    const question = 'Which W5 contract item and mapped area do you mean, and what is the cumulative total?';
    await saveRequest(user, question);
    expect(getMessageClarification(selectedProject(), source.id).stage).toBe('requested');
    expect(getMessageClarification(selectedProject(), source.id).request.question).toBe(question);
    expect(messageEvidence(sourceMessage(selectedProject()))).toEqual(originalEvidence);
    expect(selectedProject().items).toEqual(originalItems);
    expect(selectedProject().reports).toEqual(originalReports);

    const replyText = 'Confirmed W5 contract item WI-004: the whole item is now 72% complete in total. This is a mock reply.';
    const { itemId, area } = await enterReply(user, project, replyText, 72);
    await user.click(screen.getByRole('button', { name: 'Save mock reply', exact: true }));
    const received = getMessageClarification(selectedProject(), source.id);
    expect(received.stage).toBe('reply-received');
    expect(received.reply.replyToMessageId).toBe(source.id);
    expect(received.reply.text).toBe(replyText);
    expect(received.reply.itemId).toBe(itemId);
    expect(received.reply.completion).toBe(72);
    expect(sourceMessage(selectedProject()).status).toBe('replied');
    expect(messageEvidence(sourceMessage(selectedProject()))).toEqual(originalEvidence);
    expect(selectedProject().items).toEqual(originalItems);
    expect(selectedProject().reports).toEqual(originalReports);
    const replyTasks = getProjectAttention(selectedProject());
    expect(replyTasks.some((entry) => entry.id === sourceTask.id)).toBe(false);
    expect(replyTasks.filter((entry) => entry.target.messageId === received.reply.id)).toHaveLength(1);
    const replyTask = replyTasks.find((entry) => entry.target.messageId === received.reply.id);
    const replyAction = `${replyTask.actionLabel}: ${replyTask.reference || replyTask.title}`;
    await user.click(screen.getByRole('button', { name: /^Needs attention, \d+ pending tasks$/ }));
    const notifications = screen.getByRole('dialog', { name: 'Project notifications' });
    if (!within(notifications).queryByRole('button', { name: replyAction, exact: true })) {
      await user.click(within(notifications).getByRole('button', { name: /^View all/ }));
    }
    await user.click(within(notifications).getByRole('button', { name: replyAction, exact: true }));
    expect(new URLSearchParams(location.hash.split('?')[1]).get('message')).toBe(received.reply.id);
    await user.click(screen.getByRole('button', { name: 'Back to original message', exact: true }));
    expect(new URLSearchParams(location.hash.split('?')[1]).get('message')).toBe(source.id);

    view.unmount(); clearProjectFormBuffers(project.id); render(<App />);
    expect(getMessageClarification(selectedProject(), source.id).request.question).toBe(question);
    expect(messageEvidence(sourceMessage(selectedProject()))).toEqual(originalEvidence);
    await user.click(screen.getByRole('button', { name: 'Add clarified progress update', exact: true }));
    const pending = getMessageClarification(selectedProject(), source.id);
    expect(pending.stage).toBe('verification');
    expect(pending.report.sourceMessageId).toBe(received.reply.id);
    expect(pending.report.itemId).toBe(itemId);
    expect(pending.report.areaMapping.areaId).toBe(area.id);
    expect(selectedProject().items.find((entry) => entry.id === itemId).reported).toBe(72);
    expect(selectedProject().items.find((entry) => entry.id === itemId).verified).toBe(originalItems.find((entry) => entry.id === itemId).verified);
    const pendingTasks = getProjectAttention(selectedProject());
    expect(pendingTasks.some((entry) => [source.id, received.reply.id].includes(entry.target.messageId))).toBe(false);
    expect(pendingTasks.filter((entry) => entry.target.reportId === pending.report.id)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Verify clarified progress', exact: true }));
    expect(screen.getByRole('dialog').textContent).toContain(replyText);
    await user.click(screen.getByRole('button', { name: 'Verify progress', exact: true }));
    expect(getMessageClarification(selectedProject(), source.id).stage).toBe('verified');
    expect(screen.getByText('Clarified progress verified', { exact: true })).toBeTruthy();
    expect(selectedProject().items.find((entry) => entry.id === itemId).verified).toBe(72);
    expect(getProjectAttention(selectedProject()).some((entry) => entry.target.reportId === pending.report.id)).toBe(false);
    expect(messageEvidence(sourceMessage(selectedProject()))).toEqual(originalEvidence);
    expect(selectedProject().claimDrafts).toEqual(claims);
    expect(getVOCases(selectedProject())).toEqual(vos);
    expect(readWorkspace().projects.find((entry) => entry.id === other.id)).toEqual(other);
  });

  it('restores an unfinished reply only for its own project and original message after switching projects', async () => {
    const { project, other } = fixture();
    const source = sourceMessage(project);
    const user = userEvent.setup();
    mount(source.id);
    await saveRequest(user, 'Please confirm the W5 item, area and total completion.');
    const replyText = 'Unfinished clarification for this project only.';
    const { itemId, area } = await enterReply(user, project, replyText, 42);
    const savedProjects = readWorkspace().projects;
    await switchProject(user, project, other);
    await chooseUnclearMessage(user);
    expect(questionInput().value).not.toContain('Please confirm the W5 item, area and total completion.');
    expect(screen.queryByRole('textbox', { name: 'Worker reply' })).toBeNull();
    expect(getMessageClarification(selectedProject(), sourceMessage(other).id)?.thread).toBeFalsy();
    await switchProject(user, other, project);
    await chooseUnclearMessage(user);
    expect(replyInput().value).toBe(replyText);
    expect(completionInput().value).toBe('42');
    expect(screen.getByRole('combobox', { name: 'Contract work item' }).getAttribute('data-value')).toBe(itemId);
    expect(screen.getByRole('combobox', { name: 'Site area' }).getAttribute('data-value')).toBe(area.id);
    expect(readWorkspace().projects).toEqual(savedProjects);
    expect(selectedProject().whatsappMessages.some((entry) => entry.replyToMessageId === source.id)).toBe(false);
  });

  it('opens the actual newer report instead of offering to process an outdated saved reply again', async () => {
    const { project } = fixture();
    const source = sourceMessage(project);
    const user = userEvent.setup();
    const view = mount(source.id);
    await saveRequest(user, 'Confirm the W5 work item and cumulative total.');
    await enterReply(user, project, 'Earlier clarified total of 72% for WI-004.', 72);
    await user.click(screen.getByRole('button', { name: 'Save mock reply', exact: true }));
    const reply = getMessageClarification(selectedProject(), source.id).reply;
    expect(screen.getByRole('button', { name: 'Add clarified progress update', exact: true })).toBeTruthy();

    // A separate ordinary inbox update arrives after the saved reply, before
    // that reply was processed. Its real processing action owns the new total.
    vi.setSystemTime(new Date(now.getTime() + 120_000));
    const ordinaryFields = structuredClone(reply);
    delete ordinaryFields.replyToMessageId;
    delete ordinaryFields.clarificationThreadId;
    const later = { ...ordinaryFields, id: `${project.id}-LATER-WI004`,
      date: new Date(now.getTime() + 60_000).toISOString(), completion: 84,
      text: 'Later independent WI-004 observation: 84% complete in total.' };
    const current = selectedProject();
    const processed = processWhatsAppMessage({ ...current, whatsappMessages: [...current.whatsappMessages, later] }, later.id);
    expect(processed.outcome).toBe('processed');
    const workspace = readWorkspace();
    workspace.projects = workspace.projects.map((entry) => entry.id === project.id ? processed.project : entry);
    view.unmount(); localStorage.setItem(WORKSPACE_STORE, JSON.stringify(workspace)); mount(source.id);

    const context = getMessageClarification(selectedProject(), source.id);
    expect(context.stage).toBe('superseded');
    expect(context.report).toBeNull();
    expect(context.latestReport.id).toBe(processed.reportId);
    expect(screen.queryByRole('button', { name: 'Add clarified progress update', exact: true })).toBeNull();
    expect(getProjectAttention(selectedProject()).some((entry) => entry.target.messageId === reply.id)).toBe(false);
    const beforeReview = readWorkspace().projects;
    await user.click(screen.getByRole('button', { name: 'Review latest progress', exact: true }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(later.text);
    expect(dialog.textContent).toContain(processed.reportId);
    expect(dialog.textContent).not.toContain(reply.text);
    expect(readWorkspace().projects).toEqual(beforeReview);
    expect(selectedProject().claimDrafts).toEqual(project.claimDrafts);
  });

  it('continues into the exact VO review when the supervisor flags a clarified report as extra work', async () => {
    const { project } = fixture();
    const source = sourceMessage(project);
    const user = userEvent.setup();
    const view = mount(source.id);
    await saveRequest(user, 'Confirm the work item and total before supervisor review.');
    await enterReply(user, project, 'Clarified WI-004 update requiring a scope check.', 72);
    await user.click(screen.getByRole('button', { name: 'Save mock reply', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Add clarified progress update', exact: true }));
    const pending = getMessageClarification(selectedProject(), source.id);
    const itemsBeforeFlag = structuredClone(selectedProject().items);
    await user.click(screen.getByRole('button', { name: 'Verify clarified progress', exact: true }));
    await user.type(screen.getByRole('textbox', { name: 'Review note or correction reason' }), 'The supervisor identified a separate scope requiring QS review.');
    await user.click(screen.getByRole('button', { name: 'Flag possible VO', exact: true }));
    expect(new URLSearchParams(location.hash.split('?')[1]).get('case')).toBe(pending.report.id);
    expect(getMessageClarification(selectedProject(), source.id).stage).toBe('vo-review');

    view.unmount(); mount(source.id);
    expect(screen.queryByRole('button', { name: 'Add clarified progress update', exact: true })).toBeNull();
    const beforeReview = readWorkspace().projects;
    await user.click(screen.getByRole('button', { name: 'Review extra work', exact: true }));
    await screen.findByRole('heading', { name: 'Extra work (VO)' });
    expect(new URLSearchParams(location.hash.split('?')[1]).get('case')).toBe(pending.report.id);
    expect(getVOCases(selectedProject()).find((entry) => entry.id === pending.report.id).status).toBe('flagged');
    expect(selectedProject().items).toEqual(itemsBeforeFlag);
    expect(selectedProject().claimDrafts).toEqual(project.claimDrafts);
    expect(readWorkspace().projects).toEqual(beforeReview);
  });

  it('keeps included access-scope clarification outside the percentage reply and progress flow', async () => {
    const { project } = fixture();
    const source = project.whatsappMessages.find((message) => message.kind === 'clarification'
      && project.items.find((item) => item.id === message.itemId)?.pricingType === 'included');
    expect(source).toBeTruthy();
    const user = userEvent.setup();
    mount(source.id);
    expect(screen.getByText('Check the included access work', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('spinbutton', { name: 'Total completion (%)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use demo reply', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Needs clarification', exact: true }));
    expect(screen.queryByRole('button', { name: 'Save mock reply', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add clarified progress update', exact: true })).toBeNull();
    expect(selectedProject().items).toEqual(project.items);
    expect(selectedProject().reports).toEqual(project.reports);
    expect(selectedProject().claimDrafts).toEqual(project.claimDrafts);
    expect(getVOCases(selectedProject())).toEqual(getVOCases(project));
    expect(messageEvidence(selectedProject().whatsappMessages.find((entry) => entry.id === source.id))).toEqual(messageEvidence(source));
  });
});
