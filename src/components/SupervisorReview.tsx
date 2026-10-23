import { VoiceNoteEvidenceDetails } from './VoiceNoteReview';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ImageOff, MessageSquare, Pencil, ShieldCheck } from 'lucide-react';
import type { Project } from '../types/domain';
import { getSupervisorReview } from '../data/supervisor-review';
import { clearFormBuffer } from '../data/form-buffer';
import { useBufferedState } from './useFormBuffer';
import { BackButton, Badge, Button, FormActions, FormField, Input, PageHeader, Textarea, formatNumber, formatTime } from './ui';
import './supervisor-review.css';

export type SupervisorDecision = 'confirm' | 'correct' | 'cant-verify';
export interface SupervisorDecisionValues { completion?: string; reason?: string }
interface SupervisorReviewProps {
  project: Project;
  reportId: string | null;
  routeProjectId: string | null;
  onBack: () => void;
  onDecision: (decision: SupervisorDecision, values: SupervisorDecisionValues) => { outcome: 'updated' | 'unchanged' | 'invalid'; error?: string };
}
interface ReviewForm {
  mode: 'initial' | 'correct' | 'cant-verify';
  completion: string;
  correctionReason: string;
  clarificationReason: string;
}
const percent = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${formatNumber(value)}%` : 'Not recorded';
const timeLabel = (value?: string) => value && Number.isFinite(Date.parse(value)) ? formatTime(value) : 'Time not recorded';

/** One browser-local observation review, without financial or workspace controls. */
export function SupervisorReview({ project, reportId, routeProjectId, onBack, onDecision }: SupervisorReviewProps) {
  const context = getSupervisorReview(project, routeProjectId || '', reportId || '');
  const { report, item } = context;
  const identity = JSON.stringify([project.id, routeProjectId, reportId]);
  const scope = `supervisor-review:${JSON.stringify([routeProjectId, reportId])}`;
  const [form, setForm] = useBufferedState<ReviewForm>(project.id, scope, () => ({ mode: 'initial',
    completion: context.reportedCompletion == null ? '' : String(context.reportedCompletion), correctionReason: '', clarificationReason: '' }));
  const [errors, setErrors] = useState<{ completion?: string; reason?: string }>({});
  const [feedback, setFeedback] = useState<{ identity: string; message: string; error: boolean } | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const completionRef = useRef<HTMLInputElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const photoUrl = typeof report?.photo === 'string' ? report.photo : report?.photo?.url;
  const originalVoiceReport = Boolean(report?.voiceNote && report.voiceNote.messageId === report.sourceMessageId);
  const shownFeedback = feedback?.identity === identity ? feedback : null;
  const complete = Boolean(shownFeedback && !shownFeedback.error);
  const editable = context.canReview && !complete;
  const confirmationLowersVerified = context.reportedCompletion != null && context.verifiedCompletion != null
    && context.reportedCompletion < context.verifiedCompletion;
  const clarificationSaved = Boolean(complete && shownFeedback?.message.startsWith('Can’t verify'));
  const area = report?.areaMapping;
  const location = area ? [area.code ? `Area ${area.code}` : '', area.name].filter(Boolean).join(' · ')
    : report?.area || report?.location || item?.location || 'Location not recorded';
  const statusLabel = complete ? 'Review saved' : context.state === 'pending' ? 'Needs verification'
    : context.state === 'clarification' ? 'Needs clarification' : context.state === 'reviewed' ? 'Reviewed' : 'Unavailable';

  useEffect(() => { setErrors({}); setFeedback(null); }, [identity]);
  useEffect(() => setPhotoFailed(false), [photoUrl]);
  useEffect(() => { if (shownFeedback) feedbackRef.current?.focus(); }, [shownFeedback]);

  function choose(mode: ReviewForm['mode']) {
    setForm(previous => ({ ...previous, mode }));
    setErrors({}); setFeedback(null);
  }
  function decide(decision: SupervisorDecision, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!editable || decision === 'confirm' && confirmationLowersVerified) return;
    const next: typeof errors = {};
    const reason = decision === 'correct' ? form.correctionReason.trim() : decision === 'cant-verify' ? form.clarificationReason.trim() : '';
    if (decision === 'correct') {
      const value = Number(form.completion);
      if (!form.completion.trim() || !Number.isFinite(value) || value < 0 || value > 100) next.completion = 'Enter a cumulative percentage from 0 to 100.';
    }
    if (decision !== 'confirm' && !reason) next.reason = decision === 'correct' ? 'Add a reason for this correction.' : 'Explain what needs checking before this can be verified.';
    if (reason.length > 1000) next.reason = 'Keep the reason to 1,000 characters or fewer.';
    if (next.completion || next.reason) {
      setErrors(next);
      queueMicrotask(() => (next.completion ? completionRef.current : reasonRef.current)?.focus());
      return;
    }
    const result = onDecision(decision, { ...(decision === 'correct' ? { completion: form.completion.trim() } : {}), ...(reason ? { reason } : {}) });
    if (result.outcome !== 'updated') {
      setFeedback({ identity, error: true, message: result.error || 'This update has already changed. Return to Site progress to review its current state.' });
      return;
    }
    const message = decision === 'cant-verify' ? 'Can’t verify · clarification needed'
      : `${decision === 'confirm' ? 'Confirmed' : 'Corrected'} · ${percent(decision === 'confirm' ? context.reportedCompletion : Number(form.completion))} verified`;
    setFeedback({ identity, error: false, message });
    clearFormBuffer(project.id, scope);
    setErrors({});
  }

  return <main className="supervisor-review-page">
    <div className="supervisor-review-top"><BackButton onClick={onBack}>Back to Site progress</BackButton><Badge tone="blue">Browser-local demo</Badge></div>
    <div className="supervisor-review-project">{project.name}</div>
    <PageHeader title="Supervisor review" description={report?.voiceNote ? 'Check one site update against its recording, transcript and any clarification.' : 'Check one site update against its message and photo.'} />

    {shownFeedback && <div ref={feedbackRef} tabIndex={-1} role={shownFeedback.error ? 'alert' : 'status'} className={`supervisor-review-feedback${shownFeedback.error ? ' error' : ''}`}>
      {!shownFeedback.error && <Check size={18} aria-hidden="true" />}<div><strong>{shownFeedback.message}</strong>{!shownFeedback.error && <p>{shownFeedback.message.startsWith('Can’t verify')
        ? 'Verified progress is unchanged. This report now needs clarification.' : report?.voiceNote ? 'The original recording, transcript and reported percentage are retained.' : 'The original message, photo and reported percentage are retained.'}</p>}</div>
    </div>}

    {!report || !item ? <section className="supervisor-review-unavailable" aria-label="Review unavailable"><ShieldCheck aria-hidden="true" /><h2>Update unavailable</h2><p>{context.error || 'Choose a pending report from the selected project in Site progress.'}</p></section> : <>
      <section className="supervisor-review-card" aria-label="Site update">
        <header className="supervisor-review-work"><div><span className="supervisor-review-eyebrow">Contract work · {item.ref || item.id}</span><h2>{item.description}</h2><p>{location}</p>{report.areaProgress && <p>{formatNumber(report.areaProgress.allocatedQuantity)} {item.unit} allocated to this area</p>}</div><Badge tone={clarificationSaved || context.state === 'clarification' ? 'amber' : complete || context.state === 'reviewed' ? 'green' : context.state === 'pending' ? 'amber' : 'slate'}>{statusLabel}</Badge></header>
        <dl className="supervisor-review-totals"><div><dt>Reported in this update</dt><dd>{percent(context.reportedCompletion)}</dd></div><div><dt>Current verified</dt><dd>{percent(context.verifiedCompletion)}</dd></div></dl>
        <p className="supervisor-review-cumulative">Cumulative completion{report.areaProgress ? ' for this area' : ''} · total to date</p>
        <div className="supervisor-review-source"><div className="supervisor-review-sender"><strong>{report.sender || 'Sender not recorded'}</strong><time dateTime={report.date}>{timeLabel(report.date)}</time></div>{!originalVoiceReport && <blockquote>{report.message || report.text || 'No message text attached.'}</blockquote>}</div>
        {photoUrl && !photoFailed ? <figure className="supervisor-review-photo"><img src={photoUrl} alt={report.photoAlt || 'Photo attached to this site update'} onError={() => setPhotoFailed(true)} /><figcaption>Demonstration photo · {report.voiceNote ? 'review alongside the recording and transcript' : 'review alongside the message'}</figcaption></figure>
          : (!report.voiceNote || photoFailed) && <div className="supervisor-review-photo-missing"><ImageOff aria-hidden="true" /><p>{photoFailed ? 'Site photo could not be displayed' : 'No site photo attached'}</p><span>Check the available evidence before confirming. Use Can’t verify if it is insufficient.</span></div>}
      </section>

      {report.voiceNote && <VoiceNoteEvidenceDetails evidence={report.voiceNote}/>}
      {!editable && !complete && <section className="supervisor-review-readonly" aria-label="Review status"><strong>{context.state === 'clarification' ? 'A clearer update is needed' : context.state === 'reviewed' ? 'This update has been reviewed' : 'Review is unavailable'}</strong><p>{context.error || 'Return to Site progress to see the current report status.'}</p>{report.reviewReason && <p className="supervisor-review-recorded-reason">{report.reviewReason}</p>}</section>}

      {editable && <section className="supervisor-review-decision" aria-label="Your review">
        <h2>Your review</h2>
        {form.mode === 'initial' ? <><p>Confirm the reported total, correct it, or record what needs checking.</p>{confirmationLowersVerified && <p>Reported total is below verified. Choose Correct and explain the change.</p>}<div className="supervisor-review-choices"><Button className="primary" icon={Check} disabled={confirmationLowersVerified} onClick={() => decide('confirm')}>Confirm</Button><Button icon={Pencil} onClick={() => choose('correct')}>Correct</Button><Button icon={MessageSquare} onClick={() => choose('cant-verify')}>Can’t verify</Button></div></> : <form noValidate onSubmit={event => decide(form.mode === 'correct' ? 'correct' : 'cant-verify', event)}>
          {form.mode === 'correct' && <FormField label="Correct cumulative completion (%)" required error={errors.completion} hint="Enter the total completed to date, not an additional percentage."><Input ref={completionRef} type="number" inputMode="decimal" min="0" max="100" step="any" value={form.completion} onChange={event => { setForm(previous => ({ ...previous, completion: event.target.value })); setErrors(previous => ({ ...previous, completion: undefined })); }} /></FormField>}
          <FormField label={form.mode === 'correct' ? 'Correction reason' : 'What needs checking?'} required error={errors.reason} hint={form.mode === 'cant-verify' ? 'Verified progress stays unchanged. This adds a clarification task; no message is sent.' : 'The worker’s original percentage stays with the report.'}><Textarea ref={reasonRef} rows={3} maxLength={1000} value={form.mode === 'correct' ? form.correctionReason : form.clarificationReason} placeholder={form.mode === 'correct' ? 'e.g. Checked on site: the east bay is unfinished.' : 'e.g. Please show the full work area and confirm the total.'} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, [form.mode === 'correct' ? 'correctionReason' : 'clarificationReason']: value })); setErrors(previous => ({ ...previous, reason: undefined })); }} /></FormField>
          <FormActions secondary={<Button onClick={() => choose('initial')}>Cancel</Button>}><Button className="primary" type="submit" icon={form.mode === 'correct' ? Check : MessageSquare}>{form.mode === 'correct' ? 'Save correction' : 'Request clearer update'}</Button></FormActions>
        </form>}
      </section>}
      {complete && <FormActions><Button className="primary" onClick={onBack}>Return to Site progress</Button></FormActions>}
    </>}
    <p className="supervisor-review-demo-note">Mock supervisor review · changes stay in this browser. No WhatsApp message is sent.</p>
  </main>;
}
