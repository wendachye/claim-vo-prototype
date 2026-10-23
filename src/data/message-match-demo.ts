import type { Project, Workspace, WhatsAppMessage } from '../types/domain';
import { createAreaSplitDemo } from './area-split-demo.ts';
import { getDrawingMapping, saveAreaMapping } from './drawing-mapping.ts';

/** An independent, unstructured inbox showcase. Suggestions never rewrite worker evidence. */
export function createMessageMatchDemo(workspace: Workspace, now = new Date()): { outcome: 'updated'; workspace: Workspace; project: Project } | { outcome: 'invalid'; error: string; workspace: Workspace } {
  const created = createAreaSplitDemo(workspace, now);
  if (created.outcome === 'invalid') return created;
  let project: Project = { ...created.project, name: 'Message match review (Demo)',
    description: 'Review one correct and one mistaken mock item/area suggestion. A shared area name still needs a worker clarification.',
    contract: { ...created.project.contract, sampleNote: 'Fictional match-review example: original messages stay intact, with independent west/east quantities and explicit processing.' } };
  for (const area of getDrawingMapping(project).areas) {
    const aliases = area.code === 'WEST' ? ['West wall', 'West façade', 'Wall frontage'] : ['East wall', 'East façade', 'Wall frontage'];
    const saved = saveAreaMapping(project, { ...area, areaId: area.id, aliases }, new Date(now.getTime() - 70_000));
    if (saved.outcome === 'invalid') return { outcome: 'invalid', error: saved.error, workspace };
    project = saved.project;
  }
  const areas = getDrawingMapping(project).areas;
  const west = areas.find(area => area.code === 'WEST')!;
  const messages: WhatsAppMessage[] = (project.whatsappMessages || []).map((message, index) => {
    const { areaId, areaProgress, areaMapping, ...original } = message;
    const text = index
      ? 'Block A east wall cladding is a quarter complete in total. Photo attached.'
      : 'Block A west wall cladding is half complete in total. Photo attached.';
    return { ...original, id: `${project.code}-WA-MATCH-${index + 1}`, area: index ? 'East wall' : 'West wall',
      itemId: 'WI-001', text,
      matchSuggestion: { version: 1, origin: 'mock', baselineVersion: project.version,
        fields: { itemId: index ? 'WI-002' : 'WI-001', areaId: west.id, completion: index ? 25 : 50 },
        sourceExcerpt: text,
        reason: index ? 'Mock mistaken suggestion: roofing and WEST were selected for an east-wall cladding update.'
          : 'Mock suggestion: cladding and WEST match the worker’s description.' },
      processingNote: index ? 'Review match: this mock suggestion deliberately names the wrong item and area.'
        : 'Review match: check this correct mock suggestion before adding progress.' };
  });
  const unclearText = 'Block A wall frontage cladding is three quarters complete in total. Photo attached.';
  const ambiguous: WhatsAppMessage = { ...messages[0], id: `${project.code}-WA-MATCH-UNCLEAR`,
    sender: 'Sam · Demo worker', area: 'Wall frontage', completion: 75,
    date: new Date(now.getTime() - 10_000).toISOString(), text: unclearText,
    photo: '/assets/demo-scaffold-safety-adjustment.jpg',
    photoAlt: 'Generated facade-access illustration reused for the match-review demo; not actual cladding evidence',
    matchSuggestion: { version: 1, origin: 'mock', baselineVersion: project.version,
      fields: { itemId: 'WI-001', areaId: west.id, completion: 75 }, sourceExcerpt: unclearText,
      reason: 'Mock suggestion cannot resolve Wall frontage because both WEST and EAST use that name.' },
    processingNote: 'Wall frontage names two areas. Ask the worker which area before adding progress.' };
  project = { ...project, whatsappMessages: [...messages, ambiguous] };
  const { id, name, country, description, contract, code, seed, ...workflow } = project;
  project.seed = structuredClone(workflow);
  return { outcome: 'updated', project, workspace: { ...created.workspace,
    projects: created.workspace.projects.map(entry => entry.id === project.id ? project : entry) } };
}
