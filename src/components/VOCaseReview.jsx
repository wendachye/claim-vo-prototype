import { useRef, useState, useEffect } from 'react';
import { ArrowRight, CheckCheck, ChevronDown, CircleAlert, ImageOff, RotateCcw, Save, ZoomIn } from 'lucide-react';
import { VO_STATUS_LABELS, VO_SCOPE_LABELS, VO_INSTRUCTION_LABELS, VO_EXECUTION_LABELS, VO_ELIGIBILITY_LABELS, getVOClaimEligibility } from '../data/vo.js';
import { clearFormBuffer } from '../data/form-buffer.js';
import { useBufferedState } from './useFormBuffer.js';
import { BackButton, Badge, Button, FormActions, FormField, formatMoney, formatTime } from './ui.jsx';
import './vo-case-review.css';

const tone = (status) => status === 'approved' ? 'green' : status === 'pendingApproval' ? 'blue' : status === 'rejected' ? 'slate' : 'amber';
const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Date not recorded';
const amountLabel = (value, currency) => value == null || value === '' ? 'Unknown' : `${currency} ${formatMoney(value)}`;
const actionLabel = (action) => ({ save: 'QS review saved', clarify: 'Marked needs information', submit: 'Marked awaiting price approval', approve: 'Price approval recorded', assessEligibility: 'Claim eligibility recorded', reject: 'Review closed', reopen: 'Review reopened' }[action] || action);
const fieldsFor = (entry) => ({ title: entry.title || '', relatedItemId: entry.relatedItemId || '', scopeAssessment: entry.scopeAssessment || '', scopeDisposition: entry.scopeDisposition || 'unassessed', instructionStatus: entry.instructionStatus || 'notRecorded', instructionReference: entry.instructionReference || '', proposedValue: entry.proposedValue ?? '', approvedValue: entry.approvedValue ?? entry.proposedValue ?? '', approvalReference: entry.approvalReference || '', approver: entry.approver || '', executionStatus: entry.executionStatus || 'notVerified', executionReference: entry.executionReference || '', claimEligibility: entry.claimEligibility || 'needsReview', eligibilityNote: entry.eligibilityNote || '', reviewNote: '' });
const closureDispositions = ['existingScope', 'rectification', 'duplicate'];

function EvidencePhoto({ report, onOpen }) {
  const [failed, setFailed] = useState(false);
  const src = typeof report.photo === 'string' ? report.photo : report.photo?.url;
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <button type="button" className="vo-evidence-photo" aria-label="Enlarge VO evidence photo" onClick={() => onOpen?.({ src, alt: report.photoAlt })}><img src={src} alt={report.photoAlt || 'Demo photo attached to the original site update'} onError={() => setFailed(true)} loading="lazy" /><span className="vo-photo-label">{['whatsapp-mock', 'manual-vo-mock'].includes(report.channel) ? 'Generated demo photo' : 'Demo attachment'}</span><span className="vo-photo-open"><ZoomIn size={13} />View photo</span></button> : <div className="vo-no-photo"><ImageOff size={22} /><div><strong>{failed ? 'Photo unavailable' : 'No photo attached'}</strong><p>{report.channel === 'manual-vo-mock' ? 'The original entry is retained. Check the evidence before deciding.' : 'The original message is retained. Check the evidence before deciding.'}</p></div></div>;
}

function CheckSection({ number, title, status, children }) {
  return <section className="vo-check-section" aria-label={title}><header><h3><span aria-hidden="true">{number}</span>{title}</h3><span className="vo-check-state">{status}</span></header>{children}</section>;
}

export function VOCaseReview({ entry, project, currency, onAction, onPhoto, onOpenContract, onOpenClaims, onBack, backLabel, headingRef }) {
  const formRef = useRef(null);
  const formScope = `vo:${JSON.stringify([entry.id, entry.status, entry.history.length])}`;
  const [buffer, setFields] = useBufferedState(project.id, formScope, () => fieldsFor(entry));
  const fields = { ...fieldsFor(entry), ...buffer };
  const hasEdits = JSON.stringify(fields) !== JSON.stringify(fieldsFor(entry));
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [saved, setSaved] = useState('');
  const [editingChecks, setEditingChecks] = useState(() => !getVOClaimEligibility(entry).eligible);
  const editable = ['flagged', 'clarification'].includes(entry.status);
  const approved = entry.status === 'approved';
  const rejected = entry.status === 'rejected';
  const pendingApproval = entry.status === 'pendingApproval';
  const checkEdits = Object.keys(fields).some(key => key !== 'reviewNote' && fields[key] !== fieldsFor(entry)[key]);
  const editingEligibility = approved && (editingChecks || checkEdits);
  const canReviewChecks = editable || editingEligibility;
  const closingScope = closureDispositions.includes(fields.scopeDisposition);
  const report = entry.report;
  const manual = report.channel === 'manual-vo-mock';
  const contractItem = project.items.find(item => item.id === fields.relatedItemId);
  const eligibility = getVOClaimEligibility(entry);
  const sourceChecksChanged = ['scopeDisposition', 'scopeAssessment', 'instructionStatus', 'instructionReference'].some(key => fields[key] !== fieldsFor(entry)[key]);
  const setField = (name, value) => { setFields(prior => ({ ...fieldsFor(entry), ...prior, [name]: value })); setError(''); setErrorField(''); setSaved(''); };
  function problem(message, name) {
    setError(message); setErrorField(name || '');
    const control = formRef.current?.querySelector(`[name="${name}"]`);
    let parent = control?.closest('details');
    while (parent) { parent.open = true; parent = parent.parentElement?.closest('details'); }
    control?.focus();
  }
  function act(action) {
    const values = { ...fields };
    if (action === 'reject' && closingScope && !values.reviewNote.trim()) values.reviewNote = fields.scopeAssessment.trim();
    if (['clarify', 'reject', 'reopen'].includes(action) && !values.reviewNote.trim()) return problem('Add a note explaining this decision.', 'reviewNote');
    if (action === 'submit') {
      if (!fields.title.trim()) return problem('Describe the work.', 'title');
      if (fields.scopeDisposition !== 'variation') return problem('Confirm a possible variation before requesting price approval. Close existing scope or request information instead.', 'scopeDisposition');
      if (!fields.scopeAssessment.trim()) return problem('Explain how the work differs from the contract.', 'scopeAssessment');
      if (!fields.instructionReference.trim()) return problem('Record the instruction source or reference.', 'instructionReference');
      if (fields.instructionStatus === 'notRecorded') return problem('Record whether the instruction is reported, documented or disputed.', 'instructionStatus');
    }
    if (action === 'approve') {
      if (fields.approvedValue === '' || !Number.isFinite(Number(fields.approvedValue)) || Number(fields.approvedValue) < 0) return problem('Enter a non-negative approved value. Zero is valid.', 'approvedValue');
      if (!fields.approvalReference.trim()) return problem('Enter the price approval reference.', 'approvalReference');
      if (!fields.approver.trim()) return problem('Record who approved the price.', 'approver');
    }
    if (action === 'assessEligibility') {
      if (sourceChecksChanged && !values.reviewNote.trim()) return problem('Explain the scope or instruction update without changing the recorded price approval.', 'reviewNote');
      if (fields.claimEligibility === 'eligible') {
        if (fields.scopeDisposition !== 'variation') return problem('Confirm the variation scope before making it eligible.', 'scopeDisposition');
        if (!fields.scopeAssessment.trim()) return problem('Record the scope assessment.', 'scopeAssessment');
        if (fields.instructionStatus !== 'documented') return problem('Document the instruction before making this work eligible.', 'instructionStatus');
        if (!fields.instructionReference.trim()) return problem('Add the documented instruction reference.', 'instructionReference');
        if (fields.executionStatus !== 'verified') return problem('Record verification of the extra work first.', 'executionStatus');
        if (!fields.executionReference.trim()) return problem('Add the verification or measurement reference for this extra work.', 'executionReference');
      }
      if (['eligible', 'excluded'].includes(fields.claimEligibility) && !fields.eligibilityNote.trim()) return problem('Explain the claim eligibility decision.', 'eligibilityNote');
      if (!values.reviewNote.trim()) delete values.reviewNote;
    }
    const result = onAction?.(entry.id, action, values);
    if (result?.outcome === 'invalid') return problem(result.error || 'Check the review details and try again.');
    if (result?.outcome === 'unchanged') { setFields(fieldsFor(entry)); clearFormBuffer(project.id, formScope); setSaved('No changes to save.'); if (action === 'assessEligibility' && eligibility.eligible) setEditingChecks(false); }
    else if (result?.outcome === 'updated') clearFormBuffer(project.id, formScope);
  }
  const inputProps = name => ({ name, value: fields[name], onChange: event => setField(name, event.target.value), 'aria-invalid': errorField === name });
  const fieldError = name => errorField === name ? error : undefined;
  const history = [...entry.history].reverse();
  const scopeStatus = VO_SCOPE_LABELS[entry.scopeDisposition || 'unassessed'];
  const claimStatus = rejected ? 'Excluded' : approved ? eligibility.eligible ? 'Eligible for assessment' : entry.claimEligibility === 'excluded' ? 'Excluded' : 'Checks needed' : 'Price approval needed';

  return <section className="vo-detail vo-case-review" aria-labelledby="vo-detail-heading">
    <div className="vo-panel-back vo-back-register"><BackButton onClick={onBack}>{backLabel || 'Back to extra work'}</BackButton></div>
    <header className="vo-panel-header"><div><span className="vo-reference">{entry.reference}</span><h2 id="vo-detail-heading" ref={headingRef} tabIndex={-1}>{entry.title || 'Flagged extra work'}</h2></div><Badge tone={tone(entry.status)}>{approved ? 'Price approved' : VO_STATUS_LABELS[entry.status]}</Badge></header>
    <div className="vo-detail-body">
      <details className="vo-evidence-details"><summary><span><strong>{manual ? 'Manual entry & photo' : 'Original message & photo'}</strong><small>{report.sender || 'Sender not recorded'} · {dateLabel(report.date)}</small></span><ChevronDown size={16} aria-hidden="true" /></summary><div><blockquote className="vo-source-message">{report.message || 'No source message attached.'}</blockquote><p className="vo-source-location">{[report.location, report.area].filter(Boolean).join(' · ')}</p><EvidencePhoto report={report} onOpen={onPhoto}/><details className="vo-source-details"><summary>Source details</summary><p>Report: {report.id}{report.sourceMessageId && <><br/>Message: {report.sourceMessageId}</>}<br/>{manual ? 'Manual extra-work entry · local demo' : report.channel === 'whatsapp-mock' ? 'Simulated WhatsApp message' : 'Demo site report'}{manual && report.reportedInstructionReference && <><br/>Reported instruction/reference: {report.reportedInstructionReference}</>}</p></details>{report.reviewReason && <p className="vo-legacy-note"><strong>Earlier review note:</strong> {report.reviewReason}</p>}</div></details>
      <form ref={formRef} onSubmit={event => event.preventDefault()} className="vo-checks-form">
        {hasEdits && <p className="vo-unsaved" role="status">Unsaved changes · Save before refreshing.</p>}
        <CheckSection number="1" title="Contract scope" status={scopeStatus}>
          <div className="vo-scope-comparison"><div><span>Contract comparison · Version {project.version || 1}</span>{contractItem ? <><strong>{contractItem.ref} · {contractItem.description}</strong><p>{contractItem.subsection || contractItem.section}{contractItem.sourcePage ? ` · Source page ${contractItem.sourcePage}` : ''}</p><p>{contractItem.sourceNote || 'Compare the listed scope with the reported extra work.'}</p></> : <p>No contract item selected. The message and area alone do not establish a scope match.</p>}</div><Button className="ghost" onClick={() => onOpenContract?.(fields.relatedItemId, entry.id)}>Check contract<ArrowRight size={13}/></Button></div>
          {editable && <details className="vo-work-details"><summary>Work description & contract link</summary><div><FormField label="Work description" required error={fieldError('title')}><input {...inputProps('title')}/></FormField><FormField label="Contract item for comparison" optional hint="A comparison link does not confirm a variation." error={fieldError('relatedItemId')}><select {...inputProps('relatedItemId')}><option value="">Unmatched / outside listed items</option>{project.items.map(item => <option value={item.id} key={item.id}>{item.ref} · {item.description}</option>)}</select></FormField></div></details>}
          {canReviewChecks ? <div className="vo-check-fields"><FormField label="Scope decision" required error={fieldError('scopeDisposition')}><select {...inputProps('scopeDisposition')}>{Object.entries(VO_SCOPE_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></FormField><FormField label="QS scope assessment" required error={fieldError('scopeAssessment')}><textarea {...inputProps('scopeAssessment')} rows={2} placeholder="What changed, or why is this already included?"/></FormField></div> : <p className="vo-saved-check">{entry.scopeAssessment || 'No QS scope assessment recorded.'}</p>}
        </CheckSection>
        <CheckSection number="2" title="Instruction" status={VO_INSTRUCTION_LABELS[entry.instructionStatus || 'notRecorded']}>
          {canReviewChecks ? <div className="vo-check-fields"><FormField label="Instruction evidence" error={fieldError('instructionStatus')}><select {...inputProps('instructionStatus')}>{Object.entries(VO_INSTRUCTION_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></FormField><FormField label="Instruction or drawing reference" optional={fields.instructionStatus !== 'documented'} required={fields.instructionStatus === 'documented'} error={fieldError('instructionReference')}><input {...inputProps('instructionReference')} placeholder="Site instruction, drawing revision or reported source"/></FormField></div> : <p className="vo-saved-check">{entry.instructionReference || 'No instruction reference recorded.'}</p>}<p className="vo-check-hint">A worker’s report is not a documented instruction. Record the evidence separately.</p>
        </CheckSection>
        <CheckSection number="3" title="Price approval" status={approved ? 'Recorded' : pendingApproval ? 'Awaiting approval' : rejected ? 'Closed' : 'Not approved'}>
          {editable ? <FormField label="Proposed value" suffix={currency} optional hint="Unknown stays blank. This is not an approved amount." error={fieldError('proposedValue')}><input {...inputProps('proposedValue')} type="number" min="0" step="0.01" inputMode="decimal" placeholder="Unknown"/></FormField> : approved ? <dl className="vo-price-summary"><div><dt>Approved value</dt><dd className="vo-price-amount">{amountLabel(entry.approvedValue,currency)}</dd></div><div><dt>Approval reference</dt><dd>{entry.approvalReference || 'Not recorded'}</dd></div><div><dt>Approved by</dt><dd>{entry.approver || 'Not recorded'}</dd></div></dl> : pendingApproval ? <><p className="vo-check-hint">Proposed value: {amountLabel(entry.proposedValue,currency)}</p><div className="vo-check-fields"><FormField label="Approved value" suffix={currency} required error={fieldError('approvedValue')}><input {...inputProps('approvedValue')} type="number" min="0" step="0.01" inputMode="decimal" placeholder="Enter approved value"/></FormField><FormField label="Approval reference" required error={fieldError('approvalReference')}><input {...inputProps('approvalReference')}/></FormField><FormField label="Approved by" required error={fieldError('approver')}><input {...inputProps('approver')}/></FormField></div></> : <p className="vo-check-hint">No current price approval. Proposed value: {amountLabel(entry.proposedValue,currency)}</p>}
          <p className="vo-check-hint">Price approval does not verify the work or include it in a claim.</p>
        </CheckSection>
        <CheckSection number="4" title="Claim eligibility" status={claimStatus}>
          {approved ? <>{editingEligibility ? <div className="vo-check-fields"><FormField label="Extra-work verification" error={fieldError('executionStatus')}><select {...inputProps('executionStatus')}>{Object.entries(VO_EXECUTION_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></FormField><FormField label="Verification reference" required={fields.executionStatus === 'verified'} error={fieldError('executionReference')}><input {...inputProps('executionReference')} placeholder="Inspection, measurement or verified VO work record"/></FormField><FormField label="Claim decision" error={fieldError('claimEligibility')}><select {...inputProps('claimEligibility')}>{Object.entries(VO_ELIGIBILITY_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></FormField><FormField label="Eligibility note" required={fields.claimEligibility !== 'needsReview'} error={fieldError('eligibilityNote')}><textarea {...inputProps('eligibilityNote')} rows={2} placeholder="What work can be assessed, or why is it excluded?"/></FormField></div> : <><p className="vo-saved-check">Verified work · {entry.executionReference}</p><p className="vo-saved-check">{entry.eligibilityNote}</p><Button className="ghost" onClick={() => setEditingChecks(true)}>Edit claim checks</Button></>}<p className="vo-check-hint">The QS still selects the claim month, quantity/value and previous amounts in Monthly claims. A related contract item’s completion does not verify this extra work.</p>{!eligibility.eligible && entry.claimEligibility !== 'excluded' && <details className="vo-eligibility-issues"><summary>Saved checks remaining ({eligibility.issues.length})</summary><ul>{eligibility.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}{entry.eligibilityReviewedAt && <p className="vo-check-hint">Last recorded {dateLabel(entry.eligibilityReviewedAt)}. Saved claim versions keep their original assessment.</p>}</> : <p className="vo-check-hint">{rejected ? 'This review is closed and excluded from new claims.' : 'Excluded until scope, instruction, price approval and verified work are checked. Record price approval first, then assess eligibility.'}</p>}
        </CheckSection>
        {(!rejected && (!approved || editingEligibility)) && <FormField className="vo-review-note" label="Review note" hint={approved ? 'Required if you update the approved scope or instruction.' : 'Required when requesting information or rejecting.'} error={fieldError('reviewNote')}><textarea {...inputProps('reviewNote')} rows={2} placeholder="Reason, missing information or next action…"/></FormField>}
        {error && !errorField && <p className="vo-form-error" role="alert"><CircleAlert size={14}/>{error}</p>}{saved && <p className="vo-check-hint" role="status">{saved}</p>}
        {!approved && !rejected ? <><FormActions className="vo-action-row" secondary={editable && <Button className="ghost" icon={Save} onClick={() => act('save')}>Save draft</Button>}>{editable ? <Button className="primary" icon={ArrowRight} onClick={() => act(closingScope ? 'reject' : fields.scopeDisposition === 'clarification' ? 'clarify' : 'submit')}>{closingScope ? 'Close review' : fields.scopeDisposition === 'clarification' ? 'Need information' : 'Ready for approval'}</Button> : <Button className="primary" icon={CheckCheck} onClick={() => act('approve')}>Record approval</Button>}</FormActions><div className="vo-secondary-actions">{fields.scopeDisposition !== 'clarification' && <Button className="ghost" onClick={() => act('clarify')}>Need information</Button>}{!closingScope && <Button className="ghost vo-reject-action" onClick={() => act('reject')}>Reject</Button>}<span>Local demo · no message is sent.</span></div></> : approved ? <FormActions className="vo-action-row" secondary={<span className="vo-check-hint">Explicit save · no claim is submitted.</span>}>{editingEligibility && <Button className={eligibility.eligible && !hasEdits ? '' : 'primary'} icon={Save} onClick={() => act('assessEligibility')}>Save claim checks</Button>}{eligibility.eligible && <Button className="primary" icon={ArrowRight} disabled={hasEdits} onClick={() => onOpenClaims?.(entry.id)}>Review in monthly claim</Button>}</FormActions> : null}
        {(approved || rejected) && <details className="vo-reopen"><summary>Reopen this decision</summary><p className="vo-check-hint">Reopening clears the current price approval and claim eligibility. Earlier decisions remain in history.</p>{rejected || !editingEligibility ? <FormField label="Reason to reopen" required error={fieldError('reviewNote')}><textarea {...inputProps('reviewNote')} rows={2}/></FormField> : <p className="vo-check-hint">Add the reason in Review note above, then reopen.</p>}<FormActions><Button icon={RotateCcw} onClick={() => act('reopen')}>Reopen review</Button></FormActions></details>}
      </form>
      <details className="vo-history"><summary>Review history <span>{history.length} {history.length === 1 ? 'action' : 'actions'}</span></summary><ol>{history.map((event,index) => <li key={event.id || `${event.date}-${index}`}><i className={`vo-history-dot ${event.to === 'approved' ? 'approved' : ''}`}/><div><div className="vo-history-heading"><strong>{actionLabel(event.action)}</strong></div>{event.values?.reviewNote && <p>{event.values.reviewNote}</p>}{event.action === 'approve' && <p>{amountLabel(event.values?.approvedValue,currency)} · {event.values?.approver} · {event.values?.approvalReference}</p>}{event.action === 'assessEligibility' && <p>{VO_ELIGIBILITY_LABELS[event.values?.claimEligibility] || 'Checks recorded'} · {event.values?.eligibilityNote}</p>}<small>{dateLabel(event.date)} · {event.actor || 'Demo QS reviewer'}</small></div></li>)}<li><i className="vo-history-dot"/><div><strong>{manual ? 'Extra work added manually' : 'Extra work flagged'}</strong><p>{manual ? 'Original entry and optional photo retained.' : 'Original message and photo retained.'}</p><small>{dateLabel(report.date)} · {report.sender || 'Demo site report'}</small></div></li></ol></details>
    </div>
  </section>;
}

export { tone as voTone, dateLabel as voDateLabel, amountLabel as voAmountLabel };
