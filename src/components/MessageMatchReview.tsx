import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCheck, Pencil } from 'lucide-react';
import type { MessageMatchReview, Project, WhatsAppMessage, WorkItem } from '../types/domain';
import { getMessageMatchContext } from '../data/message-match';
import { getDrawingMapping } from '../data/drawing-mapping';
import { getItemAreaAllocation } from '../data/area-allocations';
import { clearFormBuffer } from '../data/form-buffer';
import { useBufferedState } from './useFormBuffer';
import { Button, FormActions, FormField, SelectField, Textarea, formatTime } from './ui';
import './message-match-review.css';

export interface MessageMatchReviewPanelProps {
  project: Project;
  message: WhatsAppMessage;
  onSave?: (messageId: string, values: { itemId: string; areaId: string; reason: string }) => { outcome: string; error?: string } | undefined;
  onEditingChange?: (editing: boolean) => void;
}
interface MatchForm { editing: boolean; itemId: string; areaId: string; reason: string }
const ownedItem = (project: Project, item: WorkItem) => item.pricingType === 'measured'
  && (!item.projectId || item.projectId === project.id) && (!item.projectCode || item.projectCode === project.code);
const itemLabel = (item?: WorkItem) => item ? `${item.ref || item.id} · ${item.description}` : 'Choose a contract work item';
const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? formatTime(value) : '';

/** Frozen labels only: safe to use inside saved claim evidence and exports. */
export function MessageMatchReviewDetails({ review }: { review: MessageMatchReview }) {
  const labelsValid = (value: unknown): value is MessageMatchReview['suggested'] => Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && ['itemId', 'itemRef', 'itemDescription', 'areaId', 'areaCode', 'areaName'].every(key => typeof (value as Record<string, unknown>)[key] === 'string'));
  if (!review || typeof review !== 'object' || !labelsValid(review.suggested) || !labelsValid(review.confirmed)
    || typeof review.reason !== 'string' || typeof review.reviewedBy !== 'string' || typeof review.reviewedAt !== 'string') {
    return <p className="wa-match-help">Match review details unavailable</p>;
  }
  const changed = review.suggested.itemId !== review.confirmed.itemId || review.suggested.areaId !== review.confirmed.areaId;
  const workLabel = (value: MessageMatchReview['suggested']) => [value.itemRef || value.itemId, value.itemDescription].filter(Boolean).join(' · ') || 'Work item unavailable';
  const areaLabel = (value: MessageMatchReview['suggested']) => [value.areaCode ? `Area ${value.areaCode}` : value.areaId, value.areaName].filter(Boolean).join(' · ') || 'Area unavailable';
  return <details className="wa-match-record">
    <summary>Match review<span>{changed ? 'Corrected' : 'Confirmed'}</span></summary>
    {changed && <dl><div><dt>Suggested work</dt><dd>{workLabel(review.suggested)}</dd></div><div><dt>Suggested area</dt><dd>{areaLabel(review.suggested)}</dd></div></dl>}
    <dl><div><dt>{changed ? 'Confirmed work' : 'Work item'}</dt><dd>{workLabel(review.confirmed)}</dd></div><div><dt>{changed ? 'Confirmed area' : 'Site area'}</dt><dd>{areaLabel(review.confirmed)}</dd></div></dl>
    {review.reason && <p className="wa-match-reason"><strong>Correction reason</strong>{review.reason}</p>}
    <p className="wa-match-reviewer">Reviewed by {review.reviewedBy}{dateLabel(review.reviewedAt) && <> · {dateLabel(review.reviewedAt)}</>}</p>
  </details>;
}

export function MessageMatchReviewPanel({ project, message, onSave, onEditingChange }: MessageMatchReviewPanelProps) {
  const context = getMessageMatchContext(project, message.id);
  const fields = context.fields || context.suggestion?.fields;
  const source = context.original || message;
  const mapping = getDrawingMapping(project);
  const sourceKey = JSON.stringify({ source: { id: source.id, kind: source.kind, text: source.text, sender: source.sender, senderRole: source.senderRole, date: source.date,
    itemId: source.itemId, area: source.area, areaId: source.areaId, areaMapping: source.areaMapping, areaProgress: source.areaProgress, location: source.location,
    completion: source.completion, completionBasis: source.completionBasis, photo: source.photo, photoAlt: source.photoAlt },
    mapping, items: project.items.map(({ id, ref, description, pricingType, quantity }) => ({ id, ref, description, pricingType, quantity })) });
  const scope = `whatsapp-match:${JSON.stringify([message.id, project.version, sourceKey, context.suggestion, context.review])}`;
  const initial = (): MatchForm => ({ editing: false, itemId: fields?.itemId || '', areaId: fields?.areaId || '', reason: context.review?.reason || '' });
  const [form, setForm] = useBufferedState(project.id, scope, initial);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const controls = useRef<Record<string, HTMLElement | null>>({});
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const editingCallback = useRef(onEditingChange); editingCallback.current = onEditingChange;
  const compatibleAreas = (itemId: string) => {
    const allocation = getItemAreaAllocation(project, itemId);
    return mapping.areas.filter(area => area.workItemIds.includes(itemId)
      && (!allocation.split || (allocation.valid && allocation.areas.some(entry => entry.areaId === area.id))));
  };
  const choices = project.items.filter(item => ownedItem(project, item) && compatibleAreas(item.id).length > 0);
  const selectedItem = choices.find(item => item.id === form.itemId);
  const areas = selectedItem ? compatibleAreas(selectedItem.id) : [];
  const selectedArea = areas.find(area => area.id === form.areaId);
  const shownItem = project.items.find(item => item.id === fields?.itemId && ownedItem(project, item));
  const shownArea = mapping.areas.find(area => area.id === fields?.areaId);
  const changed = form.itemId !== context.suggestion?.fields.itemId || form.areaId !== context.suggestion?.fields.areaId;
  const editable = context.eligible && Boolean(onSave);
  const editing = editable && form.editing;

  useEffect(() => { setErrors({}); setFeedback(null); }, [project.id, scope]);
  useEffect(() => {
    editingCallback.current?.(editing);
    return () => { editingCallback.current?.(false); };
  }, [editing, project.id, message.id]);
  useEffect(() => { if (feedback) feedbackRef.current?.focus(); }, [feedback]);

  function update(name: 'itemId' | 'areaId' | 'reason', value: string) {
    setForm(previous => ({ ...previous, [name]: value,
      ...(name === 'itemId' && !compatibleAreas(value).some(area => area.id === previous.areaId) ? { areaId: '' } : {}) }));
    setErrors(previous => ({ ...previous, [name]: undefined, ...(name === 'itemId' ? { areaId: undefined } : {}) }));
    setFeedback(null);
  }
  function cancel() { setForm(initial()); clearFormBuffer(project.id, scope); setErrors({}); setFeedback(null); }
  function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!editable) return;
    const next: Record<string, string | undefined> = {};
    if (!selectedItem) next.itemId = 'Choose a measured contract work item with a linked area.';
    if (!selectedArea) next.areaId = 'Choose an area linked to this work item.';
    if (changed && !form.reason.trim()) next.reason = 'Enter a short reason for the correction.';
    if (form.reason.length > 1000) next.reason = 'Keep the correction reason to 1,000 characters or fewer.';
    const first = Object.keys(next)[0];
    if (first) { setForm(previous => ({ ...previous, editing: true })); setErrors(next); queueMicrotask(() => controls.current[first]?.focus()); return; }
    const result = onSave?.(message.id, { itemId: form.itemId, areaId: form.areaId, reason: form.reason.trim() });
    if (!result || result.outcome === 'invalid') { setFeedback({ error: true, message: result?.error || 'The match could not be saved. Check the item and area, then try again.' }); return; }
    setForm({ ...form, editing: false, reason: form.reason.trim() }); clearFormBuffer(project.id, scope); setErrors({});
    setFeedback({ message: changed ? 'Match corrected. Original evidence is unchanged.' : 'Match confirmed. Add progress when ready.' });
  }

  if (!context.eligible && !context.review) return null;
  return <section className="wa-match-review" aria-label="Review match">
    <header className="wa-match-heading"><div><h3>Review match</h3><p>{source.audio ? 'Mock suggestion · check the reviewed transcript and recording above.' : 'Mock suggestion · review against the original below.'}</p></div>
      {editable && !editing && <Button className="ghost" icon={Pencil} onClick={() => setForm(previous => ({ ...previous, editing: true }))}>Edit match</Button>}
    </header>
    {feedback && <div ref={feedbackRef} tabIndex={-1} role={feedback.error ? 'alert' : 'status'} className={`wa-match-feedback${feedback.error ? ' error' : ''}`}>{feedback.message}</div>}
    {editing ? <form noValidate onSubmit={save}>
      <div className="wa-match-fields">
        <FormField label="Contract work item" required error={errors.itemId}><SelectField ref={node => { controls.current.itemId = node; }} value={form.itemId} onChange={event => update('itemId', event.target.value)}><option value="">Choose contract work</option>{choices.map(item => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}</SelectField></FormField>
        <FormField label="Site area" required error={errors.areaId}><SelectField ref={node => { controls.current.areaId = node; }} value={form.areaId} disabled={!selectedItem} onChange={event => update('areaId', event.target.value)}><option value="">Choose linked area</option>{areas.map(area => <option key={area.id} value={area.id}>Area {area.code} · {area.name}</option>)}</SelectField></FormField>
      </div>
      <p className="wa-match-completion">Reported completion: <strong>{fields?.completion ?? 'Not recorded'}{fields?.completion != null ? '%' : ''}</strong> · cumulative, unchanged</p>
      <FormField label="Correction reason" required={changed} optional={!changed} error={errors.reason} hint="Required when changing the suggested work item or area."><Textarea ref={node => { controls.current.reason = node; }} rows={2} maxLength={1000} value={form.reason} onChange={event => update('reason', event.target.value)} placeholder={source.audio ? 'e.g. The reviewed transcript refers to the east wall.' : 'e.g. Photo and message refer to the east wall.'} /></FormField>
      {!choices.length && <p className="wa-match-help">No measured work has a valid linked area. Check the contract and area mapping first.</p>}
      {context.issue && <p className="wa-match-help">{context.issue}</p>}
      <FormActions secondary={<Button onClick={cancel}>Cancel</Button>}><Button type="submit" className="primary" icon={CheckCheck} disabled={!choices.length}>Confirm match</Button></FormActions>
    </form> : <>
      <dl className="wa-match-summary"><div><dt>Contract work item</dt><dd>{context.review ? `${context.review.confirmed.itemRef || context.review.confirmed.itemId} · ${context.review.confirmed.itemDescription}` : itemLabel(shownItem)}</dd></div><div><dt>Site area</dt><dd>{context.review ? `Area ${context.review.confirmed.areaCode} · ${context.review.confirmed.areaName}` : shownArea ? `Area ${shownArea.code} · ${shownArea.name}` : 'Choose a linked area'}</dd></div><div><dt>Reported completion</dt><dd>{fields?.completion ?? 'Not recorded'}{fields?.completion != null ? '% cumulative' : ''}</dd></div></dl>
      {context.review ? <MessageMatchReviewDetails review={context.review} /> : <>
        {context.issue && <p className="wa-match-help">{context.issue}</p>}
        <FormActions><Button className="primary" icon={CheckCheck} disabled={!editable} onClick={() => save()}>Confirm match</Button></FormActions>
      </>}
    </>}
  </section>;
}
