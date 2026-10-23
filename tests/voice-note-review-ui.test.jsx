import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceNoteEvidenceDetails, VoiceNoteReview } from '../src/components/VoiceNoteReview';
import { getVoiceNoteContext } from '../src/data/voice-notes';
import { clearProjectFormBuffers } from '../src/data/form-buffer';
import { createDemoProject } from '../src/data/demo-project';

vi.mock('../src/data/voice-notes', async importOriginal => ({ ...await importOriginal(), getVoiceNoteContext: vi.fn() }));
const now = '2026-10-24T10:00:00+08:00';
const ids = new Set();
function fixture(code = 'VOICE-UI') {
  const project = createDemoProject({ name: 'Voice note UI', code }, new Date(now)); ids.add(project.id);
  const message = { id: `${code}-CLEAR`, text: 'Block A west wail cladding is 50% complete in total.', status: 'new' };
  project.whatsappMessages = [message]; project.claimDrafts = [{ id: 'SAVED', snapshot: { note: 'Original saved claim' } }];
  project.uiVoice = { source: message, audio: { asset: '/assets/demo-voice-clear.wav', mimeType: 'audio/wav', durationSeconds: 12, demo: true, version: 1, clarity: 'clear' },
    originalTranscript: message.text, reviewedTranscript: message.text, review: null, reviews: [], status: 'pending', readOnly: false, eligible: true,
    needsClarification: false, effectiveMessage: message, sourceKey: `${code}-SOURCE`, evidence: null };
  return { project, message };
}
function review(context, text = 'Block A west wall cladding is 50% complete in total.') {
  const entry = { id: 'REVIEW-1', transcript: text, reason: 'Corrected the word wall after listening.', reviewedBy: 'Demo QS', reviewedAt: now };
  return { ...context, reviewedTranscript: text, review: entry, reviews: [entry], status: 'reviewed' };
}
beforeEach(() => { getVoiceNoteContext.mockImplementation(project => project.uiVoice); });
afterEach(() => { cleanup(); ids.forEach(clearProjectFormBuffers); ids.clear(); vi.clearAllMocks(); });

describe('compact mock voice-note review', () => {
  it('plays only on user action and confirms a simulated transcript without processing the source or saved claims', async () => {
    const { project, message } = fixture(), before = structuredClone(project), save = vi.fn(() => ({ outcome: 'updated' }));
    const user = userEvent.setup();
    const view = render(<form><VoiceNoteReview project={project} messageId={message.id} onSave={save}/></form>);
    expect(view.container.querySelectorAll('form')).toHaveLength(1);
    const audio = view.container.querySelector('audio');
    expect(audio.controls).toBe(true); expect(audio.autoplay).toBe(false); expect(audio.preload).toBe('metadata');
    expect(audio.getAttribute('src')).toBe('/assets/demo-voice-clear.wav');
    expect(screen.getByText('Synthetic demo audio · Simulated transcript')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm transcript', exact: true }));
    expect(save).toHaveBeenCalledWith(message.id, { transcript: message.text, reason: '', sourceKey: project.uiVoice.sourceKey });
    expect(project).toEqual(before);
  });

  it('requires a correction reason and keeps the original transcript distinct', async () => {
    const { project, message } = fixture(), save = vi.fn(() => ({ outcome: 'updated' })), editing = vi.fn(), user = userEvent.setup();
    render(<VoiceNoteReview project={project} messageId={message.id} onSave={save} onEditingChange={editing}/>);
    await user.click(screen.getByRole('button', { name: 'Edit transcript', exact: true }));
    expect(editing).toHaveBeenLastCalledWith(true);
    const transcript = screen.getByRole('textbox', { name: /^Reviewed transcript/ });
    await user.clear(transcript); await user.type(transcript, 'Block A west wall cladding is 50% complete in total.');
    await user.click(screen.getByRole('button', { name: 'Save transcript correction', exact: true }));
    const reason = screen.getByRole('textbox', { name: /^Correction reason/ });
    expect(screen.getByText('Enter a short reason for the transcript correction.')).toBeTruthy();
    expect(document.activeElement).toBe(reason); expect(save).not.toHaveBeenCalled();
    await user.type(reason, 'Corrected the word wall after listening.');
    await user.click(screen.getByRole('button', { name: 'Save transcript correction', exact: true }));
    expect(save).toHaveBeenCalledWith(message.id, { transcript: transcript.value, reason: 'Corrected the word wall after listening.', sourceKey: project.uiVoice.sourceKey });
    expect(editing).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByText('Original transcript & review history', { exact: true }));
    expect(screen.getByText('Original simulated transcript').nextElementSibling.textContent).toBe(message.text);
    expect(project.whatsappMessages[0].text).toBe(message.text);
  });

  it('buffers unfinished corrections per message/project and cancel restores the reviewed transcript', async () => {
    const first = fixture('VOICE-FIRST'), second = fixture('VOICE-SECOND'), user = userEvent.setup(), editing = vi.fn(), save = vi.fn();
    const view = render(<VoiceNoteReview project={first.project} messageId={first.message.id} onSave={save} onEditingChange={editing}/>);
    await user.click(screen.getByRole('button', { name: 'Edit transcript', exact: true }));
    await user.clear(screen.getByRole('textbox', { name: /^Reviewed transcript/ }));
    await user.type(screen.getByRole('textbox', { name: /^Reviewed transcript/ }), 'Unfinished transcript');
    await user.type(screen.getByRole('textbox', { name: /^Correction reason/ }), 'Unfinished listening note');
    view.rerender(<VoiceNoteReview project={second.project} messageId={second.message.id} onSave={save} onEditingChange={editing}/>);
    expect(screen.queryByRole('textbox')).toBeNull(); expect(editing).toHaveBeenLastCalledWith(false);
    view.rerender(<VoiceNoteReview project={first.project} messageId={first.message.id} onSave={save} onEditingChange={editing}/>);
    expect(screen.getByRole('textbox', { name: /^Reviewed transcript/ }).value).toBe('Unfinished transcript');
    expect(screen.getByRole('textbox', { name: /^Correction reason/ }).value).toBe('Unfinished listening note');
    expect(editing).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Edit transcript', exact: true }));
    expect(screen.getByRole('textbox', { name: /^Reviewed transcript/ }).value).toBe(first.message.text);
    expect(screen.getByRole('textbox', { name: /^Correction reason/ }).value).toBe(''); expect(save).not.toHaveBeenCalled();
  });

  it('retains and focuses a failed save without losing the draft', async () => {
    const { project, message } = fixture(), save = vi.fn(() => ({ outcome: 'invalid', error: 'The message changed. Review it again.' })), user = userEvent.setup();
    render(<VoiceNoteReview project={project} messageId={message.id} onSave={save}/>);
    await user.click(screen.getByRole('button', { name: 'Edit transcript', exact: true }));
    await user.type(screen.getByRole('textbox', { name: /^Reviewed transcript/ }), ' Confirmed by listening.');
    await user.type(screen.getByRole('textbox', { name: /^Correction reason/ }), 'Added audible words.');
    await user.click(screen.getByRole('button', { name: 'Save transcript correction', exact: true }));
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toBe('The message changed. Review it again.');
    expect(screen.getByRole('textbox', { name: /^Correction reason/ }).value).toBe('Added audible words.');
  });

  it('keeps an unclear recording on the existing clarification path even after a transcript review', async () => {
    const { project, message } = fixture();
    project.uiVoice = { ...review(project.uiVoice), needsClarification: true, audio: { ...project.uiVoice.audio, clarity: 'unclear' } };
    const user = userEvent.setup(); render(<VoiceNoteReview project={project} messageId={message.id} onSave={vi.fn()}/>);
    expect(screen.getByText('This recording is unclear. Ask the sender to clarify before adding progress.')).toBeTruthy();
    expect(screen.getByText('Transcript reviewed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add progress/ })).toBeNull();
    await user.click(screen.getByText(/Original transcript & review history/));
    expect(screen.getByText('Original simulated transcript')).toBeTruthy();
    expect(screen.getAllByText('Corrected the word wall after listening.')).toHaveLength(2);
    expect(screen.getByText(/Reviewed by Demo QS/)).toBeTruthy();
  });

  it.each(['clarification', 'processed'])('is read-only after %s and releases the unsaved-edit gate', async status => {
    const { project, message } = fixture(), editing = vi.fn(), save = vi.fn(), user = userEvent.setup();
    const view = render(<VoiceNoteReview project={project} messageId={message.id} onSave={save} onEditingChange={editing}/>);
    await user.click(screen.getByRole('button', { name: 'Edit transcript', exact: true }));
    const locked = { ...project, uiVoice: { ...review(project.uiVoice), status, eligible: false, readOnly: true } };
    view.rerender(<VoiceNoteReview project={locked} messageId={message.id} onSave={save} onEditingChange={editing}/>);
    expect(screen.queryByRole('textbox')).toBeNull(); expect(screen.queryByRole('button', { name: 'Edit transcript' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm transcript' })).toBeNull(); expect(editing).toHaveBeenLastCalledWith(false); expect(save).not.toHaveBeenCalled();
  });

  it('shows retained transcripts if audio is missing or cannot play', () => {
    const { project, message } = fixture();
    const view = render(<VoiceNoteReview project={project} messageId={message.id} onSave={vi.fn()}/>);
    fireEvent.error(view.container.querySelector('audio'));
    expect(screen.getByRole('status').textContent).toContain('Demo audio unavailable.');
    expect(within(screen.getByRole('region', { name: 'Voice note review' })).getAllByText(message.text, { exact: true }).length).toBeGreaterThan(0);
    view.rerender(<VoiceNoteReview project={{ ...project, uiVoice: { ...project.uiVoice, audio: null, eligible: false } }} messageId={message.id} onSave={vi.fn()}/>);
    expect(screen.getByText(/Demo audio unavailable/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Confirm transcript' })).toBeNull();
  });

  it('requires a reason when a later review restores the original transcript', async () => {
    const { project, message } = fixture(), save = vi.fn(), user = userEvent.setup();
    project.uiVoice = review(project.uiVoice);
    render(<VoiceNoteReview project={project} messageId={message.id} onSave={save}/>);
    await user.click(screen.getByRole('button', { name: 'Edit transcript', exact: true }));
    const transcript = screen.getByRole('textbox', { name: /^Reviewed transcript/ });
    await user.clear(transcript); await user.type(transcript, message.text);
    await user.clear(screen.getByRole('textbox', { name: /^Correction reason/ }));
    await user.click(screen.getByRole('button', { name: 'Save transcript correction' }));
    expect(screen.getByText('Enter a short reason for the transcript correction.')).toBeTruthy(); expect(save).not.toHaveBeenCalled();
  });

  it('rejects an empty transcript without guessing words or completion', async () => {
    const { project, message } = fixture(), save = vi.fn(), user = userEvent.setup();
    render(<VoiceNoteReview project={project} messageId={message.id} onSave={save}/>);
    await user.click(screen.getByRole('button', { name: 'Edit transcript', exact: true }));
    const transcript = screen.getByRole('textbox', { name: /^Reviewed transcript/ });
    await user.clear(transcript);
    await user.click(screen.getByRole('button', { name: 'Save transcript correction' }));
    expect(screen.getByText('Enter the words you can hear. Use clarification if the recording is unclear.')).toBeTruthy();
    expect(document.activeElement).toBe(transcript); expect(save).not.toHaveBeenCalled(); expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('renders frozen evidence independently of current messages and handles original-only snapshots', async () => {
    const { project, message } = fixture(), user = userEvent.setup();
    const evidence = { version: 1, projectId: project.id, messageId: message.id, audio: project.uiVoice.audio, originalTranscript: message.text,
      reviewedTranscript: 'Frozen reviewed west wall transcript.', reason: 'Frozen correction reason.', reviewedBy: 'Saved demo reviewer', reviewedAt: now, reviewId: 'FROZEN-REVIEW', sourceKey: 'FROZEN-SOURCE' };
    const view = render(<VoiceNoteEvidenceDetails evidence={evidence}/>);
    expect(getVoiceNoteContext).not.toHaveBeenCalled(); expect(view.container.querySelector('details').open).toBe(false);
    await user.click(screen.getByText('Original voice note & transcript'));
    expect(screen.getByText('Frozen reviewed west wall transcript.')).toBeTruthy(); expect(screen.getByText('Frozen correction reason.')).toBeTruthy();
    expect(screen.getByText(/Reviewed by Saved demo reviewer/)).toBeTruthy(); expect(view.container.querySelector('audio').autoplay).toBe(false);
    view.rerender(<VoiceNoteEvidenceDetails evidence={{ ...evidence, reviewedTranscript: null, reason: '', reviewedBy: null, reviewedAt: null, reviewId: null }}/>);
    expect(screen.getByText('No transcript review was saved for this recording.')).toBeTruthy();
    expect(screen.getByText(message.text)).toBeTruthy(); expect(getVoiceNoteContext).not.toHaveBeenCalled();
    view.rerender(<VoiceNoteEvidenceDetails evidence={{ ...evidence, audio: { ...evidence.audio, asset: 'https://unexpected.example/audio.wav' } }}/>);
    expect(screen.getByText('Saved voice-note evidence unavailable.')).toBeTruthy(); expect(view.container.querySelector('audio')).toBeNull();
  });
});
