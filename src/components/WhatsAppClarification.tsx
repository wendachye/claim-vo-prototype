import { getItemAreaAllocation, getAreaItemProgress } from '../data/area-allocations';
import type { Project, WorkItem, WhatsAppMessage, SiteReport, DrawingMapping } from '../types/domain';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, CheckCheck, MessageSquare, Save, ShieldCheck } from 'lucide-react';
import { getMessageClarification, getMessageClarificationEligibility } from '../data/whatsapp-clarification';
import { getAreaLinkStatus, getDrawingMapping } from '../data/drawing-mapping';
import { clearFormBuffer } from '../data/form-buffer';
import { useBufferedState } from './useFormBuffer';
import { BackButton, Button, FormActions, FormField, Input, SelectField, Textarea, formatTime } from './ui';
import './whatsapp-clarification.css';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const knownCompletion = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const measured = (item?: WorkItem | null) => item?.pricingType === 'measured';
const emptyReply = () => ({ text: '', itemId: '', areaId: '', area: '', completion: '' });
const dateLabel = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? formatTime(value) : '';

export interface ClarificationResult { outcome: string; error?: string }
export interface ClarificationRequestFields { question: string }
export interface ClarificationReplyFields { text: string; itemId: string; areaId: string; area: string; completion: number }
export interface WhatsAppClarificationProps { project: Project; message: WhatsAppMessage; onSaveRequest?: (messageId: string, fields: ClarificationRequestFields) => ClarificationResult | undefined; onSaveReply?: (messageId: string, fields: ClarificationReplyFields) => ClarificationResult | undefined; onProcess?: (message: WhatsAppMessage) => void; onReview?: (report: SiteReport) => void; onOpenCompletion?: (itemId?: string | null) => void; onSelectMessage?: (messageId: string) => void }

export function WhatsAppClarification({ project, message, onSaveRequest, onSaveReply, onProcess, onReview, onOpenCompletion, onSelectMessage }: WhatsAppClarificationProps) {
  const context = getMessageClarification(project, message.id);
  const eligibility = getMessageClarificationEligibility(project, message.id);
  const original = context?.original || message;
  const originalId = context?.sourceMessageId || original.id;
  const requestScope = `whatsapp-clarification:${JSON.stringify([originalId, 'request'])}`;
  const replyScope = `whatsapp-clarification:${JSON.stringify([originalId, 'reply'])}`;
  const ambiguousArea = getAreaLinkStatus(project, original).ambiguous;
  const questionDefault = () => ({ question: ambiguousArea ? `The area name “${original.area}” matches more than one area. Please confirm the area code, contract work item and total percentage completed so far.` : 'Please confirm the contract work item, site area and total percentage completed so far.' });
  const [question, setQuestion] = useBufferedState(project.id, requestScope, questionDefault);
  const [fields, setFields] = useBufferedState(project.id, replyScope, emptyReply);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [feedback, setFeedback] = useState<{ error?: boolean; message: string } | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const controls = useRef<Record<string, HTMLElement | null>>({});
  const mapping: DrawingMapping = getDrawingMapping(project);
  const items = (project.items || []).filter((item) => measured(item)
    && (!item.projectId || item.projectId === project.id)
    && (!item.projectCode || item.projectCode === project.code));
  const choices = mapping.areas.length ? items.filter((item) => mapping.areas.some((area) => area.workItemIds.includes(item.id))) : items;
  const selectedItem = choices.find((item) => item.id === fields.itemId);
  const areas = mapping.areas.filter((area) => area.workItemIds.includes(fields.itemId));
  const request = context?.request;
  const reply = context?.reply;
  const report = context?.report;
  const stage = context?.stage;
  const selectedReply = reply?.id === message.id;
  const stageIndex = !request ? 0 : !reply ? 1 : 2;
  const done = stage === 'verified';

  useEffect(() => { setErrors({}); setFeedback(null); }, [project.id, originalId]);
  useEffect(() => { if (report || stage === 'superseded') setFeedback(null); }, [stage, report?.id]);
  useEffect(() => { if (feedback) feedbackRef.current?.focus(); }, [feedback]);

  function update(name: keyof ReturnType<typeof emptyReply>, value: string) {
    setFields((prior) => ({ ...prior, [name]: value, ...(name === 'itemId' ? { areaId: '', area: '' } : {}) }));
    setErrors((prior) => ({ ...prior, [name]: undefined, ...(['itemId', 'areaId'].includes(name) ? { area: undefined } : {}) }));
    setFeedback(null);
  }
  function invalidFields(next: Record<string, string | undefined>) {
    setErrors(next);
    const first = Object.keys(next)[0];
    controls.current[first]?.focus();
    return Boolean(first);
  }
  function saveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidFields(text(question.question) ? {} : { question: 'Enter a question for the worker.' })) return;
    const result = onSaveRequest?.(originalId, { question: text(question.question) });
    if (!result || result.outcome === 'invalid') return setFeedback({ error: true, message: result?.error || 'The request could not be saved. Check the message and try again.' });
    setQuestion(questionDefault()); clearFormBuffer(project.id, requestScope);
    setErrors({}); setFeedback({ message: 'Request saved. Add a mock worker reply below.' });
  }
  function saveReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string | undefined> = {};
    if (!selectedItem) next.itemId = 'Choose a measured contract work item.';
    if (mapping.areas.length ? !areas.some((area) => area.id === fields.areaId) : !text(fields.area)) next.area = mapping.areas.length ? 'Choose an area linked to this work item.' : 'Enter the site area.';
    if (String(fields.completion).trim() === '' || !knownCompletion(Number(fields.completion))) next.completion = 'Enter the total completed so far, from 0 to 100.';
    if (!text(fields.text)) next.text = 'Enter the worker’s clarified reply.';
    if (invalidFields(next)) return;
    const result = onSaveReply?.(originalId, { text: text(fields.text), itemId: fields.itemId,
      areaId: mapping.areas.length ? fields.areaId : '', area: mapping.areas.length ? '' : text(fields.area), completion: Number(fields.completion) });
    if (!result || result.outcome === 'invalid') return setFeedback({ error: true, message: result?.error || 'The reply could not be saved. Check its item, area and completion.' });
    setFields(emptyReply()); clearFormBuffer(project.id, replyScope);
    setErrors({}); setFeedback({ message: 'Mock reply saved. Review it before adding the progress update.' });
  }
  function fillDemoReply() {
    const link = getAreaLinkStatus(project, original);
    const item = choices.find((entry) => entry.id === original.itemId)
      || choices.find((entry) => link.linkedItems?.some((linked: WorkItem) => linked.id === entry.id))
      || choices.find((entry) => text(original.location) && text(entry.location) === text(original.location)) || choices[0];
    if (!item) return;
    const allocation=getItemAreaAllocation(project,item.id);
    const linked = mapping.areas.filter((area) => area.workItemIds.includes(item.id) && (!allocation.split || allocation.areas.some(entry=>entry.areaId===area.id)));
    const area = link.ambiguous ? null : linked.find((entry) => entry.id === link.area?.id) || linked[0];
    const namedArea = area ? `Area ${area.code}` : text(original.area) || text(item.demoArea) || text(item.location) || 'Demo work area';
    const totals = allocation.split ? [area ? getAreaItemProgress(project,area.id,item.id,'reported').completion : null,area ? getAreaItemProgress(project,area.id,item.id,'verified').completion : null].filter(knownCompletion) : [item.reported, item.verified, original.completion,
      ...(project.reports || []).filter((entry) => entry.itemId === item.id && !entry.vo
        && (!entry.projectId || entry.projectId === project.id) && (!entry.projectCode || entry.projectCode === project.code)
        && !['rejected', 'superseded'].includes(entry.status)).map((entry) => entry.completion)].filter(knownCompletion);
    const completion = link.ambiguous && knownCompletion(original.completion) ? original.completion : Math.min(100, Math.max(0, ...totals) + 10);
    setFields({ itemId: item.id, areaId: area?.id || '', area: area ? '' : namedArea, completion: String(completion),
      text: link.ambiguous ? '' : `Confirmed: ${item.ref || item.id} — ${item.description}. ${namedArea} is ${completion}% complete in total to date. This is cumulative progress, not an additional percentage. Simulated worker reply for this demo.` });
    setErrors({}); setFeedback(link.ambiguous ? { message: 'Choose the area confirmed by the worker and enter the reply. No area was selected automatically.' } : null);
  }

  if (!context && !eligibility.eligible) return null;
  const replyItem = reply && project.items.find((item) => item.id === reply.itemId);
  const canAddReply = stage === 'reply-received' && reply?.status === 'new' && !report;
  const newerReply = stage === 'superseded' && !report;
  const voReview = stage === 'vo-review';
  const nextTitle = voReview ? 'Continue in extra-work review' : newerReply ? 'A newer update replaced this reply'
    : canAddReply ? 'Reply ready for review' : stage === 'rejected' ? 'Clarified update dismissed'
      : stage === 'superseded' ? 'A newer update replaced this report' : stage === 'clarification' ? 'This reply still needs clarification'
        : report ? 'Ready for supervisor verification' : 'Review this saved reply in site progress';
  const nextHelp = voReview ? 'Continue with the QS to review the scope, value and approval.'
    : newerReply ? 'Review the latest progress report. This earlier reply remains saved.'
      : canAddReply ? 'Adding this reply updates reported completion. Supervisor verification is still required.'
        : !report ? reply?.processingNote || 'Open site progress to review the saved update.'
          : report.reviewReason || (stage === 'rejected' || stage === 'superseded' ? 'Open the saved review for the recorded decision.' : 'Review the reply and photo before confirming progress.');

  return <section className="wa-clarification" aria-label="Clarification">
    {selectedReply && <BackButton onClick={() => onSelectMessage?.(originalId)}>Back to original message</BackButton>}
    <header className="wa-clarification-heading"><MessageSquare size={17} aria-hidden="true" /><div><h3>{!request ? 'Ask for missing details' : !reply ? 'Record a worker reply' : done ? 'Clarification complete' : 'Review the clarified update'}</h3><p>Demo conversation · nothing is sent to WhatsApp.</p></div></header>
    <ol className="wa-clarification-steps" aria-label="Clarification stages">{['Request', 'Reply', voReview ? 'Extra work' : 'Verify'].map((label, index) => <li key={label} className={index < stageIndex || done ? 'complete' : index === stageIndex ? 'current' : ''} aria-current={!done && index === stageIndex ? 'step' : undefined}><i aria-hidden="true">{index < stageIndex || done ? <Check size={11} /> : index + 1}</i>{label}</li>)}</ol>
    {feedback && <div ref={feedbackRef} tabIndex={-1} className={`wa-clarification-feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</div>}
    {!request ? <form noValidate onSubmit={saveRequest}>
      <FormField label="Clarification question" required error={errors.question} hint="Ask for the missing details before changing progress."><Textarea ref={(node) => { controls.current.question = node; }} rows={3} value={question.question} onChange={(event) => { setQuestion({ question: event.target.value }); setErrors({}); setFeedback(null); }} /></FormField>
      <FormActions><Button type="submit" className="primary" icon={Save} disabled={!onSaveRequest}>Save clarification request</Button></FormActions>
    </form> : <>
      <details className="wa-clarification-record wa-clarification-question" key={`${originalId}:question`}><summary><strong>Saved question</strong><time>{dateLabel(request.date)}</time></summary><p>{request.question}</p></details>
      {!reply ? <form noValidate onSubmit={saveReply}>
        <div className="wa-clarification-reply-heading"><span>Confirm the work and total completed.</span><Button className="ghost" disabled={!choices.length} onClick={fillDemoReply}>Use demo reply</Button></div>
        <div className="wa-clarification-fields">
          <FormField className="wa-clarification-wide" label="Contract work item" required error={errors.itemId}><SelectField ref={(node) => { controls.current.itemId = node; }} value={fields.itemId} onChange={(event) => update('itemId', event.target.value)}><option value="">Choose contract work</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.ref || item.id} · {item.description}</option>)}</SelectField></FormField>
          <FormField label="Site area" required error={errors.area}>{mapping.areas.length ? <SelectField ref={(node) => { controls.current.area = node; }} value={fields.areaId} disabled={!selectedItem} onChange={(event) => update('areaId', event.target.value)}><option value="">Choose linked area</option>{areas.map((area) => <option key={area.id} value={area.id}>Area {area.code} · {area.name}</option>)}</SelectField> : <Input ref={(node) => { controls.current.area = node; }} value={fields.area} onChange={(event) => update('area', event.target.value)} placeholder="e.g. Block W3, east side" />}</FormField>
          <FormField label="Total completion (%)" required error={errors.completion} hint="Total to date, not an extra percentage."><Input ref={(node) => { controls.current.completion = node; }} type="number" min="0" max="100" step="any" inputMode="decimal" value={fields.completion} onChange={(event) => update('completion', event.target.value)} /></FormField>
          <FormField className="wa-clarification-wide" label="Worker reply" required error={errors.text}><Textarea ref={(node) => { controls.current.text = node; }} rows={3} value={fields.text} onChange={(event) => update('text', event.target.value)} placeholder="Clarify the work, location and total completion…" /></FormField>
        </div>
        {!choices.length && <p className="wa-clarification-help">No measured work has a compatible area. Check the contract and area mapping first.</p>}
        <FormActions><Button type="submit" className="primary" icon={Save} disabled={!onSaveReply || !choices.length}>Save mock reply</Button></FormActions>
      </form> : <>
        <details className="wa-clarification-record wa-clarification-saved-reply" key={`${originalId}:reply:${canAddReply}`} open={canAddReply || undefined}><summary><strong>Saved worker reply</strong><span>{replyItem?.ref || 'Contract work'} · {reply.completion}% total</span></summary><div className="wa-clarification-reply-meta"><span>{reply.area || reply.location}</span><time>{dateLabel(reply.date)}</time></div><p>{reply.text}</p><small>{reply.photo ? 'Original photo retained; this mock reply has no new photo.' : 'No photo is attached to this mock reply.'}</small></details>
        <div className={`wa-clarification-next${done ? ' complete' : ''}`}>
          {done ? <><CheckCheck size={19} /><div><strong>Clarified progress verified</strong><p>The original message and linked reply remain saved.</p></div></> : <div><strong>{nextTitle}</strong><p>{nextHelp}</p></div>}
        </div>
        {!done && <FormActions>{canAddReply ? <Button className="primary" icon={ArrowRight} disabled={!onProcess} onClick={() => onProcess?.(reply)}>Add clarified progress update</Button>
          : newerReply && context?.latestReport ? <Button className="primary" icon={ArrowRight} disabled={!onReview} onClick={() => context?.latestReport && onReview?.(context.latestReport)}>Review latest progress</Button>
            : !report ? <Button icon={ArrowRight} disabled={!onOpenCompletion} onClick={() => onOpenCompletion?.(reply.itemId)}>View site progress</Button>
              : <Button className="primary" icon={ShieldCheck} disabled={!onReview} onClick={() => onReview?.(report)}>{voReview ? 'Review extra work' : stage === 'verification' ? 'Verify clarified progress' : 'Review clarified update'}</Button>}</FormActions>}
      </>}
    </>}
  </section>;
}
