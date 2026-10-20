import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleAlert, FileText, Flag, ImageOff, ListChecks, LockKeyhole, MapPin, MessageSquare, Search, ShieldCheck, X, ZoomIn } from 'lucide-react';
import { Badge, Button, Modal, formatTime, formatMoney } from './ui.jsx';
import { getVOCases, VO_STATUS_LABELS } from '../data/vo.js';
import './whatsapp.css';

const waiting = (report) => ['pending', 'needsReview'].includes(report?.status);
const percent = (value) => value == null ? '—' : `${Number(value)}%`;
const messageReport = (project, message) => project.reports.find((report) => report.id === message?.reportId || report.sourceMessageId === message?.id);
const time = (value) => value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Demo message';

function statusFor(message, report, voCase) {
  if (report?.vo && voCase) return { label: voCase.status === 'flagged' ? 'Needs extra-work review' : VO_STATUS_LABELS[voCase.status], tone: voCase.status === 'approved' ? 'green' : voCase.status === 'rejected' ? 'slate' : 'amber' };
  if (report?.status === 'rejected') return { label: 'Dismissed', tone: 'slate' };
  if (report?.status === 'verified') return { label: 'Verified', tone: 'green' };
  if (report?.status === 'superseded') return { label: 'Superseded', tone: 'slate' };
  if (message.status === 'clarification') return { label: 'Needs clarification', tone: 'amber' };
  if (message.status === 'new') return { label: 'New', tone: 'blue' };
  if (report?.vo) return { label: 'Needs extra-work review', tone: 'amber' };
  return { label: waiting(report) ? 'Needs verification' : 'Update added', tone: waiting(report) ? 'amber' : 'slate' };
}

function DemoPhoto({ src, alt, className = '', onOpen }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src) return null;
  if (failed) return <div className={`wa-photo-unavailable ${className}`}><ImageOff size={22} /><span>Demo photo unavailable</span></div>;
  const photo = <img src={src} alt={alt || 'Generated construction site photo for demonstration'} onError={() => setFailed(true)} loading="lazy" />;
  return onOpen ? <button type="button" className={`wa-photo ${className}`} aria-label="Enlarge demo site photo" onClick={onOpen}>{photo}<span className="wa-photo-zoom"><ZoomIn size={13} />View photo</span><span className="wa-photo-demo">Generated demo photo</span></button> : <span className={`wa-photo ${className}`}>{photo}</span>;
}

function Field({ label, children, wide = false }) {
  return <div className={`wa-field${wide ? ' wa-field-wide' : ''}`}><span>{label}</span><strong>{children || 'Not identified'}</strong></div>;
}

export function WhatsAppView({ project, messages = [], onProcess, onReview, onOpenCompletion, onOpenContract, onOpenVO }) {
  const voCases = getVOCases(project);
  const caseFor = (report) => voCases.find((entry) => entry.id === report?.id);
  const orderedMessages = [...messages].sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new') || Date.parse(b.date) - Date.parse(a.date));
  const [selectedId, setSelectedId] = useState(() => orderedMessages.find((message) => message.status === 'new')?.id || orderedMessages.find((message) => waiting(messageReport(project, message)))?.id || orderedMessages[0]?.id || '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [photo, setPhoto] = useState(null);
  const inboxRef = useRef(null);
  const reviewRef = useRef(null);
  function chooseMessage(message) {
    setSelectedId(message.id);
    if (window.matchMedia('(max-width: 1050px)').matches) reviewRef.current?.scrollIntoView({ block: 'start' });
  }
  const shown = orderedMessages.filter((message) => {
    const report = messageReport(project, message);
    const matches = !search.trim() || `${message.sender} ${message.text} ${message.area} ${message.itemId || ''}`.toLowerCase().includes(search.trim().toLowerCase());
    return matches && (filter === 'all'
      || (filter === 'new' && message.status === 'new')
      || (filter === 'processed' && message.status === 'processed')
      || (filter === 'vo' && (message.kind === 'vo' || report?.vo))
      || (filter === 'clarification' && (message.kind === 'clarification' || message.status === 'clarification')));
  });
  const selected = shown.find((message) => message.id === selectedId) || shown[0];
  const report = selected ? messageReport(project, selected) : null;
  const item = project.items.find((entry) => entry.id === selected?.itemId);
  const status = selected ? statusFor(selected, report, caseFor(report)) : null;
  const voCase = caseFor(report);
  const isNew = selected?.status === 'new';
  const isVo = selected?.kind === 'vo' || Boolean(report?.vo);
  const isUnclear = selected?.kind === 'clarification' || selected?.status === 'clarification';
  const newCount = messages.filter((message) => message.status === 'new').length;

  return <div className="whatsapp-view">
    <div className="page-header"><div><h1>Site updates</h1><p className="page-description">Check a worker’s message, then update progress or flag extra work.</p></div></div>
    <p className="wa-demo-note">Demo inbox · no WhatsApp messages are sent.</p>

    {!messages.length ? <div className="project-empty empty-state"><MessageSquare size={32} /><h3>No demo messages for this project</h3><p>{project.items.length ? 'Choose a demo project in the project dropdown to try site updates.' : 'Add contract work first, or choose a demo project to try site updates.'}</p><Button icon={FileText} onClick={() => onOpenContract?.()}>Review contract</Button></div> : <>
      <div className="wa-workspace">
        <section ref={inboxRef} className="wa-inbox" aria-labelledby="wa-inbox-heading">
          <header className="wa-panel-header"><div><h2 id="wa-inbox-heading">Messages <span>{messages.length}</span></h2><p>{newCount ? `${newCount} new to review` : 'No new messages'}</p></div><MessageSquare size={17} /></header>
          <div className="wa-inbox-tools"><label className="search-box"><Search size={15} /><input aria-label="Search site updates" placeholder="Search messages or work items…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" className="wa-clear-search" aria-label="Clear message search" onClick={() => setSearch('')}><X size={13} /></button>}</label><select className="form-select" aria-label="Filter site updates" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All messages</option><option value="new">New messages</option><option value="processed">Saved messages</option><option value="vo">Extra work</option><option value="clarification">Needs clarification</option></select></div>
          <div className="wa-message-list" aria-label="Messages for selected project">{shown.length ? shown.map((message) => {
            const linked = messageReport(project, message);
            const state = statusFor(message, linked, caseFor(linked));
            return <button type="button" className={`wa-message${selected?.id === message.id ? ' selected' : ''}`} key={message.id} aria-pressed={selected?.id === message.id} onClick={() => chooseMessage(message)}>
              <div className="wa-message-top"><strong>{message.sender}</strong><time dateTime={message.date}>{time(message.date)}</time></div>
              <div className="wa-message-preview"><DemoPhoto src={message.photo} alt={message.photoAlt} className="wa-message-thumb" /><p>{message.text}</p></div>
              <div className="wa-message-bottom"><span><MapPin size={11} />{message.area || message.location || 'Area unclear'}</span><Badge tone={state.tone}>{message.kind === 'vo' && message.status === 'new' ? 'Extra work · new' : state.label}</Badge></div>
            </button>;
          }) : <div className="wa-list-empty"><Search size={24} /><strong>No matching messages</strong><p>Try another search or status.</p><Button className="small" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button></div>}</div>

        </section>

        {selected ? <section ref={reviewRef} className="wa-review" aria-labelledby="wa-review-heading">
          <header className="wa-panel-header"><div><h2 id="wa-review-heading">Review update</h2><p>{selected.area || selected.location || 'Location needs confirmation'}</p></div><div className="wa-review-header-actions"><Button className="small ghost wa-back-inbox" icon={ArrowLeft} onClick={() => inboxRef.current?.scrollIntoView({ block: 'start' })}>Inbox</Button><Badge tone={status.tone}>{status.label}</Badge></div></header>
          <div className="wa-review-body">
            <div className="wa-evidence-heading"><div className="avatar wa-worker-avatar">{selected.sender?.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]).join('') || 'DW'}</div><div><strong>{selected.sender}</strong><span>{selected.senderRole || 'Site worker · demo'}</span></div><time dateTime={selected.date}>{time(selected.date)}</time></div>
            <div className="wa-original-message"><div className="wa-original-label"><MessageSquare size={12} />Worker’s message</div><blockquote>{selected.text}</blockquote></div>
            <DemoPhoto src={selected.photo} alt={selected.photoAlt} className="wa-evidence-photo" onOpen={() => setPhoto({ src: selected.photo, alt: selected.photoAlt })} />

            <div className="wa-interpretation-heading"><h3>Suggested update</h3></div>
            <div className="wa-fields"><Field label="Location">{[selected.location, selected.area].filter(Boolean).join(' · ')}</Field><Field label="Update">{isVo ? 'Extra work' : isUnclear ? 'Needs clarification' : 'Total progress to date'}</Field><Field label="Matched contract work" wide>{item ? `${item.ref} · ${item.description}` : 'Not matched — confirm with the worker'}</Field></div>

            {isVo ? <div className="wa-result wa-result-vo"><div className="wa-result-title"><Flag size={16} /><strong>{isNew ? 'Check whether this is extra work' : voCase?.status === 'approved' ? 'Extra work approved' : voCase?.status === 'rejected' ? 'Extra work rejected' : voCase?.status === 'pendingApproval' ? 'Awaiting approval' : voCase?.status === 'clarification' ? 'More information needed' : 'Saved for extra-work review'}</strong></div><p>{isNew ? 'Save this message and photo for the QS to check against the contract.' : 'Open extra-work review to check the scope, value and approval.'}</p><div className="wa-result-foot">Progress unchanged <span>·</span> {voCase?.status === 'approved' ? `Approved value: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.approvedValue)}` : voCase?.proposedValue != null ? `Proposed: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.proposedValue)}` : 'Value unknown'} <span>·</span> {voCase?.status === 'approved' ? 'Approval recorded locally' : voCase?.status === 'rejected' ? 'Rejected in local review' : 'Not approved yet'}</div></div> : isUnclear ? <div className="wa-result wa-result-unclear"><div className="wa-result-title"><CircleAlert size={16} /><strong>Ask the worker to clarify</strong></div><p>{selected.kind === 'clarification' ? 'Ask which work item is meant and the total percentage completed so far.' : 'Confirm the work item, total completed so far and date before updating progress.'}</p><div className="wa-result-foot">Progress will stay unchanged.</div>{selected.status === 'clarification' && <div className="wa-clarification-saved"><Check size={13} />Marked for clarification. Contact the worker outside this demo.</div>}</div> : <div className={`wa-result ${report?.status === 'verified' ? 'wa-result-verified' : ''}`}>
              <div className="wa-result-title"><ListChecks size={16} /><strong>{isNew ? 'Progress change' : report?.status === 'verified' ? 'Progress verified' : report?.status === 'superseded' ? 'A newer update replaced this report' : report?.status === 'rejected' ? 'Report dismissed' : 'Update added — ready to verify'}</strong>{!isNew && report?.status !== 'rejected' && report?.status !== 'superseded' && <Check size={14} />}</div>
              <div className="wa-progress-comparison"><div><span>Worker reported</span><strong>{isNew ? <>{percent(item?.reported)}<ArrowRight size={15} /><em>{percent(selected.completion)}</em></> : percent(item?.reported)}</strong></div><div><span>Supervisor verified</span><strong className="wa-verified-number">{percent(item?.verified)}{report?.status !== 'verified' && <small>unchanged</small>}</strong></div></div>
              <div className="wa-result-foot">{isNew ? 'This replaces the reported total. Supervisor verification stays unchanged.' : report?.status === 'verified' ? 'Verification saved with the original message and photo.' : report?.status === 'rejected' ? 'Dismissed. Verified progress stays unchanged.' : report?.status === 'superseded' ? 'Use the newer update when reviewing progress.' : 'Next, ask the supervisor to verify the update.'}</div>
            </div>}

            <details className="wa-message-details"><summary>Message details</summary><p><strong>Message:</strong> {selected.id}{report && <><br /><strong>Report:</strong> {report.id}</>}<br /><strong>Interpretation:</strong> Predefined demo fields; AI is not connected.</p>{selected.processingNote && <p>{selected.processingNote}</p>}</details>
            {!project.locked && !isVo && !isUnclear && <div className="wa-baseline-note"><LockKeyhole size={13} /><span>Confirm the contract first so the supervisor can verify progress.</span><button type="button" onClick={() => onOpenContract?.()}>Review contract<ChevronRight size={12} /></button></div>}
          </div>
          <footer className="wa-review-footer"><span>{isNew ? 'Check the message before adding it.' : isUnclear ? 'Waiting for a clearer update.' : isVo ? 'Next: review the extra work.' : waiting(report) ? 'Next: supervisor verification.' : 'Saved with this project.'}</span><div>{isNew ? <Button className="primary" icon={isVo ? Flag : isUnclear ? MessageSquare : Check} onClick={() => onProcess?.(selected)}>{isVo ? 'Flag extra work' : isUnclear ? 'Needs clarification' : 'Add progress update'}</Button> : report ? <>{isVo ? <Button className="primary" icon={ArrowRight} onClick={() => onOpenVO?.(report.id)}>Review extra work</Button> : waiting(report) ? <><Button className="ghost" onClick={() => onOpenCompletion?.(false)}>View progress</Button><Button className="primary" icon={ShieldCheck} onClick={() => onReview?.(report)}>Verify progress</Button></> : <Button icon={ArrowRight} onClick={() => onOpenCompletion?.(false)}>View progress</Button>}</> : <Badge tone="amber">Clarification needed</Badge>}</div></footer>
        </section> : <section className="wa-review wa-no-selection"><MessageSquare size={30} /><h3>Select a message</h3><p>Its photo and proposed update will appear here.</p></section>}
      </div>


    </>}

    {photo && <div className="wa-photo-modal"><Modal title="Demo site photo" description="Generated illustration · not evidence from the actual project" onClose={() => setPhoto(null)} footer={<Button onClick={() => setPhoto(null)}>Done</Button>}><img src={photo.src} alt={photo.alt || 'Generated site photograph for the prototype'} /></Modal></div>}
  </div>;
}
