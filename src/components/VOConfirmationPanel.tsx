import type { Project } from '../types/domain';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MessageSquare, Save } from 'lucide-react';
import { getVOConfirmationApprovalValues, getVOConfirmationContext } from '../data/vo-confirmation';
import { useBufferedState } from './useFormBuffer';
import { Button, FormActions, FormField, SelectField, formatMoney, formatTime } from './ui';
import './vo-confirmation-panel.css';

type ReplyKind = 'scopeAcknowledged' | 'priceApproved' | 'changesRequested';
type ConfirmationContext = ReturnType<typeof getVOConfirmationContext>;
type ConfirmationRequest = ConfirmationContext['requests'][number];
type RequestSnapshot = ConfirmationRequest['snapshot'];
interface ActionResult { outcome: string; error?: string }
export interface VOConfirmationPanelProps {
  project: Project;
  caseId: string;
  hasUnsavedChanges: boolean;
  hasApprovalEdits?: boolean;
  onCreate?: (caseId: string, values: { recipient: string; authority: string; sourceKey: string }) => ActionResult | undefined;
  onReply?: (caseId: string, requestId: string, values: { kind: ReplyKind; message: string }) => ActionResult | undefined;
  onUseApproval?: (requestId: string) => void;
}

const replyLabels: Record<ReplyKind, string> = { scopeAcknowledged: 'Scope acknowledged', priceApproved: 'Price approved', changesRequested: 'Changes requested' };
const demoReplies: Record<ReplyKind, string> = {
  scopeAcknowledged: 'Demo reply: I acknowledge the scope described in this request. The price has not been approved.',
  priceApproved: 'Demo reply: I approve the proposed price shown in this request for the stated scope.',
  changesRequested: 'Demo reply: Please clarify the additional scope and review the proposed price before approval.',
};
const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? formatTime(value) : 'Date not recorded';
const moneyLabel = (snapshot: RequestSnapshot) => snapshot.proposedValue == null ? 'Unknown' : `${snapshot.currency || 'Currency not recorded'} ${formatMoney(snapshot.proposedValue)}`;

function RequestDetails({ snapshot, recipient, authority }: { snapshot: RequestSnapshot; recipient: string; authority: string }) {
  return <dl className="vo-confirmation-summary">
    <div><dt>Work</dt><dd>{snapshot.title}</dd></div>
    <div><dt>Scope</dt><dd>{snapshot.scopeAssessment || 'Not recorded'}</dd></div>
    <div><dt>Instruction reference</dt><dd>{snapshot.instructionReference || 'Not recorded'}</dd></div>
    <div><dt>Proposed price</dt><dd>{moneyLabel(snapshot)}</dd></div>
    <div><dt>Confirmation requested</dt><dd>{snapshot.proposedValue == null ? 'Acknowledge the stated scope only. Price approval is not yet requested.' : 'Acknowledge the stated scope and approve the proposed price. No time approval is requested.'}</dd></div>
    <div><dt>Recipient</dt><dd>{recipient}</dd></div>
    <div><dt>Approval authority</dt><dd>{authority}</dd></div>
  </dl>;
}

function SavedReply({ request }: { request: ConfirmationRequest }) {
  if (!request.reply) return null;
  return <div className="vo-confirmation-saved-reply"><strong>{replyLabels[request.reply.kind]}</strong><blockquote>{request.reply.message}</blockquote><p>{request.reply.respondent} · {dateLabel(request.reply.repliedAt)} · Simulated reply</p></div>;
}

export function VOConfirmationPanel({ project, caseId, hasUnsavedChanges, hasApprovalEdits = false, onCreate, onReply, onUseApproval }: VOConfirmationPanelProps) {
  const context = getVOConfirmationContext(project, caseId);
  const sourceIdentity = JSON.stringify([caseId, context.key]);
  const [requestDraft, setRequestDraft] = useBufferedState(project.id, `vo-confirmation-request:${sourceIdentity}`, { recipient: '', authority: '', preview: false, newRequest: false });
  const current = context.currentRequest;
  const [replyDraft, setReplyDraft] = useBufferedState(project.id, `vo-confirmation-reply:${JSON.stringify([caseId, current?.id || context.key])}`, { kind: 'scopeAcknowledged' as ReplyKind, messages: { scopeAcknowledged: '', priceApproved: '', changesRequested: '' } });
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const recipientRef = useRef<HTMLInputElement>(null);
  const authorityRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setError(''); setFeedback(''); }, [project.id, caseId, context.key, current?.id]);

  const snapshot = context.snapshot;
  const stale = !!context.latestRequest && !current;
  const showRequestForm = context.canCreate && (!current || requestDraft.newRequest);
  const blocked = hasUnsavedChanges;
  const canReply = context.entry?.status === 'pendingApproval' && context.entry.scopeDisposition === 'variation' && !!current && !current.reply && !stale;
  const approvalValues = current && getVOConfirmationApprovalValues(project, caseId, current.id);
  const status = stale ? 'New request needed' : current?.reply ? replyLabels[current.reply.kind] : current ? 'Awaiting reply' : context.requests.length ? 'History retained' : 'Not requested';
  const changeRequest = (name: 'recipient' | 'authority', value: string) => { setRequestDraft(prior => ({ ...prior, [name]: value, preview: false })); setError(''); setFeedback(''); };
  const guard = (action: 'request' | 'reply' = 'request') => {
    if (blocked) { setError('Save or cancel QS edits first.'); return false; }
    if (action === 'request' ? !context.canCreate : !canReply) { setError(context.error || 'This review is not awaiting price approval.'); return false; }
    return true;
  };
  function preview() {
    if (!guard()) return;
    if (!requestDraft.recipient.trim()) { setError('Enter the mock recipient.'); recipientRef.current?.focus(); return; }
    if (!requestDraft.authority.trim()) { setError('Record the recipient’s approval authority.'); authorityRef.current?.focus(); return; }
    setError(''); setFeedback(''); setRequestDraft(prior => ({ ...prior, preview: true }));
  }
  function saveRequest() {
    if (!guard() || !requestDraft.preview) return;
    const result = onCreate?.(caseId, { recipient: requestDraft.recipient, authority: requestDraft.authority, sourceKey: context.key });
    if (result?.outcome === 'invalid') { setError(result.error || 'Check the request and try again.'); return; }
    if (result?.outcome === 'updated' || result?.outcome === 'unchanged') {
      setError(''); setFeedback(result.outcome === 'updated' ? 'Mock request saved. Nothing was sent.' : 'This mock request is already saved.');
      setRequestDraft(prior => ({ ...prior, preview: false, newRequest: false }));
    }
  }
  function saveReply() {
    if (!guard('reply') || !current || !canReply) return;
    const message = replyDraft.messages[replyDraft.kind];
    if (!message.trim()) { setError('Enter the simulated customer reply.'); messageRef.current?.focus(); return; }
    const result = onReply?.(caseId, current.id, { kind: replyDraft.kind, message });
    if (result?.outcome === 'invalid') { setError(result.error || 'Check the reply and try again.'); return; }
    if (result?.outcome === 'updated' || result?.outcome === 'unchanged') { setError(''); setFeedback('Mock reply saved. QS approval is still separate.'); }
  }

  return <details className="vo-customer-confirmation">
    <summary><span><MessageSquare size={15} aria-hidden="true"/><strong>Customer confirmation</strong></span><span className="vo-confirmation-state">{status}<ChevronDown size={15} aria-hidden="true"/></span></summary>
    <div className="vo-confirmation-body">
      <p className="vo-confirmation-note">Browser-local demo · Nothing is sent. Acknowledging scope does not approve the price.</p>
      {blocked && <p className="vo-confirmation-warning" role="status">Save or cancel QS edits first. The request uses the saved scope and price.</p>}
      {stale && <p className="vo-confirmation-warning">The scope, price or review has changed. Create a new request; the previous version stays in history.</p>}
      {!context.canCreate && !canReply && <p className="vo-confirmation-note">{['approved', 'rejected'].includes(context.entry?.status || '') ? 'Customer confirmation is read-only after the QS decision. Reopen the review before requesting again.' : context.error || 'Requests are available while this work is awaiting price approval.'}</p>}
      {showRequestForm && <div className="vo-confirmation-request-form">
        <div className="vo-confirmation-fields"><FormField label="Recipient" required><input ref={recipientRef} name="confirmationRecipient" value={requestDraft.recipient} onChange={event => changeRequest('recipient', event.target.value)} placeholder="Customer name or role"/></FormField><FormField label="Approval authority" required hint="Record their role or authority to approve the proposed price."><input ref={authorityRef} name="confirmationAuthority" value={requestDraft.authority} onChange={event => changeRequest('authority', event.target.value)} placeholder="Approving role or recorded authority"/></FormField></div>
        <FormActions secondary={<Button className="ghost" disabled={blocked} onClick={() => { setRequestDraft(prior => ({ ...prior, recipient: 'Jordan Lee · Fictional demo customer', authority: 'Fictional customer representative · Demo price approval authority', preview: false })); setError(''); setFeedback(''); }}>Use demo contact</Button>}><Button disabled={blocked} onClick={preview}>Preview request</Button>{current && <Button className="ghost" onClick={() => setRequestDraft(prior => ({ ...prior, newRequest: false, preview: false }))}>Cancel new request</Button>}</FormActions>
        {requestDraft.preview && snapshot && <section className="vo-confirmation-preview" aria-label="Request preview"><h4>Request preview</h4><RequestDetails snapshot={snapshot} recipient={requestDraft.recipient.trim()} authority={requestDraft.authority.trim()}/><p className="vo-confirmation-note">The saved request will retain these details. Any later scope or price change needs a new request.</p><FormActions><Button className="primary" icon={Save} disabled={blocked || !onCreate} onClick={saveRequest}>Save mock request</Button></FormActions></section>}
      </div>}
      {current && <section className="vo-confirmation-current" aria-label="Saved customer request"><header><strong>Request {current.version}</strong><span>{dateLabel(current.requestedAt)} · Mock request</span></header><details className="vo-confirmation-request-details"><summary>View saved request</summary><RequestDetails snapshot={current.snapshot} recipient={current.recipient} authority={current.authority}/></details><SavedReply request={current}/>
        {canReply && <div className="vo-confirmation-reply-form"><h4>Simulate customer reply</h4><FormField label="Reply type"><SelectField name="confirmationReplyKind" value={replyDraft.kind} disabled={blocked} onChange={event => { setReplyDraft(prior => ({ ...prior, kind: event.target.value as ReplyKind })); setError(''); setFeedback(''); }}><option value="scopeAcknowledged">Scope acknowledged</option><option value="priceApproved" disabled={current.snapshot.proposedValue == null}>Price approved</option><option value="changesRequested">Changes requested</option></SelectField></FormField><FormField label="Reply message" required><textarea ref={messageRef} name="confirmationReplyMessage" rows={3} value={replyDraft.messages[replyDraft.kind]} disabled={blocked} onChange={event => { const message = event.target.value; setReplyDraft(prior => ({ ...prior, messages: { ...prior.messages, [prior.kind]: message } })); setError(''); setFeedback(''); }}/></FormField>{current.snapshot.proposedValue == null && <p className="vo-confirmation-note">Record a proposed price in a new request before simulating price approval.</p>}<FormActions secondary={<Button className="ghost" disabled={blocked} onClick={() => { setReplyDraft(prior => ({ ...prior, messages: { ...prior.messages, [prior.kind]: demoReplies[prior.kind] } })); setError(''); setFeedback(''); }}>Use demo reply</Button>}><Button icon={Save} disabled={blocked} onClick={saveReply}>Save mock reply</Button></FormActions></div>}
        {approvalValues && onUseApproval && <div className="vo-confirmation-use"><p className="vo-confirmation-note">Copy this reply into the QS approval fields, then review and record approval separately.</p>{hasApprovalEdits && <p className="vo-confirmation-note">Keep or clear your entered approval details before using the reply.</p>}<Button disabled={blocked || hasApprovalEdits} onClick={() => { if (!blocked && !hasApprovalEdits) onUseApproval(current.id); }}>Use reply in approval form</Button></div>}
        {context.canCreate && current.reply && !requestDraft.newRequest && <Button className="ghost vo-confirmation-new" disabled={blocked} onClick={() => { setRequestDraft(prior => ({ ...prior, newRequest: true, preview: false })); setError(''); setFeedback(''); }}>New mock request</Button>}
      </section>}
      {context.requests.length > 0 && <details className="vo-confirmation-history"><summary>Request history · {context.requests.length}</summary><ol>{[...context.requests].reverse().map(request => <li key={request.id}><strong>Request {request.version}{current?.id === request.id ? ' · Current' : ''}</strong><p>{dateLabel(request.requestedAt)} · {request.recipient}</p><details><summary>Request details</summary><RequestDetails snapshot={request.snapshot} recipient={request.recipient} authority={request.authority}/></details><SavedReply request={request}/>{!request.reply && <p>No reply recorded.</p>}</li>)}</ol></details>}
      {error && <p className="vo-confirmation-error" role="alert">{error}</p>}{feedback && <p className="vo-confirmation-feedback" role="status">{feedback}</p>}
    </div>
  </details>;
}
