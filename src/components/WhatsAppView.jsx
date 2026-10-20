import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, Clock3, FileText, Flag, ImageOff, Inbox, Info, ListChecks, LockKeyhole, MapPin, MessageSquare, Search, ShieldCheck, Sparkles, X, ZoomIn } from 'lucide-react';
import { Badge, Button, Modal, formatTime, formatMoney } from './ui.jsx';
import { getVOCases, VO_STATUS_LABELS } from '../data/vo.js';
import './whatsapp.css';

const waiting = (report) => ['pending', 'needsReview'].includes(report?.status);
const percent = (value) => value == null ? '—' : `${Number(value)}%`;
const messageReport = (project, message) => project.reports.find((report) => report.id === message?.reportId || report.sourceMessageId === message?.id);
const time = (value) => value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Demo message';

function statusFor(message, report, voCase) {
  if (report?.vo && voCase) return { label: voCase.status === 'flagged' ? 'Flagged for QS' : VO_STATUS_LABELS[voCase.status], tone: voCase.status === 'approved' ? 'green' : voCase.status === 'rejected' ? 'slate' : 'amber' };
  if (report?.status === 'rejected') return { label: 'Dismissed', tone: 'slate' };
  if (report?.status === 'verified') return { label: 'Verified', tone: 'green' };
  if (report?.status === 'superseded') return { label: 'Superseded', tone: 'slate' };
  if (message.status === 'clarification') return { label: 'Needs clarification', tone: 'amber' };
  if (message.status === 'new') return { label: 'New', tone: 'blue' };
  if (report?.vo) return { label: 'Flagged for QS', tone: 'amber' };
  return { label: waiting(report) ? 'Awaiting verification' : 'Processed', tone: waiting(report) ? 'amber' : 'slate' };
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
  const [selectedId, setSelectedId] = useState(messages[0]?.id || '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [photo, setPhoto] = useState(null);
  const inboxRef = useRef(null);
  const reviewRef = useRef(null);
  function chooseMessage(message) {
    setSelectedId(message.id);
    if (window.matchMedia('(max-width: 1050px)').matches) reviewRef.current?.scrollIntoView({ block: 'start' });
  }
  const shown = messages.filter((message) => {
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
  const awaitingCount = messages.filter((message) => {
    const linked = messageReport(project, message);
    return linked && !linked.vo && waiting(linked);
  }).length;
  const voCount = voCases.filter((entry) => !['approved', 'rejected'].includes(entry.status)).length;
  const affectedItems = project.items.filter((entry) => messages.some((message) => message.itemId === entry.id));
  const stats = [
    ['MOCK MESSAGES', messages.length, 'For this project only', MessageSquare],
    ['UNPROCESSED', newCount, 'Review the message and photo', Inbox],
    ['AWAITING VERIFICATION', awaitingCount, 'Processed progress reports', Clock3],
    ['POSSIBLE VOs', voCount, 'Project flags · for QS review', Flag],
  ];

  return <div className="whatsapp-view">
    <div className="page-header">
      <div><h1>WhatsApp processing</h1><p className="page-description">Turn site messages into progress updates and possible variation flags.</p></div>
      <div className="header-actions"><Button icon={Flag} onClick={() => onOpenVO?.()}>VO review</Button><Button icon={ListChecks} onClick={() => onOpenCompletion?.(false)}>Completion list<ArrowRight size={14} /></Button></div>
    </div>

    <div className="prototype-banner"><Info size={15} /><span><strong>Mock WhatsApp inbox.</strong> Messages, photos and interpretation are simulated. Nothing is sent to WhatsApp. Changes stay in this browser.</span></div>

    <div className="wa-kpis">{stats.map(([label, value, detail, Icon]) => <div className="wa-kpi" key={label}><div className="summary-label">{label}<Icon size={15} /></div><div className="wa-kpi-value">{value}</div><p>{detail}</p></div>)}</div>

    <section className="wa-project-context" aria-label="WhatsApp project context"><div className="wa-project-name"><div className="wa-whatsapp-icon"><MessageSquare size={19} /></div><div><strong>{project.name}</strong><span>{project.code} · {project.contract?.sourceKind === 'illustrative' ? 'Illustrative project' : 'Selected project'} · Demo site updates</span></div></div><Badge tone={project.locked ? 'green' : 'amber'}>{project.locked ? <LockKeyhole size={11} /> : <Clock3 size={11} />}{project.items.length ? `Baseline v${project.version || 1} · ${project.locked ? 'Confirmed' : 'In review'}` : 'No baseline yet'}</Badge></section>

    {!messages.length ? <div className="project-empty empty-state"><MessageSquare size={32} /><h3>No demo messages for this project</h3><p>{project.items.length ? 'Select Campus Scaffold (Demo) or Warehouse Extension in the project dropdown to try the seeded WhatsApp workflow.' : 'This project has no contract items yet. Review a sample project to try the mock site updates.'}</p><Button icon={FileText} onClick={() => onOpenContract?.()}>Contract review</Button></div> : <>
      <div className="wa-workspace">
        <section ref={inboxRef} className="wa-inbox" aria-labelledby="wa-inbox-heading">
          <header className="wa-panel-header"><div><h2 id="wa-inbox-heading">Site inbox <span>{messages.length}</span></h2><p>Direct worker messages · demo</p></div><MessageSquare size={17} /></header>
          <div className="wa-inbox-tools"><label className="search-box"><Search size={15} /><input aria-label="Search WhatsApp messages" placeholder="Search messages or work items…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" className="wa-clear-search" aria-label="Clear message search" onClick={() => setSearch('')}><X size={13} /></button>}</label><select className="form-select" aria-label="Filter WhatsApp messages" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All messages</option><option value="new">New messages</option><option value="processed">Processed</option><option value="vo">VO messages</option><option value="clarification">Needs clarification</option></select></div>
          <div className="wa-message-list" aria-label="Messages for selected project">{shown.length ? shown.map((message) => {
            const linked = messageReport(project, message);
            const state = statusFor(message, linked, caseFor(linked));
            return <button type="button" className={`wa-message${selected?.id === message.id ? ' selected' : ''}`} key={message.id} aria-pressed={selected?.id === message.id} onClick={() => chooseMessage(message)}>
              <div className="wa-message-top"><strong>{message.sender}</strong><time dateTime={message.date}>{time(message.date)}</time></div>
              <div className="wa-message-preview"><DemoPhoto src={message.photo} alt={message.photoAlt} className="wa-message-thumb" /><p>{message.text}</p></div>
              <div className="wa-message-bottom"><span><MapPin size={11} />{message.area || message.location || 'Area unclear'}</span><Badge tone={state.tone}>{message.kind === 'vo' && message.status === 'new' ? 'Possible VO · new' : state.label}</Badge></div>
            </button>;
          }) : <div className="wa-list-empty"><Search size={24} /><strong>No matching messages</strong><p>Try another search or status.</p><Button className="small" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button></div>}</div>
          <footer className="wa-inbox-footer"><ShieldCheck size={12} /><span>{project.code} inbox · local demo only</span></footer>
        </section>

        {selected ? <section ref={reviewRef} className="wa-review" aria-labelledby="wa-review-heading">
          <header className="wa-panel-header"><div><h2 id="wa-review-heading">Review message</h2><p>{selected.id}</p></div><div className="wa-review-header-actions"><Button className="small ghost wa-back-inbox" icon={ArrowLeft} onClick={() => inboxRef.current?.scrollIntoView({ block: 'start' })}>Inbox</Button><Badge tone={status.tone}>{status.label}</Badge></div></header>
          <div className="wa-review-body">
            <div className="wa-evidence-heading"><div className="avatar wa-worker-avatar">{selected.sender?.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]).join('') || 'DW'}</div><div><strong>{selected.sender}</strong><span>{selected.senderRole || 'Site worker · demo'}</span></div><time dateTime={selected.date}>{time(selected.date)}</time></div>
            <div className="wa-original-message"><div className="wa-original-label"><MessageSquare size={12} />Original message</div><blockquote>{selected.text}</blockquote><div className="wa-original-footer"><span>{project.code} · Incoming demo message</span><CheckCheck size={14} /></div></div>
            <DemoPhoto src={selected.photo} alt={selected.photoAlt} className="wa-evidence-photo" onOpen={() => setPhoto({ src: selected.photo, alt: selected.photoAlt })} />

            <div className="wa-interpretation-heading"><h3><Sparkles size={14} />Proposed interpretation</h3><Badge tone="slate">Mock extraction</Badge></div>
            <div className="wa-fields"><Field label="Project">{project.code}</Field><Field label="Location / area">{[selected.location, selected.area].filter(Boolean).join(' · ')}</Field><Field label="Update type">{isVo ? 'Variation / extra work' : isUnclear ? 'Needs clarification' : 'Cumulative progress'}</Field><Field label="Work item">{item ? `${item.id} · ${item.ref}` : 'Not matched'}</Field>{item && <Field label="Contract scope" wide>{item.description}</Field>}</div>

            {isVo ? <div className="wa-result wa-result-vo"><div className="wa-result-title"><Flag size={16} /><strong>{isNew ? 'Extra work may fall outside the contract' : voCase?.status === 'approved' ? 'VO approval recorded' : voCase?.status === 'rejected' ? 'VO rejected' : voCase?.status === 'pendingApproval' ? 'Awaiting approval' : voCase?.status === 'clarification' ? 'More information needed' : 'Possible VO saved for QS review'}</strong></div><p>{isNew ? 'Processing saves the message and photo as a possible VO. The QS must check the scope and instruction.' : 'Review the assessment, approval record and original evidence in VO review.'}</p><div className="wa-result-foot">Progress unchanged <span>·</span> {voCase?.status === 'approved' ? `Approved value: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.approvedValue)}` : voCase?.proposedValue != null ? `Proposed: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.proposedValue)}` : 'Value unknown'} <span>·</span> {voCase?.status === 'approved' ? 'Approval recorded locally' : voCase?.status === 'rejected' ? 'Rejected in local review' : 'No variation approved'}</div></div> : isUnclear ? <div className="wa-result wa-result-unclear"><div className="wa-result-title"><CircleAlert size={16} /><strong>Confirm the item and completion basis</strong></div><p>{selected.kind === 'clarification' ? '“Done 50%” could mean total progress or additional progress. Confirm the item and total to date before updating the register.' : 'Confirm the work item, total percentage and report chronology before updating the register.'}</p><div className="wa-result-foot">No completion update will be made.</div>{selected.status === 'clarification' && <div className="wa-clarification-saved"><Check size={13} />Marked for clarification. No WhatsApp message was sent.</div>}</div> : <div className={`wa-result ${report?.status === 'verified' ? 'wa-result-verified' : ''}`}>
              <div className="wa-result-title"><ListChecks size={16} /><strong>{isNew ? 'Completion list preview' : report?.status === 'verified' ? 'Progress verified' : report?.status === 'superseded' ? 'A newer update replaced this report' : report?.status === 'rejected' ? 'Report dismissed' : 'Reported progress updated'}</strong>{!isNew && report?.status !== 'rejected' && report?.status !== 'superseded' && <Check size={14} />}</div>
              <div className="wa-progress-comparison"><div><span>Reported total</span><strong>{isNew ? <>{percent(item?.reported)}<ArrowRight size={15} /><em>{percent(selected.completion)}</em></> : percent(item?.reported)}</strong></div><div><span>Verified total</span><strong className="wa-verified-number">{percent(item?.verified)}{report?.status !== 'verified' && <small>unchanged</small>}</strong></div></div>
              <div className="wa-result-foot">{isNew ? 'Replaces the reported total; percentages are never added together.' : report?.status === 'verified' ? 'Supervisor verification is saved in this project’s history.' : 'Supervisor review is required before verified progress changes.'}</div>
            </div>}

            {selected.processingNote && <p className="wa-processing-note"><Info size={13} />{isVo && voCase && voCase.status !== 'flagged' && !isNew ? `VO status: ${VO_STATUS_LABELS[voCase.status]}. Original message and photo retained.` : report?.status === 'verified' ? `Verified at ${percent(report.approvedCompletion ?? report.completion)} total. The original message and photo are retained.` : selected.processingNote}</p>}
            {!project.locked && !isVo && !isUnclear && <div className="wa-baseline-note"><LockKeyhole size={13} /><span>Confirm the contract baseline before verifying progress.</span><button type="button" onClick={() => onOpenContract?.()}>Review contract<ChevronRight size={12} /></button></div>}
          </div>
          <footer className="wa-review-footer"><span>{isNew ? 'Review before processing' : 'Original evidence retained'}</span><div>{isNew ? <Button className="primary" icon={isVo ? Flag : isUnclear ? MessageSquare : Check} onClick={() => onProcess?.(selected)}>{isVo ? 'Process & flag possible VO' : isUnclear ? 'Mark for clarification' : 'Process message'}</Button> : report ? <><Button icon={ArrowRight} onClick={() => isVo ? onOpenVO?.(report?.id) : onOpenCompletion?.(false)}>{isVo ? 'View VO review' : 'View completion list'}</Button>{!isVo && waiting(report) && <Button className="primary" icon={ShieldCheck} onClick={() => onReview?.(report)}>Review progress</Button>}</> : <Badge tone="amber">Clarification needed</Badge>}</div></footer>
        </section> : <section className="wa-review wa-no-selection"><MessageSquare size={30} /><h3>Select a message</h3><p>Its photo and proposed update will appear here.</p></section>}
      </div>

      <section className="wa-completion-snapshot" aria-labelledby="wa-snapshot-heading"><header className="wa-panel-header"><div><h2 id="wa-snapshot-heading"><ListChecks size={16} />Completion list · live demo view</h2><p>Shared with this project’s completion register.</p></div><Button className="small" onClick={() => onOpenCompletion?.(false)}>Open list<ArrowRight size={13} /></Button></header><div className="table-scroll"><table className="wa-snapshot-table"><thead><tr><th>Work item</th><th>Reported</th><th>Verified</th><th>Review</th></tr></thead><tbody>{affectedItems.map((entry) => {
        const pending = project.reports.find((candidate) => candidate.itemId === entry.id && !candidate.vo && waiting(candidate));
        return <tr key={entry.id}><td><strong>{entry.id}</strong><span>{entry.description}</span></td><td><div className="wa-inline-progress"><strong>{percent(entry.reported)}</strong><i><b style={{ width: `${Math.max(0, Math.min(100, entry.reported || 0))}%` }} /></i></div></td><td><div className="wa-inline-progress wa-inline-verified"><strong>{percent(entry.verified)}</strong><i><b style={{ width: `${Math.max(0, Math.min(100, entry.verified || 0))}%` }} /></i></div></td><td>{pending ? <Button className="small" onClick={() => onReview?.(pending)}>Review<ChevronRight size={13} /></Button> : <Badge tone={entry.verified > 0 ? 'green' : 'slate'}>{entry.verified > 0 ? 'Verified progress' : 'No pending report'}</Badge>}</td></tr>;
      })}</tbody></table></div><footer className="wa-snapshot-footer"><span><Flag size={13} /><strong>{voCount} possible {voCount === 1 ? 'VO' : 'VOs'}</strong> · Separate from completion percentages</span><button type="button" onClick={() => onOpenVO?.()}>Open VO review<ArrowRight size={13} /></button></footer></section>
      <p className="wa-page-note"><Info size={13} />Photos illustrate the demo workflow; they do not prove the reported completion or variation.</p>
    </>}

    {photo && <div className="wa-photo-modal"><Modal title="Demo site photo" description="Generated illustration · not evidence from the actual project" onClose={() => setPhoto(null)} footer={<Button onClick={() => setPhoto(null)}>Done</Button>}><img src={photo.src} alt={photo.alt || 'Generated site photograph for the prototype'} /></Modal></div>}
  </div>;
}
