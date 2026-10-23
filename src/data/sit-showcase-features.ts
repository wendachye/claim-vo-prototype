import type { DateInput, DrawingArea, DrawingMapping, Project, WhatsAppMessage } from '../types/domain';
import { getDrawingMapping } from './drawing-mapping.ts';
import { getItemAreaAllocation } from './area-allocations.ts';
import { initialItems } from './sit-contract-source.ts';

const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const sourceItem = initialItems.find(item => item.id === 'WI-016')!;
const sameScope = (item: unknown) => record(item) && ['id', 'ref', 'description', 'unit', 'quantity', 'rate', 'amount', 'pricingType'].every(key => item[key] === sourceItem[key as keyof typeof sourceItem]);
const itemMentioned = (value: unknown): boolean => typeof value === 'string' && /\bWI-016\b/i.test(value);
const sourceIsSIT = (project: Project) => project?.providedContractDemo === true && project.contract?.sourceKind === 'provided' && project.contract.sourceProfile === 'sit-loa-2021';

export interface SITShowcaseFeaturesResult { project: Project; changed: boolean; added: boolean; reason?: string }

/** One-time, append-only walkthrough examples. Never reinterpret an existing work scope. */
export function enrichSITShowcaseFeatures(project: Project, now: DateInput = new Date()): SITShowcaseFeaturesResult {
  const unchanged = (): SITShowcaseFeaturesResult => ({ project, changed: false, added: false });
  if (!sourceIsSIT(project) || project.sitShowcaseFeatures != null) return unchanged();
  let time: number;
  try { time = new Date(now).getTime(); } catch { return unchanged(); }
  if (!Number.isFinite(time)) return unchanged();
  const date = new Date(time).toISOString();
  const markSkipped = (reason: string): SITShowcaseFeaturesResult => ({ project: { ...project,
    sitShowcaseFeatures: { version: 1, status: 'not-applied', reason, addedAt: date } }, changed: true, added: false, reason });
  const item = project.items.filter(entry => entry.id === sourceItem.id);
  const source = project.sourceItems.filter(entry => entry.id === sourceItem.id);
  if (item.length !== 1 || source.length !== 1 || !sameScope(item[0]) || !sameScope(source[0])
    || item[0].reported !== 0 || item[0].verified !== 0 || !project.locked || !Number.isSafeInteger(project.version) || project.version < 1) {
    return markSkipped('The D.5 bracket scope has changed or already has progress. Existing work is preserved.');
  }
  if ((project.reports || []).some(report => report.itemId === sourceItem.id || report.areaProgress?.itemId === sourceItem.id)
    || (project.whatsappMessages || []).some(message => message.itemId === sourceItem.id || itemMentioned(message.text))
    || (project.claimDrafts || []).some(draft => draft.snapshot?.workRows?.some(row => row.included && row.itemId === sourceItem.id))) {
    return markSkipped('D.5 already has source records or claim evidence. Existing work is preserved.');
  }
  const mapping = getDrawingMapping(project);
  if (!mapping.drawing || mapping.drawing.inputKind !== 'provided' || mapping.drawing.sourceId !== 'provided-site-plan'
    || mapping.drawing.fileName !== 'site-plan.png' || project.drawingMapping?.areas?.length !== mapping.areas.length
    || mapping.areas.some(area => area.workItemIds.includes(sourceItem.id) || ['BRACKET-A', 'BRACKET-B'].includes(area.code))) {
    return markSkipped('The drawing or D.5 area links have changed. Keep the current mapping and review it manually.');
  }
  const prefix = `${project.id}-SHOWCASE`;
  const at = (minutesAgo: number) => new Date(time - minutesAgo * 60_000).toISOString();
  const areaAt = at(6);
  const areas: DrawingArea[] = ['A', 'B'].map(letter => ({
    id: `${prefix}-BRACKET-${letter}`, projectId: project.id, drawingId: mapping.drawing!.id,
    code: `BRACKET-${letter}`, name: `D.5 cantilever brackets — demo zone ${letter} (unplaced)`, page: 1, position: null,
    workItemIds: ['WI-016'], workItemQuantities: { 'WI-016': 90 },
    aliases: [`Bracket zone ${letter}`, 'Bracket zone'], updatedAt: areaAt,
  }));
  if (areas.some(area => project.drawingMapping?.areas.some(existing => existing.id === area.id))) return markSkipped('An example identifier is already in use. Existing records are preserved.');
  const enrichedMapping: DrawingMapping = { ...clone(project.drawingMapping!), areas: [...clone(project.drawingMapping!.areas), ...areas],
    history: [...clone(project.drawingMapping!.history || []), ...areas.map(area => ({ id: `${area.id}-ADDED`, action: 'addArea', date: areaAt,
      drawingId: mapping.drawing!.id, areaId: area.id, previousArea: null, area: clone(area),
      detail: 'Simulated 90/90 allocation of D.5’s 180 brackets. The source specifies no bracket locations; zones remain unplaced.' }))] };
  const withMapping = { ...project, drawingMapping: enrichedMapping };
  if (!getItemAreaAllocation(withMapping, 'WI-016').valid) return markSkipped('The D.5 quantity allocation needs review. Existing records are preserved.');
  const base = { projectId: project.id, projectCode: project.code, status: 'new', sender: 'Scaffold worker (demo)',
    senderRole: 'Site worker · demo', location: 'Simulated bracket zones; actual source location unspecified', demo: true, origin: 'simulated', channel: 'whatsapp-mock' };
  const clear = 'Cantilever brackets in area BRACKET-A. Work itam WI-016 is 50% complete in total.';
  const unclear = 'Cantilever brackets in bracket zone. Another 10%. Area and cumulative total unclear.';
  const matchText = 'Cantilever brackets in bracket zone B are 25% complete in total. Simulated site update.';
  const aliasText = 'Cantilever brackets in bracket zone are 10% complete in total. Simulated site update.';
  const messages: WhatsAppMessage[] = [
    { ...base, id: `${prefix}-VOICE-CLEAR`, kind: 'progress', itemId: 'WI-016', area: 'BRACKET-A', completion: 50, completionBasis: 'cumulative',
      date: at(3), text: clear, originalTranscript: clear,
      audio: { version: 1, asset: '/assets/demo-sit-voice-clear.wav', mimeType: 'audio/wav', durationSeconds: 10.54, demo: true, clarity: 'clear' },
      processingNote: 'Synthetic S.I.T. demo voice note. Correct “itam” to “item” with a reason, confirm the transcript and match, then explicitly add progress. D.5’s source location is unspecified; the area allocation is simulated.' },
    { ...base, id: `${prefix}-VOICE-UNCLEAR`, kind: 'clarification', itemId: null, area: 'Bracket zone', completion: null, completionBasis: 'incremental',
      date: at(2), text: unclear, originalTranscript: unclear,
      audio: { version: 1, asset: '/assets/demo-sit-voice-unclear.wav', mimeType: 'audio/wav', durationSeconds: 11.07, demo: true, clarity: 'unclear' },
      processingNote: 'Synthetic S.I.T. recording. Two areas share “Bracket zone” and “another 10%” is incremental. Ask the worker for one area and its cumulative total; never infer it.' },
    { ...base, id: `${prefix}-MATCH`, kind: 'progress', itemId: 'WI-016', area: 'Bracket zone B', completion: 25, completionBasis: 'cumulative', date: at(4), text: matchText,
      matchSuggestion: { version: 1, origin: 'mock', baselineVersion: project.version, fields: { itemId: 'WI-016', areaId: areas[0].id, completion: 25 },
        sourceExcerpt: matchText, reason: 'Deliberately mistaken mock area suggestion. The worker says zone B; review and correct area A with a reason.' },
      processingNote: 'Review match: correct the suggested area to BRACKET-B. This creates no completion until Add progress update and supervisor verification.' },
    { ...base, id: `${prefix}-AREA-CLARIFICATION`, kind: 'progress', itemId: 'WI-016', area: 'Bracket zone', completion: 10, completionBasis: 'cumulative', date: at(1), text: aliasText,
      matchSuggestion: { version: 1, origin: 'mock', baselineVersion: project.version, fields: { itemId: 'WI-016', areaId: areas[0].id, completion: 10 },
        sourceExcerpt: aliasText, reason: 'The shared alternate name cannot identify A or B. A worker clarification is required.' },
      processingNote: 'The alternate name matches both areas. Ask which area before adding any progress.' },
  ];
  if (messages.some(message => project.whatsappMessages.some(existing => existing.id === message.id))) return markSkipped('An example message identifier is already in use. Existing records are preserved.');
  return { changed: true, added: true, project: { ...withMapping, whatsappMessages: [...project.whatsappMessages, ...messages],
    history: [{ id: `${prefix}-FEATURES`, date, actor: 'Demo setup', action: 'Showcase examples added',
      detail: 'Simulated bracket-area split, alternate names, match review and synthetic voice notes. Contract source, existing progress and saved claims are unchanged.' }, ...project.history],
    sitShowcaseFeatures: { version: 1, status: 'added', addedAt: date, areaIds: areas.map(area => area.id), messageIds: messages.map(message => message.id) } } };
}

/** Existing records only; launch buttons must never recreate a missing/deleted example. */
export function getSITShowcaseFeatureTargets(project: Project) {
  const marker = record(project.sitShowcaseFeatures) ? project.sitShowcaseFeatures : null;
  const prefix = `${project.id}-SHOWCASE`;
  const message = (suffix: string) => project.whatsappMessages.some(entry => entry.id === `${prefix}-${suffix}`
    && entry.projectId === project.id && entry.projectCode === project.code) ? `${prefix}-${suffix}` : null;
  const areas = getDrawingMapping(project).areas;
  return { available: marker?.status === 'added', reason: typeof marker?.reason === 'string' ? marker.reason : null,
    voiceMessageId: message('VOICE-CLEAR'), unclearVoiceMessageId: message('VOICE-UNCLEAR'),
    matchMessageId: message('MATCH'), aliasMessageId: message('AREA-CLARIFICATION'),
    areaIds: ['A', 'B'].flatMap(letter => areas.some(area => area.id === `${prefix}-BRACKET-${letter}`) ? [`${prefix}-BRACKET-${letter}`] : []) };
}
