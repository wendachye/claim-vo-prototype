import type { Project, WhatsAppMessage, SiteReport, VOCase, DrawingMapping, WorkItem } from '../types/domain';
import type { ClarificationResult, WhatsAppClarificationProps } from './WhatsAppClarification';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, CircleAlert, FileText, Flag, ImageOff, ImagePlus, ListChecks, LockKeyhole, MapPin, MessageSquare, Search, ShieldCheck, X, ZoomIn } from 'lucide-react';
import { BackButton, Badge, Button, FormActions, FormField, Modal, PageHeader, formatTime, formatMoney, formatNumber, Input, SelectField } from './ui';
import { getVOCases, getVOClaimEligibility } from '../data/vo';
import { getMessageReport as messageReport } from '../data/whatsapp';
import { getAreaLinkStatus, getDrawingMapping } from '../data/drawing-mapping';
import { getAreaAllocationSnapshot, getAreaItemProgress, getItemAreaAllocation, getItemAreaRollup } from '../data/area-allocations';
import { getWorkItemMessageSample } from '../data/contract-work-links';
import { getSITAreaMessageUpdate } from '../data/sit-area-messages';
import { getSITDemoPhotoUpdate } from '../data/sit-demo-photos';
import { isReviewableProgressReport, needsProgressClarification, needsMessageClarification } from '../data/report-status';
import { getMessageSummary } from '../data/message-summary';
import { getMessageReviewStatus as statusFor, isNewInboxMessage, matchesInboxFilter } from '../data/message-inbox';
import { getMessageClarification, getMessageClarificationEligibility } from '../data/whatsapp-clarification';
import { WhatsAppClarification } from './WhatsAppClarification';
import { MessageMatchReviewPanel, MessageMatchReviewDetails } from './MessageMatchReview';
import { getMessageMatchContext } from '../data/message-match';
import './whatsapp.css';
import { ActionMenu } from './ActionMenu';

const waiting = isReviewableProgressReport;
const percent = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? `${value}%` : 'Not recorded';
const time = (value?: string | null) => value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Demo message';

function DemoPhoto({ src, alt, className = '', onOpen }: { src?: string | null; alt?: string | null; className?: string; onOpen?: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src) return onOpen ? <div className="wa-photo-unavailable wa-evidence-photo"><ImageOff size={22}/><span>No photo attached to this update</span></div> : null;
  if (failed) return <div className={`wa-photo-unavailable ${className}`}><ImageOff size={22} /><span>Demo photo unavailable</span></div>;
  const photo = <img src={src} alt={alt || 'Generated construction site photo for demonstration'} onError={() => setFailed(true)} loading="lazy" />;
  return onOpen ? <button type="button" className={`wa-photo ${className}`} aria-label="Enlarge demo site photo" onClick={onOpen}>{photo}<span className="wa-photo-zoom"><ZoomIn size={13} />View photo</span><span className="wa-photo-demo">Generated demo photo</span></button> : <span className={`wa-photo ${className}`}>{photo}</span>;
}

interface DemoPhotoRecord { photo: string; photoAlt?: string }
interface WhatsAppViewProps { project: Project; messages?: WhatsAppMessage[]; initialMessageId?: string | null; onProcess?: (message: WhatsAppMessage) => void; onSaveMatch?: (messageId:string,fields:{itemId:string;areaId:string;reason:string})=>{outcome:string;error?:string}|undefined; onStartMatchDemo?:()=>void; onReview?: (report: SiteReport) => void; onSaveClarificationRequest?: WhatsAppClarificationProps['onSaveRequest']; onSaveClarificationReply?: WhatsAppClarificationProps['onSaveReply']; onOpenCompletion?: (itemId?: string | null, areaId?: string, messageId?: string) => void; onOpenContract?: () => void; onOpenContractItem?: (id: string) => void; onOpenVO?: (id: string) => void; onOpenDrawing?: (areaId?: string) => void; onAddAreaMessages?: () => void; onRefreshDemoPhotos?: () => void; onSelectMessage?: (id: string) => void; onClearMessageSelection?: () => void; onBackToDrawing?: () => void; onBackToOverview?: () => void }

export function WhatsAppView({ project, messages = [], onProcess, onReview, onSaveClarificationRequest, onSaveClarificationReply, onOpenCompletion, onOpenContract, onOpenContractItem, onOpenVO, onOpenDrawing, onAddAreaMessages, onRefreshDemoPhotos, initialMessageId, onSelectMessage, onClearMessageSelection, onBackToDrawing, onBackToOverview, onSaveMatch, onStartMatchDemo }: WhatsAppViewProps) {
  const voCases: VOCase[] = getVOCases(project);
  const caseFor = (report?: SiteReport | null) => voCases.find((entry) => entry.id === report?.id);
  const unresolvedArea = (message: WhatsAppMessage, report?: SiteReport | null) => !report && !getMessageClarification(project, message.id)?.reply && (getAreaLinkStatus(project, message).ambiguous || getAreaLinkStatus(project, message).blocked);
  const inboxStatus = (message: WhatsAppMessage, report?: SiteReport | null) => unresolvedArea(message, report)
    ? { label: 'Needs clarification', tone: 'amber' } : statusFor(message, report, caseFor(report), getMessageClarification(project, message.id));
  const inFilter = (key: string, message: WhatsAppMessage, report?: SiteReport | null) => key === 'clarification' && unresolvedArea(message, report)
    || matchesInboxFilter(key, message, report, getMessageClarification(project, message.id));
  const orderedMessages = [...messages].sort((a, b) => Number(isNewInboxMessage(b, messageReport(project, b), getMessageClarification(project, b.id))) - Number(isNewInboxMessage(a, messageReport(project, a), getMessageClarification(project, a.id))) || Date.parse(b.date) - Date.parse(a.date));
  const [selectedId, setSelectedId] = useState(() => initialMessageId || orderedMessages.find((message) => isNewInboxMessage(message, messageReport(project, message), getMessageClarification(project, message.id)))?.id || orderedMessages.find((message) => waiting(messageReport(project, message)))?.id || orderedMessages[0]?.id || '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [matchEditing, setMatchEditing] = useState<{messageId:string;editing:boolean}|null>(null);
  const [photo, setPhoto] = useState<{ src?: string | null; alt?: string | null } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(Boolean(initialMessageId));
  const searchId = useId();
  const messageRefs = useRef(new Map<string, HTMLButtonElement>());
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const restoreInboxFocus = useRef(false);
  const inboxRef = useRef<HTMLElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!initialMessageId) { setReviewOpen(false); return; }
    if (!messages.some((message) => message.id === initialMessageId)) return;
    if (selectedId !== initialMessageId) { setSearch(''); setFilter('all'); setSelectedId(initialMessageId); setPhoto(null); }
    setReviewOpen(true);
  }, [initialMessageId, project.id]);
  function chooseMessage(message: WhatsAppMessage) {
    setSelectedId(message.id); setPhoto(null); setReviewOpen(true); onSelectMessage?.(message.id);
  }
  const shown = orderedMessages.filter((message) => {
    const report = messageReport(project, message);
    const referencedItem = project.items.find((entry) => entry.id === (report && !report.vo ? report.itemId : message.itemId));
    const matches = !search.trim() || `${message.sender} ${message.text} ${message.area} ${message.itemId || ''} ${referencedItem?.ref || ''} ${referencedItem?.description || ''}`.toLowerCase().includes(search.trim().toLowerCase());
    return matches && inFilter(filter, message, report);
  });
  const unavailable = Boolean(initialMessageId && !messages.some((message) => message.id === initialMessageId));
  const selected = unavailable ? null : messages.find((message) => message.id === selectedId) || shown[0];
  const selectionOutsideFilters = Boolean(selected && !shown.some((message) => message.id === selected.id));
  const report: SiteReport | null = selected ? messageReport(project, selected) : null;
  const matchContext = selected?.matchSuggestion ? getMessageMatchContext(project, selected.id) : null;
  const matchFields = matchContext?.review?.fields || matchContext?.suggestion?.fields;
  const routeMessage = matchContext?.effectiveMessage || (selected && matchContext?.eligible && matchFields ? { ...selected, itemId:matchFields.itemId, areaId:matchFields.areaId, area:getDrawingMapping(project).areas.find(area=>area.id===matchFields.areaId)?.code || selected.area, areaMapping:undefined, areaProgress:undefined } : selected);
  const item = project.items.find((entry) => entry.id === (report && !report.vo ? report.itemId : routeMessage?.itemId));
  const clarification = selected ? getMessageClarification(project, selected.id) : null;
  const selectedIsReply = Boolean(selected && clarification?.reply?.id === selected.id);
  const status = selected ? inboxStatus(selected, report) : null;
  const voCase = caseFor(report);
  const isNew = isNewInboxMessage(selected, report, clarification);
  const isVerified = ['verified', 'approved'].includes(report?.status || '');
  const selectedSummary = selected ? getMessageSummary(selected) : null;
  const isVo = selected?.kind === 'vo' || Boolean(report?.vo);
  const areaLink = selected ? getAreaLinkStatus(project, report || routeMessage) : null;
  const sourceAreaLink = selected ? getAreaLinkStatus(project, selected) : null;
  const areaAmbiguous = Boolean(!report && !clarification?.reply && sourceAreaLink?.ambiguous);
  const areaBlocked = Boolean(!report && !clarification?.reply && sourceAreaLink?.blocked);
  const allocation = item && !isVo ? getItemAreaAllocation(project, item.id) : null;
  // A saved report keeps its original scope. Today's map must never turn an
  // older whole-item observation into a new area observation.
  const areaProgress = report ? report.areaProgress : allocation?.split && item && areaLink?.area
    ? getAreaAllocationSnapshot(project, areaLink.area.id, item.id) : null;
  const legacyScope = Boolean(report && allocation?.split && !report.areaProgress);
  const areaReported = areaProgress && item ? getAreaItemProgress(project, areaProgress.areaId, item.id, 'reported').completion : null;
  const areaVerified = areaProgress && item ? getAreaItemProgress(project, areaProgress.areaId, item.id, 'verified').completion : null;
  const currentReported = areaProgress ? areaReported : item?.reported;
  const currentVerified = areaProgress ? areaVerified : item?.verified;
  const overallReported = allocation?.split && item ? getItemAreaRollup(project, item.id, 'reported').completion : item?.reported;
  const overallVerified = allocation?.split && item ? getItemAreaRollup(project, item.id, 'verified').completion : item?.verified;
  const contractItems: WorkItem[] = item ? [item] : isVo ? areaLink?.linkedItems || [] : [];
  const messageSample = !isVo && item ? getWorkItemMessageSample(project, item.id) : null;
  const includedScopeUpdate = selected?.kind === 'clarification' && item?.pricingType === 'included';
  const areaMessageUpdate = getSITAreaMessageUpdate(project);
  const photoUpdate = getSITDemoPhotoUpdate(project);
  const previousDemoPhotos: DemoPhotoRecord[] = (Array.isArray(selected?.demoPhotoHistory) ? selected.demoPhotoHistory : [])
    .filter((entry) => /^\/assets\/demo-[a-z0-9-]+\.jpg$/.test(entry?.photo || ''));
  const needsMatchConfirmation = Boolean(isNew && matchContext?.eligible && !matchContext.clarificationRequired);
  const editingMatch = Boolean(matchEditing && matchEditing.messageId === selected?.id && matchEditing.editing);
  const isUnclear = matchContext?.clarificationRequired || areaAmbiguous || areaBlocked || needsMessageClarification(selected, report) || (!needsMatchConfirmation && isNew && (areaLink?.conflict || allocation?.split && !areaProgress));
  const showClarification = Boolean(selected && (clarification || getMessageClarificationEligibility(project, selected.id).eligible));
  const newCount = messages.filter((message) => isNewInboxMessage(message, messageReport(project, message), getMessageClarification(project, message.id))).length;
  const nextMessage = orderedMessages.find((message) => isNewInboxMessage(message, messageReport(project, message), getMessageClarification(project, message.id)) && message.id !== selected?.id);
  const voEligibility = voCase ? getVOClaimEligibility(voCase) : null;
  const needsClaimEligibilityReview = voCase?.status === 'approved' && voEligibility?.status !== 'excluded' && !voEligibility?.eligible;
  const approvedVOHint = voEligibility?.status === 'excluded' ? 'The QS has excluded this extra work from claims. The record and original evidence remain available.' : voEligibility?.eligible ? 'The QS claim eligibility checks are complete. Review quantities and amounts in monthly claims.' : 'Price approval does not establish claim eligibility. Check the separate QS assessment.';
  const hasPendingReview = Boolean(report && (isVo ? !['approved', 'rejected'].includes(voCase?.status || '') || needsClaimEligibilityReview : waiting(report) && !legacyScope));
  const voReviewLabel = needsClaimEligibilityReview ? 'Review claim eligibility' : hasPendingReview ? 'Review extra work' : 'View extra work';
  const nextMessageButton = !isNew && nextMessage ? <Button className={hasPendingReview ? 'ghost' : 'primary'} icon={ArrowRight} onClick={() => { setSearch(''); setFilter('all'); chooseMessage(nextMessage); }}>Next message</Button> : null;
  function processSelectedMessage() {
    if (!selected || needsMatchConfirmation && (!matchContext?.review || editingMatch)) return;
    setSearch('');
    setFilter('all');
    setSelectedId(selected.id);
    setReviewOpen(true);
    onProcess?.(selected);
  }
  function saveClarification<T,>(messageId: string, fields: T, callback?: (messageId: string, fields: T) => ClarificationResult | undefined) {
    const result = callback?.(messageId, fields);
    if (result && result.outcome !== 'invalid') {
      setSearch(''); setFilter('all'); setSelectedId(messageId); setReviewOpen(true);
      onSelectMessage?.(messageId);
    }
    return result;
  }
  function openThreadMessage(messageId: string) {
    const message = messages.find((entry) => entry.id === messageId);
    if (!message) return;
    setSearch(''); setFilter('all'); chooseMessage(message);
  }

  function backToMessages() {
    restoreInboxFocus.current = true;
    setReviewOpen(false);
    setPhoto(null);
    onClearMessageSelection?.();
  }
  useEffect(() => {
    if (!window.matchMedia('(max-width: 1050px)').matches) return;
    if (reviewOpen && selected) {
      reviewRef.current?.scrollIntoView({ block: 'start' });
      reviewHeadingRef.current?.focus({ preventScroll: true });
    } else if (restoreInboxFocus.current) {
      restoreInboxFocus.current = false;
      messageRefs.current.get(selected?.id || '')?.focus();
    }
  }, [reviewOpen, selected?.id]);
  const filters = [['all', 'All messages'], ['new', 'New messages'], ['review', 'Needs verification'], ['vo', 'Extra work'], ['clarification', 'Needs clarification'], ['processed', 'Saved messages']];
  const filterCount = (key: string) => messages.filter((message) => inFilter(key, message, messageReport(project, message))).length;

  return <div className={`whatsapp-view${reviewOpen ? ' wa-review-open' : ''}`}>
    <PageHeader title="WhatsApp messages" description="Check a message, add reported progress, then verify it separately." onBack={onBackToOverview || onBackToDrawing} backLabel={onBackToOverview ? 'Back to overview' : 'Back to drawing'} />
    {unavailable && <div className="notice warning"><CircleAlert size={16}/><span>This update is not available in the selected project.</span><Button onClick={onClearMessageSelection}>Show all messages</Button></div>}
    {areaMessageUpdate.available && areaMessageUpdate.skipped.length > 0 && <details className="wa-sample-help"><summary>Some area samples need review</summary><ul>{areaMessageUpdate.skipped.map((entry, index) => <li key={`${entry.areaCode}-${index}`}><strong>{entry.areaCode}</strong> · {entry.reason}</li>)}</ul>{onOpenDrawing && <Button className="ghost" onClick={() => onOpenDrawing()}>Review area mapping</Button>}</details>}

    {!messages.length ? <div className="project-empty empty-state"><MessageSquare size={32} /><h3>No demo messages for this project</h3><p>{project.items.length ? 'Choose a demo project in the project dropdown to try site updates.' : 'Add contract work first, or choose a demo project to try site updates.'}</p><Button icon={FileText} onClick={() => onOpenContract?.()}>Review contract</Button></div> : <>
      <div className="wa-list-controls">
        <div className="wa-filter-fields">
          <div className="form-field"><label className="form-field-label" htmlFor={searchId}>Find message</label><div className="search-box"><Search size={16} aria-hidden="true"/><Input id={searchId} aria-label="Search site updates" placeholder="Search messages, work items or areas…" value={search} onChange={(event) => setSearch(event.target.value)}/>{search && <button type="button" className="wa-clear-search" aria-label="Clear message search" onClick={() => setSearch('')}><X size={14}/></button>}</div></div>
          <FormField label="Review status"><SelectField aria-label="Filter site updates" value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map(([key,label]) => <option value={key} key={key}>{label} ({filterCount(key)})</option>)}</SelectField></FormField>
        </div>
        <div className="wa-list-tools"><span>{shown.length} of {messages.length} messages · {newCount} new to review</span><div>{(search || filter !== 'all') && <Button className="ghost" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button>}{(onStartMatchDemo || (areaMessageUpdate.available && areaMessageUpdate.messageCount > 0 && onAddAreaMessages) || (photoUpdate.available && photoUpdate.messageCount + photoUpdate.reportCount > 0 && onRefreshDemoPhotos)) && <ActionMenu label="Demo options" items={[onStartMatchDemo && {label:'Try match review demo',icon:MessageSquare,onSelect:onStartMatchDemo},areaMessageUpdate.available && areaMessageUpdate.messageCount > 0 && onAddAreaMessages && {label:'Add S.I.T. area messages',icon:MessageSquare,onSelect:onAddAreaMessages},photoUpdate.available && photoUpdate.messageCount + photoUpdate.reportCount > 0 && onRefreshDemoPhotos && {label:'Use matching demo photos',icon:ImagePlus,onSelect:onRefreshDemoPhotos}]} />}</div></div>
      </div>
      <div className="wa-workspace">
        <section ref={inboxRef} className="wa-inbox" aria-labelledby="wa-inbox-heading">
          <h2 className="wa-list-heading" id="wa-inbox-heading">Inbox<span>New messages first</span></h2>
          <div className="wa-message-list" aria-label="Messages for selected project">{shown.length ? shown.map((message) => {
            const linked = messageReport(project, message);
            const state = inboxStatus(message, linked);
            const summary = getMessageSummary(message);
            const referencedItem = project.items.find((entry) => entry.id === (linked && !linked.vo ? linked.itemId : message.itemId));
            const area = message.area || message.location || 'Area unclear';
            return <button type="button" className={`wa-message${selected?.id === message.id ? ' selected' : ''}`} key={message.id} ref={(node) => { if (node) messageRefs.current.set(message.id,node); else messageRefs.current.delete(message.id); }} aria-label={`Open message: ${area}, ${summary.title}, ${time(message.date)}`} aria-pressed={selected?.id === message.id} onClick={() => chooseMessage(message)}>
              <DemoPhoto src={message.photo} alt={message.photoAlt} className="wa-message-thumb"/>
              <div className="wa-message-copy">
                <div className="wa-message-title"><strong>{summary.title}</strong><Badge tone={state.tone}>{state.label === 'To check' ? 'Needs verification' : state.label === 'Approved' ? 'Price approved' : state.label}</Badge></div>
                <span className="wa-message-area"><MapPin size={12} aria-hidden="true"/>{area}{referencedItem?.ref && <span>· Ref. {referencedItem.ref}</span>}</span>
                <p className="wa-message-excerpt">{message.kind === 'progress' && referencedItem ? referencedItem.subsection || referencedItem.description : summary.detail === 'Open the original message and photo.' ? 'View message and photo' : summary.detail}</p>
                <div className="wa-message-meta"><span>{message.sender}</span><time dateTime={message.date}>{time(message.date)}</time></div>
              </div><ChevronRight className="wa-open-message" size={16} aria-hidden="true"/>
            </button>;
          }) : <div className="wa-list-empty"><Search size={24} /><strong>No matching messages</strong><p>Try another search or status.</p><Button className="small" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button></div>}</div>

          <p className="wa-inbox-note">Demo inbox · no WhatsApp messages are sent.</p>
        </section>

        {selected ? <section ref={reviewRef} className="wa-review" aria-labelledby="wa-review-heading">
          <div className="wa-panel-back wa-back-inbox"><BackButton onClick={backToMessages}>Back to messages</BackButton></div>
          <header className="wa-panel-header"><div><h2 id="wa-review-heading" ref={reviewHeadingRef} tabIndex={-1}>{selectedSummary?.title}</h2><p>{selected.area || selected.location || 'Location needs confirmation'}</p></div><Badge tone={status?.tone}>{status?.label === 'To check' ? 'Needs verification' : status?.label === 'Approved' ? 'Price approved' : status?.label}</Badge></header>
          <div className="wa-review-body">
            {selectionOutsideFilters && <p className="wa-selected-filter-note" role="status">Selected message is outside these filters.</p>}
            {item && !showClarification && !matchContext?.eligible && <div className="wa-linked-work"><span>{isVo ? 'Related contract work · QS to confirm scope' : 'Contract work'}</span><strong>Ref. {item.ref} · {item.description}</strong></div>}

            {areaAmbiguous && <div className="notice warning" role="status"><CircleAlert size={16}/><span>“{selected.area}” matches {sourceAreaLink?.candidates.map(area => area.code).join(' and ')}. Ask the worker to confirm one area code. Progress stays unchanged.</span></div>}
            {areaBlocked && <div className="notice warning" role="status"><CircleAlert size={16}/><span>The saved area names or reference need review. Confirm the site area before processing this message.</span></div>}
            {!report && !matchContext?.eligible && !areaAmbiguous && !areaBlocked && areaLink?.area && <div className="wa-linked-work"><span>Matched site area</span><strong>{areaLink.area.code} · {areaLink.area.name}</strong>{onOpenDrawing && <Button className="ghost" onClick={() => onOpenDrawing(areaLink.area!.id)}>View area</Button>}</div>}

            {isNew && matchContext?.eligible && !showClarification && <MessageMatchReviewPanel key={selected.id} project={project} message={selected} onSave={onSaveMatch} onEditingChange={(editing)=>setMatchEditing({messageId:selected.id,editing})}/>}
            {report?.matchReview && <MessageMatchReviewDetails review={report.matchReview}/>}
            {isNew && matchContext?.clarificationRequired && !areaAmbiguous && !areaBlocked && !showClarification && <p className="notice warning">{matchContext.issue || 'Confirm the message details with the worker before updating progress.'}</p>}

            {showClarification ? <WhatsAppClarification project={project} message={selected}
              onSaveRequest={onSaveClarificationRequest ? (messageId, fields) => saveClarification(messageId, fields, onSaveClarificationRequest) : undefined}
              onSaveReply={onSaveClarificationReply ? (messageId, fields) => saveClarification(messageId, fields, onSaveClarificationReply) : undefined}
              onProcess={onProcess ? (reply) => { setSearch(''); setFilter('all'); onProcess(reply); } : undefined}
              onReview={onReview} onOpenCompletion={onOpenCompletion} onSelectMessage={openThreadMessage} /> : <>

            {!item && (!isVo || isNew || !voCase) && <p className="wa-unmatched-note">{isVo ? 'Contract match needs QS review. Related area links are context only.' : 'No matched work item. Confirm the work with the worker before changing progress.'}</p>}
            {!needsMatchConfirmation && areaLink?.conflict && <div className="notice warning"><CircleAlert size={16}/><span>Area {areaLink.area?.code} is linked to {areaLink.linkedItems.map((entry: WorkItem) => entry.id).join(', ') || 'no work items'}, while this message names {selected.itemId}. Confirm the area or work item before changing progress.</span></div>}

            {needsMatchConfirmation && !matchContext?.review ? null : areaAmbiguous || areaBlocked ? <div className="wa-result wa-result-unclear"><div className="wa-result-title"><MessageSquare size={16}/><strong>Confirm the site area</strong></div><p>Use the area code in the worker’s reply before adding this update. The original message and photo are retained.</p>{isVo && <p>Ask the worker outside this demo, then record the confirmed extra work with its area in Extra work.</p>}</div> : isVo ? <div className="wa-result wa-result-vo"><div className="wa-result-title"><Flag size={16} /><strong>{isNew ? 'Check whether this is extra work' : voCase?.status === 'approved' ? 'Price approved' : voCase?.status === 'rejected' ? 'Extra work rejected' : voCase?.status === 'pendingApproval' ? 'Awaiting approval' : voCase?.status === 'clarification' ? 'More information needed' : 'Saved for extra-work review'}</strong></div><p>{isNew ? 'Save this message and photo for the QS to check against the contract.' : voCase?.status === 'approved' ? approvedVOHint : voCase?.status === 'rejected' ? 'The QS has rejected this extra work. The record and original evidence remain available.' : 'Open extra-work review to check the scope, instruction and price.'}</p><div className="wa-result-foot">Progress unchanged <span>·</span> {voCase?.status === 'approved' ? `Approved value: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.approvedValue)}` : voCase?.proposedValue != null ? `Proposed: ${project.contract.currency || 'SGD'} ${formatMoney(voCase.proposedValue)}` : 'Value unknown'} <span>·</span> {voCase?.status === 'approved' ? 'Approval recorded locally' : voCase?.status === 'rejected' ? 'Rejected in local review' : 'Not approved yet'}</div></div> : isUnclear ? <div className="wa-result wa-result-unclear"><div className="wa-result-title"><CircleAlert size={16} /><strong>{includedScopeUpdate ? 'Check the included access work' : 'Ask the worker to clarify'}</strong></div><p>{needsProgressClarification(report) && report?.reviewReason ? report?.reviewReason : isNew && allocation?.split && !areaProgress ? 'Confirm a saved allocated area and its cumulative completion before updating progress.' : includedScopeUpdate ? 'Confirm the installed access sets, site location and inspection status with the supervisor. This is included scope; no percentage or separate value is inferred.' : selected.kind === 'clarification' ? 'Ask which work item is meant and the total percentage completed so far.' : 'Confirm the work item, total completed so far and date before updating progress.'}</p><div className="wa-result-foot">Current progress stays unchanged.</div>{(selected.status === 'clarification' || needsProgressClarification(report)) && <div className="wa-clarification-saved"><Check size={13} />{includedScopeUpdate ? 'Confirm the access-work details with the supervisor outside this demo. No message was sent.' : 'Contact the worker outside this demo, then add a clearer cumulative update. No message was sent.'}</div>}</div> : <div className={`wa-result ${isVerified ? 'wa-result-verified' : ''}`}>
              <div className="wa-result-title"><ListChecks size={16} /><strong>{isNew ? 'Progress change' : isVerified ? 'Progress verified' : report?.status === 'superseded' ? 'A newer update replaced this report' : report?.status === 'rejected' ? 'Report dismissed' : 'Reported progress saved'}</strong>{!isNew && report?.status !== 'rejected' && report?.status !== 'superseded' && <Check size={14} />}</div>
              {!isNew && <div className="wa-this-update"><span>This update</span><strong>{percent(report ? report.completion : selected.completion)}</strong><small>Saved with this message</small></div>}
              <div className="wa-progress-comparison"><div><span>{areaProgress ? 'Area reported total' : isNew ? 'Reported total' : 'Current reported total'}</span><strong>{isNew ? <>{percent(currentReported)}<ArrowRight size={15} /><em>{percent(routeMessage?.completion)}</em></> : percent(currentReported)}</strong></div><div><span>{areaProgress ? 'Area verified total' : 'Verified total'}</span><strong className="wa-verified-number">{percent(currentVerified)}{!isVerified && <small>{isNew ? 'unchanged' : 'current total'}</small>}</strong></div></div>
              {areaProgress && <div className="wa-result-foot">{formatNumber(areaProgress.allocatedQuantity)} {item?.unit} allocated to this area of {formatNumber(areaProgress.contractQuantity)} {item?.unit}. Whole-item weighted totals: reported {percent(overallReported)} · verified {percent(overallVerified)}.</div>}
              <div className="wa-result-foot">{legacyScope ? 'Historical whole-item update retained. Its percentage is not assigned to the new areas.' : isNew ? areaProgress ? 'This replaces this area’s reported completion. Other areas and supervisor verification stay unchanged.' : 'This replaces the reported total. Supervisor verification stays unchanged.' : isVerified ? 'Verification saved with the original message and photo.' : report?.status === 'rejected' ? 'Dismissed. Verified progress stays unchanged.' : report?.status === 'superseded' ? 'Use the newer update when reviewing progress.' : 'Next, ask the supervisor to verify the update.'}</div>
            </div>}
            </>}

            {!showClarification && !project.locked && !isVo && !isUnclear && <div className="wa-baseline-note"><LockKeyhole size={13} /><span>Confirm the contract first so the supervisor can verify progress.</span><button type="button" onClick={() => onOpenContract?.()}>Review contract<ChevronRight size={12} /></button></div>}
            {!showClarification && <footer className="wa-review-footer"><FormActions secondary={hasPendingReview && nextMessageButton ? nextMessageButton : <span className="wa-footer-note">{needsMatchConfirmation && (!matchContext?.review || editingMatch) ? 'Confirm the match before adding progress.' : isNew ? 'Check the original message and photo below before saving.' : isUnclear ? 'Waiting for a clearer update.' : isVo && hasPendingReview ? needsClaimEligibilityReview ? 'Next: review claim eligibility.' : 'Next: review the extra work.' : waiting(report) && !isVo ? 'Next: supervisor verification.' : 'Saved with this project.'}</span>}>
            {isNew ? <Button className="primary" icon={isUnclear ? MessageSquare : isVo ? Flag : Check} disabled={needsMatchConfirmation && (!matchContext?.review || editingMatch)} onClick={processSelectedMessage}>{isUnclear ? 'Needs clarification' : isVo ? 'Flag extra work' : 'Add progress update'}</Button> : <>
              {report ? isVo ? <Button className={hasPendingReview ? 'primary' : 'ghost'} icon={ArrowRight} onClick={() => onOpenVO?.(report.id)}>{voReviewLabel}</Button> : needsProgressClarification(report) && !legacyScope ? <Button icon={MessageSquare} onClick={() => onReview?.(report)}>View clarification</Button> : waiting(report) && !legacyScope ? <Button className="primary" icon={ShieldCheck} onClick={() => onReview?.(report)}>Review progress</Button> : <Button icon={ArrowRight} onClick={() => onOpenCompletion?.(item?.id, areaLink?.area?.id, selected.id)}>View progress</Button> : <Badge tone="amber">Clarification needed</Badge>}
              {!hasPendingReview && nextMessageButton}
            </>}
          </FormActions></footer>}
            <details className="wa-source-evidence" key={`${selected.id}:${report?.id || 'inbox'}:${clarification?.stage || 'original'}-evidence`} open={isNew && !clarification?.request}>
              <summary><MessageSquare size={15} /><span>{selectedIsReply ? 'Reply message & retained photo' : 'Original message & photo'}</span><small>{selected.sender} · {time(selected.date)}</small></summary>
              <div className="wa-source-content">
            <div className="wa-evidence-heading"><div className="avatar wa-worker-avatar">{selected.sender?.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]).join('') || 'DW'}</div><div><strong>{selected.sender}</strong><span>{selected.senderRole || 'Site worker · demo'}</span></div><time dateTime={selected.date}>{time(selected.date)}</time></div>
            <div className="wa-original-message"><div className="wa-original-label"><MessageSquare size={12} />{selectedIsReply ? 'Worker’s reply' : 'Worker’s message'}</div><blockquote>{selected.text}</blockquote></div>
            <DemoPhoto src={selected.photo} alt={selected.photoAlt} className="wa-evidence-photo" onOpen={() => setPhoto({ src: selected.photo, alt: selected.photoAlt })} />
            {previousDemoPhotos.length > 0 && <details className="wa-message-details" key={`${selected.id}-photos`}><summary>Earlier demo illustrations</summary>{previousDemoPhotos.map((entry, index) => <Button key={`${entry.photo}-${index}`} className="ghost" aria-label={`View earlier demo illustration ${index + 1}`} onClick={() => setPhoto({ src: entry.photo, alt: entry.photoAlt })}>View earlier illustration {index + 1}</Button>)}</details>}

              </div>
            </details>

            <details className="wa-context-details" key={`${selected.id}-context`}><summary>Contract &amp; drawing links</summary><div>
            {contractItems.length > 0 && <section className="wa-contract-context" aria-label="Contract work referenced by this update">
              <span>{isVo ? 'Related contract work for QS review' : areaLink?.conflict ? 'Contract item named in the message' : 'Contract work for this update'}</span>
              {contractItems.map((entry) => <div className="wa-contract-work" key={entry.id}><div><strong>{entry.ref} · {entry.description}</strong><small>{entry.sourcePage ? `Source page ${entry.sourcePage}` : 'Contract work item'}</small></div>{(onOpenContractItem || onOpenContract) && <Button className="ghost" icon={FileText} onClick={() => onOpenContractItem ? onOpenContractItem(entry.id) : onOpenContract?.()}>View contract item</Button>}</div>)}
              {isVo && <p>Related scope only. QS must check whether the requested extra work is covered by this contract item.</p>}
              {messageSample && <details className="wa-contract-sample"><summary>Sample worker message for this item</summary><pre>{messageSample}</pre><p>Confirm the site area and total completion before sending an update. This format does not create a claim value.</p></details>}
            </section>}
            <div className={`area-mapping-reference${areaLink?.conflict ? ' conflict' : ''}`}><div>{areaLink?.area ? <><strong>Area {areaLink.area.code} · {areaLink.area.name}</strong><p>{areaLink.linkedItems.length ? `Drawing links: ${areaLink.linkedItems.map((entry: WorkItem)=>entry.ref || entry.id).join(', ')}` : 'No contract work items linked yet.'}</p>{areaLink.conflict && <p>This message names a different work item. Confirm the area or item before changing progress.</p>}</> : <span>This message has no saved drawing-area link.</span>}</div><a className="area-mapping-link" href={areaLink?.area ? `#drawing?area=${encodeURIComponent(areaLink.area.id)}` : '#drawing'} onClick={event=>{if(onOpenDrawing){event.preventDefault();onOpenDrawing(areaLink?.area?.id);}}}>View area map<ArrowRight size={13}/></a></div>
            </div></details>
            <details className="wa-message-details"><summary>Message details</summary><p><strong>Message:</strong> {selected.id}{report && <><br /><strong>Report:</strong> {report.id}</>}<br /><strong>Interpretation:</strong> Predefined demo fields; AI is not connected.</p>{selected.processingNote && <p>{selected.processingNote}</p>}</details>

          </div>

        </section> : <section className="wa-review wa-no-selection"><MessageSquare size={30} /><h3>Select a message</h3><p>Its photo and proposed update will appear here.</p></section>}
      </div>


    </>}

    {photo && <div className="wa-photo-modal"><Modal title="Demo site photo" description="Generated illustration · not evidence from the actual project" onClose={() => setPhoto(null)} footer={<Button onClick={() => setPhoto(null)}>Done</Button>}><img src={photo.src || undefined} alt={photo.alt || 'Generated site photograph for the prototype'} /></Modal></div>}
  </div>;
}
