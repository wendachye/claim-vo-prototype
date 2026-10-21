import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, CircleAlert, Flag, MapPin, MessageSquare, Search, X } from 'lucide-react';
import { VO_STATUS_LABELS } from '../data/vo.js';
import { useBufferedState } from './useFormBuffer.js';
import { VOCaseReview, voTone as tone, voDateLabel as dateLabel, voAmountLabel as amountLabel } from './VOCaseReview.jsx';
import { Badge, Button, FormField, Modal, PageHeader } from './ui.jsx';
import './vo-review.css';

export function VOReviewView({ project, cases = [], initialCaseId, onSelect, onAction, onOpenWhatsApp, onOpenContract, onOpenClaims, onBackToDrawing, onClearCaseSelection }) {
  const [selectedId, setSelectedId] = useBufferedState(project.id, 'vo:selected', () => initialCaseId || cases[0]?.id || '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [photo, setPhoto] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(Boolean(initialCaseId));
  const searchId = useId();
  const caseRefs = useRef(new Map());
  const headingRef = useRef(null);
  const focusReview = useRef(false);
  const restoreRegisterFocus = useRef(false);
  const registerRef = useRef(null);
  const reviewRef = useRef(null);
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
  function choose(entry) {
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
      if (compact) caseRefs.current.get(selected?.id)?.focus();
    }
  }, [reviewOpen, selected?.id, selected?.status, selected?.history.length]);
  function reviewAction(caseId, action, values) {
    const result = onAction?.(caseId, action, values);
    if (result?.outcome === 'updated') {
      focusReview.current = true;
      setSearch(''); setFilter('all'); setSelectedId(caseId); setReviewOpen(true);
      onSelect?.(caseId);
    }
    return result;
  }
  const openCount = cases.filter((entry) => !['approved', 'rejected'].includes(entry.status)).length;
  const filterCount = (status) => cases.filter((entry) => status === 'all' || entry.status === status).length;
  const titleForList = (entry) => entry.title === `Possible extra work · ${entry.report.area}` ? 'Possible extra work' : entry.title || 'Flagged extra work';

  return <div className={`vo-view${reviewOpen ? ' vo-review-open' : ''}`}>
    <PageHeader title="Extra work (VO)" description="Review flagged extra work against the contract, then record its approval." onBack={onBackToDrawing} backLabel="Back to drawing" />
    {unavailable && <div className="notice warning"><CircleAlert size={16}/><span>This extra-work case is not available in the selected project.</span><Button onClick={onClearCaseSelection}>Show all extra work</Button></div>}

    {!cases.length ? <div className="project-empty empty-state"><Flag size={30} /><h3>No flagged extra work for this project</h3><p>Flag extra work from Site updates. Its message and photo will appear here for review.</p><Button icon={MessageSquare} onClick={() => onOpenWhatsApp?.()}>Open site updates</Button></div> : <>
      <div className="vo-list-controls">
        <div className="vo-filter-fields">
          <div className="form-field"><label className="form-field-label" htmlFor={searchId}>Find extra work</label><div className="search-box"><Search size={16} aria-hidden="true"/><input id={searchId} aria-label="Search VO records" placeholder="Search work, references or areas…" value={search} onChange={(event) => setSearch(event.target.value)}/>{search && <button type="button" aria-label="Clear VO search" onClick={() => setSearch('')}><X size={14}/></button>}</div></div>
          <FormField label="Review status"><select aria-label="Filter VO approval status" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses ({cases.length})</option>{Object.entries(VO_STATUS_LABELS).map(([value,label]) => <option key={value} value={value}>{label} ({filterCount(value)})</option>)}</select></FormField>
        </div>
        <div className="vo-list-tools"><span>{shown.length} of {cases.length} cases · {openCount} open</span><div>{(search || filter !== 'all') && <Button className="ghost" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button>}<Button className="ghost" icon={MessageSquare} onClick={() => onOpenWhatsApp?.()}>Site messages</Button></div></div>
      </div>
      <div className="vo-workspace">
      <section ref={registerRef} className="vo-register" aria-labelledby="vo-register-heading">
        <h2 className="vo-list-heading" id="vo-register-heading">Extra-work cases<span>Choose a case to review</span></h2>
        <div className="vo-register-list">{shown.length ? shown.map((entry) => <button type="button" key={entry.id} ref={(node) => { if (node) caseRefs.current.set(entry.id,node); else caseRefs.current.delete(entry.id); }} className={`vo-register-item${selected?.id === entry.id ? ' selected' : ''}`} aria-label={`Open extra work: ${entry.reference}, ${titleForList(entry)}, ${VO_STATUS_LABELS[entry.status]}`} aria-pressed={selected?.id === entry.id} onClick={() => choose(entry)}>
          <VOCaseThumbnail report={entry.report}/>
          <div className="vo-register-copy"><div className="vo-register-title"><strong>{titleForList(entry)}</strong><Badge tone={tone(entry.status)}>{VO_STATUS_LABELS[entry.status]}</Badge></div><p className="vo-register-area"><MapPin size={12} aria-hidden="true"/>{[entry.report.location,entry.report.area].filter(Boolean).join(' · ') || 'Location not recorded'}</p><div className="vo-register-value"><span>{entry.status === 'approved' ? 'Approved value' : 'Proposed value'}</span><strong>{amountLabel(entry.status === 'approved' ? entry.approvedValue : entry.proposedValue,currency)}</strong></div><div className="vo-register-meta"><span>{entry.reference}</span><time dateTime={entry.report.date}>{dateLabel(entry.report.date)}</time></div></div><ChevronRight className="vo-open-case" size={16} aria-hidden="true"/>
        </button>) : <div className="vo-list-empty"><Search size={25}/><h3>No matching extra work</h3><p>Try another search or approval status.</p><Button onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button></div>}</div>
        <p className="vo-register-note">Demo review · decisions stay in this browser. Nothing is submitted or paid.</p>
      </section>

      <div ref={reviewRef} className="vo-review-anchor">{selected ? <VOCaseReview key={`${selected.id}-${selected.status}-${selected.history.length}`} entry={selected} project={project} currency={currency} headingRef={headingRef} onAction={reviewAction} onPhoto={setPhoto} onOpenContract={onOpenContract} onOpenClaims={onOpenClaims} onBack={backToRegister} backLabel="Back to extra work" /> : <section className="vo-detail vo-list-empty"><Flag size={28} /><h3>Select extra work</h3><p>Its message, photo and review will appear here.</p></section>}</div>
    </div></>}
    {photo && <div className="vo-photo-modal"><Modal title="Extra-work photo" description="Demo attachment · review alongside the original message" onClose={() => setPhoto(null)} footer={<Button onClick={() => setPhoto(null)}>Done</Button>}><img src={photo.src} alt={photo.alt || 'Photo attached to the demo variation report'} /></Modal></div>}
  </div>;
}


function VOCaseThumbnail({ report }) {
  const [failed,setFailed] = useState(false);
  const src = typeof report.photo === 'string' ? report.photo : report.photo?.url;
  useEffect(() => setFailed(false),[src]);
  return src && !failed ? <img className="vo-case-thumbnail" src={src} alt={report.photoAlt || 'Photo attached to the extra-work case'} loading="lazy" onError={() => setFailed(true)}/> : <span className="vo-case-icon"><Flag size={21} aria-hidden="true"/></span>;
}
