import { useRef, useState } from 'react';
import { Archive, RotateCcw } from 'lucide-react';
import type { Project } from '../types/domain';
import { getMessageDismissalEligibility, getMessageInboxDecision } from '../data/message-dismissal';
import { clearFormBuffer } from '../data/form-buffer';
import { useBufferedState } from './useFormBuffer';
import { ActionMenu } from './ActionMenu';
import { Button, FormActions, FormField, Modal, Textarea, formatTime } from './ui';

export interface InboxDecisionFields { reason: string; sourceKey: string; expectedDecisionId: string | null }
export interface InboxDecisionResult { outcome: string; error?: string }
type InboxDecisionCallback = (messageId: string, fields: InboxDecisionFields) => InboxDecisionResult | undefined;
interface MessageInboxActionsProps {
  project: Project; messageId: string; editing?: boolean; recordOnly?: boolean;
  onDismiss?: InboxDecisionCallback; onReopen?: InboxDecisionCallback;
}
interface OpenDecision { action: 'dismiss' | 'reopen'; sourceKey: string; expectedDecisionId: string | null }
const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? formatTime(value) : 'Time unavailable';

/** Inbox decisions are separate from source evidence and never create progress. */
export function MessageInboxActions({ project, messageId, editing = false, recordOnly = false, onDismiss, onReopen }: MessageInboxActionsProps) {
  const context = getMessageInboxDecision(project, messageId);
  const eligibility = getMessageDismissalEligibility(project, messageId);
  const [open, setOpen] = useState<OpenDecision | null>(null);
  function start(action: OpenDecision['action']) {
    if (editing || context.blocked) return;
    setOpen({ action, sourceKey: eligibility.sourceKey, expectedDecisionId: eligibility.expectedDecisionId });
  }
  if (recordOnly) {
    if (context.blocked) return <p className="notice warning" role="status">{context.issue || 'This message’s saved decision needs review. Its original evidence is retained.'}</p>;
    if (!context.latest) return null;
    const latest = context.latest;
    return <section className="wa-inbox-decision" aria-label="Message decision">
      <strong>{context.dismissed ? 'Message dismissed' : 'Message reopened for review'}</strong>
      <p>{latest.reason}</p>
      <small>{latest.reviewedBy} · {dateLabel(latest.reviewedAt)}</small>
      {context.dismissed && <p className="wa-inbox-decision-note">Original evidence retained. Reopen to review this message again.</p>}
      {context.history.length > 1 && <details className="wa-decision-history"><summary>Decision history</summary><ol>{context.history.map(entry => <li key={entry.id}><strong>{entry.action === 'dismiss' ? 'Dismissed' : 'Reopened'}</strong><p>{entry.reason}</p><small>{entry.reviewedBy} · {dateLabel(entry.reviewedAt)}</small></li>)}</ol></details>}
    </section>;
  }
  const canDismiss = eligibility.eligible && Boolean(onDismiss);
  const canReopen = eligibility.canReopen && Boolean(onReopen);
  if (!canDismiss && !canReopen) return null;
  return <>
    <ActionMenu label="Message actions" items={[
      canDismiss && { label: 'Dismiss message', icon: Archive, disabled: editing, onSelect: () => start('dismiss') },
      canReopen && { label: 'Reopen', icon: RotateCcw, onSelect: () => start('reopen') },
    ]}/>
    {open && <InboxDecisionDialog key={JSON.stringify([project.id, messageId, open])} projectId={project.id} messageId={messageId} decision={open} blocked={editing || context.blocked} onSave={open.action === 'dismiss' ? onDismiss : onReopen} onClose={() => setOpen(null)}/>}
  </>;
}

function InboxDecisionDialog({ projectId, messageId, decision, blocked, onSave, onClose }: {
  projectId: string; messageId: string; decision: OpenDecision; blocked: boolean;
  onSave?: InboxDecisionCallback; onClose: () => void;
}) {
  const dismissing = decision.action === 'dismiss';
  const scope = `whatsapp-inbox-decision:${JSON.stringify([messageId, decision.action, decision.sourceKey, decision.expectedDecisionId])}`;
  const [reason, setReason] = useBufferedState(projectId, scope, '');
  const [error, setError] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  function save() {
    if (blocked) { setReasonError(false); setError('Finish or cancel the open message edits before saving this decision.'); return; }
    if (!reason.trim()) { setReasonError(true); setError(dismissing ? 'Enter a reason for dismissing this message.' : 'Enter a reason for reopening this message.'); reasonRef.current?.focus(); return; }
    const result = onSave?.(messageId, { reason: reason.trim(), sourceKey: decision.sourceKey, expectedDecisionId: decision.expectedDecisionId });
    if (!result || result.outcome === 'invalid') { setReasonError(false); setError(result?.error || 'This decision could not be saved. Review the message and try again.'); return; }
    clearFormBuffer(projectId, scope); onClose();
  }
  return <Modal title={dismissing ? 'Dismiss message' : 'Reopen message'} description={dismissing ? 'Remove this message from the review queue. Its original text and attachments stay in the inbox.' : 'Return this message to review. Progress updates remain a separate action.'} onClose={onClose}>
    <form className="wa-inbox-decision-form" noValidate onSubmit={event => { event.preventDefault(); save(); }}>
      <FormField label={dismissing ? 'Reason for dismissal' : 'Reason for reopening'} required error={reasonError ? error : undefined}>
        <Textarea autoFocus ref={reasonRef} name="reason" rows={3} maxLength={1000} value={reason} placeholder={dismissing ? 'e.g. Sent to the wrong project.' : 'e.g. Confirmed this message belongs to this project.'} onChange={event => { setReason(event.target.value); setError(''); setReasonError(false); }}/>
      </FormField>
      {error && !reasonError && <p className="form-field-error" role="alert">{error}</p>}
      <FormActions secondary={<Button onClick={onClose}>Cancel</Button>}><Button className="primary" type="submit" disabled={blocked}>{dismissing ? 'Dismiss message' : 'Reopen message'}</Button></FormActions>
    </form>
  </Modal>;
}
