import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, CircleAlert, FileText, Flag, ImageOff, ImagePlus, ListChecks, LockKeyhole, MapPin, MessageSquare, Search, ShieldCheck, X, ZoomIn } from 'lucide-react';
import { BackButton, Badge, Button, FormActions, Modal, PageHeader, formatTime, formatMoney } from './ui.jsx';
import { getVOCases, VO_STATUS_LABELS } from '../data/vo.js';
import { getMessageReport as messageReport } from '../data/whatsapp.js';
import { getAreaLinkStatus } from '../data/drawing-mapping.js';
import { getWorkItemMessageSample } from '../data/contract-work-links.js';
import { getSITAreaMessageUpdate } from '../data/sit-area-messages.js';
import { getSITDemoPhotoUpdate } from '../data/sit-demo-photos.js';
import { isReviewableProgressReport, needsProgressClarification, needsMessageClarification } from '../data/report-status.js';
import './whatsapp.css';

const waiting = isReviewableProgressReport;
const percent = (value) => value == null ? '—' : `${Number(value)}%`;
const time = (value) => value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Demo message';

function statusFor(message, report, voCase) {
  if (report?.vo && voCase) return { label: voCase.status === 'flagged' ? 'Needs extra-work review' : VO_STATUS_LABELS[voCase.status], tone: voCase.status === 'approved' ? 'green' : voCase.status === 'rejected' ? 'slate' : 'amber' };
  if (report?.status === 'rejected') return { label: 'Dismissed', tone: 'slate' };
  if (report?.status === 'verified') return { label: 'Verified', tone: 'green' };
  if (report?.status === 'superseded') return { label: 'Superseded', tone: 'slate' };
  if (needsProgressClarification(report)) return { label: 'Needs clarification', tone: 'amber' };
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

export function WhatsAppView({ project, messages = [], onProcess, onReview, onOpenCompletion, onOpenContract, onOpenContractItem, onOpenVO, onOpenDrawing, onAddAreaMessages, onRefreshDemoPhotos, initialMessageId, onSelectMessage, onClearMessageSelection, onBackToDrawing }) {
  const voCases = getVOCases(project);
  const caseFor = (report) => voCases.find((entry) => entry.id === report?.id);
  const orderedMessages = [...messages].sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new') || Date.parse(b.date) - Date.parse(a.date));
  const [selectedId, setSelectedId] = useState(() => initialMessageId || orderedMessages.find((message) => message.status === 'new')?.id || orderedMessages.find((message) => waiting(messageReport(project, message)))?.id || orderedMessages[0]?.id || '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [photo, setPhoto] = useState(null);
  const inboxRef = useRef(null);
  const reviewRef = useRef(null);
  useEffect(() => {
    if (!initialMessageId || !messages.some((message) => message.id === initialMessageId)) return;
    if (selectedId !== initialMessageId) { setSearch(''); setFilter('all'); setSelectedId(initialMessageId); setPhoto(null); }
    if (window.matchMedia('(max-width: 1050px)').matches) reviewRef.current?.scrollIntoView({ block: 'start' });
  }, [initialMessageId, project.id]);
  function chooseMessage(message) {
    setSelectedId(message.id); setPhoto(null); onSelectMessage?.(message.id);
    if (window.matchMedia('(max-width: 1050px)').matches) reviewRef.current?.scrollIntoView({ block: 'start' });
  }
  const shown = orderedMessages.filter((message) => {
    const report = messageReport(project, message);
    const matches = !search.trim() || `${message.sender} ${message.text} ${message.area} ${message.itemId || ''}`.toLowerCase().includes(search.trim().toLowerCase());
    return matches && (filter === 'all'
      || (filter === 'new' && message.status === 'new')
      || (filter === 'processed' && message.status === 'processed')
      || (filter === 'vo' && (message.kind === 'vo' || report?.vo))
      || (filter === 'clarification' && needsMessageClarification(message, report)));
  });
  const unavailable = Boolean(initialMessageId && !messages.some((message) => message.id === initialMessageId));
  const selected = unavailable ? null : shown.find((message) => message.id === selectedId) || shown[0];
  const report = selected ? messageReport(project, selected) : null;
  const item = project.items.find((entry) => entry.id === (report && !report.vo ? report.itemId : selected?.itemId));
  const status = selected ? statusFor(selected, report, caseFor(report)) : null;
  const voCase = caseFor(report);
  const isNew = selected?.status === 'new';
  const isVo = selected?.kind === 'vo' || Boolean(report?.vo);
  const areaLink = selected ? getAreaLinkStatus(project, selected) : null;
  const contractItems = item ? [item] : isVo ? areaLink?.linkedItems || [] : [];
  const messageSample = !isVo && item ? getWorkItemMessageSample(project, item.id) : null;
  const includedScopeUpdate = selected?.kind === 'clarification' && item?.pricingType === 'included';
  const areaMessageUpdate = getSITAreaMessageUpdate(project);
  const photoUpdate = getSITDemoPhotoUpdate(project);
  const previousDemoPhotos = (Array.isArray(selected?.demoPhotoHistory) ? selected.demoPhotoHistory : [])
    .filter((entry) => /^\/assets\/demo-[a-z0-9-]+\.jpg$/.test(entry?.photo || ''));
  const isUnclear = needsMessageClarification(selected, report) || (isNew && areaLink?.conflict);
  const newCount = messages.filter((message) => message.status === 'new').length;
  const nextMessage = orderedMessages.find((message) => message.status === 'new' && message.id !== selected?.id);
  const hasPendingReview = Boolean(report && (isVo ? !['approved', 'rejected'].includes(voCase?.status) : waiting(report)));
  const nextMessageButton = !isNew && nextMessage ? <Button className={hasPendingReview ? 'ghost' : 'primary'} icon={ArrowRight} onClick={() => { setSearch(''); setFilter('all'); chooseMessage(nextMessage); }}>Next message</Button> : null;
  function processSelectedMessage() {
    setSearch('');
    setFilter('all');
    setSelectedId(selected.id);
    onProcess?.(selected);
  }

  return <div className="whatsapp-view">
    <PageHeader title="Site updates" description="Check a worker’s message, then update progress or flag extra work." onBack={onBackToDrawing} backLabel="Back to drawing" actions={<>{areaMessageUpdate.available && areaMessageUpdate.messageCount > 0 && onAddAreaMessages && <Button icon={MessageSquare} onClick={onAddAreaMessages}>Add S.I.T. area messages</Button>}{photoUpdate.available && photoUpdate.messageCount + photoUpdate.reportCount > 0 && onRefreshDemoPhotos && <Button icon={ImagePlus} onClick={onRefreshDemoPhotos}>Use matching demo photos</Button>}</>} />
    {unavailable && <div className="notice warning"><CircleAlert size={16}/><span>This update is not available in the selected project.</span><Button onClick={onClearMessageSelection}>Show all messages</Button></div>}
    <p className="wa-demo-note">Demo inbox · no WhatsApp messages are sent.</p>
    {areaMessageUpdate.available && areaMessageUpdate.skipped.length > 0 && <details className="wa-sample-help"><summary>Some area samples need review</summary><ul>{areaMessageUpdate.skipped.map((entry, index) => <li key={`${entry.areaCode}-${index}`}><strong>{entry.areaCode}</strong> · {entry.reason}</li>)}</ul>{onOpenDrawing && <Button className="ghost" onClick={() => onOpenDrawing()}>Review area mapping</Button>}</details>}

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
          <div className="wa-panel-back wa-back-inbox"><BackButton onClick={onBackToDrawing || (() => inboxRef.current?.scrollIntoView({ block: 'start' }))}>{onBackToDrawing ? 'Back to drawing' : 'Back to messages'}</BackButton></div>
          <header className="wa-panel-header"><div><h2 id="wa-review-heading">Review update</h2><p>{selected.area || selected.location || 'Location needs confirmation'}</p></div><Badge tone={status.tone}>{status.label}</Badge></header>
          <div className="wa-review-body">
            {contractItems.length > 0 && <section className="wa-contract-context" aria-label="Contract work referenced by this update">
              <span>{isVo ? 'Related contract work for QS review' : areaLink?.conflict ? 'Contract item named in the message' : 'Contract work for this update'}</span>
              {contractItems.map((entry) => <div className="wa-contract-work" key={entry.id}><div><strong>{entry.ref} · {entry.description}</strong><small>{entry.id}{entry.sourcePage ? ` · Source page ${entry.sourcePage}` : ''}</small></div>{(onOpenContractItem || onOpenContract) && <Button className="ghost" icon={FileText} onClick={() => onOpenContractItem ? onOpenContractItem(entry.id) : onOpenContract()}>View contract item</Button>}</div>)}
              {isVo && <p>Related scope only. QS must check whether the requested extra work is covered by this contract item.</p>}
              {messageSample && <details className="wa-contract-sample"><summary>Sample worker message for this item</summary><pre>{messageSample}</pre><p>Confirm the site area and total completion before sending an update. This format does not create a claim value.</p></details>}
            </section>}
            <div className="wa-evidence-heading"><div className="avatar wa-worker-avatar">{selected.sender?.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]).join('') || 'DW'}</div><div><strong>{selected.sender}</strong><span>{selected.senderRole || 'Site worker · demo'}</span></div><time dateTime={selected.date}>{time(selected.date)}</time></div>
            <div className="wa-original-message"><div className="wa-original-label"><MessageSquare size={12} />Worker’s message</div><blockquote>{selected.text}</blockquote></div>
            <DemoPhoto src={selected.photo} alt={selected.photoAlt} className="wa-evidence-photo" onOpen={() => setPhoto({ src: selected.photo, alt: selected.photoAlt })} />
            {previousDemoPhotos.length > 0 && <details className="wa-message-details"><summary>Earlier demo illustrations</summary>{previousDemoPhotos.map((entry, index) => <Button key={`${entry.photo}-${index}`} className="ghost" aria-label={`View earlier demo illustration ${index + 1}`} onClick={() => setPhoto({ src: entry.photo, alt: entry.photoAlt })}>View earlier illustration {index + 1}</Button>)}</details>}

            <div className="wa-interpretation-heading"><h3>Suggested update</h3></div>
            <div className="wa-fields"><Field label="Location">{[selected.location, selected.area].filter(Boolean).join(' · ')}</Field><Field label="Update">{isVo ? 'Extra work' : isUnclear ? 'Needs clarification' : 'Total progress to date'}</Field>{!item && <Field label="Matched contract work" wide>Not matched — confirm with the worker</Field>}</div>
            <div className={`area-mapping-reference${areaLink?.conflict ? ' conflict' : ''}`}><div>{areaLink?.area ? <><strong>Area {areaLink.area.code} · {areaLink.area.name}</strong><p>{areaLink.linkedItems.length ? `Drawing links: ${areaLink.linkedItems.map(entry=>entry.id).join(', ')}` : 'No contract work items linked yet.'}</p>{areaLink.conflict && <p>This message names a different work item. Confirm the area or item before changing progress.</p>}</> : <span>This message has no saved drawing-area link.</span>}</div><a className="area-mapping-link" href={areaLink?.area ? `#drawing?area=${encodeURIComponent(areaLink.area.id)}` : '#drawing'} onClick={event=>{if(onOpenDrawing){event.preventDefault();onOpenDrawing(areaLink?.area?.id);}}}>View area map<ArrowRight size={13}/></a></div>

            {isVo ? <div className="wa-result wa-result-vo"><div className="wa-result-title"><Flag size={16} /><strong>{isNew ? 'Check whether this is extra work' : voCase?.status === 'approved' ? 'Extra work approved' : voCase?.status === 'rejected' ? 'Extra work rejected' : voCase?.status === 'pendingApproval' ? 'Awaiting approval' : voCase?.status === 'clarification' ? 'More information needed' : 'Saved for extra-work review'}</strong></div><p>{isNew ? 'Save this message and photo for the QS to check against the contract.' : 'Open extra-work review to check the scope, value and approval.'}</p><div className="wa-result-foot">Progress unchanged <span>·</span> {voCase?.status === 'approved' ? `Approved value: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.approvedValue)}` : voCase?.proposedValue != null ? `Proposed: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.proposedValue)}` : 'Value unknown'} <span>·</span> {voCase?.status === 'approved' ? 'Approval recorded locally' : voCase?.status === 'rejected' ? 'Rejected in local review' : 'Not approved yet'}</div></div> : isUnclear ? <div className="wa-result wa-result-unclear"><div className="wa-result-title"><CircleAlert size={16} /><strong>{includedScopeUpdate ? 'Check the included access work' : 'Ask the worker to clarify'}</strong></div><p>{needsProgressClarification(report) && report.reviewReason ? report.reviewReason : includedScopeUpdate ? 'Confirm the installed access sets, site location and inspection status with the supervisor. This is included scope; no percentage or separate value is inferred.' : selected.kind === 'clarification' ? 'Ask which work item is meant and the total percentage completed so far.' : 'Confirm the work item, total completed so far and date before updating progress.'}</p><div className="wa-result-foot">Current progress stays unchanged.</div>{(selected.status === 'clarification' || needsProgressClarification(report)) && <div className="wa-clarification-saved"><Check size={13} />{includedScopeUpdate ? 'Confirm the access-work details with the supervisor outside this demo. No message was sent.' : 'Contact the worker outside this demo, then add a clearer cumulative update. No message was sent.'}</div>}</div> : <div className={`wa-result ${report?.status === 'verified' ? 'wa-result-verified' : ''}`}>
              <div className="wa-result-title"><ListChecks size={16} /><strong>{isNew ? 'Progress change' : report?.status === 'verified' ? 'Progress verified' : report?.status === 'superseded' ? 'A newer update replaced this report' : report?.status === 'rejected' ? 'Report dismissed' : 'Update added — ready to verify'}</strong>{!isNew && report?.status !== 'rejected' && report?.status !== 'superseded' && <Check size={14} />}</div>
              <div className="wa-progress-comparison"><div><span>Worker reported</span><strong>{isNew ? <>{percent(item?.reported)}<ArrowRight size={15} /><em>{percent(selected.completion)}</em></> : percent(item?.reported)}</strong></div><div><span>Supervisor verified</span><strong className="wa-verified-number">{percent(item?.verified)}{report?.status !== 'verified' && <small>unchanged</small>}</strong></div></div>
              <div className="wa-result-foot">{isNew ? 'This replaces the reported total. Supervisor verification stays unchanged.' : report?.status === 'verified' ? 'Verification saved with the original message and photo.' : report?.status === 'rejected' ? 'Dismissed. Verified progress stays unchanged.' : report?.status === 'superseded' ? 'Use the newer update when reviewing progress.' : 'Next, ask the supervisor to verify the update.'}</div>
            </div>}

            <details className="wa-message-details"><summary>Message details</summary><p><strong>Message:</strong> {selected.id}{report && <><br /><strong>Report:</strong> {report.id}</>}<br /><strong>Interpretation:</strong> Predefined demo fields; AI is not connected.</p>{selected.processingNote && <p>{selected.processingNote}</p>}</details>
            {!project.locked && !isVo && !isUnclear && <div className="wa-baseline-note"><LockKeyhole size={13} /><span>Confirm the contract first so the supervisor can verify progress.</span><button type="button" onClick={() => onOpenContract?.()}>Review contract<ChevronRight size={12} /></button></div>}
          </div>
          <footer className="wa-review-footer"><FormActions secondary={<span className="wa-footer-note">{isNew ? 'Check the message before adding it.' : isUnclear ? 'Waiting for a clearer update.' : isVo && hasPendingReview ? 'Next: review the extra work.' : waiting(report) && !isVo ? 'Next: supervisor verification.' : 'Saved with this project.'}</span>}>
            {isNew ? <Button className="primary" icon={isVo ? Flag : isUnclear ? MessageSquare : Check} onClick={processSelectedMessage}>{isVo ? 'Flag extra work' : isUnclear ? 'Needs clarification' : 'Add progress update'}</Button> : <>
              {hasPendingReview && nextMessageButton}
              {report ? isVo ? <Button className={hasPendingReview || !nextMessage ? 'primary' : ''} icon={ArrowRight} onClick={() => onOpenVO?.(report.id)}>Review extra work</Button> : needsProgressClarification(report) ? <Button icon={MessageSquare} onClick={() => onReview?.(report)}>View clarification</Button> : waiting(report) ? <><Button className="ghost" onClick={() => onOpenCompletion?.(false)}>View progress</Button><Button className="primary" icon={ShieldCheck} onClick={() => onReview?.(report)}>Verify progress</Button></> : <Button icon={ArrowRight} onClick={() => onOpenCompletion?.(false)}>View progress</Button> : <Badge tone="amber">Clarification needed</Badge>}
              {!hasPendingReview && nextMessageButton}
            </>}
          </FormActions></footer>
        </section> : <section className="wa-review wa-no-selection"><MessageSquare size={30} /><h3>Select a message</h3><p>Its photo and proposed update will appear here.</p></section>}
      </div>


    </>}

    {photo && <div className="wa-photo-modal"><Modal title="Demo site photo" description="Generated illustration · not evidence from the actual project" onClose={() => setPhoto(null)} footer={<Button onClick={() => setPhoto(null)}>Done</Button>}><img src={photo.src} alt={photo.alt || 'Generated site photograph for the prototype'} /></Modal></div>}
  </div>;
}
