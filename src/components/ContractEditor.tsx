import type { FormEvent } from 'react';
import type { ContractDetails, WorkItem, InputNumber, DrawingArea } from '../types/domain';
interface ContractItemValues { description: string; quantity: string; rate: string; unit: string; location: string }
interface ContractEditorProps { item: WorkItem | null; checkIssue?: { messages: string[] }; locked?: boolean; onSave?: (values: ContractItemValues) => void; onNext?: () => void; nextLabel?: string; contract?: ContractDetails; sourceItems?: WorkItem[]; projectId?: string; revision?: number; relatedAreas?: DrawingArea[]; onOpenMessage?: () => void }
import { useId } from 'react';
import { AlertTriangle, ArrowRight, Check, FileText, Lock, MessageSquare } from 'lucide-react';
import { contract as sampleContract, initialItems } from '../data/contract.ts';
import { contractFormValues as formFor, contractFormScope } from '../data/form-buffer.ts';
import { claimBasisProduct } from '../data/claim-basis.ts';
import { Badge, Button, FormActions, FormField, SelectField } from './ui';
import { useBufferedState } from './useFormBuffer';
import './contract-editor.css';

const UNITS = ['m²', 'm³', 'm', 'set', 'design', 'visit', 'pc', 'hr'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMoney(value: InputNumber | undefined, currency: string) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const prefix = currency === 'SGD' ? 'S$' : currency === 'MYR' ? 'RM' : currency;
  return `${prefix} ${Number(value).toLocaleString('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value: InputNumber | undefined) {
  return value == null || value === '' ? '—' : Number(value).toLocaleString('en-SG', {
    maximumFractionDigits: 4,
  });
}

function formatMonth(value: string | null | undefined) {
  if (!value) return 'Not specified';
  const [year, month] = value.split('-');
  return MONTHS[Number(month) - 1] ? `${MONTHS[Number(month) - 1]} ${year}` : value;
}

export function ContractEditor({ item, checkIssue, locked = false, onSave, onNext, nextLabel, contract = sampleContract, sourceItems, projectId, revision = 1, relatedAreas = [], onOpenMessage }: ContractEditorProps) {
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
  const manualRecovery = item.extractionRecovery?.method === 'manual';
  const requiresReview = item.needsReview || Boolean(checkIssue);
  const hasSourceQuantity = printed?.quantity != null && String(printed.quantity) !== '' && Number.isFinite(Number(printed.quantity));
  const sourcePage = printed?.sourcePage ?? contract?.sourcePage;
  const sourceFilename = contract?.sourceFilename ?? contract?.sourceFile;
  const money = (value: InputNumber | undefined) => formatMoney(value, currency);
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
    && Math.abs(Math.round((Number(calculatedAmount) + Number.EPSILON) * 100) / 100 - Number(printed.amount)) < 0.005;
  const unitOptions = [...new Set([...UNITS, form.unit])];

  function changeField(field: keyof ContractItemValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function saveItem(event: FormEvent<HTMLFormElement>) {
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
  const sourceIncluded = printed?.pricingType === 'included';
  const sourceRateOnly = printed?.pricingType === 'rateOnly';
  const sourceAmount = printed ? sourceIncluded ? 'Included' : sourceRateOnly ? 'Rate only' : money(printed.amount) : '—';
  const workAmount = included ? 'Included' : rateOnly ? 'Rate only' : money(calculatedAmount);

  return (
    <form className='review-editor contract-item-editor' onSubmit={saveItem} noValidate>
      <div className='editor-header'>
        <div>
          <h2>{locked ? 'Work item details' : 'Review work item'}</h2>
          <p>{item.ref} <span aria-hidden='true'>·</span> {sourceContext}</p>
        </div>
        <Badge tone={locked ? 'green' : requiresReview ? 'amber' : 'green'}>
          {locked && <Lock size={12} aria-hidden='true' />}{locked ? 'Contract confirmed' : requiresReview ? 'Needs review' : 'Reviewed'}
        </Badge>
      </div>

      <div className='editor-body'>
        {hasEdits && <p className='contract-item-unsaved' role='status'>Unsaved changes stay while you browse. Confirm this item before refreshing.</p>}
        {!locked && <p className='contract-item-context'><FileText size={14} aria-hidden='true' /><span>Compare the values with the source before confirming this item.</span></p>}

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

        {locked ? <div className='contract-readonly-work'><h3>{form.description}</h3><p>{item.subsection ?? item.section}</p></div> : <FormField className='contract-item-description' label='Work description' id={`${inputId}-description`} hint={item.subsection ?? item.section}>
          <textarea id={`${inputId}-description`} className='form-textarea' rows={3} value={form.description} onChange={(event) => changeField('description', event.target.value)} />
        </FormField>}

        <div className='contract-value-comparison-wrap'>
          <table className='contract-value-comparison' aria-label='Contract value comparison'>
            <thead><tr><th scope='col'>Value</th><th scope='col'>From contract</th><th scope='col'>Work-list value</th></tr></thead>
            <tbody>
              <tr><th scope='row'>Quantity</th><td>{printed ? <>{formatQuantity(printed.quantity)} <span>{printed.unit}</span>{!rateOnly && <small>{printed.quantityBasis ?? item.quantityBasis ?? 'provisional'}</small>}</> : '—'}</td><td>{locked ? <>{formatQuantity(form.quantity)} <span>{form.unit}</span></> : <div className='contract-comparison-quantity-inputs'>
                <FormField className={item.needsReview ? 'contract-quantity-field contract-comparison-input' : 'contract-comparison-input'} label='Contract quantity' id={`${inputId}-quantity`}>
                  <input id={`${inputId}-quantity`} className='form-input' type='number' min='0' step='any' inputMode='decimal' value={form.quantity} onChange={(event) => changeField('quantity', event.target.value)} />
                </FormField>
                <FormField className='contract-comparison-input' label='Unit' id={`${inputId}-unit`}>
                  <SelectField id={`${inputId}-unit`} className='form-select' value={form.unit} onChange={(event) => changeField('unit', event.target.value)}>
                    {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </SelectField>
                </FormField>
              </div>}</td></tr>
              <tr><th scope='row'>Unit rate<small>{currency}</small></th><td>{printed ? sourceIncluded ? 'Included' : money(printed.rate) : '—'}</td><td>{locked ? included ? 'Included' : money(form.rate) : <FormField className='contract-comparison-input' label='Unit rate' suffix={currency} id={`${inputId}-rate`}>
                <input id={`${inputId}-rate`} className='form-input' type='number' min='0' step='any' inputMode='decimal' value={form.rate} placeholder={included ? 'Included in other rates' : 'Enter rate'} disabled={included} onChange={(event) => changeField('rate', event.target.value)} />
              </FormField>}</td></tr>
              <tr className='contract-comparison-amount-row'><th scope='row'>Line amount</th><td>{sourceAmount}</td><td><div className={`contract-line-amount${matchesPrintedAmount ? ' matches' : ''}`}><strong>{workAmount}</strong>{!included && !rateOnly && printed && <span>{matchesPrintedAmount ? 'Matches source' : 'Compare with source'}</span>}</div></td></tr>
            </tbody>
          </table>
        </div>
        {(included || rateOnly || !printed) && <p className='contract-value-note'>{included ? 'Included in other rates. No separate charge.' : rateOnly ? 'Rate-reference quantity; not actual hours. Actual work or hours need separate measurement and approval.' : 'Source values are unavailable for this item.'}</p>}
        {(relatedAreas.length > 0 || onOpenMessage) && <nav className='contract-item-related' aria-label='Related site records'>
          <span>Related records</span><div>{relatedAreas.map(area => <a key={area.id} className='area-mapping-link' href={`#drawing?area=${encodeURIComponent(area.id)}`} title={area.name} aria-label={`View area ${area.code} mapping`}>Area {area.code}</a>)}
          {onOpenMessage && <Button className='ghost' icon={MessageSquare} aria-label={`Open site update for ${item.ref}`} onClick={onOpenMessage}>Site update</Button>}</div>
        </nav>}

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

      <FormActions className='editor-footer' secondary={!locked ? <div className='editor-summary'>
        <strong>{item.ref}</strong>
        <span>Confirm after checking the source.</span>
      </div> : undefined}>
        {!locked && onNext && <Button onClick={onNext}>{nextLabel || 'Skip item'}</Button>}
        <Button type='submit' className='primary' icon={locked ? ArrowRight : Check} disabled={locked ? !onNext : !onSave}>
          {locked ? nextLabel || 'Next item' : 'Confirm item'}
        </Button>
      </FormActions>
    </form>
  );
}
