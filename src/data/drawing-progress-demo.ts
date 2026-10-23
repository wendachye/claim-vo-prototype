import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput, Workspace } from '../types/domain';
import { createDemoProject } from './demo-project.ts';
import { processWhatsAppMessage } from './whatsapp.ts';
import { updateVOReview } from './vo.ts';
import { DEMO_DRAWING_FILENAME, getDrawingMapping, installDrawing, saveAreaMapping, snapshotMappedArea } from './drawing-mapping.ts';

interface DemoReport extends SiteReport { sourceMessageId: string; sender: string; date: string; message: string; photo: string }

const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const title = 'Drawing Progress Showcase (Demo)';
const photoAlt = 'Generated construction illustration used as a demo site photo; not project evidence.';

// Explicit opt-in showcase data. This always opens a new, wholly fictional project.
// No progress, baseline, evidence or claim belonging to another project is copied.
export function createDrawingProgressDemo(workspace: Workspace, now: DateInput = new Date()) {
  const invalid = (error: string) => ({ workspace, outcome: 'invalid' as const, error });
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
  const at = (minutesAgo: number) => new Date(time - minutesAgo * 60_000).toISOString();
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
    project = saveAreaMapping(project, { ...area, areaId: area!.id, drawingId: mapping.drawing!.id, workItemIds: [itemId] }, baselineAt).project;
  }
  const reportFor = (sequence: string, itemId: string, areaCode: string, completion: number, status: string, minutesAgo: number, verifiedMinutesAgo: number | null = null): DemoReport => {
    const item = project.items.find((entry) => entry.id === itemId);
    const area = getDrawingMapping(project).areas.find((entry) => entry.code === areaCode);
    return {
      id: `${project.id}-MAP-REPORT-${sequence}`, projectId: project.id, projectCode: project.code,
      itemId, sourceMessageId: `${project.id}-MAP-WA-${sequence}`, channel: 'whatsapp-mock',
      area: `Area ${areaCode}`, areaMapping: snapshotMappedArea(area), location: item!.location,
      sender: 'Warehouse worker (demo)', date: at(minutesAgo), completion, completionBasis: 'cumulative', status,
      message: `${project.code} | ${item!.location} | Area ${areaCode} | ${itemId}\nCOMPLETE=${completion}% TOTAL\nFictional drawing progress showcase update.`,
      photo: '/assets/demo-scaffold.jpg', photoAlt,
      demo: true, origin: 'simulated', vo: false,
      note: 'Seeded fictional physical progress only. No claim amount or external approval is created.',
      ...(status === 'verified' ? { approvedCompletion: completion, verifiedBy: 'Warehouse supervisor (demo)', verifiedAt: at(verifiedMinutesAgo!) } : {}),
    };
  };
  const seedReports = [
    reportFor('001', 'WI-001', 'A1', 100, 'verified', 45, 40),
    reportFor('002', 'WI-002', 'A2', 40, 'verified', 40, 35),
    reportFor('003', 'WI-002', 'A2', 65, 'pending', 15),
    reportFor('004', 'WI-004', 'B2', 100, 'pending', 10),
  ];
  project.reports = seedReports;
  const totals: Record<string, [number, number]> = { 'WI-001': [100, 100], 'WI-002': [65, 40], 'WI-003': [0, 0], 'WI-004': [100, 0] };
  project.items = project.items.map((item) => ({ ...item, reported: totals[item.id]?.[0] ?? 0, verified: totals[item.id]?.[1] ?? 0 }));
  project.locked = true;
  project.lockedAt = baselineAt;
  project.baselines = [{ version: project.version, items: baselineItems, date: baselineAt, demo: true }];
  const messageBase = {
    projectId: project.id, projectCode: project.code,
    senderRole: 'Site worker · demo', completionBasis: 'cumulative',
    processingNote: 'Fictional showcase message with a prefilled mock interpretation. No AI or WhatsApp service is connected.',
    photoAlt,
  };
  project.whatsappMessages = [
    ...seedReports.map((report) => ({
      ...messageBase, id: report.sourceMessageId, kind: 'progress', status: 'processed', reportId: report.id,
      itemId: report.itemId, area: report.area, location: report.location,
      sender: report.sender, date: report.date, processedAt: report.date,
      completion: report.completion, text: report.message, photo: report.photo,
    })),
    {
      ...messageBase, id: `${project.id}-MAP-WA-005`, kind: 'vo', status: 'new',
      itemId: null, area: 'Area A2', location: 'Block A', completion: null, completionBasis: 'unclear',
      sender: 'Warehouse worker (demo)', date: at(5), photo: '/assets/demo-platform.jpg',
      text: `${project.code} | Block A | Area A2\nSupervisor requested additional roof-edge weather protection outside the existing schedule. Please check whether this is extra work.\nFictional showcase message; demo photo attached.`,
      processingNote: 'Mock possible extra work. QS must review the scope and instruction; no price or claim is approved.',
    },
    {
      ...messageBase, id: `${project.id}-MAP-WA-006`, kind: 'clarification', status: 'new',
      itemId: null, area: 'Area B1', location: 'Block B', completion: 50, completionBasis: 'unclear',
      sender: 'Warehouse worker (demo)', date: at(3), photo: '/assets/demo-scaffold.jpg',
      text: `${project.code} | Block B | Area B1 done 50%.\nFictional showcase message; demo photo attached.`,
      processingNote: 'Work item and completion basis are unclear. Ask for the item reference and total completion before changing progress.',
    },
    {
      ...messageBase, id: `${project.id}-MAP-WA-007`, kind: 'vo', status: 'new',
      itemId: null, area: 'Area B2', location: 'Block B', completion: null, completionBasis: 'unclear',
      sender: 'Warehouse worker (demo)', date: at(30), photo: '/assets/demo-platform.jpg',
      text: `${project.code} | Block B | Area B2\nSupervisor requested additional loading-bay protection beyond the existing schedule. Please review the instruction.\nFictional showcase message; demo photo attached.`,
      processingNote: 'Fictional additional work for demonstrating a locally recorded demo approval.',
    },
    {
      ...messageBase, id: `${project.id}-MAP-WA-008`, kind: 'vo', status: 'new',
      itemId: null, area: 'Area A1', location: 'Block A', completion: null, completionBasis: 'unclear',
      sender: 'Warehouse worker (demo)', date: at(35), photo: '/assets/demo-scaffold.jpg',
      text: `${project.code} | Block A | Area A1\nPlease check whether the final cladding touch-up is extra work or included in the contract.\nFictional showcase message; demo photo attached.`,
      processingNote: 'Fictional scope query for demonstrating a rejected extra-work review.',
    },
  ];
  project.voReviews = [];
  project.claimDrafts = [];
  project.history = [{
    id: `${project.id}-MAP-SHOWCASE`, action: 'Drawing completion demo created',
    detail: 'Fictional plan with linked work items, a confirmed mock baseline and seeded progress. Reported and verified totals are separate.',
    date: new Date(time).toISOString(), actor: 'Alex Tan · Demo reviewer',
  }];
  // Use the same validation/transitions as the UI. Only these new fictional
  // event timestamps/IDs are made deterministic for the supplied showcase date.
  const processDemoVO = (sequence: string, minutesAgo: number) => {
    const messageId = `${project.id}-MAP-WA-${sequence}`;
    const previousHistory = new Set(project.history.map((entry) => entry.id));
    const result = processWhatsAppMessage(project, messageId);
    if (result.outcome !== 'processed') return null;
    project = {
      ...result.project,
      whatsappMessages: (result.project.whatsappMessages || []).map((message) => message.id === messageId ? { ...message, processedAt: at(minutesAgo) } : message),
      history: result.project.history.map((entry) => previousHistory.has(entry.id) ? entry : { ...entry, date: at(minutesAgo) }),
    };
    return result.reportId;
  };
  const reviewDemoVO = (caseId: string, action: string, values: Parameters<typeof updateVOReview>[3], minutesAgo: number) => {
    const previousHistory = new Set(project.history.map((entry) => entry.id));
    const result = updateVOReview(project, caseId, action, values);
    if (result.outcome !== 'updated') return false;
    const date = at(minutesAgo), eventId = `${caseId}-${action}-DEMO`;
    project = {
      ...result.project,
      voReviews: result.project.voReviews.map((review) => review.id !== caseId ? review : {
        ...review, updatedAt: date,
        history: review.history.map((event, eventIndex) => eventIndex === review.history.length - 1 ? { ...event, id: eventId, date } : event),
      }),
      history: result.project.history.map((entry) => previousHistory.has(entry.id) ? entry : { ...entry, id: eventId, date }),
    };
    return true;
  };
  const flaggedId = processDemoVO('005', 4);
  const approvedId = processDemoVO('007', 29);
  const rejectedId = processDemoVO('008', 34);
  if (!flaggedId || !approvedId || !rejectedId) return invalid('The fictional extra-work showcase could not be created.');
  if (!reviewDemoVO(approvedId, 'submit', {
    title: 'Additional loading-bay protection (demo)',
    scopeAssessment: 'Fictional QS assessment: additional protection is outside the existing loading-bay installation scope.',
    instructionReference: `${project.code}-DEMO-INSTR-007`, proposedValue: 2500,
    relatedItemId: 'WI-004', reviewNote: 'Fictional QS review for the prototype. No instruction was submitted externally.',
  }, 25) || !reviewDemoVO(approvedId, 'approve', {
    approvedValue: 2500, approvalReference: `${project.code}-DEMO-APPROVAL-007`,
    approver: 'Fictional demo approver', reviewNote: 'Locally recorded demonstration approval only. No payment or claim was created.',
  }, 20) || !reviewDemoVO(rejectedId, 'reject', {
    title: 'Final cladding touch-up (demo)', relatedItemId: 'WI-001',
    scopeAssessment: 'Fictional QS assessment: this touch-up is already included in the existing cladding scope.',
    reviewNote: 'Demo rejection: this work is included in the contract and is not an additional variation.',
  }, 30)) return invalid('The fictional extra-work review states could not be created.');
  project.history.sort((first, second) => Date.parse(second.date) - Date.parse(first.date));
  project.drawingProgressDemo = true;
  project.contract = {
    ...project.contract,
    sampleNote: 'Fictional drawing showcase with a confirmed mock work list, seeded progress and flagged, approved and rejected extra-work examples.',
    demoNotice: 'Fully fictional drawing and progress showcase. No real site verification, claim approval or live service is connected.',
  };
  project.seed = clone({ sourceItems: project.sourceItems, items: project.items, reports: project.reports,
    history: project.history, baselines: project.baselines, voReviews: project.voReviews,
    claimDrafts: project.claimDrafts, locked: project.locked, version: project.version, whatsappMessages: project.whatsappMessages });
  return { outcome: 'created' as const, project, workspace: { ...workspace, activeProjectId: project.id, projects: [...workspace.projects, project] } };
}
