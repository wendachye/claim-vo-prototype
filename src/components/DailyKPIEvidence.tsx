import { useEffect, useState } from 'react';
import { isDailyKPIEvidenceSnapshot } from '../data/daily-kpi-evidence';
import { parseDailyKPIMessage } from '../data/daily-kpi-message';
import { DailyKPISummary } from './DailyKPISummary';
import './daily-kpi-evidence.css';

const received = (value: string) => new Date(value).toLocaleString('en-SG', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  timeZone: 'Asia/Singapore',
});

/** Uses only the original captured with this report or claim, never the live inbox. */
export function DailyKPIEvidence({ evidence, projectId, projectCode, includePhoto = true }: {
  evidence: unknown; projectId: string; projectCode?: string; includePhoto?: boolean;
}) {
  const snapshot = isDailyKPIEvidenceSnapshot(evidence, projectId, projectCode) ? evidence : null;
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [snapshot?.photo]);
  if (!snapshot) return <p className="daily-kpi-evidence-unavailable">The saved daily KPI original is unavailable. No replacement source has been inferred.</p>;
  const details = parseDailyKPIMessage(snapshot.text);
  const generated = /^\/assets\/demo-[a-z0-9-]+\.jpg(?:[?#]|$)/.test(snapshot.photo || '');

  return <section className="daily-kpi-evidence" aria-label="Original daily KPI update">
    <h3>Original daily KPI update</h3>
    <dl className="daily-kpi-evidence-meta">
      <div><dt>Sender</dt><dd>{snapshot.sender}{snapshot.senderRole && <span>{snapshot.senderRole}</span>}</dd></div>
      <div><dt>Received</dt><dd>{received(snapshot.date)}</dd></div>
    </dl>
    <blockquote className="daily-kpi-evidence-original">{snapshot.text}</blockquote>
    {includePhoto && snapshot.photo && <figure className="daily-kpi-evidence-photo">
      {photoFailed ? <p>Original photo could not be displayed. The saved text remains available.</p>
        : <img src={snapshot.photo} alt={snapshot.photoAlt || 'Photo saved with the original daily KPI update'} onError={() => setPhotoFailed(true)} />}
      <figcaption>{generated ? 'Generated demo photo' : 'Saved original photo'} · original daily KPI update</figcaption>
    </figure>}
    {!includePhoto && snapshot.photo && <p className="daily-kpi-evidence-shared-photo">Original photo: shown with the clarified reply.</p>}
    {details && <DailyKPISummary details={details} />}
  </section>;
}
