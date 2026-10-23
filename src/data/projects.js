import { contract, initialItems, initialReports } from './contract.js';
import { getWhatsAppMessages, seedWhatsAppMessages } from './whatsapp.js';
import { normalizeVOReviews } from './vo.js';
import { normalizeClaimDrafts } from './claims.js';
import { normalizeClaimTracking } from './claim-tracking.js';
import { normalizeMessageClarifications } from './whatsapp-clarification.js';

export const WORKSPACE_STORE = 'claim-vo-frontend-v2';
export const LEGACY_STORE = 'claim-vo-frontend-v1';

const clone = (value) => structuredClone(value);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const projectCode = (value) => text(value).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
const records = (value) => Array.isArray(value) && value.every(record);
const identifiedRecords = (value) => records(value)
  && value.every((entry) => typeof entry.id === 'string' && entry.id.trim() !== '')
  && new Set(value.map((entry) => entry.id)).size === value.length;

function validWorkflow(value) {
  return record(value)
    && identifiedRecords(value.items)
    && identifiedRecords(value.reports)
    && records(value.history)
    && (value.baselines === undefined || records(value.baselines))
    && (value.locked === undefined || typeof value.locked === 'boolean')
    && (value.version === undefined || (Number.isInteger(value.version) && value.version > 0));
}

function initialWorkflow(sourceItems, reports = []) {
  return {
    sourceItems: clone(sourceItems),
    items: clone(sourceItems),
    reports: clone(reports),
    locked: false,
    version: 1,
    history: [],
    baselines: [],
    voReviews: [],
    claimDrafts: [],
    claimTracking: [],
    messageClarifications: [],
  };
}

function seededProject(metadata, items, reports = []) {
  const workflow = initialWorkflow(items, reports);
  workflow.whatsappMessages = seedWhatsAppMessages({ ...metadata, ...workflow });
  return { ...metadata, ...workflow, seed: clone(workflow) };
}

function sitProject() {
  return seededProject({
    id: 'SIT01',
    code: 'SIT01',
    name: 'Campus Scaffold (Demo)',
    country: 'Singapore',
    description: 'Fictional campus scaffold schedule with simulated extraction and site updates.',
    contract: {
      ...clone(contract),
      sourceKind: 'illustrative',
      sourceFilename: 'Campus Scaffold (Demo) — illustrative schedule',
      sourcePageCount: 1,
      scope: 'Illustrative scaffold access · W3 & W5',
      dateLabel: 'Illustrative schedule · 2026',
      sampleNote: '18 invented schedule rows; all values and site reports are fictional.',
      sourceSummary: 'Generated campus demonstration schedule; no actual contract or drawing.',
      hasDrawing: false,
    },
  }, initialItems, initialReports);
}

// This warehouse schedule is also entirely fictional.
// Deliberately reuse local item IDs to exercise project-scoped state updates.
function warehouseProject() {
  const row = (values) => ({
    startDate: null,
    durationMonths: null,
    needsReview: false,
    reported: 0,
    verified: 0,
    sourcePage: 1,
    quantityBasis: 'illustrative provisional quantity',
    progressIsDemo: true,
    ...values,
  });
  const items = [
    row({
      id: 'WI-001', ref: 'A / 01', section: 'A · External envelope',
      subsection: 'Block A', description: 'Block A — external wall cladding',
      location: 'Block A', unit: 'm²', quantity: 1200, rate: 28, amount: 33600,
      pricingType: 'measured', reported: 40, verified: 25, demoArea: 'Area A1',
    }),
    row({
      id: 'WI-002', ref: 'A / 02', section: 'A · External envelope',
      subsection: 'Block A', description: 'Block A — roof sheeting',
      location: 'Block A', unit: 'm²', quantity: 900, rate: 42, amount: 37800,
      pricingType: 'measured', reported: 60, verified: 60, demoArea: 'Area A2',
    }),
    row({
      id: 'WI-003', ref: 'B / 01', section: 'B · Internal works',
      subsection: 'Block B', description: 'Block B — floor finish',
      location: 'Block B', unit: 'm²', quantity: 800, rate: 65, amount: 52000,
      pricingType: 'measured', reported: 20, verified: 0, demoArea: 'Area B1',
    }),
    row({
      id: 'WI-004', ref: 'B / 02', section: 'B · Internal works',
      subsection: 'Block B', description: 'Block B — loading-bay door installation',
      location: 'Block B', unit: 'set', quantity: 4, rate: 3200, amount: 12800,
      pricingType: 'measured', demoArea: 'Area B2',
    }),
    row({
      id: 'WI-005', ref: 'C / 01', section: 'C · Supporting works',
      subsection: 'Included scope', description: 'Temporary access protection',
      location: 'Block A / Block B', unit: 'lot', quantity: 1, rate: null, amount: null,
      pricingType: 'included', sourceNote: 'Illustrative Included item; no separate charge.',
    }),
    row({
      id: 'WI-006', ref: 'C / 02', section: 'C · Supporting works',
      subsection: 'Rate-only labour', description: 'Installation crew — additional authorised hours',
      location: 'Block A / Block B', unit: 'hr', quantity: 1, rate: 35, amount: null,
      pricingType: 'rateOnly', quantityBasis: 'rate reference, not approved work',
      sourceNote: 'Illustrative rate; authorised actual hours and billing eligibility need review.',
    }),
  ];
  const reports = [
    {
      id: 'WH02-DEMO-001', itemId: 'WI-001', area: 'Area A1', location: 'Block A',
      sender: 'Warehouse worker 01 (demo)', date: '2026-10-15T10:10:00+08:00',
      completion: 40, completionBasis: 'cumulative', status: 'pending',
      message: 'WH02 | BLOCK-A | AREA-A1 | WI-001 | COMPLETE=40% TOTAL',
      vo: false, demo: true, origin: 'simulated',
      note: 'Fictional warehouse update; verified completion remains 25% until reviewed.',
    },
    {
      id: 'WH02-DEMO-002', itemId: 'WI-002', area: 'Area A2', location: 'Block A',
      sender: 'Warehouse worker 02 (demo)', date: '2026-10-15T09:20:00+08:00',
      completion: 60, completionBasis: 'cumulative', status: 'verified',
      message: 'WH02 Block A roof sheeting is 60% complete in total.',
      vo: false, demo: true, origin: 'simulated', verifiedBy: 'Warehouse supervisor (demo)',
      note: 'Fictional physical verification; no claim valuation is implied.',
    },
    {
      id: 'WH02-DEMO-003', itemId: 'WI-003', area: 'Area B1', location: 'Block B',
      sender: 'Warehouse worker 03 (demo)', date: '2026-10-15T10:30:00+08:00',
      completion: 20, completionBasis: 'cumulative', status: 'pending',
      message: 'WH02 Block B Area B1 floor finish is 20% complete to date.',
      vo: false, demo: true, origin: 'simulated',
      note: 'Fictional report for the warehouse project only.',
    },
  ];
  return seededProject({
    id: 'WH02',
    code: 'WH02',
    name: 'Warehouse Extension (Demo)',
    country: 'Singapore',
    description: 'Fully fictional project demonstrating a separate contract and progress workflow.',
    contract: {
      id: 'WH02',
      name: 'Warehouse Extension (Demo)',
      projectName: 'Warehouse Extension (Demo)',
      reference: 'WH02-DEMO-SCHEDULE',
      date: null,
      dateLabel: 'Illustrative schedule · demo',
      mainContractor: 'Fictional warehouse contractor (demo)',
      subcontractor: 'Fictional installation team (demo)',
      currency: 'SGD',
      totalAmount: 136200,
      valuationBasis: 'Illustrative quantity × rate schedule; no signed contract',
      sourceKind: 'illustrative',
      sourceFilename: 'Warehouse Extension (Demo) — generated illustrative schedule',
      sourceFile: null,
      sourcePage: 1,
      sourcePageCount: 1,
      scope: 'Cladding, roofing, floor and door works · Blocks A & B',
      sampleNote: '6 invented rows; no uploaded contract or source drawing.',
      sourceSummary: 'Generated demonstration schedule; all parties, quantities and reports are fictional.',
      hasDrawing: false,
      representativeSubset: false,
      demo: true,
      demoNotice: 'Fully fictional project. No real contract or live WhatsApp activity.',
      gracePeriodMonths: null,
      durationNote: null,
      pricingNote: 'Illustrative values only. Included and Rate Only rows are not separate baseline amounts.',
      sourceSectionTotals: [
        { id: 'A', name: 'External envelope', amount: 71400 },
        { id: 'B', name: 'Internal works', amount: 64800 },
      ],
      aliases: { A: ['A', 'Block A', 'BLOCK-A'], B: ['B', 'Block B', 'BLOCK-B'] },
      demoAreas: [
        { id: 'AREA-A1', name: 'Area A1', location: 'Block A', itemIds: ['WI-001'], demo: true },
        { id: 'AREA-A2', name: 'Area A2', location: 'Block A', itemIds: ['WI-002'], demo: true },
        { id: 'AREA-B1', name: 'Area B1', location: 'Block B', itemIds: ['WI-003'], demo: true },
        { id: 'AREA-B2', name: 'Area B2', location: 'Block B', itemIds: ['WI-004'], demo: true },
      ],
    },
  }, items, reports);
}

export function createProject({ name, code, country = '', subcontractor = '', description = '' } = {}) {
  const cleanName = text(name);
  const cleanCode = projectCode(code);
  if (!cleanName || !cleanCode || !/[A-Z0-9]/.test(cleanCode)) {
    throw new TypeError('A project name and an alphanumeric project code are required.');
  }
  const cleanDescription = text(description);
  const cleanCountry = text(country);
  return seededProject({
    id: cleanCode, // The caller validates code uniqueness within the workspace.
    code: cleanCode,
    name: cleanName,
    country: cleanCountry,
    description: cleanDescription,
    contract: {
      id: cleanCode,
      name: cleanName,
      projectName: cleanName,
      reference: null,
      date: null,
      dateLabel: null,
      mainContractor: null,
      subcontractor: text(subcontractor) || null,
      currency: cleanCountry.toLowerCase() === 'malaysia' ? 'MYR'
        : cleanCountry.toLowerCase() === 'singapore' ? 'SGD' : null,
      totalAmount: null,
      valuationBasis: null,
      sourceKind: 'none',
      sourceFilename: null,
      sourceFile: null,
      sourcePage: null,
      sourcePageCount: null,
      scope: cleanDescription || null,
      sampleNote: 'No contract rows have been added.',
      sourceSummary: 'No contract uploaded.',
      hasDrawing: false,
      representativeSubset: false,
      demo: false,
      gracePeriodMonths: null,
      durationNote: null,
      pricingNote: null,
      sourceSectionTotals: [],
      aliases: {},
      demoAreas: [],
    },
  }, []);
}

export function seedWorkspace() {
  return {
    schemaVersion: 2,
    activeProjectId: 'SIT01',
    projects: [sitProject(), warehouseProject()],
  };
}

function validProject(project) {
  return validWorkflow(project)
    && text(project.id) !== ''
    && projectCode(project.code) !== ''
    && text(project.name) !== ''
    && record(project.contract)
    && (project.sourceItems === undefined || identifiedRecords(project.sourceItems));
}

function normalizeProject(project) {
  const base = project.id === 'SIT01' ? sitProject()
    : project.id === 'WH02' ? warehouseProject()
      : createProject(project);
  const seed = validWorkflow(project.seed) && identifiedRecords(project.seed.sourceItems)
    ? clone(project.seed) : clone(base.seed);
  seed.whatsappMessages = clone(getWhatsAppMessages({
    ...base, ...project, ...seed, whatsappMessages: seed.whatsappMessages,
  }));
  seed.voReviews = normalizeVOReviews({ ...project, ...seed, voReviews: seed.voReviews });
  seed.claimDrafts = normalizeClaimDrafts({ ...project, ...seed, claimDrafts: seed.claimDrafts });
  seed.messageClarifications = normalizeMessageClarifications({ ...project, ...seed, messageClarifications: seed.messageClarifications });
  return {
    ...base,
    ...clone(project),
    code: projectCode(project.code),
    contract: { ...base.contract, ...clone(project.contract) },
    sourceItems: clone(project.sourceItems ?? base.sourceItems),
    baselines: clone(project.baselines ?? []),
    locked: project.locked ?? false,
    version: project.version ?? 1,
    whatsappMessages: clone(getWhatsAppMessages(project)),
    messageClarifications: normalizeMessageClarifications(project),
    voReviews: normalizeVOReviews(project),
    claimDrafts: normalizeClaimDrafts(project),
    claimTracking: normalizeClaimTracking(project),
    seed,
  };
}

function parsed(storage, key) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; }
}

function persisted(storage, workspace) {
  // Return valid in-memory state even when private mode or a quota blocks writes.
  // The app's normal persistence effect can expose its storage-error UI.
  try { storage?.setItem(WORKSPACE_STORE, JSON.stringify(workspace)); } catch { /* Keep local state usable. */ }
  return workspace;
}

export function loadWorkspace(storage = globalThis.localStorage) {
  const stored = parsed(storage, WORKSPACE_STORE);
  const validEnvelope = stored?.schemaVersion === 2
    && Array.isArray(stored.projects)
    && stored.projects.length > 0
    && stored.projects.every(validProject)
    && new Set(stored.projects.map((project) => project.id)).size === stored.projects.length
    && new Set(stored.projects.map((project) => projectCode(project.code))).size === stored.projects.length;
  if (validEnvelope) {
    const projects = stored.projects.map(normalizeProject);
    return persisted(storage, {
      ...stored,
      schemaVersion: 2,
      projects,
      activeProjectId: projects.some((project) => project.id === stored.activeProjectId)
        ? stored.activeProjectId : projects[0].id,
    });
  }

  const workspace = seedWorkspace();
  const legacy = parsed(storage, LEGACY_STORE);
  // Existing v1 users may have added/deleted rows. Array shape, not 18 rows,
  // determines whether their edits, reports and review history can migrate.
  if (validWorkflow(legacy)) {
    const sit = workspace.projects[0];
    workspace.projects[0] = {
      ...sit,
      items: clone(legacy.items),
      reports: clone(legacy.reports),
      history: clone(legacy.history),
      baselines: clone(legacy.baselines ?? []),
      locked: legacy.locked ?? false,
      version: legacy.version ?? 1,
      ...(legacy.lockedAt ? { lockedAt: legacy.lockedAt } : {}),
      ...(identifiedRecords(legacy.sourceItems) ? { sourceItems: clone(legacy.sourceItems) } : {}),
    };
    workspace.projects[0].whatsappMessages = seedWhatsAppMessages(workspace.projects[0]);
    workspace.projects[0].voReviews = normalizeVOReviews({ ...workspace.projects[0], voReviews: legacy.voReviews });
    workspace.projects[0].claimDrafts = normalizeClaimDrafts({ ...workspace.projects[0], claimDrafts: legacy.claimDrafts });
    workspace.projects[0].claimTracking = normalizeClaimTracking({ ...workspace.projects[0], claimTracking: legacy.claimTracking });
  }
  // The v1 key is deliberately never changed or removed.
  return persisted(storage, workspace);
}

export function resetProject(project) {
  const fallback = project.id === 'SIT01' ? sitProject()
    : project.id === 'WH02' ? warehouseProject()
      : createProject(project);
  const seed = validWorkflow(project.seed) && identifiedRecords(project.seed.sourceItems)
    ? project.seed : fallback.seed;
  const resetSeed = { ...clone(seed), whatsappMessages: clone(getWhatsAppMessages({
    ...project, ...seed, whatsappMessages: seed.whatsappMessages,
  })), voReviews: normalizeVOReviews({ ...project, ...seed, voReviews: seed.voReviews }),
  claimDrafts: normalizeClaimDrafts({ ...project, ...seed, claimDrafts: seed.claimDrafts }),
  claimTracking: project.claimExamplesDemo === true ? normalizeClaimTracking({ ...project, ...seed, claimTracking: seed.claimTracking }) : [], messageClarifications: [] };
  const next = { ...clone(project), ...resetSeed, seed: clone(resetSeed) };
  if (project.claimExamplesDemo !== true) delete next.lockedAt;
  if (!seed.contractVersion || seed.contractVersion.version !== next.version) delete next.contractVersion;
  delete next.drawingMapping;
  return next;
}

export function updateProjectState(workspace, projectId, updater) {
  if (typeof updater !== 'function') throw new TypeError('The project updater must be a function.');
  const index = workspace.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return workspace;
  const project = workspace.projects[index];
  const draft = clone(project);
  const result = updater(draft);
  if (result !== undefined && !record(result)) throw new TypeError('The project updater must return a project object.');
  // Returned objects replace the target, like a React state updater; deletions
  // (for example clearing lockedAt on reset) must not reappear from the draft.
  const next = { ...(result ?? draft), id: project.id };
  return {
    ...workspace,
    projects: workspace.projects.map((entry, position) => position === index ? next : entry),
  };
}
