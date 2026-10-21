import { ArrowRight, CheckCheck, FileText, History, Plus } from 'lucide-react';
import { Badge, Button, formatTime } from './ui.jsx';
import { amount, periodLabel, selectedRows } from './claim-view-utils.js';
import { getClaimTracking } from '../data/claim-tracking.js';
import './saved-claims.css';

export function SavedClaimsList({ project, groups, currency, dirtyPeriods, onContinue, onPrepare, onPreview, onTrack }) {
  function renderRecord(draft, latest = true) {
    const prepared = draft.status === 'prepared';
    const tracking = prepared && project ? getClaimTracking(project, draft.id) : null;
    const status = tracking?.status || (prepared ? 'prepared' : 'draft');
    const statusLabel = { draft: 'Draft', prepared: 'Prepared', submitted: 'Submitted · demo', certified: 'Certified · demo', paid: 'Paid · demo' }[status];
    const showPrepare = latest && !prepared;
    const prepareHelp = showPrepare ? dirtyPeriods[draft.period]
      ? 'Save your edits before marking this claim prepared.'
      : !draft.snapshot?.canPrepare ? 'Continue editing to finish the checks before preparing.' : '' : '';
    const helpId = `claim-prepare-help-${encodeURIComponent(draft.id)}`;
    const itemCount = selectedRows(draft.snapshot).length;
    const continueAction = latest && <Button className={prepareHelp ? 'primary' : ''} icon={prepared ? Plus : ArrowRight} onClick={() => onContinue(draft)}>{prepared ? 'Start new version' : 'Continue editing'}</Button>;
    const previewAction = <Button className={prepared && latest && !onTrack ? 'primary' : ''} icon={FileText} onClick={() => onPreview?.(draft.id)}>Preview &amp; export</Button>;
    const trackingAction = prepared && onTrack && <Button className={latest ? 'primary' : ''} icon={ArrowRight} onClick={() => onTrack(draft.id)}>{latest ? 'Track claim status' : 'View claim status'}</Button>;
    const prepareAction = showPrepare && <Button className={prepareHelp ? '' : 'primary'} icon={CheckCheck} disabled={!!prepareHelp} aria-describedby={prepareHelp ? helpId : undefined} onClick={() => onPrepare(draft.id)}>Mark prepared</Button>;

    return <article className={`claim-history-record${latest ? '' : ' older'}`} key={draft.id}>
      <div className="claim-history-main">
        <div className="claim-history-title"><h3>{latest ? periodLabel(draft.period) : `Version ${draft.revision}`}</h3><Badge tone={['prepared', 'paid'].includes(status) ? 'green' : status === 'draft' ? 'slate' : 'blue'}>{statusLabel}</Badge>{latest && dirtyPeriods[draft.period] && <span className="claim-unsaved">Unsaved edits</span>}</div>
        <p className="claim-history-meta">{latest && `Version ${draft.revision} · `}{itemCount} selected {itemCount === 1 ? 'item' : 'items'}</p>
        <p className="claim-history-date">Saved {formatTime(draft.createdAt)}</p>
        {prepareHelp && <p className="claim-history-help" id={helpId}>{prepareHelp}</p>}
      </div>
      <div className="claim-history-amount"><small>{prepared ? 'Claim amount' : 'This month'}</small><strong><span>{draft.snapshot?.currency || currency}</span> {amount(draft.snapshot?.totals?.currentValue)}</strong></div>
      <div className="claim-history-actions">
        {prepareHelp ? <>{previewAction}{prepareAction}{continueAction}</> : <>{continueAction}{previewAction}{prepareAction}{trackingAction}</>}
      </div>
    </article>;
  }

  return <div className="claim-history-list">{groups.map((group) => <section className="claim-history-group" key={group.period}>
    {renderRecord(group.drafts[0])}
    {group.drafts.length > 1 && <details className="claim-older-versions"><summary><History size={14} />{group.drafts.length - 1} earlier {group.drafts.length === 2 ? 'version' : 'versions'}</summary>{group.drafts.slice(1).map((draft) => renderRecord(draft, false))}</details>}
  </section>)}</div>;
}
