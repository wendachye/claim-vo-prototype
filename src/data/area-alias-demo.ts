import type { Project, Workspace, WhatsAppMessage } from '../types/domain';
import { createAreaSplitDemo } from './area-split-demo.ts';
import { getDrawingMapping, saveAreaMapping } from './drawing-mapping.ts';

/** Separate inbox example: names match only after an explicit processing action. */
export function createAreaAliasDemo(workspace: Workspace, now = new Date()): { outcome: 'updated'; workspace: Workspace; project: Project } | { outcome: 'invalid'; error: string; workspace: Workspace } {
  const created = createAreaSplitDemo(workspace, now);
  if (created.outcome === 'invalid') return created;
  let project: Project = { ...created.project, name: 'Area name matching (Demo)',
    description: 'West and east wall updates use alternate area names. A shared name needs clarification before any progress changes.',
    contract: { ...created.project.contract, sampleNote: 'Fictional name-matching example: west and east quantities remain separate parts of one 1,200 m² contract item.' } };
  for (const area of getDrawingMapping(project).areas) {
    const aliases = area.code === 'WEST' ? ['West wall', 'West façade', 'Wall frontage'] : ['East wall', 'East façade', 'Wall frontage'];
    const saved = saveAreaMapping(project, { ...area, areaId: area.id, aliases }, new Date(now.getTime() - 70_000));
    if (saved.outcome === 'invalid') return { outcome: 'invalid', error: saved.error, workspace };
    project = saved.project;
  }
  const messages: WhatsAppMessage[] = (project.whatsappMessages || []).map((message, index) => {
    const { areaId, areaProgress, areaMapping, ...original } = message;
    const name = index ? 'East wall' : 'West façade';
    const completion = index ? 25 : 50;
    return { ...original, area: name,
      text: `${project.code} | Block A | Area ${name} | WI-001 | COMPLETE=${completion}% TOTAL\nCladding in this area is ${completion}% complete. This is the cumulative total for the ${index ? 480 : 720} m² area.`,
      processingNote: 'Mock alternate-name match. Review the saved area, then process and verify separately.' };
  });
  const shared: WhatsAppMessage = { ...messages[0], id: `${project.code}-WA-ALIAS-UNCLEAR`,
    sender: 'Sam · Demo worker', area: 'Wall frontage', completion: 75,
    date: new Date(now.getTime() - 10_000).toISOString(),
    text: `${project.code} | Block A | Area Wall frontage | WI-001 | COMPLETE=75% TOTAL\nWall frontage is 75% complete.`,
    processingNote: 'Wall frontage names both WEST and EAST. Ask which area before processing this mock update.' };
  project = { ...project, whatsappMessages: [...messages, shared] };
  const { id, name, country, description, contract, code, seed, ...workflow } = project;
  project.seed = structuredClone(workflow);
  return { outcome: 'updated', project, workspace: { ...created.workspace,
    projects: created.workspace.projects.map(entry => entry.id === project.id ? project : entry) } };
}
