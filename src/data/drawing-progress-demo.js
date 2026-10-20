import { createDemoProject } from './demo-project.js';
import { DEMO_DRAWING_FILENAME, getDrawingMapping, installDrawing, saveAreaMapping, snapshotMappedArea } from './drawing-mapping.js';

const clone = (value) => structuredClone(value);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const title = 'Drawing Progress Showcase (Demo)';
const photoAlt = 'Generated construction illustration used as a demo site photo; not project evidence.';

// Explicit opt-in showcase data. This always opens a new, wholly fictional project.
// No progress, baseline, evidence or claim belonging to another project is copied.
export function createDrawingProgressDemo(workspace, now = new Date()) {
  const invalid = (error) => ({ workspace, outcome: 'invalid', error });
  let time;
  try { time = new Date(now).getTime(); } catch { return invalid('Choose a valid demo date.'); }
  if (!record(workspace) || !Array.isArray(workspace.projects)
    || workspace.projects.some((project) => !record(project) || typeof project.id !== 'string' || typeof project.code !== 'string')
    || !Number.isFinite(time)) return invalid('Open a valid project workspace before starting the completion demo.');
  const codes = new Set(workspace.projects.flatMap((project) => [project.id.toUpperCase(), project.code.toUpperCase()]));
  const names = new Set(workspace.projects.map((project) => String(project.name || '').trim().toLowerCase()));
  let index = 1, code, name;
  do {
    code = `MAP${String(index).padStart(2, '0')}`;
    name = index === 1 ? title : `${title} ${index}`;
    index += 1;
  } while (codes.has(code) || names.has(name.toLowerCase()));
  const at = (minutesAgo) => new Date(time - minutesAgo * 60_000).toISOString();
  const baselineAt = at(60);
  let project = createDemoProject({
    code, name, country: 'Singapore', subcontractor: 'Fictional installation team (demo)',
    description: 'Fictional drawing completion showcase: completed, in-progress and not-started work, with separate reported and verified totals.',
  }, new Date(time));
  project.items = project.items.map((item) => {
    const next = { ...item, needsReview: false, reviewedAt: baselineAt };
    delete next.rawExtractedQuantity;
    return next;
  });
  const baselineItems = clone(project.items);
  project = installDrawing(project, { inputKind: 'sample', fileName: DEMO_DRAWING_FILENAME }, baselineAt).project;
  for (const [areaCode, itemId] of [['A1', 'WI-001'], ['A2', 'WI-002'], ['B1', 'WI-003'], ['B2', 'WI-004']]) {
    const mapping = getDrawingMapping(project);
    const area = mapping.areas.find((entry) => entry.code === areaCode);
    project = saveAreaMapping(project, { ...area, areaId: area.id, drawingId: mapping.drawing.id, workItemIds: [itemId] }, baselineAt).project;
  }
  const reportFor = (sequence, itemId, areaCode, completion, status, minutesAgo, verifiedMinutesAgo = null) => {
    const item = project.items.find((entry) => entry.id === itemId);
    const area = getDrawingMapping(project).areas.find((entry) => entry.code === areaCode);
    return {
      id: `${project.id}-MAP-REPORT-${sequence}`, projectId: project.id, projectCode: project.code,
      itemId, area: `Area ${areaCode}`, areaMapping: snapshotMappedArea(area), location: item.location,
      sender: 'Warehouse worker (demo)', date: at(minutesAgo), completion, completionBasis: 'cumulative', status,
      message: `${project.code} | ${item.location} | Area ${areaCode} | ${itemId}\nCOMPLETE=${completion}% TOTAL\nFictional drawing progress showcase update.`,
      photo: '/assets/demo-scaffold.jpg', photoAlt,
      demo: true, origin: 'simulated', vo: false,
      note: 'Seeded fictional physical progress only. No claim amount or external approval is created.',
      ...(status === 'verified' ? { approvedCompletion: completion, verifiedBy: 'Warehouse supervisor (demo)', verifiedAt: at(verifiedMinutesAgo) } : {}),
    };
  };
  project.reports = [
    reportFor('001', 'WI-001', 'A1', 100, 'verified', 45, 40),
    reportFor('002', 'WI-002', 'A2', 40, 'verified', 40, 35),
    reportFor('003', 'WI-002', 'A2', 65, 'pending', 15),
    reportFor('004', 'WI-004', 'B2', 100, 'pending', 10),
  ];
  const totals = { 'WI-001': [100, 100], 'WI-002': [65, 40], 'WI-003': [0, 0], 'WI-004': [100, 0] };
  project.items = project.items.map((item) => ({ ...item, reported: totals[item.id]?.[0] ?? 0, verified: totals[item.id]?.[1] ?? 0 }));
  project.locked = true;
  project.lockedAt = baselineAt;
  project.baselines = [{ version: project.version, items: baselineItems, date: baselineAt, demo: true }];
  project.whatsappMessages = [];
  project.voReviews = [];
  project.claimDrafts = [];
  project.history = [{
    id: `${project.id}-MAP-SHOWCASE`, action: 'Drawing completion demo created',
    detail: 'Fictional plan with linked work items, a confirmed mock baseline and seeded progress. Reported and verified totals are separate.',
    date: new Date(time).toISOString(), actor: 'Alex Tan · Demo reviewer',
  }];
  project.drawingProgressDemo = true;
  project.contract = {
    ...project.contract,
    sampleNote: 'Fictional drawing showcase with a confirmed mock work list and seeded progress.',
    demoNotice: 'Fully fictional drawing and progress showcase. No real site verification, claim approval or live service is connected.',
  };
  project.seed = clone(Object.fromEntries([
    'sourceItems', 'items', 'reports', 'history', 'baselines', 'voReviews', 'claimDrafts', 'locked', 'version', 'whatsappMessages',
  ].map((field) => [field, project[field]])));
  return { outcome: 'created', project, workspace: { ...workspace, activeProjectId: project.id, projects: [...workspace.projects, project] } };
}
