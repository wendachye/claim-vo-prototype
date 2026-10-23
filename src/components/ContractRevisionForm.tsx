import type { FormEvent } from 'react';
import type { Project } from '../types/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { clearFormBuffer } from '../data/form-buffer.ts';
import { useBufferedState } from './useFormBuffer';
import { Button, FormActions, FormField, Modal, Textarea } from './ui';
import './contract-versions.css';

const revisionScope = (version: number) => `contract:revision:${version}`;

export function ContractRevisionForm({ project, onClose, onCreate }: { project: Project; onClose?: () => void; onCreate?: (reason: string) => { outcome: string; error?: string } | Promise<{ outcome: string; error?: string }> }) {
  const formId = useId();
  const reasonControl = useRef<HTMLTextAreaElement | null>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const created = useRef(false);
  const version = project.version ?? 1;
  const scope = revisionScope(version);
  const [reason, setReason] = useBufferedState(project.id, scope, '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const problem = (message: string) => {
    setError(message);
    reasonControl.current?.focus();
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!reason.trim()) return problem('Add a short reason for this contract change.');
    if (reason.trim().length > 300) return problem('Keep the change reason within 300 characters.');
    if (/[\r\n]/.test(reason.trim())) return problem('Use one short sentence for the change reason.');
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await onCreate?.(reason.trim());
      if (['updated', 'unchanged'].includes(result?.outcome || '')) {
        created.current = true;
        clearFormBuffer(project.id, scope);
        onClose?.();
      } else if (mounted.current) problem(result?.error || 'The version could not be created. Your reason is kept; try again.');
    } catch {
      if (mounted.current) problem('The version could not be created. Your reason is kept; try again.');
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <Modal title="Edit contract" description={project.name} onClose={onClose} onCloseAutoFocus={event => { if (created.current) event.preventDefault(); }} footer={<FormActions className="contract-revision-actions" secondary={<Button onClick={onClose} disabled={saving}>Cancel</Button>}><Button type="submit" form={formId} className="primary" icon={ArrowRight} disabled={saving || !onCreate}>{saving ? 'Creating…' : 'Create version'}</Button></FormActions>}>
    <form id={formId} className="contract-revision-form" onSubmit={submit} noValidate>
      <div className="contract-revision-step"><span>Version {version}</span><ArrowRight size={15} aria-hidden="true" /><strong>Version {version + 1}</strong><span className="contract-revision-draft">Unconfirmed</span></div>
      <FormField label="Change reason" required error={error || undefined} hint="Explain what needs correcting, for example a quantity or unit rate."><Textarea ref={reasonControl} autoFocus value={reason} maxLength={300} rows={3} placeholder="e.g. Correct the quantity after checking the schedule" onChange={event => { setReason(event.target.value); setError(''); }} /></FormField>
      <p className="contract-version-note">Review the changed items, then confirm the work list. Earlier saved claims keep their original contract values.</p>
      <p className="contract-version-note">Your unfinished reason stays while you browse. Create the version before refreshing.</p>
    </form>
  </Modal>;
}
