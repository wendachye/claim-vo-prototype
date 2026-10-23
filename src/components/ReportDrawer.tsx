import type { WorkItem, SiteReport } from '../types/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  AlertTriangle,
  Check,
  Flag,
  ImageOff,
  MessageSquare,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Badge, Button, FormActions, FormField, formatTime } from './ui';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { isReviewableProgressReport, needsProgressClarification } from '../data/report-status';
import './report-drawer.css';

const percent = (value: unknown) => {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return 'Not recorded';
  return `${Number(value)}%`;
};

const defaultCompletion = (report?: SiteReport | null, item?: WorkItem | null) => {
  const value = report?.completion ?? item?.reported;
  return value == null ? '' : String(value);
};

const timeLabel = (value?: string | null) => (
  value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Time not recorded'
);

interface ReportDrawerProps { projectCode?: string; item?: WorkItem | null; report?: SiteReport | null; locked: boolean; onClose?: () => void; onApprove?: (report: SiteReport, completion: string, reason: string) => void; onChange?: (report: SiteReport, action: string, reason: string) => void; onAdd?: (itemId?: string) => void; onReviewVO?: (report: SiteReport) => void }

export function ReportDrawer({
  projectCode,
  item,
  report,
  locked,
  onClose,
  onApprove,
  onChange,
  onAdd,
  onReviewVO,
}: ReportDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const openerRef = useRef(typeof document === 'undefined' ? null : document.activeElement);
  const restoreOpenerOnClose = useRef(true);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const id = useId();
  const [completion, setCompletion] = useState(() => defaultCompletion(report, item));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [photoFailed, setPhotoFailed] = useState(false);

  const isPending = isReviewableProgressReport(report);
  const isClarification = needsProgressClarification(report);
  const isVerified = report?.status === 'verified' || report?.status === 'approved';
  const isVo = Boolean(report?.vo);
  const hasMatchedItem = Boolean(item && report?.itemId === item.id);
  const numericCompletion = Number(completion);
  const validCompletion = completion.trim() !== ''
    && Number.isFinite(numericCompletion)
    && numericCompletion >= 0
    && numericCompletion <= 100;
  const canVerify = Boolean(locked && isPending && hasMatchedItem && !isVo && validCompletion && onApprove);
  const photoUrl = typeof report?.photo === 'string' ? report.photo : report?.photo?.url;
  const isSimulated = report?.demo || report?.origin === 'simulated';
  const isManual = report?.origin === 'manual' || report?.origin === 'uploaded';
  const reportStatus = isVo ? 'Flagged extra work'
    : isVerified ? 'Verified'
      : isClarification ? 'Needs clarification'
        : isPending ? 'Needs verification'
          : report?.status === 'rejected' ? 'Rejected'
            : report?.status || 'No attached update';

  // Reset the editable review when navigating to a different report or item.
  useEffect(() => {
    setCompletion(defaultCompletion(report, item));
    setReason('');
    setError('');
  }, [report?.id, item?.id]);

  useEffect(() => setPhotoFailed(false), [photoUrl]);


  function needReason(message: string) {
    if (reason.trim()) return false;
    setError(message);
    noteRef.current?.focus();
    return true;
  }

  function change(action: string) {
    if (!report || !onChange) return;
    if (needReason('Add a review note so the decision stays clear in the history.')) return;
    setError('');
    onChange(report, action, reason.trim());
  }

  function addUpdate() {
    if (!onAdd) return;
    restoreOpenerOnClose.current = false;
    // Release the Sheet's focus trap before the next dialog captures its opener.
    flushSync(() => setSheetOpen(false));
    if (openerRef.current?.isConnected && openerRef.current instanceof HTMLElement) openerRef.current.focus();
    onAdd(item?.id);
  }

  function approve() {
    if (!canVerify || !report || !onApprove) return;
    const original = report?.completion;
    if ((original == null || Number(original) !== numericCompletion)
      && needReason('Explain the corrected percentage before verifying progress.')) return;
    if (item?.verified != null && numericCompletion < item.verified
      && needReason('Explain the lower verified total before verifying progress.')) return;
    setError('');
    onApprove(report, completion.trim(), reason.trim());
  }

  return (
    <div className="site-report-layer" ref={setPortalContainer}>
      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      {portalContainer && <SheetContent
        ref={drawerRef}
        portalContainer={portalContainer}
        overlayClassName="drawer-backdrop"
        className="drawer"
        side="right"
        showCloseButton={false}
        style={{ width: 560, maxWidth: '100vw' }}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (restoreOpenerOnClose.current && openerRef.current?.isConnected && openerRef.current instanceof HTMLElement) openerRef.current.focus();
        }}
      >
        <header className="drawer-header">
          <div>
            <div className="eyebrow">{projectCode && `${projectCode} · `}{isPending ? 'Supervisor review' : 'Progress details'}</div>
            <SheetTitle asChild><h2 id={`${id}-title`}>{item?.ref ? `Ref. ${item.ref}` : 'Unmatched update'} · {report ? report.area || item?.demoArea || 'Area unassigned' : 'Work item progress'}</h2></SheetTitle>
            <SheetDescription asChild><p id={`${id}-description`}>{item?.description || 'Review the report and match its scope before updating progress.'}</p></SheetDescription>
          </div>
          <Button className="ghost icon" aria-label="Close site report" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </Button>
        </header>

        <div className="drawer-body">
          <div className="message-meta">
            <Badge tone={isVo ? 'amber' : isVerified ? 'green' : 'slate'}>{reportStatus}</Badge>
            {report && (
              <Badge tone={isSimulated ? 'slate' : 'blue'}>
                {isSimulated ? 'Simulated WhatsApp' : isManual ? 'Manual evidence' : 'WhatsApp report'}
              </Badge>
            )}
          </div>

          <section className="site-report-progress" aria-label="Completion totals">
            <dl className="site-report-totals">
              <div><dt>Current reported total</dt><dd>{percent(item?.reported)}</dd><small>Worker’s latest total</small></div>
              <div><dt>Current verified total</dt><dd>{percent(item?.verified)}</dd><small>Supervisor checked</small></div>
            </dl>
            {report && <div className="site-report-observation"><span>This update</span><strong>{percent(report.completion)}</strong><small>{report.completionBasis === 'cumulative' ? 'Cumulative total to date' : 'Completion basis needs confirmation'}</small></div>}
            {isPending && !isVo && <p className="site-report-verification-preview"><ShieldCheck size={15} aria-hidden="true" /><span>After verification: <strong>{validCompletion ? percent(numericCompletion) : 'Enter a valid total'}</strong> verified. Reported total stays {percent(item?.reported)}.</span></p>}
          </section>

          {isVo ? (
            <div className="notice warning">
              <Flag aria-hidden="true" />
              <span><strong>Review this variation in VO review.</strong><br />Its scope, value and approval record are tracked separately from physical completion.</span>
            </div>
          ) : isVerified ? (
            <div className="notice success">
              <ShieldCheck aria-hidden="true" />
              <span><strong>This report is already verified.</strong><br />{report?.verifiedBy ? `${report.verifiedBy}. ` : ''}{report?.approvedCompletion != null ? `Verified in this review: ${percent(report.approvedCompletion)}. ` : ''}Original evidence is retained.</span>
            </div>
          ) : !hasMatchedItem && report ? (
            <div className="notice warning"><AlertTriangle aria-hidden="true" /><span>Match the update to one work item and area before verifying progress.</span></div>
          ) : null}

          {isClarification && (
            <div className="notice warning">
              <MessageSquare aria-hidden="true" />
              <span><strong>Waiting for a clearer site update.</strong><br />
                {report?.reviewReason && <><strong>Clarification note:</strong> {report.reviewReason}<br /></>}
                Contact the worker outside this demo. When the work item, area and total completion are confirmed, add a new update for review. Current progress stays unchanged; no message was sent.
              </span>
            </div>
          )}

          {!locked && report && !isVo && !isVerified && !isClarification && (
            <div className="notice warning"><AlertTriangle aria-hidden="true" /><span>Review and lock the contract baseline before verifying this progress update.</span></div>
          )}

          {isPending && report && !isVo && (
            <div>
              <h3 className="form-section-heading">Supervisor decision</h3><p className="site-report-review-help">Check the original update and photo below, then confirm the whole work item’s verified total.</p>
              <FormField label="Verified cumulative completion (%)" hint="Enter the total to date, not an additional percentage. Explain any correction below.">
                  <input
                    id={`${id}-completion`}
                    className="form-input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="any"
                    value={completion}
                    disabled={!locked || !hasMatchedItem}
                    aria-invalid={completion.trim() !== '' && !validCompletion}
                    onChange={(event) => { setCompletion(event.target.value); setError(''); }}
                  />
              </FormField>
              <FormField className="drawer-note-field" label="Review note or correction reason" error={error}>
                <textarea
                  ref={noteRef}
                  id={`${id}-reason`}
                  className="form-textarea"
                  value={reason}
                  rows={3}
                  placeholder="Add context, or explain why this update needs a correction…"
                  aria-invalid={Boolean(error)}
                  onChange={(event) => { setReason(event.target.value); setError(''); }}
                />
              </FormField>
              <div className="site-report-other-actions"><span>Other review actions</span><div className="review-actions">
                <Button className="ghost" disabled={!onChange} onClick={() => change('reject')}>Reject</Button>
                <Button className="ghost" icon={MessageSquare} disabled={!onChange} onClick={() => change('clarify')}>Needs clarification</Button>
                <Button className="ghost" icon={Flag} disabled={!onChange} onClick={() => change('vo')}>Flag possible VO</Button>
              </div></div>
            </div>
          )}

          {report ? <details className="site-report-evidence" open={isPending || undefined}>
            <summary>Original site update &amp; photo</summary>
            <div className="site-report-evidence-body">
              <div className="message-card">
              <div className="message-meta">
                <strong>{report.sender || 'Sender not recorded'}</strong>
                <time dateTime={report.date || undefined}>{timeLabel(report.date)}</time>
              </div>
              <blockquote className="message-text" style={{ margin: 0 }}>
                {report.message || 'No message text attached.'}
              </blockquote>
              </div>

              {photoUrl && !photoFailed ? (
            <figure className="evidence-placeholder" style={{ marginInline: 0 }}>
              <img
                src={photoUrl}
                alt={report?.photoAlt || `Site evidence attached to report ${report?.id || ''}`}
                onError={() => setPhotoFailed(true)}
              />
              <figcaption>{report?.channel === 'whatsapp-mock' ? 'Generated demo photo · not actual project evidence' : isSimulated ? 'Demo attachment' : 'Attached site photo'} · review alongside the original message</figcaption>
            </figure>
          ) : (
            <div className="evidence-placeholder">
              <ImageOff aria-hidden="true" />
              <strong>{photoFailed ? 'Site photo could not be displayed' : 'No site photo attached'}</strong>
              <span>{photoFailed ? 'The report is retained. Check the attachment before verifying.' : report ? 'This update contains text only. No photo evidence is being implied.' : 'A site photo will appear here when an update includes one.'}</span>
            </div>
          )}

            </div>
          </details> : <div className="notice info"><MessageSquare aria-hidden="true" /><span>No site update is attached to this work item. Add an update to record new progress.</span></div>}

          {report?.note && <p className="field-note" style={{ marginTop: 18 }}>{report.note}</p>}
          {report && (
            <details className="site-report-details">
              <summary>Update details</summary>
              <dl>
                <div><dt>Event ID</dt><dd>{report.id || 'ID unavailable'}</dd></div>
                {report.sourceMessageId && <div><dt>Original message ID</dt><dd>{report.sourceMessageId}</dd></div>}
              </dl>
              <p>Verification records physical progress. The QS reviews claim quantities, values and eligibility separately.</p>
              {report?.reviewReason && <p><strong>Recorded review note:</strong> {report.reviewReason}</p>}
              <p>The original message and photo stay with this report.</p>
            </details>
          )}
        </div>

        <footer className="drawer-footer">
          <FormActions secondary={isPending && <Button onClick={onClose}>Cancel review</Button>}>
          {!report && <Button icon={Plus} disabled={!onAdd} onClick={addUpdate}>Add site update</Button>}
          {isPending && !isVo && report && (
            <Button icon={Check} className="primary" disabled={!canVerify} onClick={approve}>Verify progress</Button>
          )}
          {(isVerified || !isPending || isVo) && <Button onClick={onClose}>Done</Button>}
          {isClarification && <Button className="primary" icon={Plus} disabled={!onAdd} onClick={addUpdate}>Add clarified demo update</Button>}
          {isVo && <Button className="primary" icon={Flag} disabled={!onReviewVO} onClick={() => report && onReviewVO?.(report)}>Open VO review</Button>}
          </FormActions>
        </footer>
      </SheetContent>}
      </Sheet>
    </div>
  );
}
