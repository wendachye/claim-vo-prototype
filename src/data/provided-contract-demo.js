import { createProject, seedWorkspace } from './projects.js';
import { getDrawingMapping, installDrawing, saveAreaMapping, snapshotMappedArea } from './drawing-mapping.js';
import { processWhatsAppMessage } from './whatsapp.js';
import { updateVOReview } from './vo.js';
import { saveClaimDraft } from './claims.js';
import { contract as sitContract, initialItems as sitItems } from './sit-contract-source.js';
import { getSITAreaDefinitions } from './sit-area-definitions.js';
import { addSITAreaMessages } from './sit-area-messages.js';
import { refreshSITDemoPhotos } from './sit-demo-photos.js';

const clone = (value) => structuredClone(value);
const photoAlt = 'Generated construction illustration used as a demo site photo; not project evidence.';
const workflowFields = ['sourceItems', 'items', 'reports', 'history', 'baselines', 'voReviews', 'claimDrafts', 'locked', 'version', 'whatsappMessages', 'messageClarifications'];

// Read the bundled fictional campus fixture, never browser-edited project data.
export function getProvidedContractSample() {
  return seedWorkspace().projects.find((project) => project.id === 'SIT01' && project.contract?.sourceKind === 'illustrative') || null;
}

// The supplied source is a separate template. It never replaces the stable
// fictional campus project or copies a browser-edited project into a new demo.
export function getSITContractSample() {
  return {
    id: 'SIT-LOA-SOURCE', code: 'SIT-LOA-SOURCE', name: 'S.I.T. Plot 1', country: 'Singapore',
    contract: clone(sitContract), sourceItems: clone(sitItems), items: clone(sitItems),
  };
}

const campusProfile = {
  description: 'Fictional campus scaffold scenario with mock site updates, QS review and a draft claim.',
  demoNotice: 'All contract parties, rows, values, drawings, site updates, photos, progress, VO decisions and claim assessments are fictional.',
  sampleNote: '18 fictional contract rows. Mock work-list checks and a separate illustrative claim draft are already saved.',
  drawingSource: {
    id: 'campus-demo-plan', asset: '/samples/campus-scaffold-area-plan.svg', fileName: 'campus-scaffold-area-plan.svg', mimeType: 'image/svg+xml',
    label: 'Fictional campus plan', note: 'Illustrative demo drawing and manual area links; not to scale.',
  },
  areas: [
    ['W3-A', 'WI-001', { x: 0.17, y: 0.5 }], ['W3-B', 'WI-002', { x: 0.385, y: 0.5 }],
    ['W5-A', 'WI-004', { x: 0.66, y: 0.5 }], ['W5-B', 'WI-005', { x: 0.84, y: 0.5 }],
  ],
  observationNote: 'Fictional campus scenario progress; not actual site activity.',
  queryNote: 'Fictional scope query only. Check the demo schedule and instruction before pricing; instruction and price remain unknown.',
  changedScopeNote: 'Fictional changed-scope example for recorded-approval review. This is a fictional instruction and approval example only.',
  includedScopeNote: 'Fictional included-scope query. QS must compare the work with the demo schedule before deciding.',
  approvalAssessment: 'Fictional QS assumption: a separate new work face is outside the demo schedule. Routine safety/staged adjustments remain included and are not priced here.',
  rejectionAssessment: 'Fictional QS assessment: this routine scaffold adjustment is already included in this demo work scope.',
  historyAction: 'Fictional campus scenario created',
  historyDetail: 'Entirely fictional contract rows, drawing, work-list checks, site observations, manual area links, VO reviews and QS draft inputs.',
  assessedQuantity: 1000,
  claimNote: 'Simulated QS inputs: separately assessed 1,000 m² at the fictional rate, fictional VO SGD 1,800, and assumed previous claims zero. Quantity is not calculated from the progress percentage. Gross draft only; retention, GST and other deductions are not calculated. Not submitted, certified or paid.',
};

const sitProfile = {
  description: 'Provided S.I.T. scaffolding contract with simulated site updates, QS review and a draft claim.',
  demoNotice: 'Provided contract and drawing; all site updates, people, photos, progress, area pins, VO decisions and claim assessments are simulated.',
  sampleNote: '18 representative contract rows, not the full schedule. Mock work-list checks and a separate illustrative claim draft are already saved.',
  drawingSource: {
    id: 'provided-site-plan', asset: '/assets/site-plan.png', fileName: 'site-plan.png', mimeType: 'image/png',
    label: 'Provided site plan', note: 'Source drawing; area pins are illustrative manual links, not surveyed positions.',
  },
  areas: getSITAreaDefinitions().map(({ code, itemIds, position }) => [code, itemIds[0], position, itemIds]),
  observationNote: 'Simulated physical progress for the provided-contract walkthrough; not actual site activity.',
  queryNote: 'Scope query only. Check the original scope and safety/staged-adjustment provisions in clauses 3(c)–(d); instruction and price remain unknown.',
  changedScopeNote: 'Fictional changed-scope example for recorded-approval review. This is not an actual instruction or entitlement under the provided contract.',
  includedScopeNote: 'Illustrative included-scope query. Check the supplied contract and instruction before deciding whether a variation exists.',
  approvalAssessment: 'Fictional QS assumption: a separate new work face is outside the original schedule. Routine safety/staged adjustments remain included and are not priced here.',
  rejectionAssessment: 'Illustrative QS assessment: this routine safety adjustment is included under the original scope; review clauses 3(c)–(d).',
  historyAction: 'Provided-contract scenario created',
  historyDetail: 'Supplied contract rows and drawing with simulated work-list checks, physical observations, manual area links, VO decisions and QS claim inputs.',
  assessedQuantity: 1044,
  claimNote: 'Simulated QS inputs: separately assessed 1,044 m² at the source rate, fictional VO SGD 1,800, and assumed previous claims zero. Quantity is not calculated from the progress percentage. Gross draft only; retention, GST and other deductions are not calculated. Not submitted, certified or paid.',
};

function demoCalendar(now) {
  let time;
  try { time = new Date(now).getTime(); } catch { /* Invalid dates get the same useful error. */ }
  if (!Number.isFinite(time)) throw new TypeError('Choose a valid date for the contract scenario.');
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit',
  }).formatToParts(time);
  const part = (type) => parts.find((entry) => entry.type === type).value;
  const period = `${part('year')}-${part('month')}`;
  const monthStart = Date.parse(`${period}-01T00:00:00+08:00`);
  // Keep the showcase's dated observations in its chosen local claim month.
  return { period, at: (minutesAgo) => new Date(Math.max(monthStart, time - minutesAgo * 60_000)).toISOString() };
}

/** A realistic workflow with entirely fictional contract and site data. */
export function createProvidedContractDemo(values, now = new Date()) {
  return createContractScenario(values, now, getProvidedContractSample(), campusProfile);
}

export function createSITContractDemo(values, now = new Date()) {
  return createContractScenario(values, now, getSITContractSample(), sitProfile);
}

function createContractScenario(values, now, sample, profile) {
  if (!sample) throw new Error('No fictional campus sample is available in this prototype.');
  const { period, at } = demoCalendar(now);
  const baselineAt = at(60);
  let project = createProject({ ...values, country: sample.country, subcontractor: sample.contract.subcontractor });
  const cleanSource = clone(sample.sourceItems).map((item) => {
    const next = { ...item, reported: 0, verified: 0, needsReview: false };
    delete next.rawExtractedQuantity;
    delete next.extractionNote;
    delete next.demoArea;
    return next;
  });
  for (const id of ['WI-001', 'WI-002', 'WI-004', 'WI-005']) {
    if (!cleanSource.some((item) => item.id === id)) throw new Error('The contract sample is missing a scenario work item.');
  }
  project = {
    ...project, providedContractDemo: true,
    description: project.description || profile.description,
    contract: {
      ...clone(sample.contract), id: project.id,
      demoNotice: profile.demoNotice,
      sampleNote: profile.sampleNote,
      demoAreas: [],
      drawingSource: clone(profile.drawingSource),
    },
    sourceItems: cleanSource,
    items: clone(cleanSource).map((item) => ({ ...item, reviewedAt: baselineAt, reviewedBy: 'Demo contract reviewer' })),
    reports: [], history: [], baselines: [], voReviews: [], claimDrafts: [], whatsappMessages: [],
    version: 1, locked: true, lockedAt: baselineAt,
  };
  project.baselines = [{ version: 1, items: clone(project.items), date: baselineAt, demo: true }];
  const installed = installDrawing(project, { inputKind: 'provided' }, baselineAt);
  if (installed.outcome !== 'updated') throw new Error('The contract plan could not be added to the scenario.');
  project = installed.project;
  const areaRows = profile.areas;
  const areaCode = (itemId) => areaRows.find(([, linkedId]) => itemId === linkedId)[0];
  const usesSITSource = sample.contract.sourceKind === 'provided' && sample.contract.sourceProfile === sitContract.sourceProfile;
  const contractContext = (itemId, label = 'CONTRACT') => {
    if (!usesSITSource) return '';
    const item = cleanSource.find((entry) => entry.id === itemId);
    return `\n${label}=${item.ref} | ${item.description}\nSCOPE=${item.subsection}`;
  };
  for (const [code, itemId, position, workItemIds = [itemId]] of areaRows) {
    const item = project.items.find((entry) => entry.id === itemId);
    const saved = saveAreaMapping(project, {
      drawingId: getDrawingMapping(project).drawing.id, code, name: item.description,
      page: 1, position, workItemIds,
    }, baselineAt);
    if (saved.outcome !== 'updated') throw new Error('A contract scenario area could not be linked.');
    project = saved.project;
  }
  project.contract.demoAreas = getDrawingMapping(project).areas.map((area) => ({
    id: area.id, name: `Area ${area.code}`, location: project.items.find((item) => item.id === area.workItemIds[0]).location,
    itemIds: clone(area.workItemIds), demo: true,
  }));
  const reportFor = (sequence, itemId, areaCode, completion, status, minutesAgo, verifiedMinutesAgo) => {
    const item = project.items.find((entry) => entry.id === itemId);
    const area = getDrawingMapping(project).areas.find((entry) => entry.code === areaCode);
    return {
      id: `${project.id}-CASE-REPORT-${sequence}`, projectId: project.id, projectCode: project.code,
      itemId, sourceMessageId: `${project.id}-CASE-WA-${sequence}`, channel: 'whatsapp-mock',
      area: `Area ${areaCode}`, areaMapping: snapshotMappedArea(area), location: item.location,
      sender: 'Scaffold worker (demo)', date: at(minutesAgo), completion, completionBasis: 'cumulative', status,
      message: `${project.code} | ${item.location} | Area ${areaCode} | ${itemId}${contractContext(itemId)}\nCOMPLETE=${completion}% TOTAL\n${profile.observationNote}`,
      photo: '/assets/demo-scaffold.jpg', photoAlt, demo: true, origin: 'simulated', vo: false,
      note: 'Simulated physical observation only. Financial entitlement and QS assessed quantities are separate.',
      ...(status === 'verified' ? { approvedCompletion: completion, verifiedBy: 'Scaffold supervisor (demo)', verifiedAt: at(verifiedMinutesAgo) } : {}),
    };
  };
  project.reports = [
    reportFor('001', 'WI-001', areaCode('WI-001'), 50, 'verified', 50, 45),
    reportFor('002', 'WI-002', areaCode('WI-002'), 100, 'verified', 45, 40),
    reportFor('003', 'WI-001', areaCode('WI-001'), 65, 'pending', 15),
    reportFor('004', 'WI-004', areaCode('WI-004'), 50, 'pending', 10),
  ];
  const totals = { 'WI-001': [65, 50], 'WI-002': [100, 100], 'WI-004': [50, 0] };
  project.items = project.items.map((item) => ({ ...item, reported: totals[item.id]?.[0] ?? 0, verified: totals[item.id]?.[1] ?? 0 }));
  const baseMessage = {
    projectId: project.id, projectCode: project.code, sender: 'Scaffold worker (demo)', senderRole: 'Site worker · demo',
    photoAlt, processingNote: 'Prefilled simulated scenario. No live WhatsApp or AI processing is connected.',
  };
  const extraMessage = (sequence, areaCode, location, minutesAgo, text, processingNote, contextItemId) => ({
    ...baseMessage, id: `${project.id}-CASE-WA-${sequence}`, kind: 'vo', status: 'new', itemId: null,
    area: `Area ${areaCode}`, location, date: at(minutesAgo), completion: null, completionBasis: 'unclear',
    photo: '/assets/demo-platform.jpg',
    text: `${project.code} | ${location} | Area ${areaCode}${contractContext(contextItemId, 'CONTRACT CONTEXT')}\n${text}${usesSITSource ? '\nThe source row is context only. QS must confirm scope, instruction and any variation entitlement; no contract item is automatically matched.' : ''}\nSimulated scenario message; generated demo photo attached. Not actual site activity.`,
    processingNote,
  });
  project.whatsappMessages = [
    ...project.reports.map((report) => ({
      ...baseMessage, id: report.sourceMessageId, kind: 'progress', status: 'processed', reportId: report.id,
      itemId: report.itemId, area: report.area, location: report.location, date: report.date, processedAt: report.date,
      completion: report.completion, completionBasis: 'cumulative', text: report.message, photo: report.photo,
    })),
    extraMessage('005', areaCode('WI-001'), 'W3', 5,
      `A supervisor asked for an additional access platform. Please check the instruction and whether this is included in the existing scaffold scope before pricing.${sample.contract.sourceKind === 'provided' ? ' Demo QS scope check: compare clauses 3(c)–(d) before treating safety or staged adjustments as extra work.' : ''}`,
      profile.queryNote, 'WI-001'),
    {
      ...baseMessage, id: `${project.id}-CASE-WA-006`, kind: 'clarification', status: 'new', itemId: null,
      area: 'W5', location: 'W5', date: at(3), completion: 10, completionBasis: 'unclear',
      photo: '/assets/demo-scaffold.jpg', text: `${project.code} | W5 another 10%.${usesSITSource ? `\nPossible source context (not matched):${contractContext('WI-004', 'OPTION 1')} | Area ${areaCode('WI-004')}${contractContext('WI-005', 'OPTION 2')} | Area ${areaCode('WI-005')}` : ''}\nSimulated unclear message; confirm the work item, mapped area and cumulative total.`,
      processingNote: 'Several W5 items exist and “another 10%” is not a cumulative total. Ask for the item and total before changing progress.',
    },
    extraMessage('007', areaCode('WI-005'), 'W5', 35,
      'DEMO ONLY: a separate instruction adds temporary access to a new off-schedule work face. The demo QS will assess this hypothetical changed scope separately.',
      profile.changedScopeNote, 'WI-005'),
    extraMessage('008', areaCode('WI-002'), 'W3', 30,
      'Please check if this routine scaffold safety adjustment can be claimed as extra work.',
      profile.includedScopeNote, 'WI-002'),
  ];
  project.history = [{
    id: `${project.id}-CASE-CREATED`, action: profile.historyAction, date: at(0), actor: 'Alex Tan · Demo reviewer',
    detail: profile.historyDetail,
  }];
  if (usesSITSource) project = refreshSITDemoPhotos(project, now).project;
  const processVO = (sequence, minutesAgo) => {
    const id = `${project.id}-CASE-WA-${sequence}`;
    const priorIds = new Set(project.history.map((entry) => entry.id));
    const result = processWhatsAppMessage(project, id);
    if (result.outcome !== 'processed') throw new Error('A simulated extra-work message could not be linked.');
    project = {
      ...result.project,
      whatsappMessages: result.project.whatsappMessages.map((message) => message.id === id ? { ...message, processedAt: at(minutesAgo) } : message),
      history: result.project.history.map((event) => priorIds.has(event.id) ? event : { ...event, date: at(minutesAgo) }),
    };
    return result.reportId;
  };
  const reviewVO = (caseId, action, input, minutesAgo) => {
    const priorIds = new Set(project.history.map((entry) => entry.id));
    const result = updateVOReview(project, caseId, action, input);
    if (result.outcome !== 'updated') throw new Error('A simulated extra-work review could not be saved.');
    const date = at(minutesAgo), eventId = `${caseId}-${action}-DEMO`;
    project = {
      ...result.project,
      voReviews: result.project.voReviews.map((review) => review.id !== caseId ? review : {
        ...review, updatedAt: date,
        ...(action === 'assessEligibility' ? { eligibilityReviewedAt: date, executionVerifiedAt: date } : {}),
        history: review.history.map((event, index) => index === review.history.length - 1 ? { ...event, id: eventId, date, ...(action === 'assessEligibility' ? { values: { ...event.values, eligibilityReviewedAt: date, executionVerifiedAt: date } } : {}) } : event),
      }),
      history: result.project.history.map((event) => priorIds.has(event.id) ? event : { ...event, id: eventId, date }),
    };
  };
  processVO('005', 4);
  const approvedId = processVO('007', 34);
  const rejectedId = processVO('008', 29);
  reviewVO(approvedId, 'submit', {
    title: 'Access to separate off-schedule work face (demo)', relatedItemId: 'WI-005',
    scopeAssessment: profile.approvalAssessment,
    instructionReference: `${project.code}-DEMO-INSTRUCTION-007`, proposedValue: 1800,
    reviewNote: 'Hypothetical scope and instruction for the UI walkthrough only; not an actual contractual assessment.',
  }, 25);
  reviewVO(approvedId, 'approve', {
    approvedValue: 1800, approvalReference: `${project.code}-DEMO-APPROVAL-007`, approver: 'Fictional demo approver',
    reviewNote: 'Locally recorded fictional approval. No external instruction, certification, payment or claim submission.',
  }, 20);
  reviewVO(approvedId, 'assessEligibility', {
    scopeDisposition: 'variation', instructionStatus: 'documented',
    executionStatus: 'verified', executionReference: `${project.code}-DEMO-WORK-CHECK-007`,
    claimEligibility: 'eligible',
    reviewNote: 'Explicit fictional post-approval scope, instruction and executed-work check for the showcase.',
    eligibilityNote: 'Fictional QS check: the instructed additional access work is verified and eligible for this mock claim. No actual project work or entitlement is certified.',
  }, 19);
  reviewVO(rejectedId, 'reject', {
    title: 'Routine scaffold safety adjustment (demo)', relatedItemId: 'WI-002',
    scopeAssessment: profile.rejectionAssessment,
    reviewNote: 'Demo rejection: no separate variation for this included-scope scenario. This is not a real contract decision.',
  }, 24);
  const claim = saveClaimDraft(project, period, {
    projectId: project.id, priorConfirmed: true,
    work: { 'WI-001': { include: true, assessedQuantity: profile.assessedQuantity, previousValue: 0 } },
    vos: { [approvedId]: { include: true, assessedValue: 1800, previousValue: 0 } },
    note: profile.claimNote,
  });
  if (claim.outcome !== 'updated' || !claim.draft.snapshot.canPrepare) throw new Error('The simulated QS draft could not be prepared for review.');
  const priorIds = new Set(project.history.map((entry) => entry.id));
  project = {
    ...claim.project,
    claimDrafts: claim.project.claimDrafts.map((draft) => draft.id === claim.draft.id ? { ...draft, createdAt: at(1) } : draft),
    history: claim.project.history.map((event) => priorIds.has(event.id) ? event : { ...event, id: `${project.id}-CASE-CLAIM-DRAFT`, date: at(1) }),
  };
  project.history.sort((first, second) => Date.parse(second.date) - Date.parse(first.date));
  if (usesSITSource) {
    const inbox = addSITAreaMessages(project, now);
    if (inbox.outcome !== 'updated') throw new Error('The S.I.T. area message samples could not be added.');
    project = inbox.project;
  }
  project.seed = clone(Object.fromEntries(workflowFields.map((field) => [field, project[field]])));
  return project;
}
