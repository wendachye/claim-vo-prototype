import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCheck, CircleAlert, FileText, History, MessageSquare, Save } from 'lucide-react';
import { getClaimTracking } from '../data/claim-tracking.js';
import { getClaimRevisionContext } from '../data/claim-revisions.js';
import { clearFormBuffer } from '../data/form-buffer.js';
import { useBufferedState } from './useFormBuffer.js';
import { BackButton, Badge, Button, FormActions, FormField, Input, NativeSelect, PageHeader, Textarea } from './ui.jsx';
import { amount, periodLabel } from './claim-view-utils.js';
import './claim-status-tracker.css';

const stages = ['prepared', 'submitted', 'certified', 'paid'];
const labels = { prepared: 'Prepared', submitted: 'Submitted', queried: 'Needs revision', certified: 'Certified', paid: 'Paid' };
const stageDates = { prepared: 'preparedAt', submitted: 'submittedAt', certified: 'certifiedAt', paid: 'paidAt' };
const calendarDate = (value) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Singapore' }).format(new Date(value)) : '';
const dateLabel = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' }) : 'Not recorded';
const today = () => calendarDate(new Date().toISOString());
const emptyForm = () => ({ date: today(), reference: '', value: '', note: '', target: 'claim:' });
const known = (value) => typeof value === 'number' && Number.isFinite(value);
const included = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => row.included);
const targetChoices = (draft) => [
  { value: 'claim:', type: 'claim', id: '', label: 'Whole claim' },
  ...included(draft?.snapshot?.workRows).map((row) => ({ value: `work:${row.id}`, type: 'work', id: row.id, label: `${row.ref || row.id} · ${row.description || 'Contract work'}` })),
  ...included(draft?.snapshot?.voRows).map((row) => ({ value: `vo:${row.id}`, type: 'vo', id: row.id, label: `${row.reference || row.id} · ${row.title || 'Extra work'}` })),
];

export function ClaimStatusTracker({ project, draftId, onBack, onRecord, onPreview, onRevise, onOpenRevision }) {
  const draft = (project.claimDrafts || []).find((entry) => entry.id === draftId && entry.projectId === project.id);
  const tracking = getClaimTracking(project, draftId);
  const queryModeScope = `claim-tracking:${JSON.stringify([draftId, 'query-open'])}`;
  const [queryMode, setQueryMode] = useBufferedState(project.id, queryModeScope, false);
  const action = tracking?.status === 'prepared' ? 'submitted' : tracking?.status === 'submitted' ? queryMode ? 'query' : 'certified' : tracking?.status === 'certified' ? 'payment' : null;
  const scope = `claim-tracking:${JSON.stringify([draftId, action])}`;
  const [fields, setFields] = useBufferedState(project.id, scope, emptyForm);
  const [feedback, setFeedback] = useState(null);
  const [errors, setErrors] = useState({});
  const feedbackRef = useRef(null);
  const currentStage = tracking?.status === 'queried' ? 1 : stages.indexOf(tracking?.status);
  const superseded = tracking?.status === 'prepared' && (project.claimDrafts || []).some((entry) => entry.projectId === project.id && entry.period === draft?.period && entry.revision > draft.revision);
  const changedAmount = action === 'certified' && fields.value.trim() !== '' && known(tracking?.claimedValue) && Math.abs(Number(fields.value) - tracking.claimedValue) >= 0.005;
  const hasEdits = !!(fields.reference || fields.value || fields.note || fields.date !== today() || fields.target && fields.target !== 'claim:');
  const choices = targetChoices(draft);
  const revisionContext = tracking?.status === 'queried' ? getClaimRevisionContext(project, draftId) : null;
  const revision = revisionContext?.revision;
  const revisedTracking = revision?.status === 'prepared' ? getClaimTracking(project, revision.id) : null;
  const resubmitted = revisedTracking && revisedTracking.status !== 'prepared';
  const sourceDraft = draft?.revisionOf ? (project.claimDrafts || []).find((entry) => entry.id === draft.revisionOf && entry.projectId === project.id) : null;
  const sourceQuery = sourceDraft ? getClaimTracking(project, sourceDraft.id)?.query : null;
  const isRevision = !!sourceDraft;

  useEffect(() => { setFeedback(null); setErrors({}); }, [project.id, draftId]);
  useEffect(() => { if (feedback) feedbackRef.current?.focus(); }, [feedback]);

  function update(name, value) {
    setFields((prior) => ({ ...prior, [name]: value }));
    setErrors((prior) => ({ ...prior, [name]: undefined }));
    setFeedback(null);
  }
  function toggleQuery(open) { setQueryMode(open); setErrors({}); setFeedback(null); }
  function fillDemoDetails() {
    const lastDate = calendarDate(tracking.history?.at(-1)?.date || (action === 'submitted' ? tracking.preparedAt : ['certified', 'query'].includes(action) ? tracking.submittedAt : tracking.paidAt || tracking.certifiedAt));
    const date = lastDate && lastDate > today() ? lastDate : today();
    const value = action === 'certified' ? tracking.claimedValue : action === 'payment' ? tracking.certifiedValue : null;
    const demoStage = action === 'submitted' ? isRevision ? 'resubmission' : 'submission' : action === 'query' ? 'query' : action === 'certified' ? 'certification' : 'payment';
    const target = action === 'query' ? choices.find((entry) => entry.type !== 'claim') || choices[0] : choices[0];
    setFields({ date, reference: `DEMO-${action === 'submitted' ? isRevision ? 'RESUB' : 'SUB' : action === 'query' ? 'QUERY' : action === 'certified' ? 'CERT' : 'PAY'}-R${draft.revision}`, value: known(value) ? String(value) : '', target: target.value,
      note: action === 'query' ? `Simulated query: please check the assessment and supporting evidence for ${target.label} before resubmission.` : `Simulated ${demoStage} for the prototype showcase.` });
    setErrors({}); setFeedback(null);
  }
  function record(event) {
    event.preventDefault();
    if (!tracking || !action || superseded) return;
    const invalid = {};
    const target = choices.find((entry) => entry.value === fields.target);
    if (!fields.date) invalid.date = 'Choose a date.';
    if (!fields.reference.trim()) invalid.reference = 'Enter a reference for this demo record.';
    if (['certified', 'payment'].includes(action) && (!fields.value.trim() || !Number.isFinite(Number(fields.value)))) invalid.value = 'Enter an amount. Zero is valid.';
    if (action === 'query' && !fields.note.trim()) invalid.note = 'Describe the query so the QS knows what to review.';
    if (action === 'query' && !target) invalid.target = 'Choose an item from this saved claim.';
    if (changedAmount && !fields.note.trim()) invalid.note = 'Explain why the certified amount differs from the claim.';
    setErrors(invalid);
    if (Object.keys(invalid).length) return setFeedback({ error: true, message: 'Check the highlighted fields before saving.' });
    const result = onRecord?.(draftId, action, { date: fields.date, reference: fields.reference.trim(), note: fields.note.trim(),
      ...(action === 'query' ? { targetType: target.type, targetId: target.id } : action !== 'submitted' ? { value: fields.value } : {}) });
    if (!result || result.outcome === 'invalid') return setFeedback({ error: true, message: result?.error || 'The status could not be recorded. Check the details and try again.' });
    setFields(emptyForm()); clearFormBuffer(project.id, scope);
    if (action === 'query') { setQueryMode(false); clearFormBuffer(project.id, queryModeScope); }
    setErrors({});
    setFeedback({ message: action === 'query' ? 'Query recorded. Create a revised claim to respond.' : action === 'submitted' ? isRevision ? 'Resubmission recorded for this demo claim.' : 'Submission recorded for this demo claim.' : action === 'certified' ? 'Certification recorded. You can now record a payment.' : result.tracking?.status === 'paid' ? 'The full payment is recorded. This demo claim is paid.' : 'Partial payment recorded. Record the updated total when more is paid.' });
  }

  if (!tracking || !draft) return <div className="claim-status-view"><PageHeader title="Claim status" onBack={onBack} backLabel="Back to monthly claims" /><section className="claim-status-unavailable"><CircleAlert size={25} /><h2>Claim tracking unavailable</h2><p>Choose a prepared claim from the selected project.</p><Button onClick={onBack}>Open monthly claims</Button></section></div>;

  const formTitle = action === 'submitted' ? isRevision ? 'Record resubmission' : 'Record submission' : action === 'query' ? 'Record query' : action === 'certified' ? 'Record certification' : 'Record payment';
  const formHelp = action === 'submitted' ? isRevision ? 'Record a mock resubmission for this revised version. The original claim stays unchanged.' : 'Add a mock submission reference and date for this saved version.' : action === 'query' ? 'Record the question received for this submitted version. QS will respond in a separate claim revision.' : action === 'certified' ? 'Record the amount assessed by the certifier. The original claim amount stays unchanged.' : 'Enter the total paid to date, including earlier payments. The claim becomes Paid when it matches the certified amount.';
  const queryTarget = tracking.query ? choices.find((entry) => entry.type === tracking.query.targetType && entry.id === tracking.query.targetId)?.label || 'Saved claim item unavailable' : '';
  const dateName = action === 'submitted' ? isRevision ? 'Resubmission date' : 'Submission date' : action === 'query' ? 'Query date' : action === 'certified' ? 'Certification date' : 'Payment date';
  const referenceName = action === 'submitted' ? isRevision ? 'Resubmission reference' : 'Submission reference' : action === 'query' ? 'Query reference' : action === 'certified' ? 'Certificate reference' : 'Payment reference';
  return <div className="claim-status-view">
    <PageHeader title="Claim status" description={`${periodLabel(draft.period)} · Version ${draft.revision}`} onBack={onBack} backLabel="Back to monthly claims" actions={onPreview && <Button icon={FileText} onClick={() => onPreview(draft.id)}>Preview saved claim</Button>} />
    <p className="claim-status-demo">Mock tracking · Saved in this browser. No real submission or payment.</p>
    {isRevision && <section className="claim-status-revision" aria-label="Response to original query"><div><strong>Revises version {sourceDraft.revision}{sourceQuery?.reference ? ` · ${sourceQuery.reference}` : ''}</strong><p>{draft.revisionResponse || 'Response not recorded.'}</p></div>{onOpenRevision && <Button onClick={() => onOpenRevision(sourceDraft.id)}>View original query</Button>}</section>}
    <section className="claim-status-summary" aria-label="Claim status summary">
      <div className="claim-status-reference"><div><span>Claim reference</span><strong>{draft.id}</strong></div><Badge tone={tracking.status === 'paid' || resubmitted ? 'green' : tracking.status === 'queried' ? 'amber' : 'blue'}>{resubmitted ? 'Revised' : labels[tracking.status]}</Badge></div>
      <ol className="claim-status-timeline" aria-label="Claim stages">{stages.map((stage, index) => <li key={stage} className={`${index < currentStage ? 'complete' : index === currentStage ? 'current' : ''}${stage === 'submitted' && tracking.status === 'queried' ? ' has-query' : ''}`} aria-current={index === currentStage ? 'step' : undefined}><i aria-hidden="true">{index < currentStage || stage === 'paid' && tracking.status === 'paid' ? <Check size={15} /> : index + 1}</i><div><strong>{labels[stage]}</strong><span>{index <= currentStage ? dateLabel(tracking[stageDates[stage]]) : 'Not yet'}</span>{stage === 'submitted' && tracking.status === 'queried' && <span className="claim-status-query-stage">Query recorded</span>}</div></li>)}</ol>
      <dl className="claim-status-amounts"><div><dt>Claimed this month</dt><dd>{tracking.currency} {amount(tracking.claimedValue)}</dd></div><div><dt>Certified amount</dt><dd>{known(tracking.certifiedValue) ? `${tracking.currency} ${amount(tracking.certifiedValue)}` : 'Not recorded'}</dd></div><div><dt>Total paid to date</dt><dd>{known(tracking.paidValue) ? `${tracking.currency} ${amount(tracking.paidValue)}` : 'Not recorded'}</dd></div></dl>
    </section>
    {feedback && <div ref={feedbackRef} tabIndex={-1} className={`claim-status-feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.error ? <CircleAlert size={17} /> : <Check size={17} />}<span>{feedback.message}</span></div>}
    {tracking.status === 'queried' ? <section className="claim-status-query" aria-label="Recorded claim query"><header><MessageSquare size={19} /><div><h2>{resubmitted ? `Query addressed in version ${revision.revision}` : 'Query needs a revision'}</h2><p>{tracking.query?.reference} · {dateLabel(tracking.query?.date)}</p></div></header><dl><dt>Related work</dt><dd>{queryTarget}</dd><dt>Query remarks</dt><dd>{tracking.query?.note}</dd></dl>
      {revision && <div className="claim-status-linked-revision"><strong>Version {revision.revision} · {revisedTracking ? labels[revisedTracking.status] : 'Draft'}</strong><span>{revision.snapshot?.currency || tracking.currency} {amount(revision.snapshot?.totals?.currentValue)}</span>{revision.revisionResponse && <p><b>QS response</b>{revision.revisionResponse}</p>}</div>}
      {revisionContext?.error && revision?.status !== 'prepared' && <p className="claim-status-query-help">{revisionContext.error}</p>}
      <p className="claim-status-query-help">{resubmitted ? 'This is the original query and submitted assessment. Follow the revised version for the current status.' : 'Review the queried item and save a separate version with your response. The original assessment stays unchanged.'}</p>
      <FormActions>{revision?.status === 'prepared' && onOpenRevision ? <Button className="primary" icon={ArrowRight} onClick={() => onOpenRevision(revision.id)}>Open revised claim</Button> : revisionContext?.canRevise && onRevise ? <Button className="primary" icon={ArrowRight} onClick={() => onRevise(draft.id)}>{revision ? 'Continue revision' : 'Revise claim'}</Button> : revision && onPreview ? <Button onClick={() => onPreview(revision.id)}>Preview revised draft</Button> : null}</FormActions>
    </section> : superseded ? <section className="claim-status-next"><h2>A newer version is available</h2><p>Prepare the latest saved version before recording its submission. This earlier version remains available to preview.</p><Button onClick={onBack}>Back to monthly claims</Button></section> : action ? <form className="claim-status-next" noValidate onSubmit={record}>
      <header><div><h2>{formTitle}</h2><p>{formHelp}</p></div><div className="claim-status-form-tools">{tracking.status === 'submitted' && <Button onClick={() => toggleQuery(!queryMode)}>{queryMode ? 'Back to certification' : 'Record a query'}</Button>}<Button onClick={fillDemoDetails}>Use demo details</Button></div></header>
      <div className="claim-status-fields"><FormField label={dateName} required error={errors.date}><Input type="date" value={fields.date} onChange={(event) => update('date', event.target.value)} /></FormField><FormField label={referenceName} required error={errors.reference} hint="Use a demo reference for the showcase."><Input value={fields.reference} onChange={(event) => update('reference', event.target.value)} placeholder={`e.g. DEMO-${action === 'submitted' ? isRevision ? 'RESUB' : 'SUB' : action === 'query' ? 'QUERY' : action === 'certified' ? 'CERT' : 'PAY'}-001`} /></FormField>{action === 'query' && <FormField className="claim-status-note" label="Related work" required error={errors.target} hint="Only work included in this saved claim can be queried."><NativeSelect value={fields.target || 'claim:'} onChange={(event) => update('target', event.target.value)}>{choices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</NativeSelect></FormField>}{['certified', 'payment'].includes(action) && <FormField label={action === 'certified' ? 'Certified amount' : 'Total paid to date'} required suffix={tracking.currency} error={errors.value} hint={action === 'certified' ? 'Enter the recorded amount, including zero if applicable.' : known(tracking.paidValue) ? `Already recorded: ${tracking.currency} ${amount(tracking.paidValue)}. Enter the new total, not this payment alone.` : 'Enter the full total received so far.'}><Input type="number" step="0.01" inputMode="decimal" value={fields.value} onChange={(event) => update('value', event.target.value)} placeholder="Enter amount" /></FormField>}<FormField className="claim-status-note" label={action === 'query' ? 'Query remarks' : 'Remarks'} required={changedAmount || action === 'query'} optional={!changedAmount && action !== 'query'} error={errors.note} hint={changedAmount ? 'Explain the difference from the claimed amount.' : undefined}><Textarea rows={3} value={fields.note} onChange={(event) => update('note', event.target.value)} placeholder={action === 'query' ? 'Describe what the QS needs to clarify or revise…' : 'Add any follow-up or explanation…'} /></FormField></div>
      {hasEdits && <p className="claim-status-buffer-note">Your unfinished edits stay while you browse. Save before refreshing.</p>}
      <FormActions secondary={<BackButton onClick={onBack}>Back to monthly claims</BackButton>}><Button type="submit" className="primary" icon={Save}>{formTitle}</Button></FormActions>
    </form> : <section className="claim-status-complete"><CheckCheck size={24} /><div><h2>Payment fully recorded</h2><p>This demo claim has reached Paid. You can review the saved claim and its tracking history.</p></div></section>}
    {!!tracking.history?.length && <details className="claim-status-history"><summary><History size={15} />Tracking history <span>{tracking.history.length}</span></summary><ol>{[...tracking.history].reverse().map((event, index) => <li key={event.id || `${event.stage || event.action}-${index}`}><div><strong>{event.stage === 'query' ? 'Query recorded' : event.stage === 'submitted' && isRevision ? 'Resubmitted' : labels[event.stage || event.action] || (event.stage === 'payment' || event.action === 'payment' ? 'Payment recorded' : 'Status recorded')}</strong><time>{dateLabel(event.date)}</time></div>{event.reference && <span>{event.reference}</span>}{known(event.value) && <p>{tracking.currency} {amount(event.value)}</p>}{event.note && <p>{event.note}</p>}</li>)}</ol></details>}
  </div>;
}
