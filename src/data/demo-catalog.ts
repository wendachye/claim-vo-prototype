import type { DemoKind, Project, ProjectDemoKind, WhatsAppMessage, Workspace } from '../types/domain';
import { getShowcaseProjectId, isSITShowcaseProject } from './showcase-workspace.ts';

export type { DemoKind, ProjectDemoKind } from '../types/domain';
export interface ProjectCatalog {
  showcase: Project | null;
  projects: Project[];
  examples: Project[];
}

const kinds = new Set<ProjectDemoKind>([
  'drawing-progress', 'area-split', 'area-alias', 'message-match', 'voice-note', 'claim-examples',
  'contract-scenario', 'campus', 'warehouse', 'sample-project',
]);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const demoMessage = (message: WhatsAppMessage) => message.demo === true && message.origin === 'simulated';

function originalMessages(project: Project): WhatsAppMessage[] {
  // The original seed remains useful after a message is processed, clarified or
  // removed from the visible inbox. Never rewrite those histories to classify it.
  return [...(project.seed?.whatsappMessages || []), ...(project.whatsappMessages || [])];
}

/** Fixture metadata and immutable source signatures, never a project's display name. */
export function getProjectDemoKind(project: Project): ProjectDemoKind | null {
  if (typeof project.demoKind === 'string' && kinds.has(project.demoKind)) return project.demoKind;
  if (project.providedContractDemo === true) return 'contract-scenario';
  if (project.claimExamplesDemo === true) return 'claim-examples';
  if (project.drawingProgressDemo === true) return 'drawing-progress';
  if (project.areaSplitDemo === true) {
    const messages = originalMessages(project).filter(demoMessage);
    // The specialized demos were built from the area split fixture and inherited
    // its flag. Check their unique original records before the common flag.
    if (messages.some(message => /-WA-VOICE-(?:CLEAR|UNCLEAR)$/.test(message.id)
      && typeof message.originalTranscript === 'string'
      && record(message.audio) && message.audio.demo === true
      && (message.audio.asset === '/assets/demo-voice-clear.wav' || message.audio.asset === '/assets/demo-voice-unclear.wav'))) return 'voice-note';
    if (messages.some(message => /-WA-MATCH-(?:1|2|UNCLEAR)$/.test(message.id)
      && message.matchSuggestion?.origin === 'mock' && message.matchSuggestion.version === 1)) return 'message-match';
    if (messages.some(message => /-WA-ALIAS-UNCLEAR$/.test(message.id)
      && message.area === 'Wall frontage' && message.completionBasis === 'cumulative')) return 'area-alias';
    return 'area-split';
  }
  // Before the public fictional campus fixture, SIT01 held this exact supplied
  // schedule and immutable demonstration seed. Recognize that reserved legacy
  // fixture by source identity and two source rows, even if its title changed.
  const originalSIT = 'China Con (LOA S.I.T Project).pdf';
  const seedItems = project.seed?.sourceItems;
  if (project.id === 'SIT01' && project.contract?.demo === true
    && project.contract.sourceKind === 'provided'
    && project.contract.reference === 'CCSC/SIT/SC/21.183'
    && project.contract.sourceFilename === originalSIT && project.contract.sourceFile === originalSIT
    && project.contract.sourcePage === 27 && project.contract.sourcePageCount === 115
    && Array.isArray(seedItems) && seedItems.length === 18
    && seedItems.some(item => item.id === 'WI-001' && item.ref === 'A.1 / 1a'
      && item.sourcePage === 27 && item.quantity === 2088 && item.rate === 13.5 && item.progressIsDemo === true)
    && seedItems.some(item => item.id === 'WI-002' && item.ref === 'A.1 / 1b'
      && item.sourcePage === 27 && item.quantity === 1821.6 && item.rate === 13.5 && item.progressIsDemo === true)) return 'contract-scenario';
  // These are the two fixed fictional fixtures created by seedWorkspace. Their
  // known source identity is required as well as the migration-compatible ID.
  if (project.id === 'SIT01' && project.contract?.sourceKind === 'illustrative'
    && project.contract?.sourceFilename === 'Campus Scaffold (Demo) — illustrative schedule'
    && project.seed?.sourceItems?.some(item => item.id === 'WI-001' && item.progressIsDemo === true)) return 'campus';
  if (project.id === 'WH02' && project.contract?.sourceKind === 'illustrative'
    && project.contract?.reference === 'WH02-DEMO-SCHEDULE'
    && project.seed?.sourceItems?.some(item => item.id === 'WI-001' && item.progressIsDemo === true)) return 'warehouse';
  const imported = project.contract?.demoImport;
  if (record(imported) && ['sample', 'upload'].includes(String(imported.inputKind))
    && typeof imported.fileName === 'string' && /\.pdf$/i.test(imported.fileName)
    && typeof imported.importedAt === 'string' && Number.isFinite(Date.parse(imported.importedAt))
    && project.contract?.demo === true && project.contract?.sourceKind === 'illustrative'
    && project.contract?.sourceFile === '/samples/warehouse-contract-demo.pdf'
    && project.contract?.reference === 'WAREHOUSE-DEMO-SCHEDULE') return 'sample-project';
  // An explicitly chosen fictional new-project template remains an example;
  // ordinary empty registers and uploaded contracts have no such marker.
  if (project.demoTemplate === 'warehouse') return 'sample-project';
  return null;
}

/** A display grouping only: no project, source, saved claim or order is mutated. */
export function getProjectCatalog(projects: Project[], showcaseProjectId?: string | null): ProjectCatalog {
  const showcase = projects.find(project => project.id === showcaseProjectId && isSITShowcaseProject(project))
    || projects.find(isSITShowcaseProject) || null;
  const regular: Project[] = [], examples: Project[] = [];
  for (const project of projects) {
    if (project === showcase) continue;
    (getProjectDemoKind(project) ? examples : regular).push(project);
  }
  return { showcase, projects: regular, examples };
}

export function getProjectGroups(workspace: Workspace): ProjectCatalog {
  return getProjectCatalog(workspace.projects, getShowcaseProjectId(workspace));
}

/** Reopen a matching fixture without resetting, merging or duplicating it. */
export function findExistingDemo(workspace: Workspace, kind: DemoKind): Project | null {
  const candidates = workspace.projects.filter(project => getProjectDemoKind(project) === kind);
  // Respect the currently selected example when old browsers already contain
  // duplicates. Otherwise the first stored example is stable across reloads.
  return candidates.find(project => project.id === workspace.activeProjectId) || candidates[0] || null;
}
