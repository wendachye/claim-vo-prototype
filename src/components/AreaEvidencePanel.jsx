import { useId, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronUp, Expand, ImageOff, MessageSquare } from 'lucide-react';
import { getAreaEvidence } from '../data/drawing-evidence.js';
import { Badge, Button, Modal, formatTime } from './ui.jsx';

const isDemoPhoto = (entry) => Boolean(entry.photo && (/generated/i.test(entry.photoAlt || '') || /\/assets\/demo-[^/]+/i.test(entry.photo)));
const updateTime = (date) => date && Number.isFinite(new Date(date).getTime()) ? formatTime(date) : 'Date not recorded';

export function AreaEvidencePanel({ project, area, onOpenEvidence }) {
  const evidence = getAreaEvidence(project, area.id);
  const [showAll, setShowAll] = useState(false);
  const [photoEntryId, setPhotoEntryId] = useState(null);
  const listId = useId();
  const entries = evidence?.entries || [];
  const visible = showAll ? entries : entries.slice(0, 3);
  const photoEntry = entries.find((entry) => entry.id === photoEntryId && entry.photo);

  return <section className="drawing-area-evidence" aria-label={`Site updates and photos for area ${area.code}`}>
    <header className="drawing-evidence-heading"><h3>Site updates &amp; photos</h3>{entries.length > 0 && <span>{evidence.messageCount} update{evidence.messageCount === 1 ? '' : 's'} · {evidence.photoCount} photo{evidence.photoCount === 1 ? '' : 's'}</span>}</header>
    {!entries.length ? <div className="drawing-evidence-empty"><MessageSquare size={20} /><p>No site updates for this area yet.</p></div> : <>
      <div className="drawing-evidence-list" id={listId}>{visible.map((entry, index) => <article className="drawing-evidence-card" key={entry.id}>
        <header><div><strong>{entry.sender || 'Sender not recorded'}</strong><small>{entry.sourceLabel ? `${entry.sourceLabel} · ` : ''}<time dateTime={entry.date && Number.isFinite(new Date(entry.date).getTime()) ? new Date(entry.date).toISOString() : undefined}>{updateTime(entry.date)}</time></small></div><Badge tone={entry.tone}>{entry.label}</Badge></header>
        <p className="drawing-evidence-message">{entry.text || 'Message text not recorded.'}</p>
        {entry.matchKind === 'work-item' && entry.matchLabel && !visible.slice(0, index).some((previous) => previous.matchKind === 'work-item' && previous.matchLabel === entry.matchLabel) && <p className="drawing-evidence-match">{entry.matchLabel}</p>}
        {entry.photo ? <EvidencePhoto key={`${entry.id}:${entry.photo}`} entry={entry} onOpen={() => setPhotoEntryId(entry.id)} /> : <p className="drawing-evidence-no-photo"><ImageOff size={13} />No photo attached</p>}
        {onOpenEvidence && (entry.messageId || entry.reportId) && <Button className="ghost" icon={ArrowUpRight} onClick={() => onOpenEvidence(entry, area.id)}>{entry.messageId ? 'Open original update' : entry.kind === 'vo' ? 'Review extra work' : 'Review site report'}</Button>}
      </article>)}</div>
      {entries.length > 3 && <Button className="ghost drawing-evidence-history" icon={showAll ? ChevronUp : ChevronDown} aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll((current) => !current)}>{showAll ? 'Show latest 3 updates' : `Show all ${entries.length} updates`}</Button>}
    </>}
    {photoEntry && <div className="drawing-evidence-photo-modal"><Modal title={`Area ${area.code} · Site photo`} description={`${photoEntry.sender || 'Sender not recorded'} · ${updateTime(photoEntry.date)}`} onClose={() => setPhotoEntryId(null)} footer={<Button onClick={() => setPhotoEntryId(null)}>Close photo</Button>}><EvidencePhoto key={`${photoEntry.id}:${photoEntry.photo}:full`} entry={photoEntry} enlarged />{photoEntry.text && <p className="drawing-evidence-modal-message">{photoEntry.text}</p>}</Modal></div>}
  </section>;
}

function EvidencePhoto({ entry, onOpen, enlarged = false }) {
  const [failed, setFailed] = useState(false);
  const alt = entry.photoAlt || 'Site photo attached to this update';
  return <figure className={`drawing-evidence-photo${enlarged ? ' enlarged' : ''}`}>
    {failed ? <div className="drawing-evidence-photo-missing" role="img" aria-label="Site photo unavailable"><ImageOff size={22} /><span>Photo unavailable</span></div> : enlarged ? <img src={entry.photo} alt={alt} onError={() => setFailed(true)} /> : <button type="button" onClick={onOpen} aria-label={`Enlarge photo from ${entry.sender || 'this site update'}`}><img src={entry.photo} alt={alt} onError={() => setFailed(true)} loading="lazy" /><span><Expand size={13} />View photo</span></button>}
    <figcaption>{isDemoPhoto(entry) ? 'Generated demo photo' : 'Site attachment · demo'}</figcaption>
  </figure>;
}
