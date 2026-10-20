// Apply the public showcase default outside the base workspace loader so its
// fictional fixtures and existing migrations remain independent of the demo factory.
import { loadWorkspace, WORKSPACE_STORE } from './projects.js';
import { createSITContractDemo } from './provided-contract-demo.js';

export const SIT_SHOWCASE_VERSION = 1;

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const identifiedRecords = (value) => Array.isArray(value) && value.every((entry) => record(entry) && text(entry.id))
  && new Set(value.map((entry) => entry.id)).size === value.length;
const currentMarker = (value) => record(value) && Number.isInteger(value.version) && value.version >= SIT_SHOWCASE_VERSION;

export function isSITShowcaseProject(project) {
  return record(project) && Boolean(text(project.id) && text(project.code) && text(project.name))
    && project.providedContractDemo === true
    && project.contract?.sourceKind === 'provided'
    && project.contract?.sourceProfile === 'sit-loa-2021'
    && identifiedRecords(project.items) && identifiedRecords(project.reports)
    && Array.isArray(project.history) && project.history.every(record)
    && (project.sourceItems === undefined || identifiedRecords(project.sourceItems));
}

export function getShowcaseProjectId(workspace) {
  if (!currentMarker(workspace?.sitShowcase) || !Array.isArray(workspace?.projects)) return null;
  return workspace.projects.find((project) => project.id === workspace.sitShowcase.projectId
    && isSITShowcaseProject(project))?.id || null;
}

function availableCode(projects) {
  const normalize = (value) => text(value).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const reserved = new Set(projects.flatMap((project) => [normalize(project?.id), normalize(project?.code)]));
  let sequence = 1;
  while (reserved.has(`SIT-DEMO${String(sequence).padStart(2, '0')}`)) sequence += 1;
  return `SIT-DEMO${String(sequence).padStart(2, '0')}`;
}

export function ensureSITShowcase(workspace, now = new Date()) {
  const base = record(workspace) ? workspace : { schemaVersion: 2 };
  const projects = Array.isArray(base.projects) ? base.projects : [];
  const priorMarker = record(base.sitShowcase) ? base.sitShowcase : {};
  const markedId = getShowcaseProjectId(base);
  const showcase = projects.find((project) => project?.id === markedId && isSITShowcaseProject(project))
    || projects.find(isSITShowcaseProject)
    || createSITContractDemo({
      name: 'S.I.T. Plot 1 — Showcase (Demo)', code: availableCode(projects),
    }, now);
  // Reuse the original object, including all user edits and saved claim revisions.
  const ordered = projects[0] === showcase ? projects : [showcase, ...projects.filter((project) => project !== showcase)];
  const activeIsValid = projects.some((project) => project?.id === base.activeProjectId);
  const activeProjectId = currentMarker(priorMarker) && activeIsValid ? base.activeProjectId : showcase.id;
  const version = currentMarker(priorMarker) ? priorMarker.version : SIT_SHOWCASE_VERSION;
  if (ordered === projects && activeProjectId === base.activeProjectId
    && priorMarker.version === version && priorMarker.projectId === showcase.id) return workspace;
  return {
    ...base, projects: ordered, activeProjectId,
    sitShowcase: { ...priorMarker, version, projectId: showcase.id },
  };
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function loadShowcaseWorkspace(storage = browserStorage(), now = new Date()) {
  // Passing null prevents the base loader from accessing a blocked browser getter.
  const workspace = ensureSITShowcase(loadWorkspace(storage ?? null), now);
  try { storage?.setItem(WORKSPACE_STORE, JSON.stringify(workspace)); } catch { /* Keep the showcase usable in memory. */ }
  return workspace;
}
