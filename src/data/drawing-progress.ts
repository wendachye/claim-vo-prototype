import type { Project, DrawingArea } from '../types/domain';
import { getDrawingMapping } from './drawing-mapping.ts';
import { getAreaItemProgress, getItemAreaAllocation } from './area-allocations.ts';

const progressValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const basisFor = (basis: string): 'reported' | 'verified' => basis === 'reported' ? 'reported' : 'verified';
const states = {
  unlinked: { label: 'Not linked', tone: 'slate' },
  completed: { label: 'Completed', tone: 'green' },
  'in-progress': { label: 'In progress', tone: 'blue' },
  'not-started': { label: 'Not started', tone: 'slate' },
  unknown: { label: 'Needs update', tone: 'amber' },
};
type ItemStatus = 'completed' | 'in-progress' | 'not-started' | 'unknown';
const itemStatus = (completion: number | null): ItemStatus => completion === null ? 'unknown' : completion === 100 ? 'completed' : completion === 0 ? 'not-started' : 'in-progress';

export interface DrawingProgressItem {
  id: string; description: string; reported: number | null; verified: number | null; completion: number | null;
  status: ItemStatus; label: string; trackingScope: 'area' | 'whole-item' | 'link-only';
  allocationQuantity?: number; contractQuantity?: number | null; completedQuantity?: number;
}
export interface DrawingAreaProgress {
  areaId: string; code: string; name: string; basis: 'reported' | 'verified';
  status: ItemStatus | 'unlinked'; label: string; tone: string; items: DrawingProgressItem[];
  totalCount: number; completedCount: number; inProgressCount: number; notStartedCount: number; unknownCount: number; summary: string;
}

function areaProgress(project: Project, area: DrawingArea, basis: 'reported' | 'verified'): DrawingAreaProgress {
  const projectItems = new Map((Array.isArray(project.items) ? project.items : []).map((item) => [item.id, item]));
  const items = area.workItemIds.flatMap((id): DrawingProgressItem[] => {
    const item = projectItems.get(id);
    if (!item) return [];
    const allocation = getItemAreaAllocation(project, id);
    const local = allocation.areas.find(entry => entry.areaId === area.id);
    let reported: number | null, verified: number | null;
    if (allocation.split) {
      reported = local ? getAreaItemProgress(project, area.id, id, 'reported').completion : null;
      verified = local ? getAreaItemProgress(project, area.id, id, 'verified').completion : null;
    } else {
      reported = progressValue(item.reported); verified = progressValue(item.verified);
    }
    const completion = basis === 'reported' ? reported : verified;
    const status = itemStatus(completion);
    return [{ id, description: typeof item.description === 'string' ? item.description : id, reported, verified, completion, status,
      label: allocation.split && !local ? 'Quantity not assigned' : states[status].label,
      trackingScope: allocation.split ? local ? 'area' : 'link-only' : 'whole-item',
      ...(local ? { allocationQuantity: local.quantity, contractQuantity: allocation.contractQuantity,
        completedQuantity: completion === null ? 0 : local.quantity * completion / 100 } : {}),
    }];
  });
  const totalCount = items.length;
  const completedCount = items.filter((item) => item.status === 'completed').length;
  const inProgressCount = items.filter((item) => item.status === 'in-progress').length;
  const notStartedCount = items.filter((item) => item.status === 'not-started').length;
  const unknownCount = items.filter((item) => item.status === 'unknown').length;
  const status = !totalCount ? 'unlinked'
    : completedCount === totalCount ? 'completed'
      : notStartedCount === totalCount ? 'not-started'
        : inProgressCount > 0 || (completedCount > 0 && notStartedCount > 0) ? 'in-progress'
          : 'unknown';
  return {
    areaId: area.id, code: area.code, name: area.name, basis, status, ...states[status], items,
    totalCount, completedCount, inProgressCount, notStartedCount, unknownCount,
    summary: `${completedCount} of ${totalCount} work item${totalCount === 1 ? '' : 's'} completed`,
  };
}

export function getAreaProgress(project: Project, areaId: string, basis = 'verified') {
  const area = getDrawingMapping(project).areas.find((entry) => entry.id === areaId);
  return area ? areaProgress(project, area, basisFor(basis)) : null;
}

export function getDrawingProgress(project: Project, basis = 'verified') {
  return getDrawingMapping(project).areas.map((area) => areaProgress(project, area, basisFor(basis)));
}
