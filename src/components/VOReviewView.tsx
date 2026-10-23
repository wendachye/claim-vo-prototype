import type { Project, VOCase, SiteReport } from '../types/domain';
import type { VOCaseReviewProps, VOPhoto } from './VOCaseReview';
import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { ChevronRight, CircleAlert, Flag, MapPin, MessageSquare, Plus, Search, X } from 'lucide-react';
import { VO_STATUS_LABELS, getVOClaimEligibility } from '../data/vo';
import { useBufferedState } from './useFormBuffer';
import { VOCaseReview, voTone as tone, voAmountLabel as amountLabel } from './VOCaseReview';
import { ManualVOForm } from './ManualVOForm';
import { Badge, Button, FormField, Modal, PageHeader, Input, SelectField } from './ui';
import './vo-review.css';

const reviewStatusLabel = (status: string) => status === 'approved' ? 'Price approved' : (VO_STATUS_LABELS as Readonly<Record<string, string>>)[status];

interface VOReviewViewProps { project: Project; cases?: VOCase[]; initialCaseId?: string | null; onSelect?: (id: string) => void; onAction?: VOCaseReviewProps['onAction']; onCreateConfirmation?: VOCaseReviewProps['onCreateConfirmation']; onConfirmationReply?: VOCaseReviewProps['onConfirmationReply']; onCreate?: ComponentProps<typeof ManualVOForm>['onSave']; onOpenWhatsApp?: () => void; onOpenContract?: VOCaseReviewProps['onOpenContract']; onReviewContract?: () => void; onOpenClaims?: (caseId: string) => void; onBackToDrawing?: () => void; onBackToOverview?: () => void; onClearCaseSelection?: () => void }

export function VOReviewView({ project, cases = [], initialCaseId, onSelect, onAction, onCreateConfirmation, onConfirmationReply, onCreate, onOpenWhatsApp, onOpenContract, onReviewContract, onOpenClaims, onBackToDrawing, onBackToOverview, onClearCaseSelection }: VOReviewViewProps) {
  const [selectedId, setSelectedId] = useBufferedState(project.id, 'vo:selected', () => initialCaseId || cases[0]?.id || '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [photo, setPhoto] = useState<VOPhoto | null>(null);
  const [reviewOpen, setReviewOpen] = useState(Boolean(initialCaseId));
  const [createOpen, setCreateOpen] = useState(false);
  const searchId = useId();
  const caseRefs = useRef(new Map<string, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const focusReview = useRef(false);
  const restoreRegisterFocus = useRef(false);
  const registerRef = useRef<HTMLElement | null>(null);
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const currency = project.contract?.currency || 'SGD';
  const shown = cases.filter((entry) => (filter === 'all' || entry.status === filter)
    && (!search.trim() || `${entry.reference} ${entry.title} ${entry.report.message} ${entry.report.area} ${entry.report.location}`.toLowerCase().includes(search.trim().toLowerCase())));
  const requested = initialCaseId ? cases.find((entry) => entry.id === initialCaseId) : null;
  const unavailable = Boolean(initialCaseId && !requested);
  const selected = unavailable ? null : initialCaseId && selectedId !== initialCaseId ? requested : shown.find((entry) => entry.id === selectedId) || shown[0];
  useEffect(() => {
    if (!initialCaseId) { setReviewOpen(false); return; }
    if (!cases.some((entry) => entry.id === initialCaseId)) return;
    setSelectedId(initialCaseId); setPhoto(null);
    if (!shown.some((entry) => entry.id === initialCaseId)) { setSearch(''); setFilter('all'); }
    focusReview.current = true;
    setReviewOpen(true);
  }, [initialCaseId]);
  useEffect(() => setPhoto(null), [selected?.id]);
  function choose(entry: VOCase) {
    focusReview.current = true;
    setSelectedId(entry.id); setPhoto(null); setReviewOpen(true);
    onSelect?.(entry.id);
  }

  function backToRegister() {
    focusReview.current = false;
    restoreRegisterFocus.current = true;
    setReviewOpen(false);
    setPhoto(null);
  }
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 1050px)').matches;
    if (reviewOpen && selected && focusReview.current) {
      focusReview.current = false;
      if (compact) reviewRef.current?.scrollIntoView({ block: 'start' });
      headingRef.current?.focus({ preventScroll: true });
    } else if (!reviewOpen && restoreRegisterFocus.current) {
      restoreRegisterFocus.current = false;
      if (compact) caseRefs.current.get(selected?.id || '')?.focus();
    }
  }, [reviewOpen, selected?.id, selected?.status, selected?.history.length]);
  function reviewAction(caseId: string, action: string, values: Parameters<NonNullable<VOCaseReviewProps['onAction']>>[2]) {
    const result = onAction?.(caseId, action, values);
    if (result?.outcome === 'updated') {
      focusReview.current = true;
      setSearch(''); setFilter('all'); setSelectedId(caseId); setReviewOpen(true);
      onSelect?.(caseId);
    }
    return result;
  }
  async function createEntry(values: Parameters<NonNullable<ComponentProps<typeof ManualVOForm>['onSave']>>[0]) {
    const result = await onCreate?.(values);
    if (result && ['updated', 'unchanged'].includes(result.outcome) && result.caseId) {
      setSearch(''); setFilter('all'); setSelectedId(result.caseId); setPhoto(null);
      focusReview.current = true;
      setCreateOpen(false); setReviewOpen(true);
      onSelect?.(result.caseId);
    }
    return result;
  }
  const openCount = cases.filter((entry) => !['approved', 'rejected'].includes(entry.status) || entry.status === 'approved' && entry.claimEligibility !== 'excluded' && !getVOClaimEligibility(entry).eligible).length;
  const filterCount = (status: string) => cases.filter((entry) => status === 'all' || entry.status === status).length;
  const titleForList = (entry: VOCase) => entry.title === `Possible extra work · ${entry.report.area}` ? 'Possible extra work' : entry.title || 'Flagged extra work';
  const priceForList = (entry: VOCase) => { const value = entry.status === 'approved' ? entry.approvedValue : entry.proposedValue; return value == null ? 'Price unknown' : amountLabel(value, currency); };

  return <div className={`vo-view${reviewOpen ? ' vo-review-open' : ''}`}>
    <PageHeader title="Extra work (VO)" description="Check the scope, instruction, price and claim eligibility." onBack={onBackToOverview || onBackToDrawing} backLabel={onBackToOverview ? 'Back to overview' : 'Back to drawing'} actions={onCreate && <Button className="primary" icon={Plus} onClick={() => setCreateOpen(true)}>Add extra work</Button>} />
    {createOpen && <ManualVOForm project={project} onClose={() => setCreateOpen(false)} onSave={createEntry} />}
    {unavailable && <div className="notice warning"><CircleAlert size={16}/><span>This extra-work case is not available in the selected project.</span><Button onClick={onClearCaseSelection}>Show all extra work</Button></div>}

    {!cases.length ? <div className="project-empty empty-state"><Flag size={30} /><h3>No flagged extra work for this project</h3><p>{onCreate ? 'Add extra work from a site instruction, or flag it from Site updates.' : project.items?.length ? 'Flag extra work from Site updates. Its message and photo will appear here for review.' : 'Add and review a contract work list before recording site updates and extra work.'}</p>{!project.items?.length && onReviewContract ? <Button icon={ChevronRight} onClick={onReviewContract}>Add a contract</Button> : <Button icon={MessageSquare} onClick={() => onOpenWhatsApp?.()}>Open site updates</Button>}</div> : <>
      <div className="vo-list-controls">
        <div className="vo-filter-fields">
          <div className="form-field"><label className="form-field-label" htmlFor={searchId}>Find extra work</label><div className="search-box"><Search size={16} aria-hidden="true"/><Input id={searchId} aria-label="Search VO records" placeholder="Search work, references or areas…" value={search} onChange={(event) => setSearch(event.target.value)}/>{search && <button type="button" aria-label="Clear VO search" onClick={() => setSearch('')}><X size={14}/></button>}</div></div>
          <FormField label="Review status"><SelectField aria-label="Filter VO approval status" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses ({cases.length})</option>{Object.keys(VO_STATUS_LABELS).map((value) => <option key={value} value={value}>{reviewStatusLabel(value)} ({filterCount(value)})</option>)}</SelectField></FormField>
        </div>
        <div className="vo-list-tools"><span>{shown.length} of {cases.length} cases · {openCount} open</span><div>{(search || filter !== 'all') && <Button className="ghost" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button>}<Button className="ghost" icon={MessageSquare} onClick={() => onOpenWhatsApp?.()}>Site messages</Button></div></div>
      </div>
      <div className="vo-workspace">
      <section ref={registerRef} className="vo-register" aria-labelledby="vo-register-heading">
        <h2 className="vo-list-heading" id="vo-register-heading">Extra-work cases</h2>
        <div className="vo-register-list">{shown.length ? shown.map((entry) => <button type="button" key={entry.id} ref={(node) => { if (node) caseRefs.current.set(entry.id,node); else caseRefs.current.delete(entry.id); }} className={`vo-register-item${selected?.id === entry.id ? ' selected' : ''}`} aria-label={`Open extra work: ${entry.reference}, ${titleForList(entry)}, ${(VO_STATUS_LABELS as Readonly<Record<string, string>>)[entry.status]}`} aria-pressed={selected?.id === entry.id} onClick={() => choose(entry)}>
          <VOCaseThumbnail report={entry.report}/>
          <div className="vo-register-copy"><div className="vo-register-title"><strong>{titleForList(entry)}</strong></div><p className="vo-register-area"><MapPin size={12} aria-hidden="true"/>{[entry.report.location,entry.report.area].filter(Boolean).join(' · ') || 'Location not recorded'}</p><div className="vo-register-summary"><Badge tone={tone(entry.status)}>{reviewStatusLabel(entry.status)}</Badge><span className="vo-register-price" aria-label={`${entry.status === 'approved' ? 'Approved price' : 'Proposed price'}: ${amountLabel(entry.status === 'approved' ? entry.approvedValue : entry.proposedValue,currency)}`}>{priceForList(entry)}</span></div></div><ChevronRight className="vo-open-case" size={16} aria-hidden="true"/>
        </button>) : <div className="vo-list-empty"><Search size={25}/><h3>No matching extra work</h3><p>Try another search or approval status.</p><Button onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button></div>}</div>
        <p className="vo-register-note">Demo review · decisions stay in this browser. Nothing is submitted or paid.</p>
      </section>

      <div ref={reviewRef} className="vo-review-anchor">{selected ? <VOCaseReview key={`${selected.id}-${selected.status}-${selected.history.length}`} entry={selected} project={project} currency={currency} headingRef={headingRef} onAction={reviewAction} onCreateConfirmation={onCreateConfirmation} onConfirmationReply={onConfirmationReply} onPhoto={setPhoto} onOpenContract={onOpenContract} onOpenClaims={onOpenClaims} onBack={backToRegister} backLabel="Back to extra work" /> : <section className="vo-detail vo-list-empty"><Flag size={28} /><h3>Select extra work</h3><p>Its message, photo and review will appear here.</p></section>}</div>
    </div></>}
    {photo && <div className="vo-photo-modal"><Modal title="Extra-work photo" description="Demo attachment · review alongside the original message" onClose={() => setPhoto(null)} footer={<Button onClick={() => setPhoto(null)}>Done</Button>}><img src={photo.src} alt={photo.alt || 'Photo attached to the demo variation report'} /></Modal></div>}
  </div>;
}


function VOCaseThumbnail({ report }: { report: SiteReport }) {
  const [failed,setFailed] = useState(false);
  const src = typeof report.photo === 'string' ? report.photo : report.photo?.url;
  useEffect(() => setFailed(false),[src]);
  return src && !failed ? <img className="vo-case-thumbnail" src={src} alt={report.photoAlt || 'Photo attached to the extra-work case'} loading="lazy" onError={() => setFailed(true)}/> : <span className="vo-case-icon"><Flag size={21} aria-hidden="true"/></span>;
}
