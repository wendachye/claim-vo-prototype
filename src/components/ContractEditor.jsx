import { useId } from 'react';
import { AlertTriangle, ArrowRight, Check, FileText, Lock, Sparkles } from 'lucide-react';
import { contract as sampleContract, initialItems } from '../data/contract.js';
import { contractFormValues as formFor, contractFormScope } from '../data/form-buffer.js';
import { Button, FormActions, FormField } from './ui.jsx';
import { useBufferedState } from './useFormBuffer.js';

const UNITS = ['m²', 'm³', 'm', 'set', 'design', 'visit', 'pc', 'hr'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMoney(value, currency) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const prefix = currency === 'SGD' ? 'S$' : currency === 'MYR' ? 'RM' : currency;
  return `${prefix} ${Number(value).toLocaleString('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value) {
  return value == null ? '—' : Number(value).toLocaleString('en-SG', {
    maximumFractionDigits: 4,
  });
}

function formatMonth(value) {
  if (!value) return 'Not specified';
  const [year, month] = value.split('-');
  return MONTHS[Number(month) - 1] ? `${MONTHS[Number(month) - 1]} ${year}` : value;
}

export function ContractEditor({ item, locked = false, onSave, onNext, nextLabel, contract = sampleContract, sourceItems, projectId, revision = 1 }) {
  const inputId = useId();
  const formScope = contractFormScope(item, revision, locked);
  const [form, setForm] = useBufferedState(projectId || contract.id || contract.reference || 'sample-contract', formScope, () => formFor(item));
  const hasEdits = !locked && JSON.stringify(form) !== JSON.stringify(formFor(item));

  if (!item) {
    return (
      <section className='review-editor'>
        <div className='editor-header'><h2>Review extracted item</h2></div>
        <div className='editor-body'><p>Select a contract item to begin the review.</p></div>
      </section>
    );
  }

  const projectSourceItems = sourceItems === undefined && contract === sampleContract ? initialItems : sourceItems;
  const printed = Array.isArray(projectSourceItems) ? projectSourceItems.find((sourceItem) => sourceItem.id === item.id) : undefined;
  const sourceKind = contract?.sourceKind ?? (contract === sampleContract ? 'provided' : 'none');
  const currency = contract?.currency || (contract === sampleContract ? 'SGD' : 'Currency not specified');
  const sourceLabel = contract.demoImport ? 'Demo PDF' : sourceKind === 'illustrative' ? 'Demo schedule' : 'Printed source';
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
    ? Number(form.quantity) * Number(form.rate)
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

  return (
    <form className='review-editor' onSubmit={saveItem} noValidate>
      <div className='editor-header'>
        <div>
          <h2>Review extracted item</h2>
          <p>{item.id} <span aria-hidden='true'>·</span> {item.ref}</p>
        </div>
        <span className={`badge ${locked ? 'neutral' : item.needsReview ? 'warning' : 'success'}`}>
          {locked ? 'Baseline locked' : item.needsReview ? 'Needs review' : 'Reviewed'}
        </span>
      </div>

      <div className='editor-body'>
        {hasEdits && <p className='field-note' role='status'>Unsaved changes kept while you browse. Confirm this item before refreshing.</p>}
        <div className='notice'>
          <Sparkles size={16} aria-hidden='true' />
          <div>
            <strong>{contract.demoImport ? 'Mock extraction' : sourceKind === 'illustrative' ? 'Illustrative review data' : 'Simulated extraction'}</strong>
            <p>{contract.demoImport
              ? 'Check these simulated values against the fictional demo PDF. Any separately selected PDF was previewed only.'
              : sourceKind === 'illustrative'
              ? 'These editable values are invented for this project’s showcase. Compare them with the illustrative schedule; no supplied contract has been extracted.'
              : 'These editable values are seeded for the showcase. Compare them with this project’s source schedule before confirming.'}</p>
          </div>
        </div>

        {locked && (
          <div className='notice success' role='status'>
            <Lock size={16} aria-hidden='true' />
            <div>
              <strong>This baseline is locked</strong>
              <p>Create a new revision to change approved contract data. Reviewing this item does not change the locked version.</p>
            </div>
          </div>
        )}

        {item.needsReview && (
          <div className='notice warning' role='note'>
            <AlertTriangle size={17} aria-hidden='true' />
            <div>
              <strong>Quantity needs a source check</strong>
              <p>
                The simulated extraction read {formatQuantity(item.rawExtractedQuantity ?? item.quantity)} {item.unit}.
                {' '}{hasSourceQuantity
                  ? `The ${sourceKind === 'illustrative' ? 'illustrative' : 'printed'} schedule shows ${formatQuantity(printed.quantity)} ${printed.unit}.`
                  : 'A source quantity is unavailable for this item in the active project. Review this project’s source before confirming.'}
              </p>
              {hasSourceQuantity && <Button
                className='secondary'
                disabled={locked}
                onClick={() => changeField('quantity', String(printed.quantity))}
              >
                Use source value: {formatQuantity(printed.quantity)}
              </Button>}
              {hasSourceQuantity && <p className='field-note'>Filling the source value does not confirm the item.</p>}
            </div>
          </div>
        )}

        <div className='field-grid'>
          <FormField className='field-card field-full' label='Work description' id={`${inputId}-description`} hint={item.subsection ?? item.section}>
            <textarea
              id={`${inputId}-description`}
              className='form-textarea'
              rows={3}
              value={form.description}
              disabled={locked}
              onChange={(event) => changeField('description', event.target.value)}
            />
          </FormField>

          <FormField className={`field-card${item.needsReview ? ' warning' : ''}`} label='Contract quantity' id={`${inputId}-quantity`} hint={rateOnly
            ? 'Printed rate-reference quantity; this is not authorised work or actual hours.'
            : printed
              ? `${sourceLabel}: ${formatQuantity(printed.quantity)} ${printed.unit ?? ''} · ${printed.quantityBasis ?? item.quantityBasis ?? 'provisional'}`
              : 'Source quantity unavailable for this item in the active project.'}>
            <input
              id={`${inputId}-quantity`}
              className='form-input'
              type='number'
              min='0'
              step='any'
              inputMode='decimal'
              value={form.quantity}
              disabled={locked}
              onChange={(event) => changeField('quantity', event.target.value)}
            />
          </FormField>

          <FormField className='field-card' label='Unit' id={`${inputId}-unit`} hint='Keep the source unit; unlike quantities are not combined.'>
            <select
              id={`${inputId}-unit`}
              className='form-select'
              value={form.unit}
              disabled={locked}
              onChange={(event) => changeField('unit', event.target.value)}
            >
              {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </FormField>

          <FormField className='field-card' label='Unit rate' suffix={currency} id={`${inputId}-rate`} hint={included ? 'Included scope has no separate source rate.' : printed ? `${sourceLabel}: ${money(printed.rate)} per ${printed.unit ?? form.unit}` : 'Source rate unavailable for this item in the active project.'}>
            <input
              id={`${inputId}-rate`}
              className='form-input'
              type='number'
              min='0'
              step='any'
              inputMode='decimal'
              value={form.rate}
              placeholder={included ? 'Included in other rates' : 'Enter rate'}
              disabled={locked || included}
              onChange={(event) => changeField('rate', event.target.value)}
            />
          </FormField>

          <div className={`field-card${matchesPrintedAmount ? ' verified' : ''}`}>
            <span className='field-label'>Line amount · {currency}</span>
            <div className='field-value'>
              {included ? 'Included' : rateOnly ? 'Rate only' : money(calculatedAmount)}
            </div>
            <p className='field-note'>
              {included
                ? 'No separate charge is inferred.'
                : rateOnly
                  ? 'Actual eligible work must be measured and approved separately.'
                  : printed
                    ? `${sourceLabel}: ${money(printed.amount)}${matchesPrintedAmount ? ' · matches current entries' : ' · compare current entries'}`
                    : 'Source amount unavailable for this item in the active project.'}
            </p>
          </div>

          <div className='field-card'>
            <span className='field-label'>Location</span>
            <div className='field-value'>{form.location || 'Not specified'}</div>
            <p className='field-note'>Source location. Demo area aliases do not change contract scope.</p>
          </div>

          <div className='field-card'>
            <span className='field-label'>Start / duration</span>
            <div className='field-value'>
              {formatMonth(item.startDate)}{item.durationMonths != null ? ` · ${item.durationMonths} months` : ''}
            </div>
            <p className='field-note'>Source duration is not a monthly rate multiplier.</p>
          </div>
        </div>

        <div className='notice'>
          <FileText size={16} aria-hidden='true' />
          <div>
            <strong>Source reference {item.ref}</strong>
            <p>{contract.demoImport
              ? `${sourceFilename} · fictional demo PDF, page 1.`
              : sourceKind === 'illustrative'
              ? 'Illustrative demo schedule · not a supplied contract.'
              : sourceKind === 'provided'
                ? `${sourceFilename || 'Project source'}${sourcePage ? ` · PDF page ${sourcePage}${contract?.sourcePageCount ? ` of ${contract.sourcePageCount}` : ''}` : ''}.`
                : 'No supplied source document is available for this project.'} This is a contract-data review, not certification of work or a payment claim.</p>
            {item.sourceNote && <p className='field-note'>{item.sourceNote}</p>}
          </div>
        </div>
      </div>

      <FormActions className='editor-footer' secondary={<div className='editor-summary'>
          <strong>{locked ? 'Read-only baseline' : item.id}</strong>
          <span>{locked ? 'A revision is required for edits.' : 'Confirm only after checking the source.'}</span>
        </div>}>
        {!locked && onNext && (
          <Button className='secondary' onClick={onNext}>{nextLabel || 'Skip item'}</Button>
        )}
        <Button
          type='submit'
          className='primary'
          icon={locked ? ArrowRight : Check}
          disabled={locked ? !onNext : !onSave}
        >
          {locked ? nextLabel || 'Next item' : 'Confirm item'}
        </Button>
      </FormActions>
    </form>
  );
}
