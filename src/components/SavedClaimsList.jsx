import { ArrowRight, CheckCheck, FileText, History, Plus } from 'lucide-react';
import { Badge, Button, formatTime } from './ui.jsx';
import { amount, periodLabel, selectedRows } from './claim-view-utils.js';
import { getClaimTracking } from '../data/claim-tracking.js';
import { getClaimRevisionContext } from '../data/claim-revisions.js';
import './saved-claims.css';

export function SavedClaimsList({ project, groups, currency, dirtyPeriods, onContinue, onPrepare, onPreview, onTrack, onRevise }) {
  function renderRecord(draft, latest = true) {
    const prepared = draft.status === 'prepared';
    const tracking = prepared && project ? getClaimTracking(project, draft.id) : null;
    const status = tracking?.status || (prepared ? 'prepared' : 'draft');
    const queryContext = status === 'queried' && project ? getClaimRevisionContext(project, draft.id) : null;
    const revisionContext = draft.revisionOf && project ? getClaimRevisionContext(project, draft.revisionOf) : null;
    const revisionSource = revisionContext && revisionContext.query?.id === draft.queryId ? revisionContext.source : null;
    const statusLabel = { draft: revisionSource ? 'Revision draft' : 'Draft', prepared: 'Prepared', submitted: revisionSource ? 'Resubmitted · demo' : 'Submitted · demo', queried: queryContext?.revision ? 'Query recorded · demo' : 'Needs revision · demo', certified: 'Certified · demo', paid: 'Paid · demo' }[status];
    const showPrepare = latest && !prepared;
    const prepareHelp = showPrepare ? dirtyPeriods[draft.period]
      ? 'Save your edits before marking this claim prepared.'
      : !draft.snapshot?.canPrepare ? 'Continue editing to finish the checks before preparing.' : '' : '';
    const helpId = `claim-prepare-help-${encodeURIComponent(draft.id)}`;
    const itemCount = selectedRows(draft.snapshot).length;
    const continueClaim = () => !prepared && revisionSource && onRevise ? onRevise(revisionSource.id) : onContinue(draft);
    const canContinue = latest && status !== 'queried' && !(prepared && revisionSource);
    const continueLabel = prepared ? 'Start new version' : revisionSource ? 'Continue revision' : 'Continue editing';
    const nextStep = prepareHelp || ({
      draft: 'Review the saved claim, then mark it prepared.',
      prepared: 'Record submission for this prepared version.',
      submitted: 'Record certification or a query for this version.',
      queried: queryContext?.revision ? `Version ${queryContext.revision.revision} responds to this query. Open the query to follow its progress.` : 'Review the query and respond in a separate claim revision.',
      certified: 'Record the total paid to date for this version.',
      paid: 'Payment is fully recorded. View the claim status for its history.',
    }[status]);
    const previewAction = <Button className={prepared && latest && !onTrack ? 'primary' : ''} icon={FileText} onClick={() => onPreview?.(draft.id)}>Preview &amp; export</Button>;
    const trackingAction = prepared && onTrack && <Button className={latest ? 'primary' : ''} icon={ArrowRight} onClick={() => onTrack(draft.id)}>{status === 'queried' ? latest ? 'Review query' : 'View query history' : latest ? 'Track claim status' : 'View claim status'}</Button>;
    const primaryDraftAction = showPrepare && (prepareHelp
      ? <Button className="primary" icon={ArrowRight} aria-describedby={helpId} onClick={continueClaim}>{continueLabel}</Button>
      : <Button className="primary" icon={CheckCheck} onClick={() => onPrepare(draft.id)}>Mark prepared</Button>);
    const blockedPrepareAction = showPrepare && prepareHelp && <Button icon={CheckCheck} disabled aria-describedby={helpId}>Mark prepared</Button>;

    return <article className={`claim-history-record${latest ? '' : ' older'}`} key={draft.id}>
      <div className="claim-history-main">
        <div className="claim-history-title"><h3>{latest ? periodLabel(draft.period) : `Version ${draft.revision}`}</h3><Badge tone={['prepared', 'paid'].includes(status) ? 'green' : status === 'queried' && !queryContext?.revision ? 'amber' : status === 'draft' ? 'slate' : 'blue'}>{statusLabel}</Badge>{latest && dirtyPeriods[draft.period] && <span className="claim-unsaved">Unsaved edits</span>}</div>
        <p className="claim-history-meta">{latest && <strong>Version {draft.revision}</strong>}{latest && ' · '}{itemCount} selected {itemCount === 1 ? 'item' : 'items'}</p>
      </div>
      <div className="claim-history-amount"><small>{prepared ? 'Claim amount' : 'This month'}</small><strong><span>{draft.snapshot?.currency || currency}</span> {amount(draft.snapshot?.totals?.currentValue)}</strong></div>
      {latest && <p className={`claim-history-next${prepareHelp ? ' needs-attention' : ''}`} id={prepareHelp ? helpId : undefined}>{nextStep}</p>}
      <details className="claim-version-details"><summary>Version details</summary><div className="claim-version-details-content">
        <p>Saved {formatTime(draft.createdAt)}</p>
        {revisionSource && <p>Revises version {revisionSource.revision} · Query {revisionContext.query.reference}</p>}
        {revisionSource && draft.revisionResponse && <div className="claim-history-response"><strong>QS response</strong><p>{draft.revisionResponse}</p></div>}
        {queryContext?.revision && <p>Revised in version {queryContext.revision.revision}. Original assessment retained.</p>}
        {canContinue && !prepareHelp && <Button icon={prepared ? Plus : ArrowRight} onClick={continueClaim}>{continueLabel}</Button>}
      </div></details>
      <div className="claim-history-actions">
        {previewAction}{blockedPrepareAction}{primaryDraftAction}{trackingAction}
      </div>
    </article>;
  }

  return <div className="claim-history-list">{groups.map((group) => <section className="claim-history-group" key={group.period}>
    {renderRecord(group.drafts[0])}
    {group.drafts.length > 1 && <details className="claim-older-versions"><summary><History size={14} />{group.drafts.length - 1} earlier {group.drafts.length === 2 ? 'version' : 'versions'}</summary>{group.drafts.slice(1).map((draft) => renderRecord(draft, false))}</details>}
  </section>)}</div>;
}
