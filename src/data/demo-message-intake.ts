import type { DateInput, DrawingArea, Project, WhatsAppMessage, WorkItem } from '../types/domain';
import { getAreaMatchForMessage, getDrawingMapping } from './drawing-mapping.ts';
import { getAreaAllocationSnapshot, getItemAreaAllocation } from './area-allocations.ts';
import { getMessageMatchContext } from './message-match.ts';
import { parseDailyKPIMessage } from './daily-kpi-message.ts';
import type { DailyKPIMessage } from '../types/daily-kpi';

/** A bounded, deterministic demonstration of message intake; no service or AI is called. */
export interface DemoMessageInput { projectId: string; text: string; photoId: string; submissionId: string; previewKey?: string }
export interface DemoMessagePhoto { id: string; label: string; photo: string; photoAlt: string }
export const DEMO_MESSAGE_PHOTOS: ReadonlyArray<Readonly<DemoMessagePhoto>> = Object.freeze([
  { id: 'scaffold', label: 'Scaffold progress', photo: '/assets/demo-w3-st31-progress.jpg',
    photoAlt: 'Generated demo illustration of scaffold progress; not project evidence.' },
  { id: 'platform', label: 'Access platform', photo: '/assets/demo-platform.jpg',
    photoAlt: 'Generated demo illustration of an access platform; not project evidence.' },
  { id: 'column', label: 'Column access scaffold', photo: '/assets/demo-column-scaffold.jpg',
    photoAlt: 'Generated demo illustration of column access scaffold; not project evidence.' },
].map(entry => Object.freeze(entry)));
export interface DemoMessagePreview {
  canSave: boolean; status: 'ready' | 'clarification' | 'invalid'; error?: string; issues: string[]; sourceKey: string;
  projectCode: string; item: WorkItem | null; area: DrawingArea | null; areaText: string; location: string;
  completion: number | null; text: string; photo: DemoMessagePhoto | null; dailyKPI: DailyKPIMessage | null;
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const clone = <T>(value: T): T => structuredClone(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const allowed = new Set(['projectId', 'text', 'photoId', 'submissionId', 'previewKey']);
const local = (project: Project, item: WorkItem) => (!item.projectId || item.projectId === project.id) && (!item.projectCode || item.projectCode === project.code);
const areaName = (value: string) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().replace(/^area\s+/i, '').toLocaleLowerCase('en');
function noteAreaIds(project: Project, note: string): string[] {
  const source = areaName(note), mentions: { id: string; start: number; end: number }[] = [];
  for (const area of getDrawingMapping(project).areas) {
    for (const value of [area.code, ...(area.aliases || [])]) {
      const name = areaName(value);
      if (!name) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_-])(${escaped})(?=$|[^\\p{L}\\p{N}_-])`, 'gu');
      for (const match of source.matchAll(pattern)) {
        const start = match.index + match[1].length;
        mentions.push({ id: area.id, start, end: start + match[2].length });
      }
    }
  }
  // “Bracket zone” is a shared prefix of the longer, specific “Bracket zone A”.
  return [...new Set(mentions.filter(mention => !mentions.some(other => other.start <= mention.start && other.end >= mention.end
    && other.end - other.start > mention.end - mention.start)).map(mention => mention.id))];
}
const dateFor = (now: DateInput) => {
  if (typeof now === 'string' ? !now.trim() : typeof now === 'number' ? !Number.isFinite(now) : !(now instanceof Date)) return null;
  try { const date = new Date(now); return Number.isFinite(date.getTime()) ? date.toISOString() : null; } catch { return null; }
};
const keyFor = (project: Project, input: DemoMessageInput, preview: DemoMessagePreview) => {
  const mapping = getDrawingMapping(project);
  return JSON.stringify({ version: 1,
  input: { projectId: input.projectId, text: input.text, photoId: input.photoId, submissionId: input.submissionId },
  project: { id: project.id, code: project.code, version: project.version, locked: project.locked,
    items: project.items.map(({ id, ref, description, pricingType, quantity, location, projectId, projectCode }) =>
      ({ id, ref, description, pricingType, quantity, location, projectId, projectCode })),
    drawing: mapping.drawing, areas: mapping.areas },
  interpretation: { status: preview.status, issues: preview.issues, itemId: preview.item?.id || null, areaId: preview.area?.id || null,
    ...(preview.dailyKPI ? { dailyKPI: preview.dailyKPI } : {}) } });
};

function validProject(project: Project) {
  return record(project) && Boolean(text(project.id)) && Boolean(text(project.code))
    && Number.isSafeInteger(project.version) && project.version > 0 && Array.isArray(project.items)
    && project.items.every(item => record(item) && text(item.id) && local(project, item))
    && new Set(project.items.map(item => item.id)).size === project.items.length
    && Array.isArray(project.history) && project.history.every(record) && Array.isArray(project.reports) && project.reports.every(record)
    && Array.isArray(project.whatsappMessages) && project.whatsappMessages.every(message => record(message) && text(message.id)
      && message.projectId === project.id && message.projectCode === project.code)
    && new Set(project.whatsappMessages.map(message => message.id)).size === project.whatsappMessages.length;
}

function inputError(project: Project, values: unknown): string | null {
  if (!validProject(project)) return 'Choose a valid project with a saved contract and inbox before adding a demo message.';
  if (!record(values) || Object.keys(values).some(key => !allowed.has(key))) return 'Use the demo message fields only.';
  if (values.projectId !== project.id) return 'Add the message to the selected project only.';
  if (typeof values.submissionId !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(values.submissionId)) return 'Reopen the demo message form before saving.';
  if (typeof values.text !== 'string' || !values.text.trim() || values.text.length > 4000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(values.text)) return 'Enter formatted message text in up to 4,000 characters.';
  if (typeof values.photoId !== 'string' || values.photoId && !DEMO_MESSAGE_PHOTOS.some(photo => photo.id === values.photoId)) return 'Choose a bundled demo photo or leave the photo blank.';
  if (values.previewKey !== undefined && typeof values.previewKey !== 'string') return 'Preview the message again before saving.';
  return null;
}

/** Uses a compatible saved measured item/area; it never creates mapping or progress. */
export function getDemoMessageSample(project: Project): string {
  const areas = getDrawingMapping(project).areas;
  for (const item of [...(Array.isArray(project?.items) ? project.items : [])].reverse()) {
    if (!item || item.pricingType !== 'measured' || !local(project, item)) continue;
    const area = areas.find(entry => entry.workItemIds.includes(item.id));
    const allocation = getItemAreaAllocation(project, item.id);
    if (!area || !allocation.valid || allocation.split && !getAreaAllocationSnapshot(project, area.id, item.id)) continue;
    return `${project.code} | ${item.location || 'Site location'} | ${area.code} | ${item.id}\nCOMPLETE=50% TOTAL\nSimulated site update.`;
  }
  const item = (Array.isArray(project?.items) ? project.items : []).find(entry => entry?.pricingType === 'measured');
  return `${project?.code || 'PROJECT'} | ${item?.location || 'Site location'} | AREA-CODE | ${item?.id || 'WI-001'}\nCOMPLETE=50% TOTAL\nSimulated site update.`;
}

/** Fictional daily activity log; dimensions and manpower are not cumulative progress. */
export function getDailyKPIMessageSample(project: Project): string {
  const location = project.items.find(item => item.pricingType === 'measured' && local(project, item))?.location || 'Site A';
  return `Date:-27/10/26\nProject: ${project.code}\nLocation: ${location}\nKPI\nTeam:-15\n3man\n\nErection:-\nLevel6:-\n14 x 4.5 x 4 T\n\n1man support platform remove modification work\nMaterials lower down\nHrs:8:00 to 19:00hrs\n\nAfternoon no materials lower down due to crane breakdown.\nSimulated daily KPI example.`;
}

/** Preview is pure. Exact codes/alternate names resolve; unclear meanings are never guessed. */
export function previewDemoMessage(project: Project, values: unknown): DemoMessagePreview {
  const preview: DemoMessagePreview = { canSave: false, status: 'invalid', issues: [], sourceKey: '', projectCode: text(project?.code),
    item: null, area: null, areaText: '', location: '', completion: null,
    text: record(values) && typeof values.text === 'string' ? values.text : '', photo: null, dailyKPI: null };
  const invalid = (error: string) => ({ ...preview, error });
  const error = inputError(project, values);
  if (error) return invalid(error);
  const input = values as DemoMessageInput;
  preview.photo = input.photoId ? clone(DEMO_MESSAGE_PHOTOS.find(photo => photo.id === input.photoId)!) : null;
  // The separator before COMPLETE may be a fifth pipe or a new line, matching the original worker format.
  const parts = input.text.match(/^\s*([^\r\n]+?)(?:[ \t]*\|[ \t]*|[ \t]*\r?\n[ \t]*)(COMPLETE[\s\S]*)$/i);
  const fields = parts?.[1].split('|').map(value => value.trim());
  if (!parts || !fields || fields.length !== 4 || fields.some(field => !field)) {
    // Keep malformed cumulative input on its validation path. A daily date in a
    // trailing note must not turn a foreign header or invalid percentage into a save.
    if (!input.text.includes('|') && !/\bCOMPLETE\s*=/i.test(input.text)) {
      const daily = parseDailyKPIMessage(input.text);
      if (daily) {
        const explicitProjects = [...input.text.matchAll(/^[ \t]*project(?:[ \t]+code)?[ \t]*[:=-]+[ \t]*([^\r\n]+)[ \t]*$/gim)];
        if (explicitProjects.some(match => match[1].trim().toUpperCase() !== project.code.toUpperCase())) return invalid('The message project code must match the selected project.');
        preview.dailyKPI = daily;
        preview.location = daily.locations.join(' · ');
        preview.areaText = daily.locations[0] || '';
        preview.issues = [...daily.issues,
          'Confirm the measured contract item, compatible site area and cumulative completion (0–100%). Daily activity, manpower, dimensions and working hours do not establish progress.'];
        preview.status = 'clarification'; preview.canSave = true;
        preview.sourceKey = keyFor(project, input, preview);
        return preview;
      }
    }
    return invalid('Use a daily KPI update with a date, location or team and work details, or Project | Location | Area | Work item followed by COMPLETE=50% TOTAL.');
  }
  if (fields[0].toUpperCase() !== project.code.toUpperCase()) return invalid('The message project code must match the selected project.');
  if (fields[1].length > 180 || fields[2].length > 120 || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(fields[3])) return invalid('Use one location, one area and one work-item ID in the formatted fields.');
  const completion = parts[2].match(/^COMPLETE[ \t]*=[ \t]*([+-]?(?:\d+(?:\.\d+)?|\.\d+))[ \t]*%[ \t]*([^|\r\n]*?)[ \t]*(?:(?:\|[ \t]*|\r?\n)([\s\S]*))?$/i);
  if (!completion || completion[1].startsWith('-') || !Number.isFinite(Number(completion[1])) || Number(completion[1]) < 0 || Number(completion[1]) > 100) return invalid('Enter a completion percentage from 0 to 100, for example COMPLETE=50% TOTAL.');
  preview.location = fields[1]; preview.areaText = fields[2]; preview.completion = Number(completion[1]);
  const itemMatches = project.items.filter(item => item.id.toUpperCase() === fields[3].toUpperCase());
  preview.item = itemMatches.length === 1 ? clone(itemMatches[0]) : null;
  if (preview.item && preview.item.pricingType !== 'measured') return invalid('Included and rate-only items cannot use percentage completion. Choose a measured work item.');
  if (!preview.item) preview.issues.push(`Work item ${fields[3]} is not in this project. Ask the worker to confirm a contract item.`);
  const areaMatch = getAreaMatchForMessage(project, { projectId: project.id, projectCode: project.code, area: preview.areaText });
  preview.area = areaMatch.area ? clone(areaMatch.area) : null;
  if (areaMatch.blocked) preview.issues.push('The saved area names need review. Ask for clarification before updating progress.');
  else if (areaMatch.status === 'ambiguous') preview.issues.push(`The area name matches ${areaMatch.candidates.map(area => area.code).join(' and ')}. Ask which area.`);
  else if (!preview.area) preview.issues.push(`Area ${preview.areaText} is not a saved code or alternate name. Ask the worker to confirm an area.`);
  if (preview.item && preview.area && !preview.area.workItemIds.includes(preview.item.id)) preview.issues.push('The area is not linked to this contract item. Confirm the item and area before processing.');
  if (completion[2].trim().toUpperCase() !== 'TOTAL' || completion[1].startsWith('+')) preview.issues.push('Confirm the cumulative total. An incremental or unspecified percentage cannot update progress.');
  if (/\b(?:VO|extra\s+work|additional\s+work|variation|incremental)\b/i.test(completion[3] || '')) preview.issues.push('The note describes extra or incremental work. Clarify the scope; record extra work through VO review.');
  if (preview.area && noteAreaIds(project, completion[3] || '').some(id => id !== preview.area!.id)) preview.issues.push('The note names a different or shared area. Ask the worker to confirm one area before updating progress.');
  if (preview.item && preview.area) {
    const allocation = getItemAreaAllocation(project, preview.item.id);
    if (!allocation.valid || allocation.split && !getAreaAllocationSnapshot(project, preview.area.id, preview.item.id)) preview.issues.push('Review this item’s saved area quantity allocation before adding progress.');
  }
  // The note is evidence too: a second item/code, conflicting percentage or extra work cannot bypass clarification.
  if (!preview.issues.length && preview.item && preview.area) {
    const candidate = messageFor(project, input, { ...preview, status: 'ready' }, '2000-01-01T00:00:00.000Z');
    const context = getMessageMatchContext({ ...project, whatsappMessages: [...project.whatsappMessages, candidate] }, candidate.id);
    if (!context.eligible || context.clarificationRequired) preview.issues.push(context.issue || 'The message needs clarification before adding progress.');
  }
  preview.status = preview.issues.length ? 'clarification' : 'ready';
  preview.canSave = true; preview.sourceKey = keyFor(project, input, preview);
  return preview;
}

function messageFor(project: Project, input: DemoMessageInput, preview: DemoMessagePreview, date: string): WhatsAppMessage {
  const ready = Boolean(preview.status === 'ready' && preview.item && preview.area);
  return { id: `DEMO-MESSAGE-${project.id}-${input.submissionId}`, projectId: project.id, projectCode: project.code,
    kind: ready ? 'progress' : 'clarification', status: ready ? 'new' : 'clarification', text: input.text,
    sender: 'Demo worker', senderRole: 'Site worker · demo', date, receivedAt: date,
    itemId: preview.item?.id || null, area: preview.areaText, location: preview.location,
    completion: preview.completion, completionBasis: ready ? 'cumulative' : 'unclear',
    photo: preview.photo?.photo || null, photoAlt: preview.photo?.photoAlt || null,
    demo: true, origin: 'simulated', channel: 'whatsapp-intake-mock',
    processingNote: ready ? 'Formatted demo message. Confirm its match before explicitly adding progress; supervisor verification stays separate.'
      : preview.issues.join(' '),
    ...(ready ? { matchSuggestion: { version: 1, origin: 'mock', baselineVersion: project.version,
      fields: { itemId: preview.item!.id, areaId: preview.area!.id, completion: preview.completion! }, sourceExcerpt: input.text,
      reason: 'Deterministic demo suggestion from the formatted item ID, saved area code or alternate name and explicit cumulative total.' } } : {}),
    demoIntake: { version: 1, submissionId: input.submissionId, input: { projectId: input.projectId, text: input.text, photoId: input.photoId },
      previewKey: preview.sourceKey, receivedAt: date, status: ready ? 'ready' : 'clarification', issues: clone(preview.issues) },
  };
}

export function saveDemoMessage(project: Project, values: unknown, now: DateInput = new Date()): { project: Project; outcome: 'updated' | 'duplicate' | 'invalid'; messageId?: string; error?: string } {
  const invalid = (error: string) => ({ project, outcome: 'invalid' as const, error });
  const inputIssue = inputError(project, values);
  if (inputIssue) return invalid(inputIssue);
  const input = values as DemoMessageInput;
  const prior = project.whatsappMessages.filter(message => message.demoIntake?.submissionId === input.submissionId);
  if (prior.length) {
    const message = prior[0], saved = message.demoIntake;
    const photo = DEMO_MESSAGE_PHOTOS.find(entry => entry.id === input.photoId);
    if (prior.length !== 1 || !saved || saved.version !== 1 || message.channel !== 'whatsapp-intake-mock'
      || message.id !== `DEMO-MESSAGE-${project.id}-${input.submissionId}` || message.demo !== true || message.origin !== 'simulated'
      || message.sender !== 'Demo worker' || message.date !== saved.receivedAt || message.receivedAt !== saved.receivedAt || !dateFor(saved.receivedAt)
      || !saved.previewKey || !['ready', 'clarification'].includes(saved.status) || !Array.isArray(saved.issues) || !saved.issues.every(issue => typeof issue === 'string')
      || !same(saved.input, { projectId: input.projectId, text: input.text, photoId: input.photoId }) || message.text !== input.text
      || (message.photo ?? null) !== (photo?.photo || null) || (message.photoAlt ?? null) !== (photo?.photoAlt || null)) return invalid('This entry was already saved. Open the original message instead of replacing its evidence.');
    return { project, outcome: 'duplicate', messageId: message.id };
  }
  const preview = previewDemoMessage(project, input);
  if (!preview.canSave) return invalid(preview.error || 'Review the formatted message before saving.');
  if (!input.previewKey || input.previewKey !== preview.sourceKey) return invalid('The message or project context changed. Preview again before saving.');
  const date = dateFor(now);
  if (!date) return invalid('Use a valid received date for the demo message.');
  const message = messageFor(project, input, preview, date), historyId = `${message.id}-RECEIVED`;
  if (project.whatsappMessages.some(entry => entry.id === message.id) || project.reports.some(entry => entry.id === `WA-REPORT-${message.id}` || entry.sourceMessageId === message.id)
    || project.history.some(entry => entry.id === historyId)) return invalid('This message reference is already in use. Reopen the demo message form.');
  return { outcome: 'updated', messageId: message.id, project: { ...project,
    whatsappMessages: [...project.whatsappMessages, message],
    history: [{ id: historyId, action: 'Demo message received', date, actor: 'Demo worker',
      detail: `${message.id} · ${preview.status === 'ready' ? 'Ready for match review' : 'Needs worker clarification'}` }, ...project.history] } };
}
