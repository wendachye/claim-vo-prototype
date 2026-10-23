import type { ContractDetails, WorkItem } from "../types/domain";
/**
 * Source-backed demonstration data, not a live project ledger.
 *
 * Contract source: user-supplied "China Con (LOA S.I.T Project).pdf".
 * PDF pp. 1–2: contract identity, SGD 543,887.61 and remeasurement basis.
 * PDF p. 27 (schedule's own p. 1 of 1): visually checked quantities, rates,
 * printed amounts, units, Included/Rate Only markers, start months/durations.
 * Representative rows below are a SUBSET; their sum is not the contract sum.
 *
 * All area aliases, people, progress and reports are explicitly simulated.
 * Reported/verified percentages describe physical observations, not claimable
 * quantities, financial entitlement, certification or money received.
 * The WI-001 extraction mismatch is an intentionally simulated review fixture.
 */

export const contract: ContractDetails = {
  id: 'SIT-LOA-SOURCE',
  sourceProfile: 'sit-loa-2021',
  sourceKind: 'provided',
  sourceFilename: 'China Con (LOA S.I.T Project).pdf',
  scope: 'External & safety scaffolding · W3 & W5',
  dateLabel: '20 Oct 2021',
  sampleNote: '18 representative rows from PDF page 27; not the full schedule.',
  sourceSummary: 'Supplied S.I.T. subcontract and schedule of rates · Punggol North, Singapore',
  hasDrawing: true,
  name: 'S.I.T. Plot 1 — External & Safety Scaffolding',
  projectName: 'Singapore Institute of Technology, Punggol North — Plot 1',
  reference: 'CCSC/SIT/SC/21.183',
  date: '2021-10-20',
  mainContractor: 'China Construction–Straits LLP',
  subcontractor: 'Goh Kwang Heng Scaffolding Pte Ltd',
  currency: 'SGD',
  totalAmount: 543887.61,
  valuationBasis: 'Subject to remeasurement at the agreed schedule of rates',
  sourceFile: 'China Con (LOA S.I.T Project).pdf',
  sourcePage: 27,
  sourcePageCount: 115,
  representativeSubset: true,
  demo: true,
  demoNotice: 'Source contract rows; all site activity and area mappings are demo data.',
  gracePeriodMonths: 3,
  durationNote: 'Schedule header: all durations + 3 months’ grace period.',
  pricingNote: 'Bundled design, supply, rental, erection and dismantling. Do not multiply rates by months.',
  sourceSectionTotals: [
    { id: 'A', name: 'Safety access scaffold', amount: 280018.76 },
    { id: 'B', name: 'Internal working platform', amount: 133362.45 },
    { id: 'C', name: 'Lift corewall working platform', amount: 81806.4 },
    { id: 'D', name: 'Others', amount: 48700 },
  ],
  aliases: {
    W3: ['W3', 'Block W3', 'W 3'],
    W5: ['W5', 'Block W5', 'W 5'],
  },
  demoAreas: [
    { id: 'AREA-B', name: 'Area B', location: 'W3', itemIds: ['WI-001'], demo: true },
    { id: 'AREA-C', name: 'Area C', location: 'W3', itemIds: ['WI-002'], demo: true },
    { id: 'AREA-D', name: 'Area D', location: 'W5', itemIds: ['WI-004'], demo: true },
  ],
};

const item = (values: Partial<WorkItem> & Pick<WorkItem, "id" | "ref" | "description" | "location" | "unit" | "quantity" | "rate" | "amount" | "pricingType">): WorkItem => ({
  startDate: null, // Month precision only where the source specifies a month.
  durationMonths: null,
  needsReview: false,
  reported: 0, // Simulated starting progress, not a historical project assertion.
  verified: 0,
  sourcePage: 27,
  quantityBasis: 'provisional',
  progressIsDemo: true,
  ...values,
});

export const initialItems: WorkItem[] = [
  item({
    id: 'WI-001', ref: 'A.1 / 1a', section: 'A · Safety access scaffold',
    subsection: 'A.1 · External façade safety access scaffold',
    description: 'Block W3 — ST3-1 & ST3-2, L3 to LR', location: 'W3',
    unit: 'm²', quantity: 2088, rate: 13.5, amount: 28188,
    startDate: '2021-12', durationMonths: 9, pricingType: 'measured',
    needsReview: true, reported: 50, verified: 25, demoArea: 'Area B',
    rawExtractedQuantity: 2880,
    reviewedQuantity: 2088,
    extractionNote: 'Simulated OCR correction: 2,880 read; the printed source quantity is 2,088. Confirm against the page.',
  }),
  item({
    id: 'WI-002', ref: 'A.1 / 1b', section: 'A · Safety access scaffold',
    subsection: 'A.1 · External façade safety access scaffold',
    description: 'Block W3 — ST3-4 & ST3-5, L3 to LR', location: 'W3',
    unit: 'm²', quantity: 1821.6, rate: 13.5, amount: 24591.6,
    startDate: '2022-01', durationMonths: 9, pricingType: 'measured',
    reported: 75, verified: 75, demoArea: 'Area C',
  }),
  item({
    id: 'WI-003', ref: 'A.1 / 1c', section: 'A · Safety access scaffold',
    subsection: 'A.1 · External façade safety access scaffold',
    description: 'Block W3 — ST3-6 & ST3-7, L3 to LR & South', location: 'W3',
    unit: 'm²', quantity: 3639.55, rate: 13.5, amount: 49133.93,
    startDate: '2022-02', durationMonths: 9, pricingType: 'measured',
  }),
  item({
    id: 'WI-004', ref: 'A.1 / 2a', section: 'A · Safety access scaffold',
    subsection: 'A.1 · External façade safety access scaffold',
    description: 'Block W5 — ST5-1, L3 to L10', location: 'W5',
    unit: 'm²', quantity: 1062, rate: 13.5, amount: 14337,
    startDate: '2022-01', durationMonths: 9, pricingType: 'measured',
    reported: 50, verified: 0, demoArea: 'Area D',
  }),
  item({
    id: 'WI-005', ref: 'A.1 / 2d', section: 'A · Safety access scaffold',
    subsection: 'A.1 · External façade safety access scaffold',
    description: 'Block W5 — East elevation, L3 to L10', location: 'W5',
    unit: 'm²', quantity: 1612.8, rate: 13.5, amount: 21772.8,
    startDate: '2021-12', durationMonths: 9, pricingType: 'measured',
  }),
  item({
    id: 'WI-006', ref: 'A.1 / 2f', section: 'A · Safety access scaffold',
    subsection: 'A.1 · External façade safety access scaffold',
    description: 'Block W5 — North elevation, L3 to L10', location: 'W5',
    unit: 'm²', quantity: 770.4, rate: 13.5, amount: 10400.4,
    startDate: '2022-03', durationMonths: 8, pricingType: 'measured',
  }),
  item({
    id: 'WI-007', ref: 'A.2 / 1a', section: 'A · Safety access scaffold',
    subsection: 'A.2 · High void opening safety access scaffold to escalator',
    description: 'Block W5 — ES-8A/8B & ES9A/9B', location: 'W5',
    unit: 'm²', quantity: 1053.84, rate: 13.5, amount: 14226.84,
    startDate: '2021-10', durationMonths: 9, pricingType: 'measured',
  }),
  item({
    id: 'WI-008', ref: 'A.3 / 1', section: 'A · Safety access scaffold',
    subsection: 'A.3 · Circular column working scaffold',
    description: 'Block W3 — C3-17, C3-21, C3-24 & C3-27', location: 'W3',
    unit: 'm²', quantity: 1749.6, rate: 13.5, amount: 23619.6,
    startDate: '2022-04', durationMonths: 4, pricingType: 'measured',
  }),
  item({
    id: 'WI-009', ref: 'B.1 / 1a', section: 'B · Internal working platform',
    subsection: 'B.1 · Internal scaffold / platform, not accessible to scissor lift',
    description: 'Block W3 — Amphitheatre Wing A', location: 'W3',
    unit: 'm³', quantity: 3947.4, rate: 8.5, amount: 33552.9,
    startDate: '2022-06', durationMonths: 2, pricingType: 'measured',
  }),
  item({
    id: 'WI-010', ref: 'B.1 / 2', section: 'B · Internal working platform',
    subsection: 'B.1 · Internal scaffold / platform, not accessible to scissor lift',
    description: 'Block W5 — Amphitheatre Wings A & B', location: 'W5',
    unit: 'm³', quantity: 7794.9, rate: 8.5, amount: 66256.65,
    startDate: '2022-03', durationMonths: 2, pricingType: 'measured',
  }),
  item({
    id: 'WI-011', ref: 'C.1 / 1a', section: 'C · Lift corewall working platform',
    subsection: 'C.1 · Internal scaffold within lift corewall',
    description: 'Block W3 — PL-4, PL-3, FL-4, SL-2, FL-3, FL-5 & FL-15', location: 'W3',
    unit: 'm', quantity: 324.9, rate: 130, amount: 42237,
    startDate: '2021-08', durationMonths: 9, pricingType: 'measured',
    sourceNote: 'The schedule start month predates the LOA; preserved as printed, not corrected by inference.',
  }),
  item({
    id: 'WI-012', ref: 'D.1', section: 'D · Others',
    subsection: 'Included scope',
    description: 'Metal decking at working level for B.1', location: 'W3 / W5',
    unit: 'm²', quantity: 1, rate: null, amount: null, pricingType: 'included',
    sourceNote: 'Printed amount is Included; null is deliberate, not an unknown extra charge or a free standalone item.',
  }),
  item({
    id: 'WI-013', ref: 'D.2 / 1', section: 'D · Others',
    subsection: 'D.2 · Removable ladder stair as temporary construction access',
    description: 'Block W3 — 3-storey height, 4.5 m × 3 = 13.5 m', location: 'W3',
    unit: 'set', quantity: 4, rate: null, amount: null, pricingType: 'included',
    sourceNote: 'Printed amount is Included; no separate charge is inferred.',
  }),
  item({
    id: 'WI-014', ref: 'D.3', section: 'D · Others', subsection: 'Priced services',
    description: 'PE endorsement', location: 'Project-wide',
    unit: 'design', quantity: 14, rate: 950, amount: 13300, pricingType: 'measured',
  }),
  item({
    id: 'WI-015', ref: 'D.4', section: 'D · Others', subsection: 'Priced services',
    description: 'COS', location: 'Project-wide',
    unit: 'visit', quantity: 48, rate: 400, amount: 19200, pricingType: 'measured',
  }),
  item({
    id: 'WI-016', ref: 'D.5', section: 'D · Others', subsection: 'Priced services',
    description: 'Installation of cantilever wall bracket', location: 'Project-wide',
    unit: 'pc', quantity: 180, rate: 90, amount: 16200, pricingType: 'measured',
  }),
  item({
    id: 'WI-017', ref: 'Erector / Mon–Sat / 1', section: 'Rate-only labour',
    subsection: 'Supply of scaffold erector',
    description: 'Scaffold erector — Monday–Saturday, 08:00–17:00', location: 'Project-wide',
    unit: 'hr', quantity: 1, rate: 18, amount: null, pricingType: 'rateOnly',
    quantityBasis: 'source rate-reference quantity, not approved work',
    sourceNote: 'Rate Only: the printed quantity 1 does not add S$18 to the baseline or establish authorised hours.',
  }),
  item({
    id: 'WI-018', ref: 'Supervisor / Sun–PH / 1', section: 'Rate-only labour',
    subsection: 'Supply of scaffold supervisor',
    description: 'Scaffold supervisor — Sunday / public holiday, 08:00–17:00', location: 'Project-wide',
    unit: 'hr', quantity: 1, rate: 40, amount: null, pricingType: 'rateOnly',
    quantityBasis: 'source rate-reference quantity, not approved work',
    sourceNote: 'Rate Only: actual eligible hours and the applicable day/time band require review.',
  }),
];
