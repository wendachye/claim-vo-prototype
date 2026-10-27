import type { Project } from '../types/domain';
import type { ClaimDraft } from '../types/claims';
import { ArrowRight, CheckCheck, FileText, History, Pencil, Plus } from 'lucide-react';
import { Badge, Button, formatTime } from './ui';
import { amount, periodLabel, selectedRows } from './claim-view-utils.ts';
import { getClaimTracking } from '../data/claim-tracking.ts';
import { getClaimRevisionContext } from '../data/claim-revisions.ts';
import { getClaimPeriodLock } from '../data/claim-actions.ts';
import './saved-claims.css';

export function SavedClaimsList({ project, groups, currency, dirtyPeriods, onContinue, onPrepare, onPreview, onTrack, onRevise }: { project: Project; groups: {period: string; drafts: ClaimDraft[]}[]; currency: string; dirtyPeriods: Record<string, boolean>; onContinue: (draft: ClaimDraft) => void; onPrepare: (id: string) => void; onPreview?: (id: string) => void; onTrack?: (id: string) => void; onRevise?: (id: string) => void }) {
  function renderRecord(draft: ClaimDraft, latest = true) {
    const prepared = draft.status === 'prepared';
    const tracking = prepared && project ? getClaimTracking(project, draft.id) : null;
    const status = tracking?.status || (prepared ? 'prepared' : 'draft');
    const queryContext = status === 'queried' && project ? getClaimRevisionContext(project, draft.id) : null;
    const revisionContext = draft.revisionOf && project ? getClaimRevisionContext(project, draft.revisionOf) : null;
    const revisionSource = revisionContext && revisionContext.query?.id === draft.queryId ? revisionContext.source : null;
    const periodLock = project && !revisionSource ? getClaimPeriodLock(project, draft.period) : null;
    const blockedByIssued = !!periodLock && (!prepared || status === 'prepared' && periodLock.draft.id !== draft.id);
    const readyDraft = latest && !prepared && !blockedByIssued && draft.snapshot?.canPrepare && !dirtyPeriods[draft.period];
    const draftLabel = blockedByIssued ? 'Read-only draft' : revisionSource ? 'Revision draft' : readyDraft ? 'Ready to prepare' : latest && !draft.snapshot?.canPrepare ? 'Incomplete draft' : 'Draft';
    const statusLabel = ({ draft: draftLabel, prepared: 'Prepared', submitted: revisionSource ? 'Resubmitted · demo' : 'Submitted · demo', queried: queryContext?.revision ? 'Query recorded · demo' : 'Needs revision · demo', certified: 'Certified · demo', paid: 'Paid · demo' } as Record<string, string>)[status];
    const showPrepare = latest && !prepared && !blockedByIssued;
    const prepareHelp = showPrepare ? dirtyPeriods[draft.period]
      ? 'Save your edits before marking this claim prepared.'
      : !draft.snapshot?.canPrepare ? 'Continue editing to finish the checks before preparing.' : '' : '';
    const helpId = `claim-prepare-help-${encodeURIComponent(draft.id)}`;
    const itemCount = selectedRows(draft.snapshot).length;
    const continueClaim = () => !prepared && revisionSource && onRevise ? onRevise(revisionSource.id) : onContinue(draft);
    const canContinue = latest && !blockedByIssued && (!prepared || status === 'prepared' && !revisionSource && !periodLock);
    const continueLabel = prepared ? 'Start new version' : revisionSource ? 'Continue revision' : prepareHelp ? 'Continue editing' : 'Edit claim';
    const nextStep = blockedByIssued ? 'This month already has an issued claim. Open its status; this saved version stays read only.' : prepareHelp || (({
      draft: 'Review the saved claim, then mark it prepared.',
      prepared: 'Record submission for this prepared version.',
      submitted: 'Record certification or a query for this version.',
      queried: queryContext?.revision ? `Version ${queryContext.revision.revision} responds to this query. Open the query to follow its progress.` : 'Review the query and respond in a separate claim revision.',
      certified: 'Record the total paid to date for this version.',
      paid: 'Payment is fully recorded. This claim is read only.',
    } as Record<string, string>)[status]);
    const previewAction = <Button className={prepared && latest && !onTrack ? 'primary' : ''} icon={FileText} onClick={() => onPreview?.(draft.id)}>Preview &amp; export</Button>;
    const trackingStatus = blockedByIssued ? periodLock!.status : status;
    const trackingAction = (prepared || blockedByIssued) && onTrack && <Button className={latest ? 'primary' : ''} icon={ArrowRight} onClick={() => onTrack(blockedByIssued ? periodLock!.draft.id : draft.id)}>{trackingStatus === 'paid' ? 'View payment history' : trackingStatus === 'queried' ? latest ? 'Review query' : 'View query history' : latest ? 'Track claim status' : 'View claim status'}</Button>;
    const primaryDraftAction = showPrepare && (prepareHelp
      ? <Button className="primary" icon={Pencil} aria-describedby={helpId} onClick={continueClaim}>{continueLabel}</Button>
      : <Button className="primary" icon={CheckCheck} onClick={() => onPrepare(draft.id)}>Mark prepared</Button>);
    const blockedPrepareAction = showPrepare && prepareHelp && <Button icon={CheckCheck} disabled aria-describedby={helpId}>Mark prepared</Button>;

    return <article className={`claim-history-record${latest ? '' : ' older'}`} key={draft.id}>
      <div className="claim-history-main">
        <div className="claim-history-title"><h3>{latest ? periodLabel(draft.period) : `Version ${draft.revision}`}</h3></div>
        <p className="claim-history-meta">{itemCount} selected {itemCount === 1 ? 'item' : 'items'}{!latest && <span className="claim-history-saved"> · Saved {formatTime(draft.createdAt)}</span>}</p>
      </div>
      <div className="claim-history-status"><Badge tone={['prepared', 'paid'].includes(status) ? 'green' : status === 'queried' && !queryContext?.revision ? 'amber' : status === 'draft' && !readyDraft ? 'slate' : 'blue'}>{statusLabel}</Badge>{latest && dirtyPeriods[draft.period] && status !== 'paid' && !blockedByIssued && <span className="claim-unsaved">{prepared ? 'Unfinished draft' : 'Unsaved edits'}</span>}</div>
      <div className="claim-history-amount"><small>{prepared ? 'Claim amount' : 'This month'}{draft.snapshot?.claimBasis?.version === 1 && ' · net'}</small><strong><span>{draft.snapshot?.currency || currency}</span> {amount(draft.snapshot?.totals?.currentValue)}</strong></div>
      <div className="claim-history-actions">
        {canContinue && !prepareHelp && <Button className="claim-edit-icon" icon={prepared ? Plus : Pencil} aria-label={continueLabel} title={continueLabel} onClick={continueClaim} />}
        {previewAction}{blockedPrepareAction}{primaryDraftAction}{trackingAction}
      </div>
      {latest && (prepareHelp || blockedByIssued || status === 'queried') && <p className={`claim-history-next${prepareHelp ? ' needs-attention' : ''}`} id={prepareHelp ? helpId : undefined}>{nextStep}</p>}
      {!latest && revisionSource && <p className="claim-history-revision">Revises version {revisionSource.revision} · Query {revisionContext!.query?.reference}</p>}
      {!latest && queryContext?.revision && <p className="claim-history-revision">Revised in version {queryContext.revision.revision}. Original assessment retained.</p>}
      {!latest && revisionSource && draft.revisionResponse && <details className="claim-history-response"><summary>QS response</summary><p>{draft.revisionResponse}</p></details>}
    </article>;
  }

  return <div className="claim-history-list">
    {!!groups.length && <div className="claim-list-head" aria-hidden="true"><span>Month</span><span>Status</span><span>Amount</span><span>Actions</span></div>}
    {groups.map((group) => {
      const latest = group.drafts[0];
      const revisionContext = latest.revisionOf ? getClaimRevisionContext(project, latest.revisionOf) : null;
      const revisionSource = revisionContext && revisionContext.query?.id === latest.queryId ? revisionContext.source : null;
      const queryContext = getClaimTracking(project, latest.id)?.status === 'queried' ? getClaimRevisionContext(project, latest.id) : null;
      return <section className="claim-history-group" key={group.period}>
        {renderRecord(latest)}
        <details className="claim-older-versions"><summary><History size={14} />History<span>{group.drafts.length > 1 ? `${group.drafts.length - 1} earlier ${group.drafts.length === 2 ? 'version' : 'versions'}` : '1 version'}</span></summary>
          <div className="claim-current-version"><p><strong>Version {latest.revision}</strong><span>Saved {formatTime(latest.createdAt)}</span></p>
            {revisionSource && <p className="claim-history-revision">Revises version {revisionSource.revision} · Query {revisionContext!.query?.reference}</p>}
            {queryContext?.revision && <p className="claim-history-revision">Revised in version {queryContext.revision.revision}. Original assessment retained.</p>}
            {revisionSource && latest.revisionResponse && <details className="claim-history-response"><summary>QS response</summary><p>{latest.revisionResponse}</p></details>}
          </div>
          {group.drafts.slice(1).map((draft) => renderRecord(draft, false))}
        </details>
      </section>;
    })}
  </div>;
}
