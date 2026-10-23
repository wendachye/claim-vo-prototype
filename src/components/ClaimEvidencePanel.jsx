import { useEffect, useId, useRef, useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import { Badge, Button, formatNumber } from './ui.jsx';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet.jsx';
import { VO_EXECUTION_LABELS, VO_INSTRUCTION_LABELS, VO_SCOPE_LABELS, VO_STATUS_LABELS } from '../data/vo.js';
import './claim-evidence.css';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const known = (value) => value !== null && value !== undefined && value !== '';
const text = (value, fallback = 'Not recorded') => known(value) ? String(value) : fallback;
const dateTime = (value) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' })
  : 'Not recorded';
const date = (value) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
  : 'Not recorded';
const month = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')
  ? new Date(`${value}-01T12:00:00+08:00`).toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' })
  : 'Month not recorded';
const percent = (value) => known(value) && Number.isFinite(Number(value)) ? `${formatNumber(Number(value))}%` : 'Not recorded';

function Field({ label, children }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

// Receives the assessment row itself. Saved callers pass a frozen snapshot row;
// this panel deliberately has no access to the current project or message store.
export function ClaimEvidencePanel({ row, kind, projectId, period, revision = null, cutoff, onClose }) {
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement);
  const [portalContainer, setPortalContainer] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const id = useId();
  const evidence = record(row?.evidence) ? row.evidence : null;
  const manual = evidence?.channel === 'manual-vo-mock';
  const unavailable = !record(row) || !['work', 'vo'].includes(kind)
    || (row.projectId && row.projectId !== projectId)
    || (evidence?.projectId && evidence.projectId !== projectId);
  const photoValue = typeof evidence?.photo === 'string' ? evidence.photo : evidence?.photo?.url || evidence?.photo?.src;
  const photo = typeof photoValue === 'string' ? photoValue : null;
  const generated = /^\/assets\/demo-[a-z0-9-]+\.jpg(?:[?#]|$)/.test(photo || '');
  const checks = record(row?.eligibilityReview) ? row.eligibilityReview : null;
  const saved = Number.isInteger(revision) && revision > 0;
  const reference = row?.ref || row?.reference || row?.id;
  const title = row?.description || row?.title;
  useEffect(() => setPhotoFailed(false), [photo, row?.id, projectId, revision, period]);

  return <div className="claim-evidence-layer" ref={setPortalContainer}>
    <Sheet open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      {portalContainer && <SheetContent portalContainer={portalContainer} className="drawer claim-evidence-panel" overlayClassName="drawer-backdrop claim-evidence-backdrop" side="right" showCloseButton={false} style={{ width: 560, maxWidth: '100vw' }} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (opener.current?.isConnected) opener.current.focus?.({ preventScroll: true });
      }}>
        <header className="drawer-header claim-evidence-header">
          <div><SheetTitle asChild><h2 id={`${id}-title`}>Evidence{!unavailable && reference ? ` · ${reference}` : ''}</h2></SheetTitle><SheetDescription asChild><p id={`${id}-description`}>{unavailable ? 'Evidence is unavailable for this claim item.' : text(title, 'Claim item')}</p></SheetDescription></div>
          <Button className="ghost icon" aria-label="Close evidence" onClick={onClose}><X size={18} aria-hidden="true" /></Button>
        </header>
        <div className="drawer-body claim-evidence-body">
          {unavailable ? <p className="claim-evidence-empty">Choose an item from the selected project to view its evidence.</p> : <>
            <div className="claim-evidence-context"><Badge tone="blue">{saved ? `Saved version ${revision}` : 'Current assessment'}</Badge><span>{month(period)} · Cutoff {date(cutoff)}</span></div>
            <p className="claim-evidence-context-note">{saved ? 'Evidence captured with this saved claim version.' : 'Evidence supporting this assessment at its cutoff.'}</p>
            <section className="claim-evidence-section" aria-label="Original update">
              <h3>{manual ? 'Manual entry' : 'Original update'}</h3>
              {evidence ? <>
                <dl className="claim-evidence-fields"><Field label={manual ? 'Entered by' : 'Sender'}>{text(evidence.sender)}</Field><Field label={manual ? 'Recorded' : 'Reported'}>{dateTime(evidence.date)}</Field><Field label="Area / location">{[evidence.area, evidence.location].filter(Boolean).join(' · ') || 'Not recorded'}</Field>{manual && <Field label="Reported instruction / reference">{text(evidence.reportedInstructionReference)}</Field>}</dl>
                <blockquote>{text(evidence.message, 'No original message was saved with this report.')}</blockquote>
              </> : <p className="claim-evidence-empty">No original report was saved for this item.</p>}
              {photo && !photoFailed ? <figure className="claim-evidence-photo"><img src={photo} alt={evidence.photoAlt || 'Photo saved with the original site update'} onError={() => setPhotoFailed(true)} /><figcaption>{generated ? 'Generated demo photo · not actual project evidence' : 'Saved site attachment'} · review alongside the original message</figcaption></figure> : <div className="claim-evidence-photo-empty"><ImageOff size={20} aria-hidden="true" /><span>{photoFailed ? 'Photo could not be displayed. The saved message and review remain available.' : 'No photo was saved with this item.'}</span></div>}
            </section>
            {kind === 'work' ? <section className="claim-evidence-section" aria-label="Supervisor review">
              <h3>Supervisor review</h3>
              <dl className="claim-evidence-fields"><Field label="Verified total">{percent(row.verified)}</Field><Field label="Reviewer">{text(evidence?.verifiedBy)}</Field><Field label="Verified">{dateTime(row.verifiedAt)}</Field></dl>
              {evidence?.reviewReason && <p className="claim-evidence-review-note">{evidence.reviewReason}</p>}
              {row.evidenceDateConfirmation?.confirmed && <p className="claim-evidence-review-note">QS confirmed this undated progress applied as of {date(row.evidenceDateConfirmation.asOf)}. The original verification date remains unrecorded.</p>}
              <p className="claim-evidence-context-note">Physical completion supports the assessment; claim quantities and values are reviewed separately.</p>
            </section> : <>
              <section className="claim-evidence-section" aria-label="Price approval"><h3>Price approval</h3><dl className="claim-evidence-fields"><Field label="Status">{row.status === 'approved' ? 'Price approved' : VO_STATUS_LABELS[row.status] || 'Not recorded'}</Field><Field label="Approval reference">{text(row.approvalReference)}</Field><Field label="Approver">{text(row.approver)}</Field><Field label="Approved">{dateTime(row.approvalDate)}</Field></dl></section>
              <section className="claim-evidence-section" aria-label="Claim eligibility"><h3>Claim eligibility</h3>{checks ? <>
                <dl className="claim-evidence-fields"><Field label="Contract scope">{VO_SCOPE_LABELS[checks.scopeDisposition] || 'Not recorded'}</Field><Field label="Instruction">{VO_INSTRUCTION_LABELS[checks.instructionStatus] || 'Not recorded'}{known(checks.instructionReference) && <span className="claim-evidence-reference">{checks.instructionReference}</span>}</Field><Field label="Work verification">{VO_EXECUTION_LABELS[checks.executionStatus] || 'Not recorded'}{known(checks.executionReference) && <span className="claim-evidence-reference">{checks.executionReference}</span>}</Field><Field label="Work verified">{dateTime(checks.executionVerifiedAt)}</Field><Field label="QS decision">{checks.claimEligibility === 'excluded' ? 'Excluded from claim' : row.eligible ? 'Eligible for assessment' : 'Needs QS review'}</Field><Field label="QS reviewed">{dateTime(checks.eligibilityReviewedAt)}</Field></dl>
                {checks.eligibilityNote && <p className="claim-evidence-review-note">{checks.eligibilityNote}</p>}
                {checks.scopeAssessment && <details className="claim-evidence-scope"><summary>Scope assessment</summary><p>{checks.scopeAssessment}</p></details>}
              </> : <p className="claim-evidence-empty">No separate claim eligibility review was saved with this item.</p>}{!row.eligible && row.exclusionReason && <p className="claim-evidence-review-note">{row.exclusionReason}</p>}<p className="claim-evidence-context-note">Price approval and work verification are separate checks.</p></section>
            </>}
            {evidence && <details className="claim-evidence-details"><summary>Source details</summary><dl className="claim-evidence-fields"><Field label="Report ID">{text(evidence.id)}</Field><Field label="Original message ID">{text(evidence.sourceMessageId)}</Field>{known(row.sourcePage) && <Field label="Contract source page">{row.sourcePage}</Field>}</dl></details>}
          </>}
        </div>
        <footer className="drawer-footer claim-evidence-footer"><Button onClick={onClose}>Done</Button></footer>
      </SheetContent>}
    </Sheet>
  </div>;
}
