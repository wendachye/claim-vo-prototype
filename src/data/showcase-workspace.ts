import type { Project, Workspace, DateInput } from "../types/domain";
// Apply the public showcase default outside the base workspace loader so its
// fictional fixtures and existing migrations remain independent of the demo factory.
import { loadWorkspace, WORKSPACE_STORE } from './projects.ts';
import { createSITContractDemo } from './provided-contract-demo.ts';
import { refreshSITDemoPhotos } from './sit-demo-photos.ts';

export const SIT_SHOWCASE_VERSION = 1;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const identifiedRecords = (value: unknown) => Array.isArray(value) && value.every((entry) => record(entry) && text(entry.id))
  && new Set(value.map((entry) => entry.id)).size === value.length;
const currentMarker = (value: unknown): value is { version: number; projectId: string } => record(value) && Number.isInteger(value.version) && (value.version as number) >= SIT_SHOWCASE_VERSION;

export function isSITShowcaseProject(project: Project | null | undefined) {
  return record(project) && Boolean(text(project.id) && text(project.code) && text(project.name))
    && project.providedContractDemo === true
    && project.contract?.sourceKind === 'provided'
    && project.contract?.sourceProfile === 'sit-loa-2021'
    && identifiedRecords(project.items) && identifiedRecords(project.reports)
    && Array.isArray(project.history) && project.history.every(record)
    && (project.sourceItems === undefined || identifiedRecords(project.sourceItems));
}

export function getShowcaseProjectId(workspace: Partial<Workspace> | null | undefined) {
  if (!currentMarker(workspace?.sitShowcase) || !Array.isArray(workspace?.projects)) return null;
  return workspace.projects.find((project) => project.id === workspace.sitShowcase!.projectId
    && isSITShowcaseProject(project))?.id || null;
}

function availableCode(projects: Project[]) {
  const normalize = (value: unknown) => text(value).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const reserved = new Set(projects.flatMap((project) => [normalize(project?.id), normalize(project?.code)]));
  let sequence = 1;
  while (reserved.has(`SIT-DEMO${String(sequence).padStart(2, '0')}`)) sequence += 1;
  return `SIT-DEMO${String(sequence).padStart(2, '0')}`;
}

export function ensureSITShowcase(workspace: Workspace, now: DateInput = new Date()): Workspace {
  const base: Partial<Workspace> = record(workspace) ? workspace : { schemaVersion: 2 };
  const projects = Array.isArray(base.projects) ? base.projects : [];
  const priorMarker: Partial<NonNullable<Workspace["sitShowcase"]>> = record(base.sitShowcase) ? base.sitShowcase : {};
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
    ...base, projects: ordered, activeProjectId: activeProjectId!,
    sitShowcase: { ...priorMarker, version, projectId: showcase.id },
  } as Workspace;
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function loadShowcaseWorkspace(storage: Storage | null = browserStorage(), now: DateInput = new Date()): Workspace {
  // Passing null prevents the base loader from accessing a blocked browser getter.
  const loaded = ensureSITShowcase(loadWorkspace(storage ?? null), now);
  // Refresh eligible generated illustrations in every original demo, including
  // inactive projects. The guarded refresh archives old photos and leaves
  // progress, uploaded attachments and saved claim snapshots untouched.
  const projects = loaded.projects.map((project) => refreshSITDemoPhotos(project, now).project);
  const workspace = projects.some((project, index) => project !== loaded.projects[index])
    ? { ...loaded, projects } : loaded;
  try { storage?.setItem(WORKSPACE_STORE, JSON.stringify(workspace)); } catch { /* Keep the showcase usable in memory. */ }
  return workspace;
}
