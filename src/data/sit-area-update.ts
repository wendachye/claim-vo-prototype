import type { Project, WorkItem, DateInput, DrawingPosition, DrawingMapping } from "../types/domain";
interface AreaAddition { code: string; name: string; page: number; position: DrawingPosition | null; workItemIds: string[] }
interface AreaSkip { code: string; itemIds: string[]; reason: string }
export interface SITAreaPreview { available: boolean; additions: AreaAddition[]; areaCount: number; itemCount: number; skipped: AreaSkip[]; reason: string | null }
// Adding the source-zone examples is an explicit action for an existing demo.
// Existing mappings and source evidence are never rewritten by this helper.
import { initialItems } from './sit-contract-source.ts';
import { getSITAreaDefinitions } from './sit-area-definitions.ts';
import { getDrawingMapping, getProvidedDrawingSource, saveAreaMapping } from './drawing-mapping.ts';

const clone = <T,>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const sourceById = new Map(initialItems.map((item) => [item.id, item]));
const scopeFields = ['ref', 'description', 'location', 'subsection', 'pricingType'];
const ownItem = (project: Project, item: WorkItem) => (item.projectId == null || item.projectId === '' || item.projectId === project.id)
  && (item.projectCode == null || item.projectCode === '' || text(item.projectCode).toUpperCase() === text(project.code).toUpperCase());
const matchingScope = (project: Project, item: WorkItem | undefined) => {
  const source = sourceById.get(item?.id || '');
  return Boolean(source && item && ownItem(project, item) && scopeFields.every((field) => item[field] === source[field]));
};
const unavailable = (reason: string): SITAreaPreview => ({ available: false, additions: [], areaCount: 0, itemCount: 0, skipped: [], reason });

/** Preview missing source-zone examples without changing the selected project. */
export function getSITAreaUpdate(project: Project): SITAreaPreview {
  if (!record(project) || !text(project.id) || !text(project.code) || project.providedContractDemo !== true
    || project.contract?.sourceKind !== 'provided' || project.contract?.sourceProfile !== 'sit-loa-2021'
    || project.contract?.reference !== 'CCSC/SIT/SC/21.183') return unavailable('Choose the original S.I.T. contract demo.');
  if (!Array.isArray(project.items) || !project.items.every((item) => record(item) && text(item.id))
    || new Set(project.items.map((item) => item.id)).size !== project.items.length) {
    return unavailable('Review the contract work list before adding source area links.');
  }
  const source = getProvidedDrawingSource(project);
  const mapping = getDrawingMapping(project);
  if (!source || source.id !== 'provided-site-plan' || source.asset !== '/assets/site-plan.png'
    || source.fileName !== 'site-plan.png' || source.mimeType !== 'image/png'
    || !mapping.drawing || mapping.drawing.inputKind !== 'provided' || mapping.drawing.sourceId !== source.id) {
    return unavailable('Source area links need the original supplied S.I.T. site plan.');
  }
  // Do not silently normalize away a damaged or foreign saved area while adding examples.
  const saved = project.drawingMapping;
  const localIds = new Set(project.items.map((item) => item.id));
  if (!Array.isArray(saved?.areas) || mapping.areas.length !== saved.areas.length
    || saved.areas.some((area) => !Array.isArray(area.workItemIds) || area.workItemIds.some((id) => !localIds.has(id)))
    || !Array.isArray(saved.history) || !saved.history.every(record)) {
    return unavailable('Review the saved area mappings before adding source area links.');
  }
  const mapped = new Set(mapping.areas.flatMap((area) => area.workItemIds));
  const usedCodes = new Set(mapping.areas.map((area) => area.code));
  const items = new Map(project.items.map((item) => [item.id, item]));
  const additions: AreaAddition[] = [];
  const skipped: AreaSkip[] = [];
  for (const definition of getSITAreaDefinitions()) {
    const primaryId = definition.itemIds[0];
    const primary = items.get(primaryId);
    if (!primary || !matchingScope(project, primary)) {
      skipped.push({ code: definition.code, itemIds: [...definition.itemIds], reason: 'The source work item is missing or its scope has changed. Map it manually.' });
      continue;
    }
    // A user's existing mapping takes priority, including renamed or relocated zones.
    if (mapped.has(primaryId)) continue;
    const workItemIds = definition.itemIds.filter((id) => !mapped.has(id) && matchingScope(project, items.get(id)));
    if (usedCodes.has(definition.code)) {
      skipped.push({ code: definition.code, itemIds: workItemIds, reason: 'This area code is already saved. Review its links manually.' });
      continue;
    }
    const changedRelatedIds = definition.itemIds.filter((id) => id !== primaryId && !mapped.has(id) && !matchingScope(project, items.get(id)));
    if (changedRelatedIds.length) skipped.push({ code: definition.code, itemIds: changedRelatedIds, reason: 'Related included scope has changed. It was not added to this area.' });
    additions.push({ code: definition.code, name: definition.name || primary.description,
      page: 1, position: null, workItemIds });
  }
  return { available: true, additions, areaCount: additions.length,
    itemCount: new Set(additions.flatMap((area) => area.workItemIds)).size, skipped, reason: null };
}

/** Apply only the previewed missing named areas. No existing area is edited. */
export function applySITAreaUpdate(project: Project, now: DateInput = new Date()) {
  const preview = getSITAreaUpdate(project);
  if (!preview.available) return { ...preview, project, outcome: 'unavailable' as const, error: preview.reason };
  if (!preview.areaCount) return { ...preview, project, outcome: 'unchanged' as const };
  let date;
  try { date = new Date(now).toISOString(); } catch { /* Invalid dates leave the project intact. */ }
  if (!date) return { ...preview, project, outcome: 'unavailable' as const, error: 'Choose a valid date before saving source area links.' };
  let next = project;
  for (const area of preview.additions) {
    const result = saveAreaMapping(next, { ...area, drawingId: next.drawingMapping!.drawing!.id }, date);
    if (result.outcome !== 'updated') return { ...preview, project, outcome: 'unavailable' as const, error: ('error' in result ? result.error : undefined) || 'The area links changed. Reopen the drawing and try again.' };
    // saveAreaMapping validates and allocates IDs/history; retain the original
    // raw area objects and any extra user metadata rather than normalizing them.
    next = { ...result.project, drawingMapping: { ...clone(next.drawingMapping!),
      areas: [...clone(next.drawingMapping!.areas), clone(('area' in result ? result.area : null)!)],
      history: result.project.drawingMapping!.history } };
  }
  return { ...preview, project: next, outcome: 'updated' as const };
}
