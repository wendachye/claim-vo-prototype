import { useId } from 'react';
import { AlertTriangle, ArrowRight, Check, FileText, Lock } from 'lucide-react';
import { contract as sampleContract, initialItems } from '../data/contract.js';
import { contractFormValues as formFor, contractFormScope } from '../data/form-buffer.js';
import { claimBasisProduct } from '../data/claim-basis.js';
import { Badge, Button, FormActions, FormField } from './ui.jsx';
import { useBufferedState } from './useFormBuffer.js';
import './contract-editor.css';

const UNITS = ['m²', 'm³', 'm', 'set', 'design', 'visit', 'pc', 'hr'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMoney(value, currency) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const prefix = currency === 'SGD' ? 'S$' : currency === 'MYR' ? 'RM' : currency;
  return `${prefix} ${Number(value).toLocaleString('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value) {
  return value == null || value === '' ? '—' : Number(value).toLocaleString('en-SG', {
    maximumFractionDigits: 4,
  });
}

function formatMonth(value) {
  if (!value) return 'Not specified';
  const [year, month] = value.split('-');
  return MONTHS[Number(month) - 1] ? `${MONTHS[Number(month) - 1]} ${year}` : value;
}

export function ContractEditor({ item, checkIssue, locked = false, onSave, onNext, nextLabel, contract = sampleContract, sourceItems, projectId, revision = 1 }) {
  const inputId = useId();
  const formScope = contractFormScope(item, revision, locked);
  const [form, setForm] = useBufferedState(projectId || contract.id || contract.reference || 'sample-contract', formScope, () => formFor(item));
  const hasEdits = !locked && JSON.stringify(form) !== JSON.stringify(formFor(item));

  if (!item) {
    return (
      <section className='review-editor'>
        <div className='editor-header'><h2>Review work item</h2></div>
        <div className='editor-body'><p>Select a contract item to begin the review.</p></div>
      </section>
    );
  }

  const projectSourceItems = sourceItems === undefined && contract === sampleContract ? initialItems : sourceItems;
  const printed = Array.isArray(projectSourceItems) ? projectSourceItems.find((sourceItem) => sourceItem.id === item.id) : undefined;
  const sourceKind = contract?.sourceKind ?? (contract === sampleContract ? 'provided' : 'none');
  const currency = contract?.currency || (contract === sampleContract ? 'SGD' : 'Currency not specified');
  const sourceLabel = contract.demoImport ? 'Demo PDF' : sourceKind === 'illustrative' ? 'Demo schedule' : 'Printed source';
  const manualRecovery = item.extractionRecovery?.method === 'manual';
  const requiresReview = item.needsReview || Boolean(checkIssue);
  const hasSourceQuantity = printed?.quantity != null && printed.quantity !== '' && Number.isFinite(Number(printed.quantity));
  const sourcePage = printed?.sourcePage ?? contract?.sourcePage;
  const sourceFilename = contract?.sourceFilename ?? contract?.sourceFile;
  const money = (value) => formatMoney(value, currency);
  const included = item.pricingType === 'included';
  const rateOnly = item.pricingType === 'rateOnly';
  const hasEnteredNumbers = form.quantity.trim() !== '' && form.rate.trim() !== '';
  const calculatedAmount = hasEnteredNumbers
    && Number.isFinite(Number(form.quantity))
    && Number.isFinite(Number(form.rate))
    && !included && !rateOnly
    ? claimBasisProduct(form.quantity, form.rate)
    : null;
  const matchesPrintedAmount = calculatedAmount != null && printed?.amount != null
    && Math.abs(Math.round((calculatedAmount + Number.EPSILON) * 100) / 100 - printed.amount) < 0.005;
  const unitOptions = [...new Set([...UNITS, form.unit])];

  function changeField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function saveItem(event) {
    event.preventDefault();
    if (locked) {
      onNext?.();
      return;
    }
    onSave?.({
      description: form.description,
      quantity: form.quantity,
      rate: form.rate,
      unit: form.unit,
      location: form.location,
    });
  }

  const demoContext = contract.demoImport
    ? 'Simulated values from the fictional demo PDF. Any separately selected PDF was previewed only.'
    : sourceKind === 'illustrative'
      ? 'Invented showcase values from the illustrative schedule; no supplied contract was extracted.'
      : sourceKind === 'provided'
        ? 'Showcase values copied from the supplied schedule.'
        : 'Seeded showcase values. No source document is supplied.';
  const sourceContext = contract.demoImport ? 'Demo PDF'
    : sourceKind === 'provided' ? 'Supplied schedule'
      : sourceKind === 'illustrative' ? 'Demo schedule' : 'Demo values';
  const amountNote = included
    ? 'Included in other rates. No separate charge.'
    : rateOnly
      ? 'Actual work or hours need separate measurement and approval.'
      : printed
        ? `${sourceLabel}: ${money(printed.amount)}${matchesPrintedAmount ? ' · matches current entries' : ' · compare current entries'}`
        : 'Source amount unavailable for this item.';

  return (
    <form className='review-editor contract-item-editor' onSubmit={saveItem} noValidate>
      <div className='editor-header'>
        <div>
          <h2>{locked ? 'Work item details' : 'Review work item'}</h2>
          <p>{item.ref} <span aria-hidden='true'>·</span> {sourceContext}</p>
        </div>
        <Badge tone={locked ? 'green' : requiresReview ? 'amber' : 'green'}>
          {locked ? 'Contract confirmed' : requiresReview ? 'Needs review' : 'Reviewed'}
        </Badge>
      </div>

      <div className='editor-body'>
        {hasEdits && <p className='contract-item-unsaved' role='status'>Unsaved changes stay while you browse. Confirm this item before refreshing.</p>}
        {locked ? <p className='contract-item-context'><Lock size={14} aria-hidden='true' /><span>Read only. To edit, choose More options → Edit contract.</span></p> : <p className='contract-item-context'><FileText size={14} aria-hidden='true' /><span>Compare the values with the source before confirming this item.</span></p>}

        {item.needsReview && (
          <div className='notice warning contract-quantity-warning' role='note'>
            <AlertTriangle size={17} aria-hidden='true' />
            <div>
              <strong>{manualRecovery ? 'Review manual entry' : 'Check the quantity'}</strong>
              {manualRecovery ? <p>Entered manually after the Page 1 demo failure. Check the description, unit, quantity and rate against the demo PDF, then confirm this item.</p> : <p>
                Simulated extraction: {formatQuantity(item.rawExtractedQuantity ?? item.quantity)} {item.unit}.
                {' '}{hasSourceQuantity
                  ? `${sourceKind === 'illustrative' ? 'Illustrative' : 'Printed'} schedule: ${formatQuantity(printed.quantity)} ${printed.unit}.`
                  : 'A source quantity is unavailable. Check this project’s source before confirming.'}
              </p>}
              {hasSourceQuantity && <Button
                disabled={locked}
                onClick={() => changeField('quantity', String(printed.quantity))}
              >Use source value: {formatQuantity(printed.quantity)}</Button>}
              {hasSourceQuantity && <p className='field-note'>This fills the quantity. Confirm the item separately.</p>}
            </div>
          </div>
        )}

        {!item.needsReview && checkIssue && <div className='notice warning contract-quantity-warning' role='note'><AlertTriangle size={17} aria-hidden='true' /><div><strong>Check saved values</strong>{checkIssue.messages.map((message,index)=><p key={`${index}-${message}`}>{message}</p>)}</div></div>}

        {locked ? <>
          <div className='contract-readonly-work'><h3>{form.description}</h3><p>{item.subsection ?? item.section}</p></div>
          <dl className='contract-readonly-values'>
            <div><dt>Contract quantity</dt><dd>{formatQuantity(form.quantity)} <span>{form.unit}</span></dd>{rateOnly ? <p>Rate-reference quantity; not actual hours.</p> : printed && <p>{sourceLabel}: {formatQuantity(printed.quantity)} {printed.unit}</p>}</div>
            <div><dt>Unit rate</dt><dd>{included ? 'Included' : money(form.rate)}</dd>{!included && <p>{printed ? `${sourceLabel}: ${money(printed.rate)} per ${printed.unit ?? form.unit}` : `per ${form.unit}`}</p>}</div>
          </dl>
          <div className={`contract-line-amount${matchesPrintedAmount ? ' matches' : ''}`}><span>Line amount</span><strong>{included ? 'Included' : rateOnly ? 'Rate only' : money(calculatedAmount)}</strong><p>{amountNote}</p></div>
        </> : <div className='field-grid contract-item-fields'>
          <FormField className='field-full' label='Work description' id={`${inputId}-description`} hint={item.subsection ?? item.section}>
            <textarea id={`${inputId}-description`} className='form-textarea' rows={3} value={form.description} onChange={(event) => changeField('description', event.target.value)} />
          </FormField>
          <FormField className={item.needsReview ? 'contract-quantity-field' : ''} label='Contract quantity' id={`${inputId}-quantity`} hint={rateOnly
            ? 'Rate-reference quantity; not authorised work or actual hours.'
            : printed
              ? `${sourceLabel}: ${formatQuantity(printed.quantity)} ${printed.unit ?? ''} · ${printed.quantityBasis ?? item.quantityBasis ?? 'provisional'}`
              : 'Source quantity unavailable for this item.'}>
            <input id={`${inputId}-quantity`} className='form-input' type='number' min='0' step='any' inputMode='decimal' value={form.quantity} onChange={(event) => changeField('quantity', event.target.value)} />
          </FormField>
          <FormField label='Unit' id={`${inputId}-unit`} hint='Keep the source unit.'>
            <select id={`${inputId}-unit`} className='form-select' value={form.unit} onChange={(event) => changeField('unit', event.target.value)}>
              {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </FormField>
          <FormField label='Unit rate' suffix={currency} id={`${inputId}-rate`} hint={included ? 'Included scope has no separate source rate.' : printed ? `${sourceLabel}: ${money(printed.rate)} per ${printed.unit ?? form.unit}` : 'Source rate unavailable for this item.'}>
            <input id={`${inputId}-rate`} className='form-input' type='number' min='0' step='any' inputMode='decimal' value={form.rate} placeholder={included ? 'Included in other rates' : 'Enter rate'} disabled={included} onChange={(event) => changeField('rate', event.target.value)} />
          </FormField>
          <div className={`contract-line-amount${matchesPrintedAmount ? ' matches' : ''}`}><span>Line amount</span><strong>{included ? 'Included' : rateOnly ? 'Rate only' : money(calculatedAmount)}</strong><p>{amountNote}</p></div>
        </div>}

        <details className='contract-item-source'>
          <summary>Source &amp; scope details <span>{item.ref}</span></summary>
          <div>
            <p>{demoContext}</p>
            <dl><div><dt>Location</dt><dd>{form.location || 'Not specified'}</dd></div><div><dt>Start / duration</dt><dd>{formatMonth(item.startDate)}{item.durationMonths != null ? ` · ${item.durationMonths} months` : ''}</dd></div></dl>
            <p>Item record: {item.id}.</p>
            <p>Area aliases do not change contract scope. Source duration is not a monthly rate multiplier.</p>
            <p>{contract.demoImport
              ? `${sourceFilename || 'Demo source'} · fictional demo PDF, page 1.`
              : sourceKind === 'illustrative'
                ? 'Illustrative demo schedule; not a supplied contract.'
                : sourceKind === 'provided'
                  ? `${sourceFilename || 'Project source'}${sourcePage ? ` · PDF page ${sourcePage}${contract?.sourcePageCount ? ` of ${contract.sourcePageCount}` : ''}` : ''}.`
                  : 'No supplied source document is available for this project.'}</p>
            {item.sourceNote && <p>{item.sourceNote}</p>}
            <p>Contract-data review only. This does not certify work or create a payment claim.</p>
          </div>
        </details>
      </div>

      <FormActions className='editor-footer' secondary={<div className='editor-summary'>
        <strong>{locked ? 'Read-only contract' : item.ref}</strong>
        <span>{locked ? 'Create a revision to edit.' : 'Confirm after checking the source.'}</span>
      </div>}>
        {!locked && onNext && <Button onClick={onNext}>{nextLabel || 'Skip item'}</Button>}
        <Button type='submit' className='primary' icon={locked ? ArrowRight : Check} disabled={locked ? !onNext : !onSave}>
          {locked ? nextLabel || 'Next item' : 'Confirm item'}
        </Button>
      </FormActions>
    </form>
  );
}
