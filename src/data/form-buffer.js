// Unfinished UI edits only. These buffers never write saved project records and
// disappear on a page refresh; explicit Save/Confirm actions remain required.
const projects = new Map();
const clone = (value) => value === undefined ? undefined : structuredClone(value);

export function readFormBuffer(projectId, scope) {
  return clone(projects.get(String(projectId))?.get(String(scope)));
}

export function writeFormBuffer(projectId, scope, value) {
  const key = String(projectId);
  if (!projects.has(key)) projects.set(key, new Map());
  projects.get(key).set(String(scope), clone(value));
}

export function clearFormBuffer(projectId, scope) {
  const key = String(projectId);
  const values = projects.get(key);
  values?.delete(String(scope));
  if (values?.size === 0) projects.delete(key);
}

export function clearProjectFormBuffers(projectId) {
  projects.delete(String(projectId));
}

export function contractFormValues(item) {
  return {
    description: item?.description ?? '',
    quantity: String(item?.needsReview ? (item.rawExtractedQuantity ?? item.quantity ?? '') : (item?.quantity ?? '')),
    rate: item?.rate == null ? '' : String(item.rate),
    unit: item?.unit ?? 'm²',
    location: item?.location ?? '',
  };
}

export function contractFormScope(item, revision = 1, locked = false) {
  return `contract:${JSON.stringify([revision, locked, item?.id, item?.reviewedAt, contractFormValues(item)])}`;
}

export function findUnfinishedContractItem(project) {
  if (!project?.id || project.locked || !Array.isArray(project.items)) return null;
  for (const item of project.items) {
    const values = readFormBuffer(project.id, contractFormScope(item, project.version ?? 1, false));
    if (values !== undefined && JSON.stringify(values) !== JSON.stringify(contractFormValues(item))) return item.id;
  }
  return null;
}
