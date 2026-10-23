import { ChevronDown } from 'lucide-react';
import { defaultClaimBasis } from '../data/claim-basis.js';
import { Button, FormField, Input, NativeSelect, formatMoney, formatNumber } from './ui.jsx';
import './claim-basis.css';

const known = (value) => value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '');
const number = (value) => known(value) && ['number', 'string'].includes(typeof value) && Number.isFinite(Number(value)) ? Number(value) : null;
const amount = (value, currency) => number(value) === null ? '—' : `${currency} ${formatMoney(Number(value))}`;
const nonNegativeError = (value) => known(value) && (number(value) === null || number(value) < 0)
  ? 'Enter a non-negative amount.' : undefined;

export function ClaimBasisSettings({ value, currency = 'SGD', previousGrossValue, onChange }) {
  const configured = value !== null && typeof value === 'object' && !Array.isArray(value);
  const basis = configured ? value : null;
  const update = (name, next) => onChange?.({ ...basis, [name]: next });
  const rate = number(basis?.retentionRate);
  const rateError = known(basis?.retentionRate) && (rate === null || rate < 0 || rate > 100)
    ? 'Enter a retention rate from 0 to 100%.' : undefined;
  const referenceRequired = (number(basis?.previousNetValue) ?? 0) > 0 || (number(previousGrossValue) ?? 0) > 0;
  const billingLabel = basis?.billingMethod === 'quantityRate' ? 'Quantity × rate'
    : basis?.billingMethod === 'unsupported' ? 'Billing needs review' : 'Choose billing method';
  const retentionLabel = basis?.retentionMode === 'none' ? 'No retention'
    : basis?.retentionMode === 'rateCap' ? `${rate === null ? '—' : formatNumber(rate)}% retention · cap ${amount(basis.retentionCap, currency)}`
      : 'Choose retention';

  return <details className="claim-basis-settings">
    <summary><strong>Claim basis</strong><span>{configured ? `${billingLabel} · ${retentionLabel} · Prior net ${amount(basis.previousNetValue, currency)}` : 'Legacy gross-only assessment'}</span><ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="claim-basis-content">
      {!configured ? <div className="claim-basis-legacy"><p>This assessment keeps its original gross-only basis. Set a basis to review retention and prior submitted net amounts in a new draft.</p><Button onClick={() => onChange?.(defaultClaimBasis())}>Set claim basis</Button></div> : <>
        <div className="claim-basis-fields">
          <FormField label="Billing method" required><NativeSelect value={basis.billingMethod || ''} aria-label="Billing method" onChange={event => update('billingMethod', event.target.value)}><option value="">Choose billing method</option><option value="quantityRate">Cumulative quantity × rate</option><option value="unsupported">Other method (needs review)</option></NativeSelect></FormField>
          <FormField label="Retention" required><NativeSelect value={basis.retentionMode || ''} aria-label="Retention" onChange={event => update('retentionMode', event.target.value)}><option value="">Choose retention</option><option value="none">None</option><option value="rateCap">Rate with cap</option></NativeSelect></FormField>
          {basis.retentionMode === 'rateCap' && <>
            <FormField label="Retention rate" required suffix="%" error={rateError}><Input type="number" min="0" max="100" step="0.01" inputMode="decimal" aria-label="Retention rate" value={basis.retentionRate ?? ''} onChange={event => update('retentionRate', event.target.value)} placeholder="Enter rate" /></FormField>
            <FormField label="Retention cap" required suffix={currency} error={nonNegativeError(basis.retentionCap)} hint="Maximum cumulative retention held."><Input type="number" min="0" step="0.01" inputMode="decimal" aria-label="Retention cap" value={basis.retentionCap ?? ''} onChange={event => update('retentionCap', event.target.value)} placeholder="Enter cap" /></FormField>
          </>}
          <FormField label="Previously submitted net" suffix={currency} error={nonNegativeError(basis.previousNetValue)} hint="Cumulative submitted amount after retention, not certified or paid totals."><Input type="number" min="0" step="0.01" inputMode="decimal" aria-label="Previously submitted net" value={basis.previousNetValue ?? ''} onChange={event => update('previousNetValue', event.target.value)} placeholder="0.00 after confirmation" /></FormField>
          <FormField label="Previous claim reference" required={referenceRequired} optional={!referenceRequired} hint={referenceRequired ? 'Identify the earlier submission or opening balance.' : 'Add a reference when there is an earlier claim.'}><Input aria-label="Previous claim reference" required={referenceRequired} value={basis.priorReference ?? ''} onChange={event => update('priorReference', event.target.value)} placeholder="e.g. DEMO-CLAIM-001" /></FormField>
        </div>
        {basis.retentionMode === 'rateCap' && rate > 0 && <p className="claim-basis-help">Applies to cumulative gross work and eligible VOs; capped across all months.</p>}
        <dl className="claim-basis-prior"><div><dt>Item totals claimed before (gross)</dt><dd>{amount(previousGrossValue, currency)}</dd></div></dl>
        <p className="claim-basis-help">Blank prior amounts mean zero only after confirming previous claims below.</p>
        {(basis.billingMethod === 'unsupported' || currency !== 'SGD') && <p className="claim-basis-blocked" role="status">{currency !== 'SGD' ? `This mock claim basis is not supported for ${currency}. No currency conversion is applied.` : 'This billing method needs review before the claim can be prepared.'}</p>}
      </>}
      <p className="claim-basis-help">Mock settings for this draft, not extracted S.I.T. terms. Tax, retention releases and other deductions are not supported.</p>
    </div>
  </details>;
}
