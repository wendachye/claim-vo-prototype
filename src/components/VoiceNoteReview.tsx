import { useEffect, useRef, useState } from 'react';
import { CheckCheck, CircleAlert, Mic, Pencil, VolumeX } from 'lucide-react';
import type { Project, VoiceNoteEvidence } from '../types/domain';
import { getVoiceNoteContext, isVoiceNoteEvidenceSnapshot } from '../data/voice-notes';
import { clearFormBuffer } from '../data/form-buffer';
import { useBufferedState } from './useFormBuffer';
import { Badge, Button, FormActions, FormField, Textarea, formatTime } from './ui';
import './voice-note-review.css';

export interface VoiceNoteReviewProps {
  project: Project;
  messageId: string;
  onSave?: (messageId: string, values: { transcript: string; reason: string; sourceKey: string }) => { outcome: string; error?: string } | undefined;
  onEditingChange?: (editing: boolean) => void;
}
interface TranscriptForm { editing: boolean; transcript: string; reason: string }
const reviewedAt = (value: string) => Number.isFinite(Date.parse(value)) ? formatTime(value) : 'Review time unavailable';
const duration = (value: number) => Number.isFinite(value) && value > 0 ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '';

/** Uses only a frozen evidence record; later message edits cannot change saved claims. */
export function VoiceNoteEvidenceDetails({ evidence, defaultOpen = false }: { evidence: VoiceNoteEvidence | null | undefined; defaultOpen?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [evidence?.audio?.asset]);
  if (!isVoiceNoteEvidenceSnapshot(evidence)) return <p className="wa-voice-help">Saved voice-note evidence unavailable.</p>;
  return <details className="wa-voice-history wa-voice-saved-evidence" open={defaultOpen || undefined}>
    <summary>Original voice note &amp; transcript</summary>
    <p className="wa-voice-help">Synthetic demo audio · Simulated transcript</p>
    {!failed ? <div className="wa-voice-player"><audio controls preload="metadata" aria-label="Saved original demo voice note" src={evidence.audio.asset} onError={() => setFailed(true)}>Your browser does not support audio playback.</audio></div>
      : <p className="wa-voice-audio-error" role="status"><VolumeX size={15} aria-hidden="true" />Demo audio unavailable. The saved transcripts remain below.</p>}
    <div className="wa-voice-original"><strong>Original simulated transcript</strong><p>{evidence.originalTranscript}</p></div>
    {evidence.reviewedTranscript !== null ? <div className="wa-voice-current-review"><strong>Reviewed transcript</strong><p>{evidence.reviewedTranscript}</p>{evidence.reason && <p><strong>Correction reason</strong>{evidence.reason}</p>}<p className="wa-voice-reviewer">Reviewed by {evidence.reviewedBy} · {reviewedAt(evidence.reviewedAt!)}</p></div>
      : <p className="wa-voice-help">No transcript review was saved for this recording.</p>}
  </details>;
}

/** A browser-local transcript review. Saving never processes or verifies progress. */
export function VoiceNoteReview({ project, messageId, onSave, onEditingChange }: VoiceNoteReviewProps) {
  const context = getVoiceNoteContext(project, messageId);
  const scope = `voice-transcript:${JSON.stringify([messageId, context.sourceKey, context.review?.id])}`;
  const initial = (): TranscriptForm => ({ editing: false, transcript: context.reviewedTranscript, reason: context.review?.reason || '' });
  const [form, setForm] = useBufferedState(project.id, scope, initial);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);
  const controls = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const editingCallback = useRef(onEditingChange); editingCallback.current = onEditingChange;
  const editable = context.eligible && !context.readOnly && Boolean(onSave);
  const editing = editable && form.editing;
  const changed = form.transcript.trim() !== context.originalTranscript.trim()
    || Boolean(context.review && form.transcript.trim() !== context.reviewedTranscript.trim());
  const audio = context.audio;

  useEffect(() => { setErrors({}); setFeedback(null); }, [project.id, scope]);
  useEffect(() => { setAudioFailed(false); }, [audio?.asset]);
  useEffect(() => {
    editingCallback.current?.(editing);
    return () => { editingCallback.current?.(false); };
  }, [editing, project.id, messageId]);
  useEffect(() => { if (feedback) feedbackRef.current?.focus(); }, [feedback]);

  function update(name: 'transcript' | 'reason', value: string) {
    setForm(previous => ({ ...previous, [name]: value }));
    setErrors(previous => ({ ...previous, [name]: undefined })); setFeedback(null);
  }
  function cancel() { setForm(initial()); clearFormBuffer(project.id, scope); setErrors({}); setFeedback(null); }
  function save() {
    if (!editable) return;
    const next: Record<string, string> = {};
    const transcript = form.transcript.trim(), reason = form.reason.trim();
    if (!transcript) next.transcript = 'Enter the words you can hear. Use clarification if the recording is unclear.';
    else if (transcript.length > 4000) next.transcript = 'Keep the transcript to 4,000 characters or fewer.';
    if (changed && !reason) next.reason = 'Enter a short reason for the transcript correction.';
    else if (reason.length > 1000) next.reason = 'Keep the correction reason to 1,000 characters or fewer.';
    const first = Object.keys(next)[0];
    if (first) { setForm(previous => ({ ...previous, editing: true })); setErrors(next); queueMicrotask(() => controls.current[first]?.focus()); return; }
    const result = onSave?.(messageId, { transcript, reason, sourceKey: context.sourceKey });
    if (!result || result.outcome === 'invalid') { setFeedback({ error: true, message: result?.error || 'The transcript could not be saved. Review the recording and try again.' }); return; }
    setForm({ editing: false, transcript, reason: '' }); clearFormBuffer(project.id, scope); setErrors({});
    setFeedback({ message: context.needsClarification ? 'Transcript reviewed. Ask the sender to clarify the unclear recording.' : 'Transcript reviewed. Review the suggested match before adding progress.' });
  }

  if (!context.source) return null;
  return <section className="wa-voice-review" aria-label="Voice note review">
    <header className="wa-voice-heading"><div><h3><Mic size={15} aria-hidden="true" />Voice note</h3><p>Synthetic demo audio · Simulated transcript</p></div>
      {context.review && <Badge tone="blue">Transcript reviewed</Badge>}
    </header>
    {audio && !audioFailed ? <div className="wa-voice-player"><audio key={audio.asset} controls preload="metadata" aria-label="Original demo voice note" onError={() => setAudioFailed(true)} src={audio.asset}>Your browser does not support audio playback.</audio>{duration(audio.durationSeconds) && <span>{duration(audio.durationSeconds)}</span>}</div>
      : <p className="wa-voice-audio-error" role="status"><VolumeX size={15} aria-hidden="true" />Demo audio unavailable. The original transcript is retained below.</p>}
    {context.needsClarification && <p className="wa-voice-unclear"><CircleAlert size={15} aria-hidden="true" /><span>{context.readOnly ? 'This recording required clarification. The original audio is retained.' : 'This recording is unclear. Ask the sender to clarify before adding progress.'}</span></p>}
    {feedback && <div ref={feedbackRef} tabIndex={-1} role={feedback.error ? 'alert' : 'status'} className={`wa-voice-feedback${feedback.error ? ' error' : ''}`}>{feedback.message}</div>}
    {editing ? <div className="wa-voice-editor" role="group" aria-label="Edit voice transcript">
      <FormField label="Reviewed transcript" required error={errors.transcript} hint="Keep uncertain words explicit. A transcript edit does not add or verify progress."><Textarea ref={node => { controls.current.transcript = node; }} rows={3} maxLength={4000} value={form.transcript} onChange={event => update('transcript', event.target.value)} /></FormField>
      <FormField label="Correction reason" required={changed} optional={!changed} error={errors.reason}><Textarea ref={node => { controls.current.reason = node; }} rows={2} maxLength={1000} value={form.reason} onChange={event => update('reason', event.target.value)} placeholder="e.g. The worker said W3, not W5." /></FormField>
      <FormActions secondary={<Button onClick={cancel}>Cancel</Button>}><Button className="primary" icon={CheckCheck} onClick={save}>{changed ? 'Save transcript correction' : 'Confirm transcript'}</Button></FormActions>
    </div> : <>
      <div className="wa-voice-transcript"><span>{context.review ? 'Reviewed transcript' : 'Simulated transcript'}</span><p>{context.reviewedTranscript || 'Transcript unavailable'}</p></div>
      {context.review && <div className="wa-voice-current-review">{context.review.reason && <p><strong>Correction reason</strong>{context.review.reason}</p>}<p className="wa-voice-reviewer">Reviewed by {context.review.reviewedBy} · {reviewedAt(context.review.reviewedAt)}</p></div>}
      {editable && <FormActions secondary={<Button className="ghost" icon={Pencil} onClick={() => setForm(previous => ({ ...previous, editing: true }))}>Edit transcript</Button>}>{!context.review && <Button className="primary" icon={CheckCheck} onClick={save}>Confirm transcript</Button>}</FormActions>}
    </>}
    {context.readOnly && <p className="wa-voice-help">{context.issue || (context.status === 'clarification' ? 'A clarification thread is already saved. Continue the existing clarification below.' : 'This transcript is kept with the saved message. Continue its existing review workflow.')}</p>}
    {!editable && !context.readOnly && context.issue && <p className="wa-voice-help">{context.issue}</p>}
    <details className="wa-voice-history"><summary>Original transcript &amp; review history{context.reviews.length > 0 && <span>{context.reviews.length}</span>}</summary>
      <div className="wa-voice-original"><strong>Original simulated transcript</strong><p>{context.originalTranscript || 'Original transcript unavailable'}</p></div>
      {context.reviews.length > 0 && <ol>{context.reviews.map(review => <li key={review.id}><p>{review.transcript}</p>{review.reason && <p><strong>Correction reason</strong>{review.reason}</p>}<p className="wa-voice-reviewer">{review.reviewedBy} · {reviewedAt(review.reviewedAt)}</p></li>)}</ol>}
    </details>
  </section>;
}
