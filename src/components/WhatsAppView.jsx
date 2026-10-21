import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, CircleAlert, FileText, Flag, ImageOff, ImagePlus, ListChecks, LockKeyhole, MapPin, MessageSquare, Search, ShieldCheck, X, ZoomIn } from 'lucide-react';
import { BackButton, Badge, Button, FormActions, FormField, Modal, PageHeader, formatTime, formatMoney, Input, NativeSelect } from './ui.jsx';
import { getVOCases } from '../data/vo.js';
import { getMessageReport as messageReport } from '../data/whatsapp.js';
import { getAreaLinkStatus } from '../data/drawing-mapping.js';
import { getWorkItemMessageSample } from '../data/contract-work-links.js';
import { getSITAreaMessageUpdate } from '../data/sit-area-messages.js';
import { getSITDemoPhotoUpdate } from '../data/sit-demo-photos.js';
import { isReviewableProgressReport, needsProgressClarification, needsMessageClarification } from '../data/report-status.js';
import { getMessageSummary } from '../data/message-summary.js';
import { getMessageReviewStatus as statusFor, isNewInboxMessage, matchesInboxFilter } from '../data/message-inbox.js';
import { getMessageClarification, getMessageClarificationEligibility } from '../data/whatsapp-clarification.js';
import { WhatsAppClarification } from './WhatsAppClarification.jsx';
import './whatsapp.css';

const waiting = isReviewableProgressReport;
const percent = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? `${value}%` : 'Not recorded';
const time = (value) => value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Demo message';

function DemoPhoto({ src, alt, className = '', onOpen }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src) return onOpen ? <div className="wa-photo-unavailable wa-evidence-photo"><ImageOff size={22}/><span>No photo attached to this update</span></div> : null;
  if (failed) return <div className={`wa-photo-unavailable ${className}`}><ImageOff size={22} /><span>Demo photo unavailable</span></div>;
  const photo = <img src={src} alt={alt || 'Generated construction site photo for demonstration'} onError={() => setFailed(true)} loading="lazy" />;
  return onOpen ? <button type="button" className={`wa-photo ${className}`} aria-label="Enlarge demo site photo" onClick={onOpen}>{photo}<span className="wa-photo-zoom"><ZoomIn size={13} />View photo</span><span className="wa-photo-demo">Generated demo photo</span></button> : <span className={`wa-photo ${className}`}>{photo}</span>;
}

export function WhatsAppView({ project, messages = [], onProcess, onReview, onSaveClarificationRequest, onSaveClarificationReply, onOpenCompletion, onOpenContract, onOpenContractItem, onOpenVO, onOpenDrawing, onAddAreaMessages, onRefreshDemoPhotos, initialMessageId, onSelectMessage, onClearMessageSelection, onBackToDrawing, onBackToOverview }) {
  const voCases = getVOCases(project);
  const caseFor = (report) => voCases.find((entry) => entry.id === report?.id);
  const orderedMessages = [...messages].sort((a, b) => Number(isNewInboxMessage(b, messageReport(project, b), getMessageClarification(project, b.id))) - Number(isNewInboxMessage(a, messageReport(project, a), getMessageClarification(project, a.id))) || Date.parse(b.date) - Date.parse(a.date));
  const [selectedId, setSelectedId] = useState(() => initialMessageId || orderedMessages.find((message) => isNewInboxMessage(message, messageReport(project, message), getMessageClarification(project, message.id)))?.id || orderedMessages.find((message) => waiting(messageReport(project, message)))?.id || orderedMessages[0]?.id || '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [photo, setPhoto] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(Boolean(initialMessageId));
  const searchId = useId();
  const messageRefs = useRef(new Map());
  const reviewHeadingRef = useRef(null);
  const restoreInboxFocus = useRef(false);
  const inboxRef = useRef(null);
  const reviewRef = useRef(null);
  useEffect(() => {
    if (!initialMessageId) { setReviewOpen(false); return; }
    if (!messages.some((message) => message.id === initialMessageId)) return;
    if (selectedId !== initialMessageId) { setSearch(''); setFilter('all'); setSelectedId(initialMessageId); setPhoto(null); }
    setReviewOpen(true);
  }, [initialMessageId, project.id]);
  function chooseMessage(message) {
    setSelectedId(message.id); setPhoto(null); setReviewOpen(true); onSelectMessage?.(message.id);
  }
  const shown = orderedMessages.filter((message) => {
    const report = messageReport(project, message);
    const matches = !search.trim() || `${message.sender} ${message.text} ${message.area} ${message.itemId || ''}`.toLowerCase().includes(search.trim().toLowerCase());
    return matches && matchesInboxFilter(filter, message, report, getMessageClarification(project, message.id));
  });
  const unavailable = Boolean(initialMessageId && !messages.some((message) => message.id === initialMessageId));
  const selected = unavailable ? null : shown.find((message) => message.id === selectedId) || shown[0];
  const report = selected ? messageReport(project, selected) : null;
  const item = project.items.find((entry) => entry.id === (report && !report.vo ? report.itemId : selected?.itemId));
  const clarification = selected ? getMessageClarification(project, selected.id) : null;
  const status = selected ? statusFor(selected, report, caseFor(report), clarification) : null;
  const voCase = caseFor(report);
  const isNew = isNewInboxMessage(selected, report, clarification);
  const isVerified = ['verified', 'approved'].includes(report?.status);
  const selectedSummary = selected ? getMessageSummary(selected) : null;
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
  const showClarification = Boolean(selected && (clarification || getMessageClarificationEligibility(project, selected.id).eligible));
  const newCount = messages.filter((message) => isNewInboxMessage(message, messageReport(project, message), getMessageClarification(project, message.id))).length;
  const nextMessage = orderedMessages.find((message) => isNewInboxMessage(message, messageReport(project, message), getMessageClarification(project, message.id)) && message.id !== selected?.id);
  const hasPendingReview = Boolean(report && (isVo ? !['approved', 'rejected'].includes(voCase?.status) : waiting(report)));
  const nextMessageButton = !isNew && nextMessage ? <Button className={hasPendingReview ? 'ghost' : 'primary'} icon={ArrowRight} onClick={() => { setSearch(''); setFilter('all'); chooseMessage(nextMessage); }}>Next message</Button> : null;
  function processSelectedMessage() {
    setSearch('');
    setFilter('all');
    setSelectedId(selected.id);
    setReviewOpen(true);
    onProcess?.(selected);
  }
  function saveClarification(messageId, fields, callback) {
    const result = callback?.(messageId, fields);
    if (result && result.outcome !== 'invalid') {
      setSearch(''); setFilter('all'); setSelectedId(messageId); setReviewOpen(true);
      onSelectMessage?.(messageId);
    }
    return result;
  }
  function openThreadMessage(messageId) {
    const message = messages.find((entry) => entry.id === messageId);
    if (!message) return;
    setSearch(''); setFilter('all'); chooseMessage(message);
  }

  function backToMessages() {
    restoreInboxFocus.current = true;
    setReviewOpen(false);
    setPhoto(null);
  }
  useEffect(() => {
    if (!window.matchMedia('(max-width: 1050px)').matches) return;
    if (reviewOpen && selected) {
      reviewRef.current?.scrollIntoView({ block: 'start' });
      reviewHeadingRef.current?.focus({ preventScroll: true });
    } else if (restoreInboxFocus.current) {
      restoreInboxFocus.current = false;
      messageRefs.current.get(selected?.id)?.focus();
    }
  }, [reviewOpen, selected?.id]);
  const filters = [['all', 'All messages'], ['new', 'New messages'], ['review', 'To check'], ['vo', 'Extra work'], ['clarification', 'Needs clarification'], ['processed', 'Saved messages']];
  const filterCount = (key) => messages.filter((message) => matchesInboxFilter(key, message, messageReport(project, message), getMessageClarification(project, message.id))).length;

  return <div className={`whatsapp-view${reviewOpen ? ' wa-review-open' : ''}`}>
    <PageHeader title="WhatsApp messages" description="Review worker messages and photos before adding progress or flagging extra work." onBack={onBackToOverview || onBackToDrawing} backLabel={onBackToOverview ? 'Back to overview' : 'Back to drawing'} />
    {unavailable && <div className="notice warning"><CircleAlert size={16}/><span>This update is not available in the selected project.</span><Button onClick={onClearMessageSelection}>Show all messages</Button></div>}
    {areaMessageUpdate.available && areaMessageUpdate.skipped.length > 0 && <details className="wa-sample-help"><summary>Some area samples need review</summary><ul>{areaMessageUpdate.skipped.map((entry, index) => <li key={`${entry.areaCode}-${index}`}><strong>{entry.areaCode}</strong> · {entry.reason}</li>)}</ul>{onOpenDrawing && <Button className="ghost" onClick={() => onOpenDrawing()}>Review area mapping</Button>}</details>}

    {!messages.length ? <div className="project-empty empty-state"><MessageSquare size={32} /><h3>No demo messages for this project</h3><p>{project.items.length ? 'Choose a demo project in the project dropdown to try site updates.' : 'Add contract work first, or choose a demo project to try site updates.'}</p><Button icon={FileText} onClick={() => onOpenContract?.()}>Review contract</Button></div> : <>
      <div className="wa-list-controls">
        <div className="wa-filter-fields">
          <div className="form-field"><label className="form-field-label" htmlFor={searchId}>Find message</label><div className="search-box"><Search size={16} aria-hidden="true"/><Input id={searchId} aria-label="Search site updates" placeholder="Search messages, work items or areas…" value={search} onChange={(event) => setSearch(event.target.value)}/>{search && <button type="button" className="wa-clear-search" aria-label="Clear message search" onClick={() => setSearch('')}><X size={14}/></button>}</div></div>
          <FormField label="Review status"><NativeSelect aria-label="Filter site updates" value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map(([key,label]) => <option value={key} key={key}>{label} ({filterCount(key)})</option>)}</NativeSelect></FormField>
        </div>
        <div className="wa-list-tools"><span>{shown.length} of {messages.length} messages · {newCount} new to review</span><div>{(search || filter !== 'all') && <Button className="ghost" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button>}{((areaMessageUpdate.available && areaMessageUpdate.messageCount > 0 && onAddAreaMessages) || (photoUpdate.available && photoUpdate.messageCount + photoUpdate.reportCount > 0 && onRefreshDemoPhotos)) && <details className="wa-demo-options"><summary>Demo options</summary><div>{areaMessageUpdate.available && areaMessageUpdate.messageCount > 0 && onAddAreaMessages && <Button icon={MessageSquare} onClick={onAddAreaMessages}>Add S.I.T. area messages</Button>}{photoUpdate.available && photoUpdate.messageCount + photoUpdate.reportCount > 0 && onRefreshDemoPhotos && <Button icon={ImagePlus} onClick={onRefreshDemoPhotos}>Use matching demo photos</Button>}</div></details>}</div></div>
      </div>
      <div className="wa-workspace">
        <section ref={inboxRef} className="wa-inbox" aria-labelledby="wa-inbox-heading">
          <h2 className="wa-list-heading" id="wa-inbox-heading">Inbox<span>New messages first</span></h2>
          <div className="wa-message-list" aria-label="Messages for selected project">{shown.length ? shown.map((message) => {
            const linked = messageReport(project, message);
            const state = statusFor(message, linked, caseFor(linked), getMessageClarification(project, message.id));
            const summary = getMessageSummary(message);
            const area = message.area || message.location || 'Area unclear';
            return <button type="button" className={`wa-message${selected?.id === message.id ? ' selected' : ''}`} key={message.id} ref={(node) => { if (node) messageRefs.current.set(message.id,node); else messageRefs.current.delete(message.id); }} aria-label={`Open message: ${area}, ${summary.title}, ${time(message.date)}`} aria-pressed={selected?.id === message.id} onClick={() => chooseMessage(message)}>
              <DemoPhoto src={message.photo} alt={message.photoAlt} className="wa-message-thumb"/>
              <div className="wa-message-copy">
                <div className="wa-message-title"><strong>{summary.title}</strong><Badge tone={state.tone}>{state.label}</Badge></div>
                <span className="wa-message-area"><MapPin size={12} aria-hidden="true"/>{area}{message.itemId && <span>· {message.itemId}</span>}</span>
                <p className="wa-message-excerpt">{summary.detail}</p>
                <div className="wa-message-meta"><span>{message.sender}</span><time dateTime={message.date}>{time(message.date)}</time></div>
              </div><ChevronRight className="wa-open-message" size={16} aria-hidden="true"/>
            </button>;
          }) : <div className="wa-list-empty"><Search size={24} /><strong>No matching messages</strong><p>Try another search or status.</p><Button className="small" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button></div>}</div>

          <p className="wa-inbox-note">Demo inbox · no WhatsApp messages are sent.</p>
        </section>

        {selected ? <section ref={reviewRef} className="wa-review" aria-labelledby="wa-review-heading">
          <div className="wa-panel-back wa-back-inbox"><BackButton onClick={backToMessages}>Back to messages</BackButton></div>
          <header className="wa-panel-header"><div><h2 id="wa-review-heading" ref={reviewHeadingRef} tabIndex={-1}>{selectedSummary.title}</h2><p>{selected.area || selected.location || 'Location needs confirmation'}</p></div><Badge tone={status.tone}>{status.label}</Badge></header>
          <div className="wa-review-body">
            <div className="wa-evidence-heading"><div className="avatar wa-worker-avatar">{selected.sender?.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]).join('') || 'DW'}</div><div><strong>{selected.sender}</strong><span>{selected.senderRole || 'Site worker · demo'}</span></div><time dateTime={selected.date}>{time(selected.date)}</time></div>
            <div className="wa-original-message"><div className="wa-original-label"><MessageSquare size={12} />Worker’s message</div><blockquote>{selected.text}</blockquote></div>
            <DemoPhoto src={selected.photo} alt={selected.photoAlt} className="wa-evidence-photo" onOpen={() => setPhoto({ src: selected.photo, alt: selected.photoAlt })} />
            {previousDemoPhotos.length > 0 && <details className="wa-message-details" key={`${selected.id}-photos`}><summary>Earlier demo illustrations</summary>{previousDemoPhotos.map((entry, index) => <Button key={`${entry.photo}-${index}`} className="ghost" aria-label={`View earlier demo illustration ${index + 1}`} onClick={() => setPhoto({ src: entry.photo, alt: entry.photoAlt })}>View earlier illustration {index + 1}</Button>)}</details>}

            {showClarification ? <WhatsAppClarification project={project} message={selected}
              onSaveRequest={onSaveClarificationRequest ? (messageId, fields) => saveClarification(messageId, fields, onSaveClarificationRequest) : undefined}
              onSaveReply={onSaveClarificationReply ? (messageId, fields) => saveClarification(messageId, fields, onSaveClarificationReply) : undefined}
              onProcess={onProcess ? (reply) => { setSearch(''); setFilter('all'); onProcess(reply); } : undefined}
              onReview={onReview} onOpenCompletion={onOpenCompletion} onSelectMessage={openThreadMessage} /> : <>
            <div className="wa-interpretation-heading"><h3>{isNew ? 'Proposed update' : 'Update result'}</h3></div>
            {!item && <p className="wa-unmatched-note">{isVo ? 'Contract match needs QS review. Related area links are context only.' : 'No matched work item. Confirm the work with the worker before changing progress.'}</p>}
            {areaLink?.conflict && <div className="notice warning"><CircleAlert size={16}/><span>Area {areaLink.area.code} is linked to {areaLink.linkedItems.map((entry) => entry.id).join(', ') || 'no work items'}, while this message names {selected.itemId}. Confirm the area or work item before changing progress.</span></div>}

            {isVo ? <div className="wa-result wa-result-vo"><div className="wa-result-title"><Flag size={16} /><strong>{isNew ? 'Check whether this is extra work' : voCase?.status === 'approved' ? 'Extra work approved' : voCase?.status === 'rejected' ? 'Extra work rejected' : voCase?.status === 'pendingApproval' ? 'Awaiting approval' : voCase?.status === 'clarification' ? 'More information needed' : 'Saved for extra-work review'}</strong></div><p>{isNew ? 'Save this message and photo for the QS to check against the contract.' : 'Open extra-work review to check the scope, value and approval.'}</p><div className="wa-result-foot">Progress unchanged <span>·</span> {voCase?.status === 'approved' ? `Approved value: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.approvedValue)}` : voCase?.proposedValue != null ? `Proposed: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.proposedValue)}` : 'Value unknown'} <span>·</span> {voCase?.status === 'approved' ? 'Approval recorded locally' : voCase?.status === 'rejected' ? 'Rejected in local review' : 'Not approved yet'}</div></div> : isUnclear ? <div className="wa-result wa-result-unclear"><div className="wa-result-title"><CircleAlert size={16} /><strong>{includedScopeUpdate ? 'Check the included access work' : 'Ask the worker to clarify'}</strong></div><p>{needsProgressClarification(report) && report.reviewReason ? report.reviewReason : includedScopeUpdate ? 'Confirm the installed access sets, site location and inspection status with the supervisor. This is included scope; no percentage or separate value is inferred.' : selected.kind === 'clarification' ? 'Ask which work item is meant and the total percentage completed so far.' : 'Confirm the work item, total completed so far and date before updating progress.'}</p><div className="wa-result-foot">Current progress stays unchanged.</div>{(selected.status === 'clarification' || needsProgressClarification(report)) && <div className="wa-clarification-saved"><Check size={13} />{includedScopeUpdate ? 'Confirm the access-work details with the supervisor outside this demo. No message was sent.' : 'Contact the worker outside this demo, then add a clearer cumulative update. No message was sent.'}</div>}</div> : <div className={`wa-result ${isVerified ? 'wa-result-verified' : ''}`}>
              <div className="wa-result-title"><ListChecks size={16} /><strong>{isNew ? 'Progress change' : isVerified ? 'Progress verified' : report?.status === 'superseded' ? 'A newer update replaced this report' : report?.status === 'rejected' ? 'Report dismissed' : 'Update added — ready to verify'}</strong>{!isNew && report?.status !== 'rejected' && report?.status !== 'superseded' && <Check size={14} />}</div>
              <div className="wa-progress-comparison"><div><span>{isNew ? 'Reported total' : 'Current reported total'}</span><strong>{isNew ? <>{percent(item?.reported)}<ArrowRight size={15} /><em>{percent(selected.completion)}</em></> : percent(item?.reported)}</strong></div><div><span>Verified total</span><strong className="wa-verified-number">{percent(item?.verified)}{!isVerified && <small>unchanged</small>}</strong></div></div>
              <div className="wa-result-foot">{isNew ? 'This replaces the reported total. Supervisor verification stays unchanged.' : isVerified ? 'Verification saved with the original message and photo.' : report?.status === 'rejected' ? 'Dismissed. Verified progress stays unchanged.' : report?.status === 'superseded' ? 'Use the newer update when reviewing progress.' : 'Next, ask the supervisor to verify the update.'}</div>
            </div>}
            </>}

            <details className="wa-context-details" key={`${selected.id}-context`}><summary>Contract &amp; drawing links</summary><div>
            {contractItems.length > 0 && <section className="wa-contract-context" aria-label="Contract work referenced by this update">
              <span>{isVo ? 'Related contract work for QS review' : areaLink?.conflict ? 'Contract item named in the message' : 'Contract work for this update'}</span>
              {contractItems.map((entry) => <div className="wa-contract-work" key={entry.id}><div><strong>{entry.ref} · {entry.description}</strong><small>{entry.id}{entry.sourcePage ? ` · Source page ${entry.sourcePage}` : ''}</small></div>{(onOpenContractItem || onOpenContract) && <Button className="ghost" icon={FileText} onClick={() => onOpenContractItem ? onOpenContractItem(entry.id) : onOpenContract()}>View contract item</Button>}</div>)}
              {isVo && <p>Related scope only. QS must check whether the requested extra work is covered by this contract item.</p>}
              {messageSample && <details className="wa-contract-sample"><summary>Sample worker message for this item</summary><pre>{messageSample}</pre><p>Confirm the site area and total completion before sending an update. This format does not create a claim value.</p></details>}
            </section>}
            <div className={`area-mapping-reference${areaLink?.conflict ? ' conflict' : ''}`}><div>{areaLink?.area ? <><strong>Area {areaLink.area.code} · {areaLink.area.name}</strong><p>{areaLink.linkedItems.length ? `Drawing links: ${areaLink.linkedItems.map(entry=>entry.id).join(', ')}` : 'No contract work items linked yet.'}</p>{areaLink.conflict && <p>This message names a different work item. Confirm the area or item before changing progress.</p>}</> : <span>This message has no saved drawing-area link.</span>}</div><a className="area-mapping-link" href={areaLink?.area ? `#drawing?area=${encodeURIComponent(areaLink.area.id)}` : '#drawing'} onClick={event=>{if(onOpenDrawing){event.preventDefault();onOpenDrawing(areaLink?.area?.id);}}}>View area map<ArrowRight size={13}/></a></div>
            </div></details>
            <details className="wa-message-details"><summary>Message details</summary><p><strong>Message:</strong> {selected.id}{report && <><br /><strong>Report:</strong> {report.id}</>}<br /><strong>Interpretation:</strong> Predefined demo fields; AI is not connected.</p>{selected.processingNote && <p>{selected.processingNote}</p>}</details>
            {!showClarification && !project.locked && !isVo && !isUnclear && <div className="wa-baseline-note"><LockKeyhole size={13} /><span>Confirm the contract first so the supervisor can verify progress.</span><button type="button" onClick={() => onOpenContract?.()}>Review contract<ChevronRight size={12} /></button></div>}
          </div>
          {!showClarification && <footer className="wa-review-footer"><FormActions secondary={hasPendingReview && nextMessageButton ? nextMessageButton : <span className="wa-footer-note">{isNew ? 'Check the message before adding it.' : isUnclear ? 'Waiting for a clearer update.' : isVo && hasPendingReview ? 'Next: review the extra work.' : waiting(report) && !isVo ? 'Next: supervisor verification.' : 'Saved with this project.'}</span>}>
            {isNew ? <Button className="primary" icon={isVo ? Flag : isUnclear ? MessageSquare : Check} onClick={processSelectedMessage}>{isVo ? 'Flag extra work' : isUnclear ? 'Needs clarification' : 'Add progress update'}</Button> : <>
              {report ? isVo ? <Button className={hasPendingReview || !nextMessage ? 'primary' : ''} icon={ArrowRight} onClick={() => onOpenVO?.(report.id)}>Review extra work</Button> : needsProgressClarification(report) ? <Button icon={MessageSquare} onClick={() => onReview?.(report)}>View clarification</Button> : waiting(report) ? <Button className="primary" icon={ShieldCheck} onClick={() => onReview?.(report)}>Review progress</Button> : <Button icon={ArrowRight} onClick={() => onOpenCompletion?.(item?.id, areaLink?.area?.id, selected.id)}>View progress</Button> : <Badge tone="amber">Clarification needed</Badge>}
              {!hasPendingReview && nextMessageButton}
            </>}
          </FormActions></footer>}
        </section> : <section className="wa-review wa-no-selection"><MessageSquare size={30} /><h3>Select a message</h3><p>Its photo and proposed update will appear here.</p></section>}
      </div>


    </>}

    {photo && <div className="wa-photo-modal"><Modal title="Demo site photo" description="Generated illustration · not evidence from the actual project" onClose={() => setPhoto(null)} footer={<Button onClick={() => setPhoto(null)}>Done</Button>}><img src={photo.src} alt={photo.alt || 'Generated site photograph for the prototype'} /></Modal></div>}
  </div>;
}
