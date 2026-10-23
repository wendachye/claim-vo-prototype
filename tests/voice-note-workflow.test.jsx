import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { seedWorkspace, resetProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createVoiceNoteDemo } from '../src/data/voice-note-demo.ts';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { getItemAreaRollup } from '../src/data/area-allocations.ts';
import { getMessageClarification } from '../src/data/whatsapp-clarification.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { getVoiceNoteContext, saveVoiceTranscriptReview } from '../src/data/voice-notes.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

const now = new Date('2026-10-24T10:00:00+08:00');
const projectIds = new Set();
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selectedProject = () => { const value = workspace(); return value.projects.find(project => project.id === value.activeProjectId); };
const originalEvidence = message => Object.fromEntries(['id', 'projectId', 'projectCode', 'text', 'originalTranscript', 'audio', 'sender', 'date', 'photo', 'photoAlt', 'completion', 'completionBasis'].map(field => [field, message[field]]));
const sourceBy = (project, clarity = 'clear') => project.whatsappMessages.find(message => message.audio?.clarity === clarity);
const voicePanel = () => screen.getByRole('region', { name: 'Voice note review', exact: true });
const savedClaimEvidence = project => project.claimDrafts.map(draft => ({ draft, pack: buildClaimPack(project, draft.id), csv: toClaimCSV(buildClaimPack(project, draft.id).pack) }));

function updated(result) {
  if (result.outcome !== 'updated') throw new Error(result.error || `Expected updated, received ${result.outcome}`);
  return result.project;
}

function withSavedClaim(project) {
  const message = sourceBy(project), west = project.drawingMapping.areas.find(area => area.code === 'WEST');
  project = updated(saveVoiceTranscriptReview(project, message.id, { transcript: 'Block A west wall cladding is 50% complete in total.',
    reason: 'The recording says wall.', sourceKey: getVoiceNoteContext(project, message.id).sourceKey }, now));
  project = updated(saveMessageMatchReview(project, message.id, { itemId: 'WI-001', areaId: west.id, reason: '' }, now));
  const processed = processWhatsAppMessage(project, message.id);
  if (processed.outcome !== 'processed') throw new Error(processed.error || 'Expected a processed voice note.');
  project = updated(verifyProgressReport(processed.project, processed.reportId, 50, '', now));
  return updated(saveClaimDraft(project, '2026-10', { priorConfirmed: true,
    work: { 'WI-001': { include: true, assessedQuantity: 360, previousValue: 0 } } }));
}

function fixture(prepare = project => project) {
  const other = createClaimExamplesDemo({ name: 'Other paid claim project', code: 'VOICE-OTHER' }, now);
  const created = createVoiceNoteDemo({ schemaVersion: 2, activeProjectId: other.id, projects: [other] }, now);
  if (created.outcome !== 'updated') throw new Error(created.error);
  const project = prepare(created.project);
  projectIds.add(project.id); projectIds.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ ...created.workspace,
    projects: created.workspace.projects.map(entry => entry.id === project.id ? project : entry),
    sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find(entry => entry.id === project.id), other: loaded.projects.find(entry => entry.id === other.id) };
}

function mount(messageId) {
  window.history.replaceState(null, '', `#whatsapp?message=${encodeURIComponent(messageId)}`);
  return render(<App />);
}

async function correctTranscript(user, transcript = 'Block A west wall cladding is 50% complete in total.', reason = 'The recording says west wall; the mock transcript misheard wall.') {
  const panel = voicePanel();
  await user.click(within(panel).getByRole('button', { name: 'Edit transcript', exact: true }));
  const field = within(panel).getByRole('textbox', { name: /^Reviewed transcript/ });
  await user.clear(field); await user.type(field, transcript);
  const reasonField = within(panel).getByRole('textbox', { name: /^Correction reason/ });
  await user.clear(reasonField);
  if (reason) await user.type(reasonField, reason);
  await user.click(within(panel).getByRole('button', { name: 'Save transcript correction', exact: true }));
  return { transcript, reason };
}

function expectOtherUnchanged(other) {
  const saved = workspace().projects.find(entry => entry.id === other.id);
  expect(saved).toEqual(other);
  expect(savedClaimEvidence(saved)).toEqual(savedClaimEvidence(other));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});

afterEach(() => {
  cleanup(); projectIds.forEach(clearProjectFormBuffers); projectIds.clear();
  vi.useRealTimers(); vi.unstubAllGlobals();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('voice-note inbox review uses the existing match, clarification and supervisor workflow', () => {
  it('creates independent voice-only examples and resets only its own original recordings and transcripts', () => {
    const workspaceBefore = seedWorkspace(), before = structuredClone(workspaceBefore);
    const first = createVoiceNoteDemo(workspaceBefore, now);
    expect(first.outcome).toBe('updated');
    expect(workspaceBefore).toEqual(before);
    expect(first.workspace.projects.slice(0, -1)).toEqual(before.projects);
    expect(first.project.name).toBe('Voice-note review (Demo)');
    expect(first.project.locked).toBe(true);
    expect(first.project.drawingMapping.areas.map(area => area.workItemQuantities['WI-001'])).toEqual([720, 480]);
    expect(first.project.whatsappMessages).toHaveLength(2);
    expect(first.project.reports).toEqual([]);
    expect(first.project.claimDrafts).toEqual([]);
    const clear = sourceBy(first.project), unclear = sourceBy(first.project, 'unclear');
    expect(clear.text).toBe('Block A west wail cladding is 50% complete in total.');
    expect(unclear.text).toBe('Block A east wall, another 10%. Total unclear.');
    for (const message of first.project.whatsappMessages) {
      expect(message.text).toBe(message.originalTranscript);
      expect(message.audio).toMatchObject({ version: 1, mimeType: 'audio/wav', demo: true });
      expect(message.audio.durationSeconds).toBeGreaterThan(0);
      expect(message.photo).toBeUndefined();
      expect(message.areaProgress).toBeUndefined();
      expect(message.matchSuggestion).toBeUndefined();
    }
    expect(unclear.completion).toBeNull();
    expect(unclear.completionBasis).toBe('incremental');
    const second = createVoiceNoteDemo(first.workspace, now);
    expect(second.outcome).toBe('updated');
    expect(second.project.id).not.toBe(first.project.id);
    expect(second.workspace.projects.find(project => project.id === first.project.id)).toEqual(first.project);
    const reset = resetProject({ ...first.project, reports: [{ id: 'TEMP', status: 'pending' }],
      whatsappMessages: first.project.whatsappMessages.map(message => ({ ...message, status: 'processed' })) });
    expect(reset.whatsappMessages).toEqual(first.project.whatsappMessages);
    expect(reset.reports).toEqual([]);
    expect(reset.drawingMapping).toEqual(first.project.drawingMapping);
  });

  it('reopens its voice-note example from Demo options while keeping every existing project unchanged', async () => {
    const { project, other } = fixture(), user = userEvent.setup();
    mount(sourceBy(project).id);
    const before = structuredClone(workspace().projects);
    await user.click(screen.getByRole('button', { name: 'Demo options', exact: true }));
    await user.click(screen.getByRole('menuitem', { name: 'Try voice-note demo', exact: true }));
    await waitFor(() => expect(selectedProject().id).toBe(project.id));
    const saved = selectedProject();
    projectIds.add(saved.id);
    expect(saved.name).toBe('Voice-note review (Demo)');
    expect(saved.whatsappMessages).toHaveLength(2);
    expect(saved.reports).toEqual([]);
    expect(saved.voiceTranscriptReviews || []).toEqual([]);
    expect(workspace().projects).toEqual(before);
    expectOtherUnchanged(other);
    const messageId = new URLSearchParams(location.hash.split('?')[1]).get('message');
    expect(messageId).toBe(sourceBy(saved).id);
    expect(voicePanel().querySelector('audio')).toBeTruthy();
  });

  it('retains the audio and original transcript while an explicit correction requires a reason and changes no progress', async () => {
    const { project, other } = fixture(), source = sourceBy(project), original = originalEvidence(source);
    const user = userEvent.setup(), view = mount(source.id);
    const panel = voicePanel(), audio = panel.querySelector('audio');
    expect(audio?.controls).toBe(true);
    expect(audio?.querySelector('source')?.getAttribute('src') || audio?.getAttribute('src')).toBe(source.audio.asset);
    expect(getVoiceNoteContext(selectedProject(), source.id).review).toBeNull();
    const { transcript } = await correctTranscript(user, undefined, '');
    expect(getVoiceNoteContext(selectedProject(), source.id).review).toBeNull();
    const reason = 'The recording says west wall; the mock transcript misheard wall.';
    await user.type(within(voicePanel()).getByRole('textbox', { name: /^Correction reason/ }), reason);
    await user.click(within(voicePanel()).getByRole('button', { name: 'Save transcript correction', exact: true }));
    await waitFor(() => expect(getVoiceNoteContext(selectedProject(), source.id).review?.transcript).toBe(transcript));
    const saved = selectedProject(), review = getVoiceNoteContext(saved, source.id).review;
    expect(review.reason).toBe(reason);
    expect(originalEvidence(sourceBy(saved))).toEqual(original);
    expect(saved.items).toEqual(project.items);
    expect(saved.reports).toEqual([]);
    expect(saved.claimDrafts).toEqual(project.claimDrafts);
    expectOtherUnchanged(other);
    const after = structuredClone(workspace().projects);
    view.unmount(); render(<App />);
    expect(getVoiceNoteContext(selectedProject(), source.id).review?.transcript).toBe(transcript);
    expect(originalEvidence(sourceBy(selectedProject()))).toEqual(original);
    expect(workspace().projects).toEqual(after);
  });

  it('requires a fresh match after a second transcript correction without adding or verifying progress automatically', async () => {
    const { project, other } = fixture(), source = sourceBy(project), user = userEvent.setup();
    mount(source.id);
    await correctTranscript(user);
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    await waitFor(() => expect(getMessageMatchContext(selectedProject(), source.id).review).toBeTruthy());
    const firstReview = getMessageMatchContext(selectedProject(), source.id).review;
    const beforeItems = selectedProject().items;
    await correctTranscript(user, 'Block A west wall cladding is fifty percent complete in total.', 'Write the percentage as spoken in the recording.');
    await waitFor(() => expect(getVoiceNoteContext(selectedProject(), source.id).reviews).toHaveLength(2));
    expect(getMessageMatchContext(selectedProject(), source.id).review).toBeNull();
    expect(selectedProject().messageMatchReviews).toContainEqual(firstReview);
    expect(selectedProject().items).toEqual(beforeItems);
    expect(selectedProject().reports).toEqual([]);
    const add = screen.queryByRole('button', { name: 'Add progress update', exact: true });
    expect(!add || add.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Confirm match', exact: true })).toBeTruthy();
    expectOtherUnchanged(other);
  });

  it('adds reported progress only after match confirmation, then verifies its own allocated area and keeps processed transcripts read-only', async () => {
    const { project, other } = fixture(), source = sourceBy(project), original = originalEvidence(source), user = userEvent.setup();
    const view = mount(source.id);
    const { transcript, reason } = await correctTranscript(user);
    expect(selectedProject().reports).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    expect(selectedProject().reports).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Add progress update', exact: true }));
    await waitFor(() => expect(selectedProject().reports).toHaveLength(1));
    let saved = selectedProject(), report = saved.reports[0];
    expect(report.status).toBe('pending');
    expect(report.message).toBe(source.text);
    expect(report.areaMapping.code).toBe('WEST');
    expect(report.areaProgress.allocatedQuantity).toBe(720);
    expect(report.voiceNote).toMatchObject({ audio: source.audio, originalTranscript: source.text, reviewedTranscript: transcript, reason });
    expect(getItemAreaRollup(saved, 'WI-001', 'reported').completion).toBe(30);
    expect(getItemAreaRollup(saved, 'WI-001', 'verified').completion).toBeNull();
    expect(getProjectAttention(saved).filter(task => task.target.reportId === report.id)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Edit transcript', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Review progress', exact: true }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Verify progress', exact: true }));
    await waitFor(() => expect(selectedProject().reports[0].status).toBe('verified'));
    saved = selectedProject(); report = saved.reports[0];
    expect(getItemAreaRollup(saved, 'WI-001', 'verified').completion).toBe(30);
    expect(getProjectAttention(saved).some(task => task.target.reportId === report.id)).toBe(false);
    expect(originalEvidence(sourceBy(saved))).toEqual(original);
    expect(saved.claimDrafts).toEqual(project.claimDrafts);
    expectOtherUnchanged(other);
    const after = structuredClone(workspace().projects);
    view.unmount(); render(<App />);
    expect(screen.queryByRole('button', { name: 'Edit transcript', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm transcript', exact: true })).toBeNull();
    expect(workspace().projects).toEqual(after);
  });

  it('keeps unclear audio in the existing request and separate reply flow, preserving a saved claim and the original recording', async () => {
    const { project, other } = fixture(withSavedClaim), source = sourceBy(project, 'unclear'), original = originalEvidence(source);
    const claims = savedClaimEvidence(project), beforeItems = structuredClone(project.items);
    const east = project.drawingMapping.areas.find(area => area.code === 'EAST');
    const user = userEvent.setup(), view = mount(source.id);
    expect(getVoiceNoteContext(selectedProject(), source.id).needsClarification).toBe(true);
    expect(screen.queryByRole('button', { name: 'Add progress update', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm match', exact: true })).toBeNull();
    const question = 'Please confirm the total cumulative completion for Block A east wall cladding.';
    const questionField = screen.getByRole('textbox', { name: 'Clarification question', exact: true });
    await user.clear(questionField); await user.type(questionField, question);
    await user.click(screen.getByRole('button', { name: 'Save clarification request', exact: true }));
    await waitFor(() => expect(getMessageClarification(selectedProject(), source.id)?.stage).toBe('requested'));
    expect(selectedProject().items).toEqual(beforeItems);
    expect(screen.queryByRole('button', { name: 'Edit transcript', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Use demo reply', exact: true }));
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Contract work item', exact: true }), 'WI-001');
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Site area', exact: true }), east.id);
    const completion = screen.getByRole('spinbutton', { name: 'Total completion (%)', exact: true });
    await user.clear(completion); await user.type(completion, '25');
    const replyField = screen.getByRole('textbox', { name: 'Worker reply', exact: true });
    const replyText = 'Block A east wall cladding WI-001 is 25% complete in total. Separate clarified demo reply.';
    await user.clear(replyField); await user.type(replyField, replyText);
    await user.click(screen.getByRole('button', { name: 'Save mock reply', exact: true }));
    await waitFor(() => expect(getMessageClarification(selectedProject(), source.id)?.stage).toBe('reply-received'));
    const received = getMessageClarification(selectedProject(), source.id);
    expect(received.reply.text).toBe(replyText);
    expect(received.reply.replyToMessageId).toBe(source.id);
    expect(received.reply.audio).toBeUndefined();
    expect(selectedProject().items).toEqual(beforeItems);
    expect(savedClaimEvidence(selectedProject())).toEqual(claims);
    expect(originalEvidence(sourceBy(selectedProject(), 'unclear'))).toEqual(original);
    view.unmount(); render(<App />);
    expect(getMessageClarification(selectedProject(), source.id)?.request.question).toBe(question);
    await user.click(screen.getByRole('button', { name: 'Add clarified progress update', exact: true }));
    await waitFor(() => expect(getMessageClarification(selectedProject(), source.id)?.stage).toBe('verification'));
    expect(getItemAreaRollup(selectedProject(), 'WI-001', 'reported').completion).toBe(40);
    expect(getItemAreaRollup(selectedProject(), 'WI-001', 'verified').completion).toBe(30);
    await user.click(screen.getByRole('button', { name: 'Verify clarified progress', exact: true }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Verify progress', exact: true }));
    await waitFor(() => expect(getMessageClarification(selectedProject(), source.id)?.stage).toBe('verified'));
    expect(getItemAreaRollup(selectedProject(), 'WI-001', 'verified').completion).toBe(40);
    expect(savedClaimEvidence(selectedProject())).toEqual(claims);
    expect(originalEvidence(sourceBy(selectedProject(), 'unclear'))).toEqual(original);
    expectOtherUnchanged(other);
  });
});
