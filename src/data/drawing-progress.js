// Drawing colours summarize linked whole work items; they do not measure area work.
import { getDrawingMapping } from './drawing-mapping.js';

const progressValue = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const basisFor = (basis) => basis === 'reported' ? 'reported' : 'verified';
const states = {
  unlinked: { label: 'Not linked', tone: 'slate' },
  completed: { label: 'Completed', tone: 'green' },
  'in-progress': { label: 'In progress', tone: 'blue' },
  'not-started': { label: 'Not started', tone: 'slate' },
  unknown: { label: 'Needs update', tone: 'amber' },
};
const itemStatus = (completion) => completion === null ? 'unknown' : completion === 100 ? 'completed' : completion === 0 ? 'not-started' : 'in-progress';

function areaProgress(project, area, basis) {
  const projectItems = new Map((Array.isArray(project.items) ? project.items : []).map((item) => [item.id, item]));
  const items = area.workItemIds.flatMap((id) => {
    const item = projectItems.get(id);
    if (!item) return [];
    const reported = progressValue(item.reported), verified = progressValue(item.verified);
    const completion = basis === 'reported' ? reported : verified;
    const status = itemStatus(completion);
    return [{ id, description: typeof item.description === 'string' ? item.description : id, reported, verified, completion, status, label: states[status].label }];
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

export function getAreaProgress(project, areaId, basis = 'verified') {
  const area = getDrawingMapping(project).areas.find((entry) => entry.id === areaId);
  return area ? areaProgress(project, area, basisFor(basis)) : null;
}

export function getDrawingProgress(project, basis = 'verified') {
  return getDrawingMapping(project).areas.map((area) => areaProgress(project, area, basisFor(basis)));
}
