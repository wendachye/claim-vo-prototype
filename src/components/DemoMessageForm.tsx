import { useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ImagePlus } from 'lucide-react';
import type { Project } from '../types/domain';
import { DEMO_MESSAGE_PHOTOS, getDemoMessageSample, previewDemoMessage, type DemoMessageInput } from '../data/demo-message-intake';
import { clearFormBuffer } from '../data/form-buffer';
import { useBufferedState } from './useFormBuffer';
import { Badge, Button, FormActions, FormField, Modal, SelectField, Textarea } from './ui';
import './demo-message-form.css';

const FORM_SCOPE = 'whatsapp:demo-message';
const initialFields = () => ({
  text: '', photoId: '',
  submissionId: globalThis.crypto?.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(36).slice(2)}`,
});
interface DemoMessageResult { outcome: string; messageId?: string; error?: string }
interface DemoMessageFormProps {
  project: Project;
  onSave: (values: DemoMessageInput) => DemoMessageResult | undefined;
  onClose: () => void;
}

export function DemoMessageForm({ project, onSave, onClose }: DemoMessageFormProps) {
  const formId = useId();
  const textControl = useRef<HTMLTextAreaElement | null>(null);
  const saving = useRef(false);
  const saved = useRef(false);
  const [fields, setFields] = useBufferedState(project.id, FORM_SCOPE, initialFields);
  const [reviewed, setReviewed] = useState<{ projectId: string; sourceKey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const values: DemoMessageInput = { ...fields, projectId: project.id };
  const preview = previewDemoMessage(project, values);
  const isPreview = Boolean(reviewed && reviewed.projectId === project.id && reviewed.sourceKey === preview.sourceKey);
  const stalePreview = Boolean(reviewed && !isPreview);
  const sample = getDemoMessageSample(project);

  function update(name: 'text' | 'photoId', value: string) {
    setFields(previous => ({ ...previous, [name]: value }));
    setReviewed(null);
    setError(null);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    if (!isPreview) {
      if (!preview.canSave || preview.status === 'invalid') {
        setError(preview.error || preview.issues[0] || 'Check the message format before previewing.');
        textControl.current?.focus();
        return;
      }
      setReviewed({ projectId: project.id, sourceKey: preview.sourceKey });
      setError(null);
      return;
    }
    // Use the exact reviewed source key. The state boundary rejects a changed
    // project, baseline or mapping instead of silently reinterpreting the text.
    if (!preview.canSave || preview.status === 'invalid') {
      setReviewed(null);
      setError('The message or project changed. Preview it again before saving.');
      return;
    }
    saving.current = true;
    setError(null);
    try {
      const result = onSave({ ...values, previewKey: reviewed!.sourceKey });
      if (result?.messageId && ['updated', 'unchanged', 'duplicate'].includes(result.outcome)) {
        saved.current = true;
        clearFormBuffer(project.id, FORM_SCOPE);
        onClose();
      } else {
        setError(result?.error || 'The message could not be added. Your entries are kept; please try again.');
      }
    } catch {
      setError('The message could not be added. Your entries are kept; please try again.');
    } finally {
      saving.current = false;
    }
  }

  return <Modal title="Add demo message" description={`${project.name} · Mock incoming message`} onClose={onClose}
    onCloseAutoFocus={event => { if (saved.current) event.preventDefault(); }}
    footer={<FormActions className="demo-message-actions" secondary={isPreview
      ? <Button icon={ArrowLeft} onClick={() => { setReviewed(null); setError(null); }}>Back to edit</Button>
      : <Button onClick={onClose}>Cancel</Button>}>
      <Button type="submit" form={formId} className="primary" icon={isPreview ? Check : ArrowRight}>{isPreview ? 'Save to inbox' : 'Preview message'}</Button>
    </FormActions>}>
    <form id={formId} className="demo-message-form" onSubmit={submit} noValidate>
      <ol className="demo-message-steps" aria-label="Message entry steps">
        <li aria-current={!isPreview ? 'step' : undefined}>1. Write message</li><li aria-current={isPreview ? 'step' : undefined}>2. Preview</li>
      </ol>
      {!isPreview ? <>
        <div className="demo-message-compose-heading"><span>Selected project · <strong>{project.code}</strong></span><Button className="ghost" onClick={() => update('text', sample)} disabled={!sample}>Use example</Button></div>
        <FormField label="Message text" required hint="Project | Location | Area | Item ID, then COMPLETE=50% TOTAL. Enter cumulative completion.">
          <Textarea ref={textControl} value={fields.text} onChange={event => update('text', event.target.value)} rows={6} maxLength={4000} placeholder={sample || 'Add a contract work item and site area to use an example.'} autoFocus />
        </FormField>
        <FormField label="Demo photo" optional hint="Choose a bundled illustration, or leave this message without a photo.">
          <SelectField value={fields.photoId} onChange={event => update('photoId', event.target.value)}>
            <option value="">No photo</option>{DEMO_MESSAGE_PHOTOS.map(photo => <option key={photo.id} value={photo.id}>{photo.label}</option>)}
          </SelectField>
        </FormField>
        {stalePreview && <p className="demo-message-note" role="status">Project details changed. Preview your message again.</p>}
      </> : <section className="demo-message-preview" aria-label="Message preview">
        <div className="demo-message-preview-heading"><h3>Message preview</h3><Badge tone={preview.status === 'clarification' ? 'amber' : 'blue'}>{preview.status === 'clarification' ? 'Needs clarification' : 'Ready for review'}</Badge></div>
        <blockquote className="demo-message-original">{preview.text}</blockquote>
        {preview.photo ? <figure className="demo-message-photo"><img src={preview.photo.photo} alt={preview.photo.photoAlt} /><figcaption><ImagePlus size={13} aria-hidden="true" />Generated demo photo · illustrative only</figcaption></figure> : <p className="demo-message-note">No photo attached.</p>}
        <dl className="demo-message-summary">
          <div><dt>Project</dt><dd>{preview.projectCode}</dd></div>
          <div><dt>Contract item</dt><dd>{preview.item ? `${preview.item.ref || preview.item.id} · ${preview.item.description}` : 'Needs clarification'}</dd></div>
          <div><dt>Site area</dt><dd>{preview.area ? `${preview.area.code} · ${preview.area.name}` : preview.areaText || 'Needs clarification'}</dd></div>
          <div><dt>{preview.status === 'clarification' ? 'Completion in message' : 'Cumulative completion'}</dt><dd>{preview.completion == null ? 'Not confirmed' : `${preview.completion}% ${preview.status === 'clarification' ? 'stated · needs review' : 'reported total'}`}</dd></div>
        </dl>
        {preview.issues.length > 0 && <div className="demo-message-issues"><p>Clarify before updating progress:</p><ul>{preview.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div>}
        <p className="demo-message-note">{preview.status === 'clarification' ? 'Saving adds an inbox message only. Ask the worker to clarify before updating progress.' : 'Saving adds an inbox message only. Review the match, process it and verify progress separately.'}</p>
      </section>}
      {error && <p className="demo-message-error" role="alert">{error}</p>}
      <p className="demo-message-note">Local demo · nothing is sent to WhatsApp. Unfinished entries stay while you browse; save before refreshing.</p>
    </form>
  </Modal>;
}
