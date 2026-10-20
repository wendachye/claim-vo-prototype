import { ArrowRight, Flag } from 'lucide-react';
import { Badge, Button, formatTime } from './ui.jsx';

const dateLabel = (date) => date && Number.isFinite(new Date(date).getTime()) ? formatTime(date) : '';

export function AreaVOPanel({ area, flags, onOpenVO, onOpenEvidence }) {
  if (!flags || (!flags.totalCount && !flags.newMessageCount)) return null;
  const currentCases = flags.cases.filter((entry) => entry.status !== 'rejected');
  const rejectedCases = flags.cases.filter((entry) => entry.status === 'rejected');
  const renderCase = (entry, index, list) => <article className={`drawing-vo-case${entry.status === 'rejected' ? ' rejected' : ''}`} key={entry.id}>
    <div className="drawing-vo-case-heading"><strong>{entry.title || 'Extra work'}</strong><Badge tone={entry.tone}>{entry.label}</Badge></div>
    {dateLabel(entry.date) && <small>{dateLabel(entry.date)}</small>}
    {entry.matchKind === 'work-item' && entry.matchLabel && !list.slice(0, index).some((previous) => previous.matchKind === 'work-item' && previous.matchLabel === entry.matchLabel) && <p className="drawing-vo-match">{entry.matchLabel}</p>}
    {onOpenVO && <Button className="ghost" icon={ArrowRight} onClick={() => onOpenVO(entry.id, area.id)}>Review VO</Button>}
  </article>;

  return <section className="drawing-area-vo" aria-label={`Extra work for area ${area.code}`}>
    <header className="drawing-vo-heading"><h3><Flag size={14} />Extra work</h3>{flags.openCount + flags.newMessageCount > 0 && <span>{flags.openCount + flags.newMessageCount} to review</span>}</header>
    {currentCases.length > 0 && <div className="drawing-vo-case-list">{currentCases.map(renderCase)}</div>}
    {flags.newMessages.length > 0 && <div className="drawing-vo-new-messages">{flags.newMessages.map((entry) => <article className="drawing-vo-message" key={entry.id}><strong>{entry.title || 'Extra work reported from site'}</strong><p>{entry.label}</p>{dateLabel(entry.date) && <small>{dateLabel(entry.date)}</small>}{onOpenEvidence && <Button className="ghost" icon={ArrowRight} onClick={() => onOpenEvidence({ id: `message:${entry.id}` }, area.id)}>See message</Button>}</article>)}<p className="drawing-vo-message-help">Review the message before creating a VO.</p></div>}
    {rejectedCases.length > 0 && <details className="drawing-vo-rejected"><summary>Rejected history · {rejectedCases.length}</summary><div>{rejectedCases.map(renderCase)}</div></details>}
  </section>;
}
