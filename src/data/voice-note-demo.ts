import type { Project, Workspace, WhatsAppMessage } from '../types/domain';
import { createAreaSplitDemo } from './area-split-demo.ts';
import { getDrawingMapping, saveAreaMapping } from './drawing-mapping.ts';

/** Independent voice-only examples; no existing browser evidence or claims are copied. */
export function createVoiceNoteDemo(workspace: Workspace, now = new Date()): { outcome: 'updated'; workspace: Workspace; project: Project } | { outcome: 'invalid'; error: string; workspace: Workspace } {
  const created = createAreaSplitDemo(workspace, now);
  if (created.outcome === 'invalid') return created;
  let project: Project = { ...created.project, name: 'Voice-note review (Demo)',
    description: 'Listen to two synthetic demo recordings, review their mock transcripts, then explicitly match and verify a clear total or ask for clarification.',
    contract: { ...created.project.contract, sampleNote: 'Fictional voice-note example: west and east are separate parts of one 1,200 m² contract item. Audio and transcription are simulated.' } };
  for (const area of getDrawingMapping(project).areas) {
    const saved = saveAreaMapping(project, { ...area, areaId: area.id,
      aliases: area.code === 'WEST' ? ['West wall', 'West façade'] : ['East wall', 'East façade'] }, new Date(now.getTime() - 70_000));
    if (saved.outcome === 'invalid') return { outcome: 'invalid', error: saved.error, workspace };
    project = saved.project;
  }
  const messages: WhatsAppMessage[] = (project.whatsappMessages || []).map((message, index) => {
    const { areaId, areaProgress, areaMapping, photo, photoAlt, matchSuggestion, ...original } = message;
    const unclear = index === 1;
    const text = unclear ? 'Block A east wall, another 10%. Total unclear.' : 'Block A west wail cladding is 50% complete in total.';
    return { ...original, id: `${project.code}-WA-VOICE-${unclear ? 'UNCLEAR' : 'CLEAR'}`,
      kind: unclear ? 'clarification' : 'progress', area: unclear ? 'East wall' : 'West wall',
      completion: unclear ? null : 50, completionBasis: unclear ? 'incremental' : 'cumulative',
      text, originalTranscript: text,
      audio: { version: 1, asset: unclear ? '/assets/demo-voice-unclear.wav' : '/assets/demo-voice-clear.wav',
        mimeType: 'audio/wav', durationSeconds: unclear ? 7.90 : 6.22, demo: true, clarity: unclear ? 'unclear' : 'clear' },
      processingNote: unclear ? 'Synthetic demo voice note. The cumulative total is missing; ask the worker before adding progress.'
        : 'Synthetic demo voice note. Review the mock transcript, then confirm the work and area match before adding progress.' };
  });
  project = { ...project, whatsappMessages: messages, voiceTranscriptReviews: [], messageMatchReviews: [], reports: [], claimDrafts: [], claimTracking: [], messageClarifications: [] };
  const { id, name, country, description, contract, code, seed, ...workflow } = project;
  project.seed = structuredClone(workflow);
  return { outcome: 'updated', project, workspace: { ...created.workspace,
    projects: created.workspace.projects.map(entry => entry.id === project.id ? project : entry) } };
}
