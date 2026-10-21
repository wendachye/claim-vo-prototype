import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, CircleAlert, FileText, History, Save } from 'lucide-react';
import { getClaimTracking } from '../data/claim-tracking.js';
import { clearFormBuffer } from '../data/form-buffer.js';
import { useBufferedState } from './useFormBuffer.js';
import { BackButton, Badge, Button, FormActions, FormField, Input, PageHeader, Textarea } from './ui.jsx';
import { amount, periodLabel } from './claim-view-utils.js';
import './claim-status-tracker.css';

const stages = ['prepared', 'submitted', 'certified', 'paid'];
const labels = { prepared: 'Prepared', submitted: 'Submitted', certified: 'Certified', paid: 'Paid' };
const stageDates = { prepared: 'preparedAt', submitted: 'submittedAt', certified: 'certifiedAt', paid: 'paidAt' };
const calendarDate = (value) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Singapore' }).format(new Date(value)) : '';
const dateLabel = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' }) : 'Not recorded';
const today = () => calendarDate(new Date().toISOString());
const emptyForm = () => ({ date: today(), reference: '', value: '', note: '' });
const known = (value) => typeof value === 'number' && Number.isFinite(value);

export function ClaimStatusTracker({ project, draftId, onBack, onRecord, onPreview }) {
  const draft = (project.claimDrafts || []).find((entry) => entry.id === draftId && entry.projectId === project.id);
  const tracking = getClaimTracking(project, draftId);
  const action = tracking?.status === 'prepared' ? 'submitted' : tracking?.status === 'submitted' ? 'certified' : tracking?.status === 'certified' ? 'payment' : null;
  const scope = `claim-tracking:${JSON.stringify([draftId, action])}`;
  const [fields, setFields] = useBufferedState(project.id, scope, emptyForm);
  const [feedback, setFeedback] = useState(null);
  const [errors, setErrors] = useState({});
  const feedbackRef = useRef(null);
  const currentStage = stages.indexOf(tracking?.status);
  const superseded = tracking?.status === 'prepared' && (project.claimDrafts || []).some((entry) => entry.projectId === project.id && entry.period === draft?.period && entry.revision > draft.revision);
  const changedAmount = action === 'certified' && fields.value.trim() !== '' && known(tracking?.claimedValue) && Math.abs(Number(fields.value) - tracking.claimedValue) >= 0.005;
  const hasEdits = !!(fields.reference || fields.value || fields.note || fields.date !== today());

  useEffect(() => { setFeedback(null); setErrors({}); }, [project.id, draftId]);
  useEffect(() => { if (feedback) feedbackRef.current?.focus(); }, [feedback]);

  function update(name, value) {
    setFields((prior) => ({ ...prior, [name]: value }));
    setErrors((prior) => ({ ...prior, [name]: undefined }));
    setFeedback(null);
  }
  function fillDemoDetails() {
    const lastDate = calendarDate(tracking.history?.at(-1)?.date || (action === 'submitted' ? tracking.preparedAt : action === 'certified' ? tracking.submittedAt : tracking.paidAt || tracking.certifiedAt));
    const date = lastDate && lastDate > today() ? lastDate : today();
    const value = action === 'certified' ? tracking.claimedValue : action === 'payment' ? tracking.certifiedValue : null;
    setFields({ date, reference: `DEMO-${action === 'submitted' ? 'SUB' : action === 'certified' ? 'CERT' : 'PAY'}-R${draft.revision}`, value: known(value) ? String(value) : '', note: `Simulated ${action === 'submitted' ? 'submission' : action === 'certified' ? 'certification' : 'payment'} for the prototype showcase.` });
    setErrors({});
    setFeedback(null);
  }
  function record(event) {
    event.preventDefault();
    if (!tracking || !action || superseded) return;
    const invalid = {};
    if (!fields.date) invalid.date = 'Choose a date.';
    if (!fields.reference.trim()) invalid.reference = 'Enter a reference for this demo record.';
    if (action !== 'submitted' && (!fields.value.trim() || !Number.isFinite(Number(fields.value)))) invalid.value = 'Enter an amount. Zero is valid.';
    if (changedAmount && !fields.note.trim()) invalid.note = 'Explain why the certified amount differs from the claim.';
    setErrors(invalid);
    if (Object.keys(invalid).length) return setFeedback({ error: true, message: 'Check the highlighted fields before saving.' });
    const result = onRecord?.(draftId, action, { date: fields.date, reference: fields.reference.trim(), note: fields.note.trim(), ...(action !== 'submitted' ? { value: fields.value } : {}) });
    if (!result || result.outcome === 'invalid') return setFeedback({ error: true, message: result?.error || 'The status could not be recorded. Check the details and try again.' });
    setFields(emptyForm());
    clearFormBuffer(project.id, scope);
    setErrors({});
    setFeedback({ message: action === 'submitted' ? 'Submission recorded for this demo claim.' : action === 'certified' ? 'Certification recorded. You can now record a payment.' : result.tracking?.status === 'paid' ? 'The full payment is recorded. This demo claim is paid.' : 'Partial payment recorded. Record the updated total when more is paid.' });
  }

  if (!tracking || !draft) return <div className="claim-status-view"><PageHeader title="Claim status" onBack={onBack} backLabel="Back to monthly claims" /><section className="claim-status-unavailable"><CircleAlert size={25} /><h2>Claim tracking unavailable</h2><p>Choose a prepared claim from the selected project.</p><Button onClick={onBack}>Open monthly claims</Button></section></div>;

  const formTitle = action === 'submitted' ? 'Record submission' : action === 'certified' ? 'Record certification' : 'Record payment';
  const formHelp = action === 'submitted' ? 'Add a mock submission reference and date for this saved version.' : action === 'certified' ? 'Record the amount assessed by the certifier. The original claim amount stays unchanged.' : 'Enter the total paid to date, including earlier payments. The claim becomes Paid when it matches the certified amount.';
  return <div className="claim-status-view">
    <PageHeader title="Claim status" description={`${periodLabel(draft.period)} · Version ${draft.revision}`} onBack={onBack} backLabel="Back to monthly claims" actions={onPreview && <Button icon={FileText} onClick={() => onPreview(draft.id)}>Preview saved claim</Button>} />
    <p className="claim-status-demo">Mock tracking · Saved in this browser. No real submission or payment.</p>
    <section className="claim-status-summary" aria-label="Claim status summary">
      <div className="claim-status-reference"><div><span>Claim reference</span><strong>{draft.id}</strong></div><Badge tone={tracking.status === 'paid' ? 'green' : 'blue'}>{labels[tracking.status]}</Badge></div>
      <ol className="claim-status-timeline" aria-label="Claim stages">{stages.map((stage, index) => <li key={stage} className={index < currentStage ? 'complete' : index === currentStage ? 'current' : ''} aria-current={index === currentStage ? 'step' : undefined}><i aria-hidden="true">{index < currentStage || stage === 'paid' && tracking.status === 'paid' ? <Check size={15} /> : index + 1}</i><div><strong>{labels[stage]}</strong><span>{index <= currentStage ? dateLabel(tracking[stageDates[stage]]) : 'Not yet'}</span></div></li>)}</ol>
      <dl className="claim-status-amounts"><div><dt>Claimed this month</dt><dd>{tracking.currency} {amount(tracking.claimedValue)}</dd></div><div><dt>Certified amount</dt><dd>{known(tracking.certifiedValue) ? `${tracking.currency} ${amount(tracking.certifiedValue)}` : 'Not recorded'}</dd></div><div><dt>Total paid to date</dt><dd>{known(tracking.paidValue) ? `${tracking.currency} ${amount(tracking.paidValue)}` : 'Not recorded'}</dd></div></dl>
    </section>
    {feedback && <div ref={feedbackRef} tabIndex={-1} className={`claim-status-feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.error ? <CircleAlert size={17} /> : <Check size={17} />}<span>{feedback.message}</span></div>}
    {superseded ? <section className="claim-status-next"><h2>A newer version is available</h2><p>Prepare the latest saved version before recording its submission. This earlier version remains available to preview.</p><Button onClick={onBack}>Back to monthly claims</Button></section> : action ? <form className="claim-status-next" noValidate onSubmit={record}>
      <header><div><h2>{formTitle}</h2><p>{formHelp}</p></div><Button onClick={fillDemoDetails}>Use demo details</Button></header>
      <div className="claim-status-fields"><FormField label={action === 'submitted' ? 'Submission date' : action === 'certified' ? 'Certification date' : 'Payment date'} required error={errors.date}><Input type="date" value={fields.date} onChange={(event) => update('date', event.target.value)} /></FormField><FormField label={action === 'submitted' ? 'Submission reference' : action === 'certified' ? 'Certificate reference' : 'Payment reference'} required error={errors.reference} hint="Use a demo reference for the showcase."><Input value={fields.reference} onChange={(event) => update('reference', event.target.value)} placeholder={action === 'submitted' ? 'e.g. DEMO-SUB-001' : action === 'certified' ? 'e.g. DEMO-CERT-001' : 'e.g. DEMO-PAY-001'} /></FormField>{action !== 'submitted' && <FormField label={action === 'certified' ? 'Certified amount' : 'Total paid to date'} required suffix={tracking.currency} error={errors.value} hint={action === 'certified' ? 'Enter the recorded amount, including zero if applicable.' : known(tracking.paidValue) ? `Already recorded: ${tracking.currency} ${amount(tracking.paidValue)}. Enter the new total, not this payment alone.` : 'Enter the full total received so far.'}><Input type="number" step="0.01" inputMode="decimal" value={fields.value} onChange={(event) => update('value', event.target.value)} placeholder="Enter amount" /></FormField>}<FormField className="claim-status-note" label="Remarks" required={changedAmount} optional={!changedAmount} error={errors.note} hint={changedAmount ? 'Explain the difference from the claimed amount.' : undefined}><Textarea rows={3} value={fields.note} onChange={(event) => update('note', event.target.value)} placeholder="Add any follow-up or explanation…" /></FormField></div>
      {hasEdits && <p className="claim-status-buffer-note">Your unfinished edits stay while you browse. Save before refreshing.</p>}
      <FormActions secondary={<BackButton onClick={onBack}>Back to monthly claims</BackButton>}><Button type="submit" className="primary" icon={Save}>{formTitle}</Button></FormActions>
    </form> : <section className="claim-status-complete"><CheckCheck size={24} /><div><h2>Payment fully recorded</h2><p>This demo claim has reached Paid. You can review the saved claim and its tracking history.</p></div></section>}
    {!!tracking.history?.length && <details className="claim-status-history"><summary><History size={15} />Tracking history <span>{tracking.history.length}</span></summary><ol>{[...tracking.history].reverse().map((event, index) => <li key={event.id || `${event.stage || event.action}-${index}`}><div><strong>{labels[event.stage || event.action] || (event.stage === 'payment' || event.action === 'payment' ? 'Payment recorded' : 'Status recorded')}</strong><time>{dateLabel(event.date)}</time></div>{event.reference && <span>{event.reference}</span>}{known(event.value) && <p>{tracking.currency} {amount(event.value)}</p>}{event.note && <p>{event.note}</p>}</li>)}</ol></details>}
  </div>;
}
