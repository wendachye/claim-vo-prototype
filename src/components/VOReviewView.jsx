import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCheck, CircleAlert, Flag, ImageOff, MapPin, MessageSquare, RotateCcw, Save, Search, ShieldCheck, X, ZoomIn } from 'lucide-react';
import { VO_STATUS_LABELS } from '../data/vo.js';
import { BackButton, Badge, Button, FormActions, FormField, Modal, PageHeader, formatMoney, formatTime } from './ui.jsx';
import './vo-review.css';

const tone = (status) => status === 'approved' ? 'green' : status === 'pendingApproval' ? 'blue' : status === 'rejected' ? 'slate' : 'amber';
const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Date not recorded';
const amountLabel = (value, currency) => value == null || value === '' ? 'Unknown' : `${currency} ${formatMoney(value)}`;
const closed = (status) => ['approved', 'rejected'].includes(status);
const actionLabel = (action) => ({ save: 'QS review saved', clarify: 'Marked needs information', submit: 'Marked awaiting approval', approve: 'Approval recorded', reject: 'VO rejected', reopen: 'Review reopened' }[action] || action);

function EvidencePhoto({ report, onOpen }) {
  const [failed, setFailed] = useState(false);
  const src = typeof report.photo === 'string' ? report.photo : report.photo?.url;
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <button type="button" className="vo-evidence-photo" aria-label="Enlarge VO evidence photo" onClick={() => onOpen({ src, alt: report.photoAlt })}><img src={src} alt={report.photoAlt || 'Demo photo attached to the original site update'} onError={() => setFailed(true)} loading="lazy" /><span className="vo-photo-label">{report.channel === 'whatsapp-mock' ? 'Generated demo photo' : 'Demo attachment'}</span><span className="vo-photo-open"><ZoomIn size={13} />View photo</span></button> : <div className="vo-no-photo"><ImageOff size={22} /><div><strong>{failed ? 'Photo unavailable' : 'No photo attached'}</strong><p>{failed ? 'The original message is retained. Check the attachment before deciding.' : 'This source update contains text only; no photo evidence is implied.'}</p></div></div>;
}

export function VOReviewView({ project, cases = [], initialCaseId, onSelect, onAction, onOpenWhatsApp, onOpenContract, onOpenClaims }) {
  const [selectedId, setSelectedId] = useState(initialCaseId || cases[0]?.id || '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [photo, setPhoto] = useState(null);
  const registerRef = useRef(null);
  const reviewRef = useRef(null);
  const currency = project.contract?.currency || 'SGD';
  const shown = cases.filter((entry) => (filter === 'all' || entry.status === filter)
    && (!search.trim() || `${entry.reference} ${entry.title} ${entry.report.message} ${entry.report.area} ${entry.report.location}`.toLowerCase().includes(search.trim().toLowerCase())));
  const selected = shown.find((entry) => entry.id === selectedId) || shown[0];
  useEffect(() => {
    if (!initialCaseId || !cases.some((entry) => entry.id === initialCaseId)) return;
    setSelectedId(initialCaseId);
    if (!shown.some((entry) => entry.id === initialCaseId)) { setSearch(''); setFilter('all'); }
  }, [initialCaseId]);
  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
      onSelect?.(selected.id);
    }
  }, [selected?.id, selectedId, onSelect]);
  function choose(entry) {
    setSelectedId(entry.id);
    onSelect?.(entry.id);
    if (window.matchMedia('(max-width: 1050px)').matches) reviewRef.current?.scrollIntoView({ block: 'start' });
  }

  return <div className="vo-view">
    <PageHeader title="Extra work (VO)" description="Check extra work against the contract and record its approval." actions={<Button icon={MessageSquare} onClick={() => onOpenWhatsApp?.()}>Site updates<ArrowRight size={14} /></Button>} />
    <p className="vo-demo-note">Demo review · decisions stay in this browser.</p>

    {!cases.length ? <div className="project-empty empty-state"><Flag size={30} /><h3>No flagged extra work for this project</h3><p>Flag extra work from Site updates. Its message and photo will appear here for review.</p><Button icon={MessageSquare} onClick={() => onOpenWhatsApp?.()}>Open site updates</Button></div> : <div className="vo-workspace">
      <section ref={registerRef} className="vo-register" aria-labelledby="vo-register-heading"><header className="vo-panel-header"><div><h2 id="vo-register-heading">Extra work <span>{cases.length}</span></h2></div><Flag size={16} /></header>
        <div className="vo-register-tools"><label className="search-box"><Search size={15} /><input aria-label="Search VO records" placeholder="Search work or location…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear VO search" onClick={() => setSearch('')}><X size={13} /></button>}</label><select aria-label="Filter VO approval status" className="form-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(VO_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="vo-register-list">{shown.length ? shown.map((entry) => <button type="button" key={entry.id} className={`vo-register-item${selected?.id === entry.id ? ' selected' : ''}`} aria-pressed={selected?.id === entry.id} onClick={() => choose(entry)}><div className="vo-register-top"><span>{entry.reference}</span><Badge tone={tone(entry.status)}>{VO_STATUS_LABELS[entry.status]}</Badge></div><strong>{entry.title || 'Flagged extra work'}</strong><p><MapPin size={11} />{[entry.report.location, entry.report.area].filter(Boolean).join(' · ') || 'Location not recorded'}</p><div className="vo-register-bottom"><span>{dateLabel(entry.report.date)}</span><span>{entry.status === 'approved' ? 'Approved' : 'Proposed'}: <b>{amountLabel(entry.status === 'approved' ? entry.approvedValue : entry.proposedValue, currency)}</b></span></div></button>) : <div className="vo-list-empty"><Search size={25} /><h3>No matching extra work</h3><p>Try another search or approval status.</p><Button className="small" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button></div>}</div>
        <footer className="vo-register-footer"><ShieldCheck size={12} />{project.code} records only</footer>
      </section>

      <div ref={reviewRef} className="vo-review-anchor">{selected ? <VOCaseReview key={`${selected.id}-${selected.status}-${selected.history.length}`} entry={selected} project={project} currency={currency} onAction={onAction} onPhoto={setPhoto} onOpenContract={onOpenContract} onOpenClaims={onOpenClaims} onBack={() => registerRef.current?.scrollIntoView({ block: 'start' })} /> : <section className="vo-detail vo-list-empty"><Flag size={28} /><h3>Select extra work</h3><p>Its message, photo and review will appear here.</p></section>}</div>
    </div>}
    {photo && <div className="vo-photo-modal"><Modal title="Extra-work photo" description="Demo attachment · review alongside the original message" onClose={() => setPhoto(null)} footer={<Button onClick={() => setPhoto(null)}>Done</Button>}><img src={photo.src} alt={photo.alt || 'Photo attached to the demo variation report'} /></Modal></div>}
  </div>;
}

function VOCaseReview({ entry, project, currency, onAction, onPhoto, onOpenContract, onOpenClaims, onBack }) {
  const formRef = useRef(null);
  const [fields, setFields] = useState(() => ({ title: entry.title || '', relatedItemId: entry.relatedItemId || '', scopeAssessment: entry.scopeAssessment || '', instructionReference: entry.instructionReference || '', proposedValue: entry.proposedValue ?? '', approvedValue: entry.approvedValue ?? entry.proposedValue ?? '', approvalReference: entry.approvalReference || '', approver: entry.approver || '', reviewNote: '' }));
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [saved, setSaved] = useState('');
  const editable = ['flagged', 'clarification'].includes(entry.status);
  const isClosed = closed(entry.status);
  const pendingApproval = entry.status === 'pendingApproval';
  const report = entry.report;
  const setField = (name, value) => { setFields((prior) => ({ ...prior, [name]: value })); setError(''); setErrorField(''); setSaved(''); };
  function problem(message, name) { setError(message); setErrorField(name || ''); formRef.current?.querySelector(`[name="${name}"]`)?.focus(); }
  function act(action) {
    if (['clarify', 'reject', 'reopen'].includes(action) && !fields.reviewNote.trim()) return problem('Add a decision note so the reason remains in the review history.', 'reviewNote');
    if (action === 'submit') {
      if (!fields.title.trim()) return problem('Describe the extra work.', 'title');
      if (!fields.scopeAssessment.trim()) return problem('Explain why this is extra work before marking it ready for approval.', 'scopeAssessment');
      if (!fields.instructionReference.trim()) return problem('Add the instruction or drawing reference before marking it ready for approval.', 'instructionReference');
    }
    if (action === 'approve') {
      if (fields.approvedValue === '' || !Number.isFinite(Number(fields.approvedValue)) || Number(fields.approvedValue) < 0) return problem('Enter a non-negative approved value. Zero is valid.', 'approvedValue');
      if (!fields.approver.trim()) return problem('Record who approved the extra work.', 'approver');
      if (!fields.approvalReference.trim()) return problem('Enter the approval reference.', 'approvalReference');
    }
    const result = onAction?.(entry.id, action, fields);
    if (result?.outcome === 'invalid') return problem(result.error || 'Check the review details and try again.');
    if (result?.outcome === 'unchanged') setSaved('No changes to save.');
  }
  const inputProps = (name) => ({ name, value: fields[name], onChange: (event) => setField(name, event.target.value), 'aria-invalid': errorField === name });
  const fieldError = (name) => errorField === name ? error : undefined;
  const history = [...(entry.history || [])].reverse();

  return <section className="vo-detail" aria-labelledby="vo-detail-heading">
    <div className="vo-panel-back vo-back-register"><BackButton onClick={onBack}>Back to extra work</BackButton></div>
    <header className="vo-panel-header"><div><span className="vo-reference">{entry.reference}</span><h2 id="vo-detail-heading">{entry.title || 'Flagged extra work'}</h2></div><Badge tone={tone(entry.status)}>{VO_STATUS_LABELS[entry.status]}</Badge></header>
    <div className="vo-next-step"><div><strong>{entry.status === 'approved' ? 'Approval recorded' : entry.status === 'rejected' ? 'Review closed' : 'Next step'}</strong><p>{editable ? entry.status === 'clarification' ? 'Add the missing information, then mark this ready for approval.' : 'Check the message and photo, then explain the extra work and add its instruction reference.' : pendingApproval ? 'Enter the approved amount, approval reference and who approved it.' : entry.status === 'approved' ? 'Review this approval in the monthly claim. The claim month and QS assessment still need checking.' : 'The work was rejected. Reopen the decision only if it needs another review.'}</p></div>{entry.status === 'approved' && onOpenClaims && <Button className="primary" icon={ArrowRight} onClick={onOpenClaims}>Review in monthly claim</Button>}</div>
    <div className="vo-detail-body">
      <div className="vo-section-title"><h3>Worker’s message</h3></div>
      <div className="vo-source-meta"><strong>{report.sender || 'Sender not recorded'}</strong><time dateTime={report.date}>{dateLabel(report.date)}</time></div>
      <blockquote className="vo-source-message">{report.message || 'No source message attached.'}</blockquote>
      <p className="vo-source-location">{[report.location, report.area].filter(Boolean).join(' · ')}</p>
      <EvidencePhoto report={report} onOpen={onPhoto} />
      <details className="vo-source-details"><summary>Source details</summary><p>Report: {report.id}{report.sourceMessageId && <><br />Message: {report.sourceMessageId}</>}<br />{report.channel === 'whatsapp-mock' ? 'Simulated WhatsApp message' : 'Demo site report'}</p></details>
      {report.reviewReason && <p className="vo-legacy-note"><strong>Earlier review note:</strong> {report.reviewReason}</p>}

      <form ref={formRef} onSubmit={(event) => event.preventDefault()} className="vo-review-form">
        <div className="vo-section-title"><h3>Review the extra work</h3><button type="button" onClick={() => onOpenContract?.()}>Check contract<ArrowRight size={12} /></button></div>
        <details className={`vo-assessment-details${editable ? ' editing' : ''}`} open={editable}><summary>{editable ? 'Work details' : 'Saved work details'}</summary>
        <div className="vo-form-grid">
          <FormField className="vo-wide" label="Work description" error={fieldError('title')}><input className="form-input" {...inputProps('title')} disabled={!editable} /></FormField>
          <FormField className="vo-wide" label="Related contract item" optional error={fieldError('relatedItemId')}><select className="form-select" {...inputProps('relatedItemId')} disabled={!editable}><option value="">No matching contract item</option>{project.items.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.description}</option>)}</select></FormField>
          <FormField className="vo-wide" label="Why is this extra work?" error={fieldError('scopeAssessment')}><textarea className="form-textarea" {...inputProps('scopeAssessment')} disabled={!editable} rows={3} placeholder="Explain what was added and how it differs from the contract…" /></FormField>
          <FormField label="Instruction or drawing reference" error={fieldError('instructionReference')}><input className="form-input" {...inputProps('instructionReference')} disabled={!editable} placeholder="e.g. site instruction or drawing revision" /></FormField>
          <FormField label="Proposed value" suffix={currency} optional hint="Leave blank if the value is not known." error={fieldError('proposedValue')}><input className="form-input" {...inputProps('proposedValue')} disabled={!editable} type="number" min="0" step="0.01" inputMode="decimal" placeholder="Unknown" /></FormField>
        </div>
        <p className="vo-field-note">A flag needs review before it can be approved.</p></details>

        {(pendingApproval || entry.status === 'approved') && <div className={`vo-approval-card${entry.status === 'approved' ? ' approved' : ''}`}>
          <div className="vo-section-title"><h3><ShieldCheck size={15} />{entry.status === 'approved' ? 'Recorded approval' : 'Record approval'}</h3></div>
          {entry.status === 'approved' && <div className="vo-approved-value"><span>Approved value</span><strong>{amountLabel(entry.approvedValue, currency)}</strong></div>}
          {pendingApproval ? <div className="vo-form-grid"><FormField label="Approved value" suffix={currency} error={fieldError('approvedValue')}><input className="form-input" {...inputProps('approvedValue')} type="number" min="0" step="0.01" inputMode="decimal" placeholder="Enter approved value" /></FormField><FormField label="Approval reference" error={fieldError('approvalReference')}><input className="form-input" {...inputProps('approvalReference')} placeholder="Approval or email reference" /></FormField><FormField className="vo-wide" label="Approved by" error={fieldError('approver')}><input className="form-input" {...inputProps('approver')} placeholder="Person or organisation" /></FormField></div> : <div className="vo-recorded-approval"><span>Approval reference<strong>{entry.approvalReference || 'Not recorded'}</strong></span><span>Approved by<strong>{entry.approver || 'Not recorded'}</strong></span></div>}
          <p className="vo-field-note">Records the approval only. Nothing is sent or paid.</p>
        </div>}

        {isClosed ? <details className="vo-reopen"><summary>Reopen this decision</summary><FormField className="vo-decision-note" label="Reason to reopen" error={fieldError('reviewNote')}><textarea className="form-textarea" {...inputProps('reviewNote')} rows={2} placeholder="Explain why this needs another review…" /></FormField>{error && !errorField && <p className="vo-form-error" role="alert"><CircleAlert size={14} />{error}</p>}<FormActions><Button icon={RotateCcw} onClick={() => act('reopen')}>Reopen review</Button></FormActions></details> : <>
          <FormField className="vo-decision-note" label="Review note" hint="Required when requesting information or rejecting." error={fieldError('reviewNote')}><textarea className="form-textarea" {...inputProps('reviewNote')} rows={2} placeholder="Add a question, decision or next action…" /></FormField>
          {error && !errorField && <p className="vo-form-error" role="alert"><CircleAlert size={14} />{error}</p>}{saved && <p className="vo-field-note" role="status">{saved}</p>}
          <FormActions className="vo-action-row" secondary={<>{editable && <Button className="ghost" icon={Save} onClick={() => act('save')}>Save draft</Button>}<Button className="ghost" onClick={() => act('clarify')}>Need information</Button><Button className="ghost vo-reject-action" onClick={() => act('reject')}>Reject</Button></>}>{editable ? <Button className="primary" icon={ArrowRight} onClick={() => act('submit')}>Ready for approval</Button> : <Button className="primary" icon={CheckCheck} onClick={() => act('approve')}>Record approval</Button>}</FormActions>
        </>}
      </form>

      <details className="vo-history"><summary>Review history <span>{history.length} {history.length === 1 ? 'action' : 'actions'}</span></summary><ol>{history.map((event, index) => <li key={event.id || `${event.date}-${index}`}><i className={`vo-history-dot ${event.to === 'approved' ? 'approved' : ''}`} /><div><div className="vo-history-heading"><strong>{actionLabel(event.action)}</strong>{event.to && <Badge tone={tone(event.to)}>{VO_STATUS_LABELS[event.to] || event.to}</Badge>}</div>{event.values?.reviewNote && <p>{event.values.reviewNote}</p>}{event.action === 'approve' && <p>{amountLabel(event.values?.approvedValue, currency)} · {event.values?.approver} · {event.values?.approvalReference}</p>}<small>{dateLabel(event.date)} · {event.actor || 'Demo QS reviewer'}</small></div></li>)}<li><i className="vo-history-dot" /><div><strong>Extra work flagged</strong><p>Original message retained for QS review.</p><small>{dateLabel(report.date)} · {report.sender || 'Demo site report'}</small></div></li></ol></details>
    </div>
  </section>;
}
