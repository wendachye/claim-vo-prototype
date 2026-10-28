import type { Project, VOCase } from '../types/domain';
import { useEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { getVOLinkTargets } from '../data/vo';
import { clearFormBuffer } from '../data/form-buffer';
import { useBufferedState } from './useFormBuffer';
import { Button, FormActions, FormField, SelectField, Textarea } from './ui';

interface VOLinkFormProps {
  project: Project; entry: VOCase;
  onSave: (sourceId: string, targetId: string, reason: string) => { outcome: string; error?: string } | undefined;
  onClose: () => void;
}

export function VOLinkForm({ project, entry, onSave, onClose }: VOLinkFormProps) {
  const scope = `vo-link:${entry.id}`;
  const [fields, setFields] = useBufferedState(project.id, scope, { targetId: '', reason: '' });
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);
  const targets = getVOLinkTargets(project, entry.id);
  useEffect(() => { formRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus(); }, []);
  function problem(message: string, field = '') {
    setError(message); setErrorField(field);
    formRef.current?.querySelector<HTMLElement>(field === 'targetId' ? '[role="combobox"]' : `[name="${field}"]`)?.focus();
  }
  function save() {
    if (!targets.some(target => target.id === fields.targetId)) return problem('Choose an available VO from this project.', 'targetId');
    if (!fields.reason.trim()) return problem('Explain why these records describe the same extra work.', 'reason');
    const result = onSave(entry.id, fields.targetId, fields.reason.trim());
    if (!result || result.outcome === 'invalid') return problem(result?.error || 'The link could not be saved. Check the records and try again.');
    if (['updated', 'unchanged'].includes(result.outcome)) { clearFormBuffer(project.id, scope); onClose(); }
  }
  return <form ref={formRef} className="vo-link-form" aria-label="Link to existing VO" onSubmit={event => { event.preventDefault(); save(); }}>
    <h3><Link2 size={15} aria-hidden="true"/>Link to existing VO</h3>
    <p>Use one VO for the same extra work. Original messages and photos stay intact; this case will have no separate claim value.</p>
    {targets.length ? <>
      <FormField label="Existing VO" required error={errorField === 'targetId' ? error : undefined}><SelectField name="targetId" value={fields.targetId} aria-label="Existing VO" aria-invalid={errorField === 'targetId'} onChange={event => { setFields(previous => ({ ...previous, targetId: event.target.value })); setError(''); setErrorField(''); }}><option value="">Choose a VO</option>{targets.map(target => <option value={target.id} key={target.id}>{target.reference} · {target.title}</option>)}</SelectField></FormField>
      <FormField label="Reason for linking" required error={errorField === 'reason' ? error : undefined}><Textarea name="reason" aria-label="Reason for linking" aria-invalid={errorField === 'reason'} value={fields.reason} rows={2} maxLength={1000} placeholder="Explain how the messages relate to the same work…" onChange={event => { setFields(previous => ({ ...previous, reason: event.target.value })); setError(''); setErrorField(''); }}/></FormField>
    </> : <p className="vo-link-empty" role="status">No available VO to link. Both cases must be open for editing, without a previous price approval or saved claim. For a case awaiting approval, choose Need information first.</p>}
    {error && !errorField && <p className="vo-form-error" role="alert">{error}</p>}
    <FormActions secondary={<Button onClick={onClose}>Cancel</Button>}><Button className="primary" type="submit" disabled={!targets.length}>Save link</Button></FormActions>
  </form>;
}
