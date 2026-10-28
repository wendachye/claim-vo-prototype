import type { Project, VOCase, SiteReport } from '../types/domain';
import { useRef, useState, useEffect, type ReactNode, type RefObject } from 'react';
import { ArrowRight, CheckCheck, ChevronDown, CircleAlert, ImageOff, Link2, RotateCcw, Save, ZoomIn } from 'lucide-react';
import { VO_STATUS_LABELS, VO_SCOPE_LABELS, VO_INSTRUCTION_LABELS, VO_EXECUTION_LABELS, VO_ELIGIBILITY_LABELS, getVOClaimEligibility, getVOEvidenceLink, getVORelatedEvidence } from '../data/vo';
import { clearFormBuffer } from '../data/form-buffer';
import { useBufferedState } from './useFormBuffer';
import { BackButton, Badge, Button, FormActions, FormField, SelectField, formatMoney, formatTime } from './ui';
import './vo-case-review.css';
import { VOConfirmationPanel, type VOConfirmationPanelProps } from './VOConfirmationPanel';
import { getVOConfirmationApprovalValues } from '../data/vo-confirmation';
import { ActionMenu } from './ActionMenu';
import { VOLinkForm } from './VOLinkForm';

const tone = (status: string) => status === 'approved' ? 'green' : status === 'pendingApproval' ? 'blue' : ['rejected', 'linked'].includes(status) ? 'slate' : 'amber';
const dateLabel = (value?: string | null) => value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Date not recorded';
const amountLabel = (value: string | number | null | undefined, currency: string) => value == null || value === '' ? 'Unknown' : `${currency} ${formatMoney(value)}`;
const actionLabel = (action: string) => ({ save: 'QS review saved', clarify: 'Marked needs information', submit: 'Marked awaiting price approval', approve: 'Price approval recorded', assessEligibility: 'Claim eligibility recorded', reject: 'Review closed', reopen: 'Review reopened' } as Record<string, string>)[action] || action;
const fieldsFor = (entry: VOCase) => ({ title: entry.title || '', relatedItemId: entry.relatedItemId || '', scopeAssessment: entry.scopeAssessment || '', scopeDisposition: entry.scopeDisposition || 'unassessed', instructionStatus: entry.instructionStatus || 'notRecorded', instructionReference: entry.instructionReference || '', proposedValue: entry.proposedValue ?? '', approvedValue: entry.approvedValue ?? entry.proposedValue ?? '', approvalReference: entry.approvalReference || '', approver: entry.approver || '', executionStatus: entry.executionStatus || 'notVerified', executionReference: entry.executionReference || '', claimEligibility: entry.claimEligibility || 'needsReview', eligibilityNote: entry.eligibilityNote || '', reviewNote: '' });
const closureDispositions = ['existingScope', 'rectification', 'duplicate'];

type VOFields = ReturnType<typeof fieldsFor>;
export type VOActionValues = Omit<VOFields, 'reviewNote'> & { reviewNote?: string };
export interface VOPhoto { src: string; alt?: string | null }
export interface VOActionResult { outcome: string; error?: string }
export interface VOCaseReviewProps { entry: VOCase; project: Project; currency: string; onAction?: (caseId: string, action: string, values: VOActionValues) => VOActionResult | undefined; onLink?: (sourceId: string, targetId: string, reason: string) => VOActionResult | undefined; onOpenRelatedCase?: (caseId: string) => void; onPhoto?: (photo: VOPhoto) => void; onOpenContract?: (itemId: string, caseId: string) => void; onOpenClaims?: (caseId: string) => void; onBack?: () => void; backLabel?: string; headingRef?: RefObject<HTMLHeadingElement | null>; onCreateConfirmation?: VOConfirmationPanelProps['onCreate']; onConfirmationReply?: VOConfirmationPanelProps['onReply'] }
const labelFor = (labels: Readonly<Record<string, string>>, key?: string) => key ? labels[key] : undefined;

function EvidencePhoto({ report, onOpen }: { report: SiteReport; onOpen?: (photo: VOPhoto) => void }) {
  const [failed, setFailed] = useState(false);
  const src = typeof report.photo === 'string' ? report.photo : report.photo?.url;
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <button type="button" className="vo-evidence-photo" aria-label="Enlarge VO evidence photo" onClick={() => onOpen?.({ src, alt: report.photoAlt })}><img src={src} alt={report.photoAlt || 'Demo photo attached to the original site update'} onError={() => setFailed(true)} loading="lazy" /><span className="vo-photo-label">{['whatsapp-mock', 'manual-vo-mock'].includes(report.channel || '') ? 'Generated demo photo' : 'Demo attachment'}</span><span className="vo-photo-open"><ZoomIn size={13} />View photo</span></button> : <div className="vo-no-photo"><ImageOff size={16} /><strong>{failed ? 'Photo unavailable' : 'No photo attached'}</strong></div>;
}

function CheckSection({ title, status, children, collapsible = false, open = false, summaryValue }: { title: string; status?: ReactNode; children?: ReactNode; collapsible?: boolean; open?: boolean; summaryValue?: string }) {
  if (collapsible) return <section className={`vo-check-section vo-stage-section${open ? ' vo-current-review' : ''}`} aria-label={title}>
    <details className="vo-stage-details" open={open || undefined}>
      <summary><h3 className="form-section-heading">{title}</h3><span className="vo-stage-status"><span className="vo-check-state">{status}</span>{summaryValue && <strong>{summaryValue}</strong>}</span><ChevronDown size={16} aria-hidden="true"/></summary>
      <div className="vo-stage-content">{children}</div>
    </details>
  </section>;
  return <section className="vo-check-section" aria-label={title}><header><h3>{title}</h3><span className="vo-check-state">{status}</span></header>{children}</section>;
}

export function VOCaseReview({ entry, project, currency, onAction, onLink, onOpenRelatedCase, onPhoto, onOpenContract, onOpenClaims, onBack, backLabel, headingRef, onCreateConfirmation, onConfirmationReply }: VOCaseReviewProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const formScope = `vo:${JSON.stringify([entry.id, entry.status, entry.history.length])}`;
  const [buffer, setFields] = useBufferedState(project.id, formScope, () => fieldsFor(entry));
  const fields = { ...fieldsFor(entry), ...buffer };
  const hasEdits = JSON.stringify(fields) !== JSON.stringify(fieldsFor(entry));
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [saved, setSaved] = useState('');
  const [editingChecks, setEditingChecks] = useState(() => !getVOClaimEligibility(entry).eligible && entry.claimEligibility !== 'excluded');
  const actionScope = `${formScope}:action`;
  const [reviewAction, setReviewAction] = useBufferedState<'clarify' | 'reject' | 'reopen' | null>(project.id, actionScope, null);
  const [noteRequested, setNoteRequested] = useState(false);
  const [linkOpen, setLinkOpen] = useBufferedState(project.id, `vo-link-open:${entry.id}`, false);
  const restoreActionsFocus = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const editable = ['flagged', 'clarification'].includes(entry.status);
  const approved = entry.status === 'approved';
  const rejected = entry.status === 'rejected';
  const pendingApproval = entry.status === 'pendingApproval';
  const checkEdits = (Object.keys(fields) as (keyof VOFields)[]).some(key => key !== 'reviewNote' && fields[key] !== fieldsFor(entry)[key]);
  const editingEligibility = approved && (editingChecks || checkEdits);
  const canReviewChecks = editable || editingEligibility;
  const closingScope = closureDispositions.includes(fields.scopeDisposition);
  const report = entry.report;
  const linked = getVOEvidenceLink(project, entry.id);
  const readOnlyLinked = entry.status === 'linked';
  const showingLink = linkOpen && Boolean(onLink);
  const related = getVORelatedEvidence(project, entry.id);
  const manual = report.channel === 'manual-vo-mock';
  const contractItem = project.items.find(item => item.id === fields.relatedItemId);
  const eligibility = getVOClaimEligibility(entry);
  const sourceChecksChanged = (['scopeDisposition', 'scopeAssessment', 'instructionStatus', 'instructionReference'] as const).some(key => fields[key] !== fieldsFor(entry)[key]);
  const confirmationSourceEdits = (['title', 'relatedItemId', 'scopeAssessment', 'scopeDisposition', 'instructionStatus', 'instructionReference', 'proposedValue'] as const).some(key => String(fields[key] ?? '') !== String(fieldsFor(entry)[key] ?? ''));
  const hasApprovalEdits = (['approvedValue', 'approvalReference', 'approver'] as const).some(key => String(fields[key] ?? '') !== String(fieldsFor(entry)[key] ?? ''));
  const setField = (name: keyof VOFields, value: string) => { setFields(prior => ({ ...fieldsFor(entry), ...prior, [name]: value })); setError(''); setErrorField(''); setSaved(''); };
  function problem(message: string, name?: string) {
    setError(message); setErrorField(name || '');
    const control = formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`);
    let parent: HTMLDetailsElement | null | undefined = control?.closest('details');
    while (parent) { parent.open = true; parent = parent.parentElement?.closest('details'); }
    control?.focus();
  }
  useEffect(() => {
    if (reviewAction || noteRequested) noteRef.current?.focus();
  }, [reviewAction, noteRequested]);
  useEffect(() => {
    if (!showingLink && restoreActionsFocus.current) {
      restoreActionsFocus.current = false;
      formRef.current?.querySelector<HTMLButtonElement>('.action-menu-trigger')?.focus();
    }
  }, [showingLink]);
  useEffect(() => {
    if (!errorField) return;
    const control = formRef.current?.querySelector<HTMLElement>(`[name="${errorField}"]`);
    let parent = control?.closest('details');
    while (parent) { parent.open = true; parent = parent.parentElement?.closest('details'); }
    control?.focus();
  }, [error, errorField]);
  function chooseAction(action: 'clarify' | 'reject' | 'reopen') {
    setReviewAction(action); setError(''); setErrorField(''); setSaved('');
  }
  function chooseLink() {
    if (hasEdits || reviewAction) return problem('Save or finish your review changes before linking this VO.');
    setLinkOpen(true); setError(''); setErrorField(''); setSaved('');
  }
  function closeLink() {
    restoreActionsFocus.current = true; setLinkOpen(false);
  }
  function act(action: string) {
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

    }
    const { reviewNote, ...withoutNote } = values;
    const actionValues = action === 'assessEligibility' && !reviewNote.trim() ? withoutNote : values;
    const result = onAction?.(entry.id, action, actionValues);
    if (result?.outcome === 'invalid') return problem(result.error || 'Check the review details and try again.');
    if (result?.outcome === 'unchanged') { setFields(fieldsFor(entry)); clearFormBuffer(project.id, formScope); setReviewAction(null); clearFormBuffer(project.id, actionScope); setSaved('No changes to save.'); if (action === 'assessEligibility' && eligibility.eligible) setEditingChecks(false); }
    else if (result?.outcome === 'updated') { clearFormBuffer(project.id, formScope); setReviewAction(null); clearFormBuffer(project.id, actionScope); }
  }
  const inputProps = (name: keyof VOFields) => ({ name, value: fields[name], onChange: (event: { target: { value: string } }) => setField(name, event.target.value), 'aria-invalid': errorField === name });
  const fieldError = (name: keyof VOFields) => errorField === name ? error : undefined;
  const history = [...entry.history].reverse();
  const scopeStatus = labelFor(VO_SCOPE_LABELS, entry.scopeDisposition || 'unassessed');
  const claimStatus = rejected ? 'Excluded' : approved ? eligibility.eligible ? 'Eligible for assessment' : entry.claimEligibility === 'excluded' ? 'Excluded' : 'Checks needed' : 'Price approval needed';
  const showNote = Boolean(reviewAction || noteRequested || fields.reviewNote || sourceChecksChanged || errorField === 'reviewNote' || editable && fields.scopeDisposition === 'clarification');
  const noteRequired = Boolean(reviewAction || approved && sourceChecksChanged || editable && fields.scopeDisposition === 'clarification');
  const closedReason = history.find(event => event.action === 'reject')?.values?.reviewNote || entry.reviewNote || entry.scopeAssessment || 'No closing reason recorded.';
  const workStatus = rejected ? 'Previous assessment' : `${scopeStatus || 'Not reviewed'} · ${labelFor(VO_INSTRUCTION_LABELS, entry.instructionStatus || 'notRecorded')}`;
  const actionText = reviewAction === 'clarify' ? 'Need information' : reviewAction === 'reject' ? 'Reject' : 'Reopen review';


  function useConfirmationApproval(requestId: string) {
    if (!pendingApproval || hasApprovalEdits || confirmationSourceEdits) return;
    const values = getVOConfirmationApprovalValues(project, entry.id, requestId);
    if (!values) return problem('This reply does not approve the current quoted price. Review the latest customer request.');
    setFields(previous => ({ ...fieldsFor(entry), ...previous, ...values }));
    setError('');setErrorField('');setSaved('Reply copied into the approval form. Check the details, then Record approval.');
  }

  function resetApprovalFields() {
    const savedFields=fieldsFor(entry);
    setFields(previous => ({ ...fieldsFor(entry), ...previous, approvedValue:savedFields.approvedValue, approvalReference:savedFields.approvalReference, approver:savedFields.approver }));
    setError('');setErrorField('');setSaved('Approval fields reset. Your review note is retained.');
  }

  return <section className="vo-detail vo-case-review" aria-labelledby="vo-detail-heading">
    <div className="vo-panel-back vo-back-register"><BackButton onClick={onBack}>{backLabel || 'Back to extra work'}</BackButton></div>
    <header className="vo-panel-header"><div><span className="vo-reference">{entry.reference}</span><h2 id="vo-detail-heading" ref={headingRef} tabIndex={-1}>{entry.title || 'Flagged extra work'}</h2></div><Badge tone={tone(entry.status)}>{approved ? 'Price approved' : labelFor(VO_STATUS_LABELS, entry.status)}</Badge></header>
    <div className="vo-detail-body">
      <details className="vo-evidence-details" open><summary><span><strong>{manual ? 'Manual entry & photo' : 'Original evidence'}</strong><small>{report.sender || 'Sender not recorded'} · {dateLabel(report.date)}</small></span><ChevronDown size={16} aria-hidden="true" /></summary><div><blockquote className="vo-source-message">{report.message || 'No source message attached.'}</blockquote><p className="vo-source-location">{[report.location, report.area].filter(Boolean).join(' · ')}</p><EvidencePhoto report={report} onOpen={onPhoto}/><details className="vo-source-details"><summary>Source details</summary><p>Report: {report.id}{report.sourceMessageId && <><br/>Message: {report.sourceMessageId}</>}<br/>{manual ? 'Manual extra-work entry · local demo' : report.channel === 'whatsapp-mock' ? 'Simulated WhatsApp message' : 'Demo site report'}{manual && report.reportedInstructionReference && <><br/>Reported instruction/reference: {report.reportedInstructionReference}</>}</p></details>{report.reviewReason && <p className="vo-legacy-note"><strong>Earlier review note:</strong> {report.reviewReason}</p>}</div></details>
      {related.length > 0 && <details className="vo-related-evidence"><summary><strong>Related evidence</strong><span>{related.length} {related.length === 1 ? 'linked record' : 'linked records'}</span><ChevronDown size={15} aria-hidden="true"/></summary><div>{related.map(({ link, report: source }) => <article key={link.id} className="vo-related-record"><header><div><strong>{link.sourceReference}</strong><small>{source.sender || 'Sender not recorded'} · {dateLabel(source.date)}</small></div>{onOpenRelatedCase && <Button className="ghost" onClick={() => onOpenRelatedCase(link.sourceCaseId)}>Open record<ArrowRight size={13}/></Button>}</header><blockquote className="vo-source-message">{source.message || 'No source message attached.'}</blockquote><p className="vo-source-location">{[source.location, source.area].filter(Boolean).join(' · ')}</p><EvidencePhoto report={source} onOpen={onPhoto}/><p className="vo-link-reason"><strong>Reason for linking:</strong> {link.reason}</p><small className="vo-link-meta">Linked {dateLabel(link.linkedAt)} · {link.linkedBy}</small></article>)}</div></details>}
      {linked && <section className="vo-linked-summary" aria-label="Linked VO"><h3><Link2 size={15} aria-hidden="true"/>Linked to {linked.targetReference}</h3><p>{linked.reason}</p><small>Linked {dateLabel(linked.linkedAt)} · {linked.linkedBy}</small><p>This record is supporting evidence only. Its work is reviewed and priced in the linked VO.</p>{onOpenRelatedCase && <Button onClick={() => onOpenRelatedCase(linked.targetCaseId)}>Open {linked.targetReference}<ArrowRight size={14}/></Button>}</section>}
      {readOnlyLinked && !linked && <section className="vo-linked-summary" aria-label="Saved evidence link needs review"><h3>Saved evidence link needs review</h3><p>The original evidence is retained. A valid destination could not be confirmed, so this record cannot be reviewed or claimed separately.</p></section>}
      {!readOnlyLinked && showingLink && onLink && <VOLinkForm project={project} entry={entry} onSave={onLink} onClose={closeLink}/>}
      {!readOnlyLinked && !showingLink && <form ref={formRef} onSubmit={event => event.preventDefault()} className="vo-checks-form">
        {hasEdits && <p className="vo-unsaved" role="status">Unsaved changes · Save before refreshing.</p>}
        {rejected && <section className="vo-closed-summary" aria-label="Review closed"><header><h3>Review closed</h3><Badge>Excluded from new claims</Badge></header><p>{closedReason}</p></section>}
        <details className={`vo-work-review${editable ? ' vo-current-review' : ''}`} open={editable || undefined}>
          <summary><strong>Work review</strong><span>{workStatus}</span><ChevronDown size={15} aria-hidden="true"/></summary>
          <div>
        <CheckSection title="Contract scope" status={rejected ? 'Recorded assessment' : scopeStatus}>
          <div className="vo-scope-comparison"><div><span>Contract comparison · Version {project.version || 1}</span>{contractItem ? <><strong>{contractItem.ref} · {contractItem.description}</strong><p>{contractItem.subsection || contractItem.section}{contractItem.sourcePage ? ` · Source page ${contractItem.sourcePage}` : ''}</p><p>{contractItem.sourceNote || 'Compare the listed scope with the reported extra work.'}</p></> : <p>No contract item selected. The message and area alone do not establish a scope match.</p>}</div><Button className="ghost" onClick={() => onOpenContract?.(fields.relatedItemId, entry.id)}>Check contract<ArrowRight size={13}/></Button></div>
          {editable && <details className="vo-work-details"><summary>Work description & contract link</summary><div><FormField label="Work description" required error={fieldError('title')}><input {...inputProps('title')}/></FormField><FormField label="Contract item for comparison" optional hint="A comparison link does not confirm a variation." error={fieldError('relatedItemId')}><SelectField {...inputProps('relatedItemId')}><option value="">Unmatched / outside listed items</option>{project.items.map(item => <option value={item.id} key={item.id}>{item.ref} · {item.description}</option>)}</SelectField></FormField></div></details>}
          {canReviewChecks ? <div className="vo-check-fields"><FormField label="Scope decision" required error={fieldError('scopeDisposition')}><SelectField {...inputProps('scopeDisposition')}>{Object.entries(VO_SCOPE_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</SelectField></FormField><FormField label="QS scope assessment" required error={fieldError('scopeAssessment')}><textarea {...inputProps('scopeAssessment')} rows={2} placeholder="What changed, or why is this already included?"/></FormField></div> : <p className="vo-saved-check">{entry.scopeAssessment || 'No QS scope assessment recorded.'}</p>}
        </CheckSection>
        <CheckSection title="Instruction" status={labelFor(VO_INSTRUCTION_LABELS, entry.instructionStatus || 'notRecorded')}>
          {canReviewChecks ? <div className="vo-check-fields"><FormField label="Instruction evidence" error={fieldError('instructionStatus')}><SelectField {...inputProps('instructionStatus')}>{Object.entries(VO_INSTRUCTION_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</SelectField></FormField><FormField label="Instruction or drawing reference" optional={fields.instructionStatus !== 'documented'} required={fields.instructionStatus === 'documented'} error={fieldError('instructionReference')}><input {...inputProps('instructionReference')} placeholder="Site instruction, drawing revision or reported source"/></FormField></div> : <p className="vo-saved-check">{entry.instructionReference || 'No instruction reference recorded.'}</p>}<p className="vo-check-hint">A worker’s report is not a documented instruction.</p>
        </CheckSection>
          {editable && <FormField className="vo-proposed-value" label="Proposed value" suffix={currency} optional hint="Leave blank if unknown. This is not an approved price." error={fieldError('proposedValue')}><input {...inputProps('proposedValue')} type="number" min="0" step="0.01" inputMode="decimal" placeholder="Unknown"/></FormField>}
          </div>
        </details>
        {!rejected && <CheckSection title="Price approval" status={approved ? 'Recorded' : pendingApproval ? 'Awaiting approval' : 'Not approved'} collapsible open={pendingApproval} summaryValue={approved ? amountLabel(entry.approvedValue,currency) : undefined}>
          {approved ? <><details className="vo-approval-details"><summary>Approval details</summary><dl className="vo-price-summary"><div><dt>Approval reference</dt><dd>{entry.approvalReference || 'Not recorded'}</dd></div><div><dt>Approved by</dt><dd>{entry.approver || 'Not recorded'}</dd></div></dl></details></> : pendingApproval ? <><p className="vo-check-hint">Proposed value: {amountLabel(entry.proposedValue,currency)}</p><div className="vo-check-fields"><FormField label="Approved value" suffix={currency} required error={fieldError('approvedValue')}><input {...inputProps('approvedValue')} type="number" min="0" step="0.01" inputMode="decimal" placeholder="Enter approved value"/></FormField><FormField label="Approval reference" required error={fieldError('approvalReference')}><input {...inputProps('approvalReference')}/></FormField><FormField label="Approved by" required error={fieldError('approver')}><input {...inputProps('approver')}/></FormField></div></> : <p className="vo-check-hint">Record the scope and instruction before requesting price approval.</p>}
          {(onCreateConfirmation || onConfirmationReply) && <VOConfirmationPanel project={project} caseId={entry.id} hasUnsavedChanges={confirmationSourceEdits} hasApprovalEdits={hasApprovalEdits} onCreate={onCreateConfirmation} onReply={onConfirmationReply} onUseApproval={pendingApproval?useConfirmationApproval:undefined}/>}
          {pendingApproval && hasApprovalEdits && <Button className="ghost" icon={RotateCcw} onClick={resetApprovalFields}>Reset approval fields</Button>}
        </CheckSection>}
        {!rejected && <CheckSection title="Claim readiness" status={claimStatus} collapsible open={editingEligibility}>
          {approved ? <>{editingEligibility ? <div className="vo-check-fields"><FormField label="Extra-work verification" error={fieldError('executionStatus')}><SelectField {...inputProps('executionStatus')}>{Object.entries(VO_EXECUTION_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</SelectField></FormField><FormField label="Verification reference" required={fields.executionStatus === 'verified'} error={fieldError('executionReference')}><input {...inputProps('executionReference')} placeholder="Inspection or measurement reference for this extra work"/></FormField><FormField label="Claim decision" error={fieldError('claimEligibility')}><SelectField {...inputProps('claimEligibility')}>{Object.entries(VO_ELIGIBILITY_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</SelectField></FormField><FormField label="Eligibility note" required={fields.claimEligibility !== 'needsReview'} error={fieldError('eligibilityNote')}><textarea {...inputProps('eligibilityNote')} rows={2} placeholder="What can be assessed, or why is it excluded?"/></FormField></div> : <><p className="vo-saved-check">{eligibility.eligible ? `Verified work · ${entry.executionReference}` : 'Excluded from new claims.'}</p><p className="vo-saved-check">{entry.eligibilityNote}</p><Button className="ghost" onClick={() => setEditingChecks(true)}>Edit claim checks</Button></>}
            {!eligibility.eligible && entry.claimEligibility !== 'excluded' && <details className="vo-eligibility-issues"><summary>Saved checks remaining ({eligibility.issues.length})</summary><ul>{eligibility.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
            <p className="vo-check-hint">Price approval does not set the claim amount. The QS assesses it in Monthly claims.</p>
            {entry.eligibilityReviewedAt && <p className="vo-check-hint">Last recorded {dateLabel(entry.eligibilityReviewedAt)}. Saved claim versions keep their original assessment.</p>}
          </> : <p className="vo-check-hint">Price approval and verified extra work are required before the QS can include it in a claim.</p>}
        </CheckSection>}
        {rejected && (onCreateConfirmation || onConfirmationReply) && <VOConfirmationPanel project={project} caseId={entry.id} hasUnsavedChanges={confirmationSourceEdits} hasApprovalEdits={hasApprovalEdits} onCreate={onCreateConfirmation} onReply={onConfirmationReply}/>}
        {rejected && (entry.proposedValue != null || entry.approvedValue != null) && <details className="vo-approval-details"><summary>Previous price details</summary><p className="vo-saved-check">Proposed value: {amountLabel(entry.proposedValue,currency)} · No current price approval.</p></details>}
        <section className="vo-next-action" aria-label="Next action"><h3 className="form-section-heading">Next action</h3>
        {showNote && <div className="vo-action-note">
          {reviewAction && <p className="vo-check-hint">{reviewAction === 'reopen' ? 'Reopening clears the current price approval and claim eligibility. Earlier decisions stay in history.' : reviewAction === 'reject' ? 'Record why this case should be closed. Original evidence stays in history.' : 'Record what information is missing. No message is sent.'}</p>}
          <FormField className="vo-review-note" label={reviewAction === 'reopen' ? 'Reason to reopen' : 'Review note'} required={noteRequired} optional={!noteRequired} error={fieldError('reviewNote')}><textarea ref={noteRef} {...inputProps('reviewNote')} rows={2} placeholder="Reason or missing information…"/></FormField>
        </div>}
        {error && !errorField && <p className="vo-form-error" role="alert"><CircleAlert size={14}/>{error}</p>}{saved && <p className="vo-check-hint" role="status">{saved}</p>}
        <FormActions className="vo-action-row" secondary={<>
          {reviewAction ? <Button onClick={() => { setReviewAction(null); clearFormBuffer(project.id, actionScope); setError(''); setErrorField(''); }}>Cancel action</Button> : editable && <Button className="ghost" icon={Save} onClick={() => act('save')}>Save draft</Button>}
          <ActionMenu label="Review actions" items={[
            editable && onLink && {label:'Link to existing VO',icon:Link2,onSelect:chooseLink},
            !approved && !rejected && {label:'Need information',onSelect:()=>chooseAction('clarify')},
            !approved && !rejected && {label:'Reject',onSelect:()=>chooseAction('reject')},
            (approved || rejected) && {label:'Reopen review',icon:RotateCcw,onSelect:()=>chooseAction('reopen')},
            !rejected && {label:'Add review note',onSelect:()=>{setNoteRequested(true);if(approved)setEditingChecks(true);}},
          ]}/>
        </>}>
          {reviewAction ? <Button className="primary" onClick={() => act(reviewAction)}>{actionText}</Button> : editable ? <Button className="primary" icon={ArrowRight} onClick={() => act(closingScope ? 'reject' : fields.scopeDisposition === 'clarification' ? 'clarify' : 'submit')}>{closingScope ? 'Close review' : fields.scopeDisposition === 'clarification' ? 'Need information' : 'Ready for approval'}</Button> : pendingApproval ? <Button className="primary" icon={CheckCheck} onClick={() => act('approve')}>Record approval</Button> : approved ? <>
            {editingEligibility && <Button className={eligibility.eligible && !hasEdits ? '' : 'primary'} icon={Save} onClick={() => act('assessEligibility')}>Save claim checks</Button>}
            {eligibility.eligible && <Button className={editingEligibility && hasEdits ? '' : 'primary'} icon={ArrowRight} disabled={hasEdits} onClick={() => onOpenClaims?.(entry.id)}>Review in monthly claim</Button>}
          </> : null}
        </FormActions>
        </section>
      </form>}
      <details className="vo-history"><summary>Review history <span>{history.length + (linked ? 1 : 0)} {history.length + (linked ? 1 : 0) === 1 ? 'action' : 'actions'}</span></summary><ol>{linked && <li><i className="vo-history-dot"/><div><strong>Linked to {linked.targetReference}</strong><p>{linked.reason}</p><small>{dateLabel(linked.linkedAt)} · {linked.linkedBy}</small></div></li>}{history.map((event,index) => <li key={event.id || `${event.date}-${index}`}><i className={`vo-history-dot ${event.to === 'approved' ? 'approved' : ''}`}/><div><div className="vo-history-heading"><strong>{actionLabel(event.action)}</strong></div>{event.values?.reviewNote && <p>{event.values.reviewNote}</p>}{event.action === 'approve' && <p>{amountLabel(event.values?.approvedValue,currency)} · {event.values?.approver} · {event.values?.approvalReference}</p>}{event.action === 'assessEligibility' && <p>{labelFor(VO_ELIGIBILITY_LABELS, event.values?.claimEligibility) || 'Checks recorded'} · {event.values?.eligibilityNote}</p>}<small>{dateLabel(event.date)} · {event.actor || 'Demo QS reviewer'}</small></div></li>)}<li><i className="vo-history-dot"/><div><strong>{manual ? 'Extra work added manually' : 'Extra work flagged'}</strong><p>{manual ? 'Original entry and optional photo retained.' : 'Original message and photo retained.'}</p><small>{dateLabel(report.date)} · {report.sender || 'Demo site report'}</small></div></li></ol></details>
    </div>
  </section>;
}

export { tone as voTone, dateLabel as voDateLabel, amountLabel as voAmountLabel };
