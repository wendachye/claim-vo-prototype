import type { Project, WorkItem } from "../types/domain";
// Unfinished UI edits only. These buffers never write saved project records and
// disappear on a page refresh; explicit Save/Confirm actions remain required.
const projects = new Map<string, Map<string, unknown>>();
const clone = <T,>(value: T): T => value === undefined ? value : structuredClone(value);

export function readFormBuffer(projectId: string, scope: string) {
  return clone(projects.get(String(projectId))?.get(String(scope)));
}

export function writeFormBuffer(projectId: string, scope: string, value: unknown) {
  const key = String(projectId);
  if (!projects.has(key)) projects.set(key, new Map());
  projects.get(key)!.set(String(scope), clone(value));
}

export function clearFormBuffer(projectId: string, scope: string) {
  const key = String(projectId);
  const values = projects.get(key);
  values?.delete(String(scope));
  if (values?.size === 0) projects.delete(key);
}

export function clearProjectFormBuffers(projectId: string) {
  projects.delete(String(projectId));
}

export function contractFormValues(item: WorkItem | null | undefined) {
  return {
    description: item?.description ?? '',
    quantity: String(item?.needsReview ? (item.rawExtractedQuantity ?? item.quantity ?? '') : (item?.quantity ?? '')),
    rate: item?.rate == null ? '' : String(item.rate),
    unit: item?.unit ?? 'm²',
    location: item?.location ?? '',
  };
}

export function contractFormScope(item: WorkItem | null | undefined, revision = 1, locked = false) {
  return `contract:${JSON.stringify([revision, locked, item?.id, item?.reviewedAt, contractFormValues(item)])}`;
}

export function findUnfinishedContractItem(project: Project | null | undefined) {
  if (!project?.id || project.locked || !Array.isArray(project.items)) return null;
  for (const item of project.items) {
    const values = readFormBuffer(project.id, contractFormScope(item, project.version ?? 1, false));
    if (values !== undefined && JSON.stringify(values) !== JSON.stringify(contractFormValues(item))) return item.id;
  }
  return null;
}
