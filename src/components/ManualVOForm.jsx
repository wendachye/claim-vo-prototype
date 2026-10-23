import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Plus, X } from 'lucide-react';
import { getDrawingMapping } from '../data/drawing-mapping.js';
import { clearFormBuffer } from '../data/form-buffer.js';
import { MANUAL_VO_PHOTOS } from '../data/manual-vo.js';
import { useBufferedState } from './useFormBuffer.js';
import { Button, FormActions, FormField, Input, Modal, NativeSelect, Textarea } from './ui.jsx';
import './manual-vo.css';

const FORM_SCOPE = 'vo:manual-entry';
const initialFields = () => ({
  submissionId: globalThis.crypto?.randomUUID?.() || `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  title: '', description: '', areaId: '', areaText: '', relatedItemId: '', instructionReference: '', photo: '',
});

export function ManualVOForm({ project, onClose, onSave }) {
  const formId = useId();
  const controls = useRef({});
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const savedRef = useRef(false);
  const [fields, setFields] = useBufferedState(project.id, FORM_SCOPE, initialFields);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const areas = getDrawingMapping(project).areas;
  const items = Array.isArray(project.items) ? project.items : [];
  const photo = MANUAL_VO_PHOTOS.find(entry => entry.value === fields.photo);
  const staleArea = fields.areaId && !areas.some(area => area.id === fields.areaId);
  const staleItem = fields.relatedItemId && !items.some(item => item.id === fields.relatedItemId);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const update = (name, value) => {
    setFields(prior => ({ ...prior, [name]: value,
      ...(name === 'areaId' && value ? { areaText: '' } : {}),
      ...(name === 'areaText' ? { areaId: '' } : {}),
    }));
    setError(null);
  };
  function problem(message, field) {
    setError({ message, field });
    const control = controls.current[field];
    let parent = control?.closest('details');
    while (parent) { parent.open = true; parent = parent.parentElement?.closest('details'); }
    control?.focus();
  }
  async function save(event) {
    event?.preventDefault();
    if (savingRef.current) return;
    if (!fields.title.trim()) return problem('Describe the extra work.', 'title');
    if (fields.title.trim().length > 160) return problem('Keep the work description within 160 characters.', 'title');
    if (!fields.description.trim()) return problem('Add the work details or reported instruction.', 'description');
    if (fields.description.trim().length > 4000) return problem('Keep the details within 4,000 characters.', 'description');
    if (staleArea) return problem('Choose a current area or enter another location.', 'areaId');
    if (staleItem) return problem('Choose a current contract item or leave the comparison unlinked.', 'relatedItemId');
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await onSave?.({ ...fields });
      if (['updated', 'unchanged'].includes(result?.outcome) && result.caseId) {
        savedRef.current = true;
        clearFormBuffer(project.id, FORM_SCOPE);
        onClose?.();
      } else if (mounted.current) problem(result?.error || 'The extra work could not be added. Check the details and try again.', result?.field);
    } catch {
      if (mounted.current) problem('The extra work could not be added. Your entries are kept; please try again.');
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  const props = name => ({ name, value: fields[name] || '', ref: node => { controls.current[name] = node; }, onChange: event => update(name, event.target.value) });
  const fieldError = name => error?.field === name ? error.message : undefined;
  const knownFieldError = error?.field && controls.current[error.field];

  return <Modal title="Add extra work" description={`${project.name} · Manual demo entry`} onClose={onClose} onCloseAutoFocus={event => { if (savedRef.current) event.preventDefault(); }} footer={<FormActions className="manual-vo-actions" secondary={<Button onClick={onClose} disabled={saving}>Cancel</Button>}><Button type="submit" form={formId} className="primary" icon={Plus} disabled={saving || !onSave}>{saving ? 'Adding…' : 'Add for review'}</Button></FormActions>}>
    <form id={formId} className="manual-vo-form" onSubmit={save} noValidate>
      <FormField label="Work description" required error={fieldError('title')}><Input {...props('title')} maxLength={160} placeholder="e.g. Additional access platform at W5" autoFocus /></FormField>
      <FormField label="Details" required error={fieldError('description')} hint="Describe the additional work and how the instruction was received."><Textarea {...props('description')} rows={3} maxLength={4000} placeholder="What was requested, where and by whom?" /></FormField>
      {areas.length > 0 || staleArea ? <FormField label="Site area" optional error={fieldError('areaId')}><NativeSelect {...props('areaId')}><option value="">Another location / not yet linked</option>{staleArea && <option value={fields.areaId} disabled>Previous area unavailable</option>}{areas.map(area => <option key={area.id} value={area.id}>{area.code} · {area.name}</option>)}</NativeSelect></FormField> : null}
      {!fields.areaId && <FormField label="Location" optional error={fieldError('areaText')}><Input {...props('areaText')} maxLength={120} placeholder="e.g. W5, east side" /></FormField>}
      <FormField label="Instruction or reference" optional error={fieldError('instructionReference')}><Input {...props('instructionReference')} maxLength={500} placeholder="e.g. Reported site instruction or meeting reference" /></FormField>
      <details className="manual-vo-optional">
        <summary>Contract link &amp; demo photo <span>Optional</span></summary>
        <div className="manual-vo-optional-fields">
          <FormField label="Contract item for comparison" optional error={fieldError('relatedItemId')} hint="A comparison link does not confirm a variation."><NativeSelect {...props('relatedItemId')}><option value="">Unmatched / outside listed items</option>{staleItem && <option value={fields.relatedItemId} disabled>Previous contract item unavailable</option>}{items.map(item => <option key={item.id} value={item.id}>{item.ref || item.id} · {item.description}</option>)}</NativeSelect></FormField>
          <FormField label="Demo photo" optional error={fieldError('photo')}><NativeSelect {...props('photo')}><option value="">No photo</option>{MANUAL_VO_PHOTOS.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</NativeSelect></FormField>
          {photo && <figure className="manual-vo-photo"><img src={photo.value} alt={photo.alt} /><figcaption><ImagePlus size={13} aria-hidden="true" />Generated demo photo · not project evidence<Button className="ghost icon" aria-label="Remove demo photo" onClick={() => update('photo', '')}><X size={14} /></Button></figcaption></figure>}
        </div>
      </details>
      {error && !knownFieldError && <p className="manual-vo-error" role="alert">{error.message}</p>}
      <p className="manual-vo-note">Manual demo record · price unknown. The QS reviews scope, instruction and approval in the existing workflow.</p>
      <p className="manual-vo-note">Unfinished entries stay while you browse. Save before refreshing.</p>
    </form>
  </Modal>;
}
