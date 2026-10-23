import type { AreaProgressSnapshot, DrawingArea, Project, SiteReport } from '../types/domain';
import { claimBasisNumber } from './claim-basis.ts';
import { getDrawingMapping } from './drawing-mapping.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const progress = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const dateTime = (value: unknown) => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;
const inProject = (project: Project, report: SiteReport) => (!report.projectId || report.projectId === project.id)
  && (!report.projectCode || report.projectCode === project.code);
const rounded = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

// Quantities use four decimal places. Integer units make allocation limits exact
// (for example, 0.1 + 0.2 is the same quantity as 0.3).
export function areaQuantityUnits(value: unknown): bigint | null {
  const quantity = claimBasisNumber(value, 4);
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(Math.round(quantity * 10000))) return null;
  return BigInt(Math.round(quantity * 10000));
}
const quantityFromUnits = (units: bigint) => Number(units) / 10000;

export interface ItemAreaAllocation {
  split: boolean; valid: boolean; contractQuantity: number | null;
  allocatedQuantity: number; remainingQuantity: number | null;
  areas: { areaId: string; code: string; name: string; quantity: number }[];
  issues: string[];
}

export function getItemAreaAllocation(project: Project, itemId: string): ItemAreaAllocation {
  const item = (Array.isArray(project?.items) ? project.items : []).find(entry => entry.id === itemId);
  const mapping = getDrawingMapping(project);
  const areas = mapping.areas;
  const matchingReports = (Array.isArray(project?.reports) ? project.reports : []).filter(report => inProject(project, report)
    && report.itemId === itemId && report.areaProgress?.itemId === itemId);
  const rawAreas = Array.isArray(project?.drawingMapping?.areas) ? project.drawingMapping.areas.filter(area => record(area)
    && area.projectId === project.id && area.drawingId === mapping.drawing?.id) : [];
  const rawById = new Map<string, DrawingArea>();
  for (const area of rawAreas) if (!rawById.has(area.id)) rawById.set(area.id, area);
  const rawConfigured = rawAreas.filter(area => record(area.workItemQuantities) ? Object.hasOwn(area.workItemQuantities, itemId)
    : Object.hasOwn(area, 'workItemQuantities') && Array.isArray(area.workItemIds) && area.workItemIds.includes(itemId));
  const configured = areas.filter(area => {
    const raw = rawById.get(area.id);
    return record(raw?.workItemQuantities) ? Object.hasOwn(raw.workItemQuantities, itemId)
      : Boolean(raw && Object.hasOwn(raw, 'workItemQuantities') && area.workItemIds.includes(itemId));
  });
  const split = rawConfigured.length > 0 || matchingReports.length > 0;
  const contractUnits = item?.pricingType === 'measured' ? areaQuantityUnits(item.quantity) : null;
  const issues: string[] = [];
  if (rawConfigured.some(area => !areas.some(saved => saved.id === area.id && saved.code === String(area.code).trim().toUpperCase())
    || rawAreas.filter(entry => entry.id === area.id || entry.code === area.code).length > 1)) {
    issues.push('Review duplicated or invalid saved areas before tracking their quantities.');
  }
  if (split && !item) issues.push('This contract item is no longer available.');
  else if (split && item?.pricingType !== 'measured') issues.push('Only measured contract items can be split into area quantities.');
  else if (split && contractUnits === null) issues.push('Check the contract quantity before splitting this item.');
  let allocatedUnits = 0n;
  const allocations: ItemAreaAllocation['areas'] = [];
  for (const area of configured) {
    const raw = rawById.get(area.id)!;
    const rawQuantity = record(raw.workItemQuantities) ? raw.workItemQuantities[itemId] : undefined;
    const units = typeof rawQuantity === 'number' ? areaQuantityUnits(rawQuantity) : null;
    if (!area.workItemIds.includes(itemId) || units === null) {
      issues.push(`Area ${area.code} has an invalid quantity for this contract item.`);
      continue;
    }
    allocatedUnits += units;
    allocations.push({ areaId: area.id, code: area.code, name: area.name, quantity: quantityFromUnits(units) });
  }
  if (contractUnits !== null && allocatedUnits > contractUnits) issues.push('Area quantities exceed the contract quantity. Review the area links.');
  for (const report of matchingReports) {
    const saved = report.areaProgress!;
    const allocation = allocations.find(area => area.areaId === saved.areaId);
    if (!allocation || saved.allocatedQuantity !== allocation.quantity || saved.contractQuantity !== quantityFromUnits(contractUnits ?? 0n)) {
      issues.push('An area quantity changed after progress was recorded. Review the allocation before adding progress.');
      break;
    }
  }
  return {
    split, valid: issues.length === 0, contractQuantity: contractUnits === null ? null : quantityFromUnits(contractUnits),
    allocatedQuantity: quantityFromUnits(allocatedUnits),
    remainingQuantity: contractUnits === null ? null : quantityFromUnits(contractUnits - allocatedUnits), areas: allocations, issues,
  };
}

/** Start of the current uninterrupted area-tracking interval. Quantities can
 * be removed before any scoped reports exist, then enabled again later. Undo
 * saved map events rather than reusing the first allocation ever recorded.
 */
export function getItemAreaSplitStartedAt(project: Project, itemId: string): string | null {
  const mapping = getDrawingMapping(project);
  let areas = new Map(mapping.areas.map(area => [area.id, area]));
  const hasQuantity = () => [...areas.values()].some(area => area.workItemIds.includes(itemId)
    && Object.hasOwn(area.workItemQuantities || {}, itemId) && areaQuantityUnits(area.workItemQuantities?.[itemId]) !== null);
  if (!hasQuantity()) return null;
  for (const event of [...mapping.history].reverse()) {
    const active = hasQuantity();
    if (Array.isArray(event.previousAreas) && ['addDrawing', 'replaceDrawing'].includes(event.action)) {
      areas = new Map(event.previousAreas.filter(area => area && typeof area.id === 'string').map(area => [area.id, area]));
    } else if (['addArea', 'updateArea', 'removeArea'].includes(event.action)) {
      const areaId = event.areaId || event.area?.id || event.previousArea?.id;
      if (!areaId) continue;
      if (event.previousArea) areas.set(areaId, event.previousArea);
      else areas.delete(areaId);
    } else continue;
    if (active && !hasQuantity()) return typeof event.date === 'string' && Number.isFinite(dateTime(event.date)) ? event.date : null;
  }
  return null;
}

export function getAreaAllocationSnapshot(project: Project, areaId: string, itemId: string): AreaProgressSnapshot | null {
  const allocation = getItemAreaAllocation(project, itemId);
  const area = allocation.areas.find(entry => entry.areaId === areaId);
  if (!allocation.valid || allocation.contractQuantity === null || !area) return null;
  return { areaId, itemId, allocatedQuantity: area.quantity, contractQuantity: allocation.contractQuantity };
}

export function sameProgressScope(a: Pick<SiteReport, 'itemId' | 'areaProgress'>, b: Pick<SiteReport, 'itemId' | 'areaProgress'>) {
  if (!a?.itemId || a.itemId !== b?.itemId) return false;
  const first = a.areaProgress, second = b.areaProgress;
  if (first || second) return Boolean(first && second && first.itemId === a.itemId && second.itemId === b.itemId && first.areaId === second.areaId);
  return true;
}

export interface AreaItemProgress {
  completion: number | null; completedQuantity: number; knownCount: number; unknownCount: number;
  evidence: SiteReport[]; valid: boolean; issues: string[];
}

export function getAreaItemProgress(project: Project, areaId: string, itemId: string, basis: 'reported' | 'verified' = 'verified', cutoff?: number): AreaItemProgress {
  const allocation = getItemAreaAllocation(project, itemId);
  const snapshot = getAreaAllocationSnapshot(project, areaId, itemId);
  const empty = (issues = allocation.issues): AreaItemProgress => ({ completion: null, completedQuantity: 0, knownCount: 0, unknownCount: 1, evidence: [], valid: allocation.valid && Boolean(snapshot), issues });
  if (!snapshot || !allocation.valid) return empty();
  const candidates = (Array.isArray(project?.reports) ? project.reports : [])
    .map((report, index) => ({ report, index }))
    .filter(({ report }) => inProject(project, report) && report.itemId === itemId && !report.vo && report.areaProgress?.areaId === areaId
      && report.areaProgress.itemId === itemId && report.areaProgress.allocatedQuantity === snapshot.allocatedQuantity
      && report.areaProgress.contractQuantity === snapshot.contractQuantity
      && (basis === 'verified' ? ['verified', 'approved'].includes(report.status) : !['rejected', 'superseded'].includes(report.status))
      && progress(basis === 'verified' ? report.approvedCompletion ?? report.completion : report.completion) !== null)
    .map(entry => ({ ...entry, time: dateTime(basis === 'verified' ? entry.report.verifiedAt : entry.report.date) }))
    .filter(({ time }) => cutoff === undefined || Number.isFinite(time) && time <= cutoff)
    .sort((a, b) => (Number.isFinite(b.time) ? b.time : -Infinity) - (Number.isFinite(a.time) ? a.time : -Infinity) || b.index - a.index);
  const report = candidates[0]?.report;
  if (!report) return empty([]);
  const completion = progress(basis === 'verified' ? report.approvedCompletion ?? report.completion : report.completion)!;
  return { completion, completedQuantity: rounded(snapshot.allocatedQuantity * completion / 100), knownCount: 1, unknownCount: 0,
    evidence: [structuredClone(report)], valid: true, issues: [] };
}

export function getItemAreaRollup(project: Project, itemId: string, basis: 'reported' | 'verified' = 'verified', cutoff?: number): AreaItemProgress {
  const allocation = getItemAreaAllocation(project, itemId);
  if (!allocation.split || !allocation.valid || !allocation.contractQuantity) return {
    completion: null, completedQuantity: 0, knownCount: 0, unknownCount: allocation.areas.length,
    evidence: [], valid: allocation.valid && allocation.split, issues: allocation.issues,
  };
  const parts = allocation.areas.map(area => getAreaItemProgress(project, area.areaId, itemId, basis, cutoff));
  const knownCount = parts.reduce((sum, part) => sum + part.knownCount, 0);
  const completedQuantity = rounded(parts.reduce((sum, part) => sum + part.completedQuantity, 0));
  return { completion: knownCount ? rounded(completedQuantity / allocation.contractQuantity * 100) : null,
    completedQuantity, knownCount, unknownCount: parts.length - knownCount, evidence: parts.flatMap(part => part.evidence), valid: true, issues: [] };
}

export function syncAreaItemProgress(project: Project, itemId: string): Project {
  if (!getItemAreaAllocation(project, itemId).split) return project;
  const reported = getItemAreaRollup(project, itemId, 'reported').completion;
  const verified = getItemAreaRollup(project, itemId, 'verified').completion;
  return { ...project, items: project.items.map(item => item.id === itemId ? { ...item, reported, verified } : item) };
}
