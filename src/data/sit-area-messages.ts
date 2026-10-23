import type { Project, WorkItem, WhatsAppMessage, DrawingArea, DateInput } from "../types/domain";
interface MessageSpecification { areaCode: string; kind: string; completion?: number; photo: string; query?: string }
interface MessageSkip { areaCode: string; reason: string }
interface MessageDates { now: string; at: (index: number) => string }
export interface SITMessagePreview { available: boolean; messages: WhatsAppMessage[]; messageCount: number; firstMessageId: string | null; skipped: MessageSkip[]; reason: string | null }
// Unprocessed sample inbox entries for the newly named S.I.T. contract areas.
// Adding examples never processes a report or changes a physical/financial total.
import { initialItems } from './sit-contract-source.ts';
import { getDrawingMapping } from './drawing-mapping.ts';
import { getSITAreaDefinitions } from './sit-area-definitions.ts';
import { getSITAreaUpdate } from './sit-area-update.ts';
import { getSITDemoPhoto } from './sit-demo-photos.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const clone = <T,>(value: T): T => structuredClone(value);
const sampleSet = 'sit-mapped-areas-v1';
const sourceById = new Map(initialItems.map((item) => [item.id, item]));
const scopeFields = ['ref', 'description', 'location', 'subsection', 'pricingType'];
const photoAlt = 'Generated construction illustration used as a demo site photo; not project evidence.';
const inProject = (project: Project, entry: unknown) => record(entry)
  && (entry.projectId == null || entry.projectId === '' || entry.projectId === project.id)
  && (entry.projectCode == null || entry.projectCode === ''
    || text(entry.projectCode).toUpperCase() === text(project.code).toUpperCase());
const scopeMatches = (project: Project, item: WorkItem | undefined) => {
  const source = sourceById.get(item?.id || '');
  return Boolean(source && item && inProject(project, item) && scopeFields.every((field) => source[field] === item[field]));
};
const unavailable = (reason: string | null): SITMessagePreview => ({ available: false, messages: [], messageCount: 0, firstMessageId: null, skipped: [], reason });

const specifications: MessageSpecification[] = [
  { areaCode: 'W3-ST36', kind: 'progress', completion: 40, photo: '/assets/demo-scaffold.jpg' },
  { areaCode: 'W5-NORTH', kind: 'progress', completion: 25, photo: '/assets/demo-scaffold.jpg' },
  { areaCode: 'W5-ESCALATOR', kind: 'progress', completion: 60, photo: '/assets/demo-escalator-access.jpg' },
  { areaCode: 'W3-COLUMNS', kind: 'progress', completion: 35, photo: '/assets/demo-scaffold.jpg' },
  { areaCode: 'W3-AMPH-A', kind: 'progress', completion: 50, photo: '/assets/demo-platform.jpg' },
  { areaCode: 'W5-AMPH-AB', kind: 'progress', completion: 30, photo: '/assets/demo-platform.jpg' },
  { areaCode: 'W3-LIFT-CORES', kind: 'progress', completion: 20, photo: '/assets/demo-lift-core.jpg' },
  { areaCode: 'W3-TEMP-ACCESS', kind: 'clarification', photo: '/assets/demo-temporary-stair.jpg' },
  { areaCode: 'W5-ESCALATOR', kind: 'vo', photo: '/assets/demo-escalator-access.jpg',
    query: 'A supervisor requested another access platform beyond the listed escalator opening work. The exact extent and written instruction are not confirmed. Please check whether this is included scope or possible extra work.' },
  { areaCode: 'W3-COLUMNS', kind: 'vo', photo: '/assets/demo-scaffold.jpg',
    query: 'A supervisor requested scaffold access to another column outside the four listed column references. The additional column ID and written instruction are not confirmed. Please check the contract scope before treating this as extra work.' },
];

function calendar(now: DateInput): MessageDates | null {
  let time: number = NaN;
  try { time = new Date(now).getTime(); } catch { /* Invalid inputs return an unavailable preview. */ }
  if (!Number.isFinite(time)) return null;
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).formatToParts(time);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)!.value;
  const monthStart = Date.parse(`${part('year')}-${part('month')}-01T00:00:00+08:00`);
  return { now: new Date(time).toISOString(), at: (index: number) => new Date(Math.max(monthStart, time - (20 - index * 2) * 60_000)).toISOString() };
}

function messageFor(project: Project, specification: MessageSpecification, area: DrawingArea, item: WorkItem, index: number, dates: MessageDates): WhatsAppMessage {
  const isVo = specification.kind === 'vo';
  const isProgress = specification.kind === 'progress';
  const suffix = isVo ? 'VO-QUERY' : isProgress ? 'PROGRESS' : 'SCOPE-CHECK';
  const context = `${isVo ? 'CONTRACT CONTEXT' : 'CONTRACT'}=${item.ref} | ${item.description}\nSCOPE=${item.subsection}`;
  const header = `${project.code} | ${item.location} | Area ${area.code}${isVo ? '' : ` | ${item.id}`}`;
  const decking = area.workItemIds.includes('WI-012') ? sourceById.get('WI-012') : null;
  const body = isProgress ? [
    `COMPLETE=${specification.completion}% TOTAL`,
    'Reported cumulative physical progress for this whole contract work item. Supervisor verification is still required.',
    ...(decking ? [`RELATED INCLUDED SCOPE=${decking.ref} | ${decking.description}`,
      'The percentage above refers to the B.1 platform item only. Included decking remains one shared W3/W5 scope; no decking percentage, quantity split or separate charge is inferred from this update.'] : []),
  ].join('\n') : isVo ? [specification.query,
    'The source row is context only. Scope, instruction, variation entitlement and price require QS review; no contract item is automatically matched and no value is proposed.',
  ].join('\n') : [
    'TEMPORARY ACCESS: 2 of the 4 ladder-stair sets are reported installed. Their individual positions and inspected status need supervisor confirmation.',
    'This is included D.2 scope. No percentage, additional quantity or separate charge is inferred from the count or photo. Ask the supervisor to confirm the physical status before changing progress.',
  ].join('\n');
  const message = {
    id: `${project.id}-SIT-AREA-${area.code}-${suffix}`, projectId: project.id, projectCode: project.code,
    kind: specification.kind, status: 'new', sender: 'S.I.T. area worker (demo)', senderRole: 'Site worker · demo',
    date: dates.at(index), itemId: isVo ? null : item.id, area: `Area ${area.code}`, location: item.location,
    completion: isProgress ? specification.completion : null, completionBasis: isProgress ? 'cumulative' : 'unclear',
    photo: specification.photo, photoAlt, demo: true, origin: 'simulated', mockSampleSet: sampleSet,
    text: `${header}\n${context}\n${body}\nSimulated site update with a generated demo photo; not actual site activity or project evidence.`,
    processingNote: isVo ? 'Prefilled simulated scope query. Flag for QS review; instruction, entitlement and price remain unknown.'
      : isProgress ? 'Prefilled simulated cumulative progress. Processing changes reported completion only; supervisor verification and claim assessment remain separate.'
        : 'Included temporary-access scope needs supervisor clarification. Do not convert a set count or photo into completion or a separate claim value.',
  };
  return { ...message, ...getSITDemoPhoto(project, message) };
}

/** Preview only; the actual saved inbox and all project totals remain untouched. */
export function getSITAreaMessageUpdate(project: Project, now: DateInput = new Date()): SITMessagePreview {
  const areaUpdate = getSITAreaUpdate(project);
  if (!areaUpdate.available) return unavailable(areaUpdate.reason);
  const dates = calendar(now);
  if (!dates) return unavailable('Choose a valid date before adding sample site updates.');
  const messages = project.whatsappMessages;
  if (!Array.isArray(messages) || !messages.every((entry) => record(entry) && text(entry.id)
    && entry.projectId === project.id && entry.projectCode === project.code)
    || new Set(messages.map((entry) => entry.id)).size !== messages.length
    || !Array.isArray(project.reports) || !project.reports.every((entry) => inProject(project, entry) && text(entry.id))
    || !Array.isArray(project.history) || !project.history.every(record)) {
    return unavailable('Review the saved project inbox and reports before adding sample site updates.');
  }
  const occupied = new Set([
    ...messages.map((entry) => entry.id),
    ...project.reports.flatMap((entry) => [entry.sourceMessageId, text(entry.id).replace(/^WA-REPORT-/, '')]),
  ]);
  const areas = getDrawingMapping(project).areas;
  const definitions = new Map(getSITAreaDefinitions().slice(4).map((entry) => [entry.code, entry]));
  const projectItems = new Map(project.items.map((entry) => [entry.id, entry]));
  const additions: WhatsAppMessage[] = [], skipped: MessageSkip[] = [];
  const skip = (areaCode: string, reason: string) => {
    if (!skipped.some((entry) => entry.areaCode === areaCode && entry.reason === reason)) skipped.push({ areaCode, reason });
  };
  specifications.forEach((specification, index) => {
    const suffix = specification.kind === 'vo' ? 'VO-QUERY' : specification.kind === 'progress' ? 'PROGRESS' : 'SCOPE-CHECK';
    const messageId = `${project.id}-SIT-AREA-${specification.areaCode}-${suffix}`;
    if (occupied.has(messageId)) return;
    const definition = definitions.get(specification.areaCode)!;
    const area = areas.find((entry) => entry.code === specification.areaCode);
    const expectedIds = [...definition.itemIds].sort();
    if (!area || JSON.stringify([...area.workItemIds].sort()) !== JSON.stringify(expectedIds)
      || !expectedIds.every((id) => scopeMatches(project, projectItems.get(id)))) {
      skip(specification.areaCode, 'Link the matching original contract scope to this named area before adding its samples.');
      return;
    }
    const item = projectItems.get(definition.itemIds[0])!;
    if (specification.kind === 'progress' && (item.reported !== 0 || item.verified !== 0
      || project.reports.some((entry) => entry.itemId === item.id && !entry.vo && !['rejected', 'superseded'].includes(entry.status))
      || messages.some((entry) => entry.itemId === item.id && entry.kind === 'progress'))) {
      skip(specification.areaCode, 'Existing progress or a saved progress message is retained. Add a new site update manually for this work item.');
      return;
    }
    additions.push(messageFor(project, specification, area, item, index, dates));
  });
  return { available: true, messages: additions, messageCount: additions.length,
    firstMessageId: additions[0]?.id || null, skipped, reason: null };
}

/** Explicitly add new examples once, without processing, verification or approvals. */
export function addSITAreaMessages(project: Project, now: DateInput = new Date()) {
  const preview = getSITAreaMessageUpdate(project, now);
  if (!preview.available) return { ...preview, project, outcome: 'unavailable' as const, error: preview.reason };
  if (!preview.messageCount) return { ...preview, project, outcome: 'unchanged' as const };
  const date = calendar(now)!.now;
  const firstMessageId = preview.firstMessageId;
  return { ...preview, outcome: 'updated' as const, project: {
    ...project, whatsappMessages: [...project.whatsappMessages, ...clone(preview.messages)],
    history: [{ id: `${firstMessageId}-samples-added`, action: 'Mapped-area sample messages added',
      detail: `${preview.messageCount} unprocessed simulated site updates and generated photos added for named S.I.T. areas.`,
      date, actor: 'Alex Tan · Demo reviewer' }, ...project.history],
  } };
}
