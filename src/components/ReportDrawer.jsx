import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Flag,
  ImageOff,
  Info,
  MessageSquare,
  Plus,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Badge, Button, FormActions, FormField, formatTime } from './ui.jsx';
import { isReviewableProgressReport, needsProgressClarification } from '../data/report-status.js';
import './report-drawer.css';

const percent = (value) => {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return 'Not recorded';
  return `${Number(value)}%`;
};

const defaultCompletion = (report, item) => {
  const value = report?.completion ?? item?.reported;
  return value == null ? '' : String(value);
};

const timeLabel = (value) => (
  value && !Number.isNaN(new Date(value).getTime()) ? formatTime(value) : 'Time not recorded'
);

export function ReportDrawer({
  projectCode,
  item,
  report,
  locked,
  onClose,
  onApprove,
  onChange,
  onReplay,
  onAdd,
  onReviewVO,
}) {
  const drawerRef = useRef(null);
  const noteRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
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
        : report?.status === 'pending' ? 'Pending review'
        : report?.status === 'needsReview' ? 'Needs review'
          : report?.status === 'rejected' ? 'Rejected'
            : report?.status || 'No attached update';

  // Reset the editable review when navigating to a different report or item.
  useEffect(() => {
    setCompletion(defaultCompletion(report, item));
    setReason('');
    setError('');
  }, [report?.id, item?.id]);

  useEffect(() => setPhotoFailed(false), [photoUrl]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...(drawerRef.current?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], summary, [tabindex="0"]',
    ) || [])].filter((element) => !element.hidden && element.getClientRects().length > 0);
    const focusFirst = () => (controls()[0] || drawerRef.current)?.focus();
    focusFirst();

    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const all = controls();
      if (!all.length) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }
      const first = all[0];
      const last = all[all.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === drawerRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !drawerRef.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleFocus = (event) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target)) focusFirst();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, []);

  function needReason(message) {
    if (reason.trim()) return false;
    setError(message);
    noteRef.current?.focus();
    return true;
  }

  function change(action) {
    if (!report || !onChange) return;
    if (needReason('Add a review note so the decision stays clear in the history.')) return;
    setError('');
    onChange(report, action, reason.trim());
  }

  function approve() {
    if (!canVerify) return;
    const original = report?.completion;
    if ((original == null || Number(original) !== numericCompletion)
      && needReason('Explain the corrected percentage before verifying progress.')) return;
    setError('');
    onApprove(report, completion.trim(), reason.trim());
  }

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={drawerRef}
        className="drawer"
        style={{ width: 560, maxWidth: '100vw' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        tabIndex={-1}
      >
        <header className="drawer-header">
          <div>
            <div className="eyebrow">{projectCode && `${projectCode} · `}{report ? 'Site evidence' : 'Progress details'}</div>
            <h2 id={`${id}-title`}>{item?.id || report?.itemId || 'Unmatched update'} · {report ? report.area || item?.demoArea || 'Area unassigned' : 'Work item progress'}</h2>
            <p id={`${id}-description`}>{item?.description || 'Review the report and match its scope before updating progress.'}</p>
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

          <h3>Original site update</h3>
          {report ? (
            <div className="message-card">
              <div className="message-meta">
                <strong>{report.sender || 'Sender not recorded'}</strong>
                <time dateTime={report.date || undefined}>{timeLabel(report.date)}</time>
              </div>
              <blockquote className="message-text" style={{ margin: 0 }}>
                {report.message || 'No message text attached.'}
              </blockquote>
            </div>
          ) : (
            <div className="notice info"><MessageSquare aria-hidden="true" /><span>No site update is attached to this work item. Add an update to record new progress.</span></div>
          )}

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

          <h3>Cumulative physical progress</h3>
          <div className="detail-grid">
            <div className="detail-block">
              <div className="detail-label">{report ? 'Reported in this update' : 'Reported total'}</div>
              <div className="detail-value">{percent(report?.completion ?? (!report ? item?.reported : null))}</div>
            </div>
            <div className="detail-block">
              <div className="detail-label">Currently verified</div>
              <div className="detail-value">{percent(item?.verified)}</div>
            </div>
            <div className="detail-block">
              <div className="detail-label">Work item</div>
              <div className="detail-value">{hasMatchedItem || !report ? item?.ref || 'Not matched' : 'Not matched'}</div>
            </div>
            <div className="detail-block">
              <div className="detail-label">Completion basis</div>
              <div className="detail-value">{report?.completionBasis === 'cumulative' ? 'Total to date' : report ? 'Needs confirmation' : 'No report selected'}</div>
            </div>
          </div>

          {isVo ? (
            <div className="notice warning">
              <Flag aria-hidden="true" />
              <span><strong>Review this variation in VO review.</strong><br />Its scope, value and approval record are tracked separately from physical completion.</span>
            </div>
          ) : isVerified ? (
            <div className="notice success">
              <ShieldCheck aria-hidden="true" />
              <span><strong>This report is already verified.</strong><br />{report?.verifiedBy ? `${report.verifiedBy}. ` : ''}Replaying its event will not add progress again.</span>
            </div>
          ) : !hasMatchedItem && report ? (
            <div className="notice warning"><AlertTriangle aria-hidden="true" /><span>Match the update to one work item and area before verifying progress.</span></div>
          ) : null}

          {isClarification && (
            <div className="notice warning">
              <MessageSquare aria-hidden="true" />
              <span><strong>Waiting for a clearer site update.</strong><br />
                {report.reviewReason && <><strong>Clarification note:</strong> {report.reviewReason}<br /></>}
                Contact the worker outside this demo. When the work item, area and total completion are confirmed, add a new update for review. Current progress stays unchanged; no message was sent.
              </span>
            </div>
          )}

          {!locked && report && !isVo && !isVerified && !isClarification && (
            <div className="notice warning"><AlertTriangle aria-hidden="true" /><span>Review and lock the contract baseline before verifying this progress update.</span></div>
          )}

          <div className="notice info">
            <Info aria-hidden="true" />
            <span>Verification records a physical observation. The QS reviews claimable quantity, valuation and eligibility separately.</span>
          </div>

          {isPending && report && !isVo && (
            <div>
              <h3 className="form-section-heading">Review decision</h3>
              {!isVo && (
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
              )}
              <FormField className="drawer-note-field" label={isVo ? 'QS review note' : 'Review note or correction reason'} error={error}>
                <textarea
                  ref={noteRef}
                  id={`${id}-reason`}
                  className="form-textarea"
                  value={reason}
                  rows={3}
                  placeholder={isVo ? 'Record the scope question, instruction evidence or next action…' : 'Add context, or explain why this update needs a correction…'}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => { setReason(event.target.value); setError(''); }}
                />
              </FormField>
              <div className="review-actions">
                {isVo ? (
                  <>
                    <Button icon={X} disabled={!onChange} onClick={() => change('reject')}>Dismiss flag</Button>
                    <Button icon={MessageSquare} disabled={!onChange} onClick={() => change('clarify')}>Save review note</Button>
                  </>
                ) : (
                  <>
                    <Button disabled={!onChange} onClick={() => change('reject')}>Reject</Button>
                    <Button icon={MessageSquare} disabled={!onChange} onClick={() => change('clarify')}>Needs clarification</Button>
                    <Button icon={Flag} disabled={!onChange} onClick={() => change('vo')}>Flag possible VO</Button>
                  </>
                )}
              </div>
            </div>
          )}

          {report?.note && <p className="field-note" style={{ marginTop: 18 }}>{report.note}</p>}
          {report && (
            <details className="site-report-details">
              <summary>Update details &amp; demo tools</summary>
              <dl>
                <div><dt>Event ID</dt><dd>{report.id || 'ID unavailable'}</dd></div>
                {report.sourceMessageId && <div><dt>Original message ID</dt><dd>{report.sourceMessageId}</dd></div>}
              </dl>
              <p>The original message and photo stay with this report. Replaying the same update checks that it cannot add progress twice.</p>
              <Button icon={RotateCcw} disabled={!onReplay} onClick={() => onReplay?.(report)}>Replay demo update</Button>
            </details>
          )}
        </div>

        <footer className="drawer-footer">
          <FormActions secondary={isPending && <Button onClick={onClose}>Cancel review</Button>}>
          {!report && <Button icon={Plus} disabled={!onAdd} onClick={() => onAdd?.(item?.id)}>Add site update</Button>}
          {isPending && !isVo && report && (
            <Button icon={Check} className="primary" disabled={!canVerify} onClick={approve}>Verify progress</Button>
          )}
          {(isVerified || !isPending || isVo) && <Button onClick={onClose}>Done</Button>}
          {isClarification && <Button className="primary" icon={Plus} disabled={!onAdd} onClick={() => onAdd?.(item?.id)}>Add clarified demo update</Button>}
          {isVo && <Button className="primary" icon={Flag} disabled={!onReviewVO} onClick={() => onReviewVO?.(report)}>Open VO review</Button>}
          </FormActions>
        </footer>
      </section>
    </div>
  );
}
