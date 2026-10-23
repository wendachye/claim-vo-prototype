import { useEffect, useId, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, ListChecks } from 'lucide-react';
import { Badge, Button, formatMoney } from './ui.jsx';
import './contract-checks.css';

const knownAmount = (value) => typeof value === 'number' && Number.isFinite(value);
const money = (value, currency) => knownAmount(value) ? `${currency ? `${currency} ` : ''}${formatMoney(value)}` : 'Unknown';

export function ContractChecks({ project, checks, open, onOpenChange, onOpenItem }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  useEffect(() => setExpanded(false), [project.id]);
  const isOpen = open ?? expanded;
  const issues = checks.issues || [];
  const itemCount = checks.itemIssueCount || 0;
  const totals = checks.totals || {};
  const currency = totals.currency;
  const partial = checks.partial === true;
  const comparisonKnown = totals.comparison === 'match' || totals.comparison === 'difference' || totals.comparison === 'partial';
  const calculationDiffers = knownAmount(totals.recordedTotal) && knownAmount(totals.calculatedTotal) && Math.abs(totals.recordedTotal - totals.calculatedTotal) > 0.005;
  const totalNeedsReview = totals.comparison === 'difference';
  const status = itemCount ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'} to check` : totalNeedsReview ? 'Total needs review' : 'No item issues';

  function toggle() {
    const next = !isOpen;
    if (open === undefined) setExpanded(next);
    onOpenChange?.(next);
  }

  return <section className="contract-checks" id="contract-checks" tabIndex={-1} aria-label="Contract checks">
    <button type="button" className="contract-checks-toggle" aria-expanded={isOpen} aria-controls={contentId} onClick={toggle}>
      <ListChecks size={17} aria-hidden="true" />
      <span className="contract-checks-title">Contract checks</span>
      <span className={`contract-checks-status${itemCount || totalNeedsReview ? ' has-issues' : ''}`}>{status}</span>
      {partial && <Badge className="contract-checks-partial">Partial schedule</Badge>}
      <ChevronDown className="contract-checks-chevron" size={16} aria-hidden="true" />
    </button>
    {isOpen && <div className="contract-checks-body" id={contentId}>
      {project.locked && <p className="contract-checks-note">Current values; confirmed baseline unchanged.</p>}
      {issues.length > 0 ? <ul className="contract-checks-issues" aria-label="Items to check">{issues.map((issue) => <li key={issue.id || issue.itemId}>
        <Button className="ghost contract-checks-item" aria-label={`Review checks for ${issue.itemId}`} onClick={() => onOpenItem?.(issue.itemId)}>
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
        {totals.comparison === 'difference' && <p className="contract-checks-total-note">The work-list total differs from the declared contract value. Review the source before confirming.</p>}
        {partial ? <p className="contract-checks-note">{project.items?.length || 0} selected rows · These selected rows are part of the contract. Their total is not expected to match the full contract value.</p> : totals.comparison === 'unknown' && project.contract?.representativeSubset !== false ? <p className="contract-checks-note">{checks.scopeNote || 'Schedule coverage is not recorded. Check the source before comparing with the full contract value.'}</p> : null}
        <p className="contract-checks-note contract-checks-pricing-note">Totals include measured items only. Included and rate-only items have no separate priced total.</p>
      </div>
    </div>}
  </section>;
}
