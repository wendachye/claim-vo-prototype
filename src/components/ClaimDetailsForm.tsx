import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import type { ClaimDocumentDetails } from '../types/claims';
import { claimDocumentFieldLimits, validateClaimDocumentDetails } from '../data/claim-document-details.ts';
import { clearFormBuffer } from '../data/form-buffer.ts';
import { useBufferedState } from './useFormBuffer';
import { Button, FormActions, FormField, Input, Modal, Textarea } from './ui';
import './claim-details-form.css';

type DetailField = Exclude<keyof ClaimDocumentDetails, 'version'>;
export type ClaimDetailsSaveInput = { details: ClaimDocumentDetails; sourceKey: string };
export type ClaimDetailsSaveResult = { outcome: string; error?: string };
export type SaveClaimDetails = (draftId: string, input: ClaimDetailsSaveInput) => ClaimDetailsSaveResult | Promise<ClaimDetailsSaveResult>;

export function ClaimDetailsForm({ projectId, draftId, details, sourceKey, onSave, onClose }: {
  projectId: string; draftId: string; details: ClaimDocumentDetails; sourceKey: string;
  onSave: SaveClaimDetails; onClose: () => void;
}) {
  const formId = useId();
  const scope = `claim:document-details:${JSON.stringify([draftId, sourceKey])}`;
  const [values, setValues] = useBufferedState(projectId, scope, details);
  const [errors, setErrors] = useState<Partial<Record<DetailField, string>>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const controls = useRef<Partial<Record<DetailField, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const errorControl = useRef<HTMLParagraphElement | null>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const saved = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const focusField = (name?: DetailField) => {
    const control = name ? controls.current[name] : null;
    const disclosure = control?.closest('details');
    if (disclosure) disclosure.open = true;
    if (control) requestAnimationFrame(() => { if (mounted.current) control.focus(); });
  };
  const problem = (message: string) => {
    setError(message);
    requestAnimationFrame(() => { if (mounted.current) errorControl.current?.focus(); });
  };
  const change = (name: DetailField, next: string) => {
    setValues(previous => ({ ...previous, [name]: next }));
    setErrors(previous => ({ ...previous, [name]: undefined }));
    setError('');
  };
  const field = (name: DetailField, label: string, options: { multiline?: boolean; hint?: string; type?: string; autoFocus?: boolean } = {}) => <FormField key={name} label={label} error={errors[name]} hint={options.hint}>
    {options.multiline ? <Textarea name={name} ref={control => { controls.current[name] = control; }} rows={3} value={values[name]} maxLength={claimDocumentFieldLimits[name]} disabled={saving} onChange={event => change(name, event.target.value)} /> : <Input name={name} ref={control => { controls.current[name] = control; }} type={options.type || 'text'} autoFocus={options.autoFocus} value={values[name]} maxLength={claimDocumentFieldLimits[name]} disabled={saving} onChange={event => change(name, event.target.value)} />}
  </FormField>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const checked = validateClaimDocumentDetails(values);
    if (!checked.details) {
      const fieldErrors = checked.fieldErrors || {};
      setErrors(fieldErrors);
      setError(checked.error || 'Check the highlighted claim details.');
      focusField(Object.keys(fieldErrors)[0] as DetailField | undefined);
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await onSave(draftId, { details: checked.details, sourceKey });
      if (['updated', 'unchanged'].includes(result.outcome)) {
        saved.current = true;
        clearFormBuffer(projectId, scope);
        if (mounted.current) onClose();
      } else if (mounted.current) problem(result.error || 'The new version could not be saved. Your edits are kept.');
    } catch {
      if (mounted.current) problem('The new version could not be saved. Your edits are kept; try again.');
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <div className="claim-details-modal"><Modal title="Edit claim details" description="Printed details for this claim only." onClose={saving ? undefined : onClose} onCloseAutoFocus={event => { if (saved.current) event.preventDefault(); }} footer={<FormActions className="claim-details-actions" secondary={<Button onClick={onClose} disabled={saving}>Cancel</Button>}><Button type="submit" form={formId} className="primary" icon={Save} disabled={saving}>{saving ? 'Saving…' : 'Save new version'}</Button></FormActions>}>
    <form id={formId} className="claim-details-form" onSubmit={submit} noValidate>
      <p className="claim-details-note">Your original saved version stays unchanged. The new draft keeps the same amounts and evidence.</p>
      <fieldset><legend>Recipient</legend>
        {field('recipientCompany', 'Recipient company', { autoFocus: true })}
        <details className="claim-details-disclosure"><summary>Attention and address</summary><div>
          {field('recipientAttention', 'Attention')}
          {field('recipientAddress', 'Recipient address', { multiline: true })}
        </div></details>
      </fieldset>
      <fieldset><legend>Project &amp; references</legend>
        {field('projectName', 'Project name')}
        {field('printedProjectCode', 'Printed project code', { hint: 'Changes the document only; the project in this workspace stays the same.' })}
        <div className="claim-details-grid">{field('contractReference', 'Contract reference')}{field('claimReference', 'Claim reference', { hint: 'Leave blank to use the new version’s system ID.' })}</div>
        {field('claimDate', 'Claim date', { type: 'date', hint: 'Printed on the document. This does not submit the claim.' })}
      </fieldset>
      <fieldset><legend>Your company</legend>
        {field('companyName', 'Company name')}
        <details className="claim-details-disclosure"><summary>Address and contact details</summary><div>
          {field('companyAddress', 'Company address', { multiline: true })}
          {field('companyRegistration', 'Company registration no.')}
          <div className="claim-details-grid">{field('companyPhone', 'Phone', { type: 'tel' })}{field('companyEmail', 'Email', { type: 'email' })}</div>
        </div></details>
      </fieldset>
      <p className="claim-details-note">Leave unknown details blank. Unfinished edits stay while you browse, until this page is refreshed.</p>
      {error && <p className="claim-details-error" ref={errorControl} tabIndex={-1} role="alert">{error}</p>}
    </form>
  </Modal></div>;
}
