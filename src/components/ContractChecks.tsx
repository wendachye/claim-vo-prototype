import type { FormEvent } from 'react';
import type { Project } from '../types/domain';
import type { getContractChecks } from '../data/contract-checks';
import type { getContractTotalReview } from '../data/contract-total-review';
interface ContractChecksProps { presentation?: 'compact' | 'details'; showPartialLabel?: boolean; project: Project; checks: ReturnType<typeof getContractChecks>; totalReview?: ReturnType<typeof getContractTotalReview>; open?: boolean; onOpenChange?: (open: boolean) => void; onOpenItem?: (id: string) => void; onSaveTotalReview?: (reason: string, scopeKey: string) => { outcome: string; error?: string } | Promise<{ outcome: string; error?: string }>; onReviewEditingChange?: (editing: boolean) => void; reviewRequested?: number }
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, CircleAlert } from 'lucide-react';
import { clearFormBuffer, readFormBuffer } from '../data/form-buffer.ts';
import { useBufferedState } from './useFormBuffer';
import { Badge, Button, FormActions, FormField, Textarea, formatMoney } from './ui';
import './contract-checks.css';

const knownAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const money = (value: unknown, currency?: string | null) => knownAmount(value) ? `${currency ? `${currency} ` : ''}${formatMoney(value)}` : 'Unknown';
const reviewDate = (value: string | null | undefined) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Date not recorded';

export function ContractChecks({ project, checks, totalReview, open, onOpenChange, onOpenItem, onSaveTotalReview, onReviewEditingChange, reviewRequested = 0, showPartialLabel = true, presentation = 'compact' }: ContractChecksProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const contentId = useId();
  const reasonControl = useRef<HTMLTextAreaElement | null>(null);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef(false);
  const mounted = useRef(false);
  const submissions = useRef(new Set<string>());
  const scope = `contract:total-review:${totalReview?.scopeKey || 'unavailable'}`;
  const identity = JSON.stringify([project.id, scope]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [reason, setReason] = useBufferedState(project.id, scope, () => totalReview?.status === 'reviewed' ? totalReview?.review?.reason || '' : '');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setExpanded(false); }, [project.id]);
  useEffect(() => { setEditing(false); setError(''); setSaving(submissions.current.has(identity)); returnFocus.current = false; }, [identity]);
  const isOpen = presentation === 'details' || (open ?? expanded);
  const issues = checks.issues || [];
  const itemCount = checks.itemIssueCount || 0;
  const totals = checks.totals || {};
  const currency = totals.currency;
  const partial = checks.partial === true;
  const comparisonKnown = totals.comparison === 'match' || totals.comparison === 'difference' || totals.comparison === 'partial';
  const calculationDiffers = knownAmount(totals.recordedTotal) && knownAmount(totals.calculatedTotal) && Math.abs(totals.recordedTotal - totals.calculatedTotal) > 0.005;
  const totalNeedsReview = totals.comparison === 'difference';
  const reviewed = totalNeedsReview && totalReview?.status === 'reviewed';
  const requiresReview = totalNeedsReview && !partial && totalReview?.required === true;
  const canReview = requiresReview && !project.locked && checks.canConfirm === true;
  const hasIssues = itemCount > 0 || (totalNeedsReview && !reviewed);
  const status = itemCount ? `${itemCount} ${itemCount === 1 ? 'item needs' : 'items need'} review` : totalNeedsReview ? reviewed ? 'Total difference reviewed' : 'Total needs review' : 'No issues found';

  useEffect(() => {
    if (!reviewRequested || !canReview) return;
    if (open === undefined) setExpanded(true);
    onOpenChange?.(true);
    setEditing(true);
    reasonControl.current?.focus();
  }, [reviewRequested]);
  useEffect(() => { if (editing && isOpen && canReview) reasonControl.current?.focus(); }, [editing, isOpen, canReview]);
  useEffect(() => { if (!editing && isOpen && returnFocus.current) { reviewButton.current?.focus(); returnFocus.current = false; } }, [editing, isOpen]);
  useEffect(() => { onReviewEditingChange?.(editing && canReview); }, [editing, canReview, onReviewEditingChange]);
  useEffect(() => () => { onReviewEditingChange?.(false); }, [onReviewEditingChange]);

  function problem(message: string) {
    setError(message);
    reasonControl.current?.focus();
  }
  async function saveReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canReview || submissions.current.has(identity)) return;
    const trimmed = reason.trim();
    if (!trimmed) return problem('Add a short reason for the total difference.');
    if (trimmed.length > 500) return problem('Keep the reason within 500 characters.');
    submissions.current.add(identity);
    setSaving(true);
    setError('');
    try {
      const result = await onSaveTotalReview?.(trimmed, totalReview?.scopeKey || '');
      if (['updated', 'unchanged'].includes(result?.outcome || '')) {
        if (readFormBuffer(project.id, scope) === reason) clearFormBuffer(project.id, scope);
        if (mounted.current && currentIdentity.current === identity) {
          returnFocus.current = true;
          setEditing(false);
        }
      } else if (mounted.current && currentIdentity.current === identity) problem(result?.error || 'The reason could not be saved. Your entry is kept; try again.');
    } catch {
      if (mounted.current && currentIdentity.current === identity) problem('The reason could not be saved. Your entry is kept; try again.');
    } finally {
      submissions.current.delete(identity);
      if (mounted.current && currentIdentity.current === identity) setSaving(false);
    }
  }

  function toggle() {
    const next = !isOpen;
    if (open === undefined) setExpanded(next);
    onOpenChange?.(next);
  }

  return <section className={`contract-checks${presentation === 'details' ? ' contract-checks-details' : ''}`} id="contract-checks" tabIndex={-1} aria-label="Contract checks">
    {presentation === 'compact' && <button type="button" className={`contract-checks-toggle${hasIssues ? ' has-issues' : ''}`} aria-label={`Contract checks: ${status}`} aria-expanded={isOpen} aria-controls={contentId} onClick={toggle}>
      {hasIssues ? <CircleAlert size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
      <span className="contract-checks-status">{status}</span>
      {partial && showPartialLabel && <Badge className="contract-checks-partial">Partial schedule</Badge>}
      <ChevronDown className="contract-checks-chevron" size={14} aria-hidden="true" />
    </button>}
    {isOpen && <div className="contract-checks-body" id={contentId}>
      {presentation === 'details' && partial && showPartialLabel && <Badge className="contract-checks-partial">Partial schedule</Badge>}
      {project.locked && <p className="contract-checks-note">Current values; confirmed baseline unchanged.</p>}
      {issues.length > 0 ? <ul className="contract-checks-issues" aria-label="Items to check">{issues.map((issue) => <li key={issue.id || issue.itemId}>
        <Button className="ghost contract-checks-item" aria-label={`Review checks for ${issue.itemId}`} onClick={() => issue.itemId && onOpenItem?.(issue.itemId)}>
          <span className="contract-checks-item-copy"><span className="contract-checks-item-heading"><span className="mono">{issue.itemRef || 'No reference'}</span><strong>{issue.description || 'Work item'}</strong></span><span className="contract-checks-messages">{issue.messages.map((message, index) => <span key={`${index}-${message}`}>{message}</span>)}</span></span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </Button>
      </li>)}</ul> : <p className="contract-checks-clear"><Check size={14} aria-hidden="true" />{project.items?.length ? 'No missing values or item calculation differences found.' : 'Add work items to check their values.'}</p>}
      <div className="contract-checks-reconciliation">
        <dl className="contract-checks-totals">
          <div><dt>{partial ? 'Selected work total' : 'Work-list total'}</dt><dd>{money(totals.recordedTotal, currency)}</dd></div>
          <div><dt>Declared contract value</dt><dd>{money(totals.declaredTotal, currency)}</dd></div>
          <div className={totals.comparison === 'difference' ? 'contract-checks-total-difference' : undefined}><dt>Difference to declared value</dt><dd>{money(comparisonKnown ? totals.difference : null, currency)}</dd></div>
        </dl>
        {calculationDiffers && <p className="contract-checks-calculation">Quantity × rate total: <strong>{money(totals.calculatedTotal, currency)}</strong>. Check the item differences above.</p>}
        {totals.comparison === 'difference' && <p className="contract-checks-total-note">The work-list total differs from the declared contract value. {reviewed ? 'The reason is recorded below.' : 'Review the source before confirming.'}</p>}
        {requiresReview && <div className="contract-total-review">
          {totalReview?.status === 'stale' && <p className="contract-checks-total-note">Contract values have changed. Review the total difference again before confirming.</p>}
          {reviewed && !editing && <div className="contract-total-review-saved"><p className="contract-total-review-reason">{totalReview?.review?.reason}</p><p className="contract-checks-note">Recorded by {totalReview?.review?.reviewedBy || 'Reviewer not recorded'} · {reviewDate(totalReview?.review?.reviewedAt)}</p></div>}
          {project.locked && !reviewed ? <p className="contract-checks-note">This confirmed version has no recorded total-difference review. Its baseline and saved claims remain unchanged.</p> : !project.locked && !editing ? <>
            <Button ref={reviewButton} onClick={() => { setEditing(true); setError(''); }} disabled={!canReview} className="contract-total-review-open">{reviewed ? 'Edit reason' : 'Review total difference'}</Button>
            {!checks.canConfirm && <p className="contract-checks-note">Resolve the item checks before reviewing the total.</p>}
          </> : null}
          {editing && canReview && <form className="contract-total-review-form" onSubmit={saveReason} noValidate>
            <FormField label="Reason for total difference" required error={error || undefined} hint="Explain the difference after checking the source."><Textarea ref={reasonControl} value={reason} maxLength={500} rows={3} placeholder="e.g. The declared sum includes a separate provisional allowance" onChange={event => { setReason(event.target.value); setError(''); }} disabled={saving} /></FormField>
            <p className="contract-checks-note">Saved with contract version {project.version ?? 1}. Contract values stay unchanged.</p>
            <FormActions secondary={<Button type="button" disabled={saving} onClick={() => { returnFocus.current = true; setEditing(false); setError(''); }}>Cancel</Button>}><Button type="submit" className="primary" disabled={saving || !onSaveTotalReview}>{saving ? 'Saving…' : 'Save reason'}</Button></FormActions>
          </form>}
        </div>}
        {partial ? <p className="contract-checks-note">{project.items?.length || 0} selected rows · These selected rows are part of the contract. Their total is not expected to match the full contract value.</p> : totals.comparison === 'unknown' && project.contract?.representativeSubset !== false ? <p className="contract-checks-note">{checks.scopeNote || 'Schedule coverage is not recorded. Check the source before comparing with the full contract value.'}</p> : null}
        <p className="contract-checks-note contract-checks-pricing-note">Totals include measured items only. Included and rate-only items have no separate priced total.</p>
      </div>
    </div>}
  </section>;
}
