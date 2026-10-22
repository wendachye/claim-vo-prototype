import { createProject } from './projects.js';
import { markClaimPrepared, saveClaimDraft } from './claims.js';
import { recordClaimStage } from './claim-tracking.js';

const clone = (value) => structuredClone(value);
const workflowFields = ['sourceItems', 'items', 'reports', 'history', 'baselines', 'voReviews', 'claimDrafts', 'claimTracking', 'whatsappMessages', 'messageClarifications', 'locked', 'lockedAt', 'version'];

// Independent fictional records for comparing incomplete, ready and paid claims.
// This builder never reads an existing project or changes a visitor's claims.
export function createClaimExamplesDemo(values = {}, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  const period = (offset) => new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
  const months = [period(-2), period(-1), period(0)];
  const at = (month, day = 1, hour = '09:00:00') => `${month}-${String(day).padStart(2, '0')}T${hour}+08:00`;
  const base = createProject({ name: 'Claim examples (Demo)', code: 'CLAIM-EXAMPLES', country: 'Singapore', ...values });
  const baselineAt = at(period(-3), 1, '08:00:00');
  const sourceItems = [
    { id: 'WI-001', ref: 'A / 01', section: 'A · External envelope', description: 'Block A — external wall cladding', location: 'Block A', unit: 'm²', quantity: 1000, rate: 25, amount: 25000 },
    { id: 'WI-002', ref: 'B / 01', section: 'B · Internal finishes', description: 'Block B — floor finishing', location: 'Block B', unit: 'm²', quantity: 500, rate: 40, amount: 20000 },
  ].map((item) => ({ ...item, pricingType: 'measured', needsReview: false, reported: 0, verified: 0, sourcePage: 1, progressIsDemo: true, reviewedAt: baselineAt, reviewedBy: 'Fictional contract reviewer' }));
  const reports = months.map((month, index) => ({
    id: `${base.id}-REPORT-${month}-A`, projectId: base.id, itemId: 'WI-001', status: 'verified',
    completion: [35, 60, 80][index], approvedCompletion: [35, 60, 80][index],
    date: at(month, 1, '00:00:00'), verifiedAt: at(month, 1, '00:01:00'),
    sender: 'Fictional site worker', verifiedBy: 'Fictional supervisor', location: 'Block A', area: 'Area A1',
    message: `Simulated ${month} cladding progress. The QS claim quantity is assessed separately.`, photo: null, demo: true,
  }));
  reports.push({ ...reports.at(-1), id: `${base.id}-REPORT-${months[2]}-B`, itemId: 'WI-002', completion: 65, approvedCompletion: 65, location: 'Block B', area: 'Area B1', message: 'Simulated floor progress. QS measurements and prior claim checks are still outstanding.' });
  let project = {
    ...base, claimExamplesDemo: true,
    description: 'Fictional claim examples: an incomplete draft, a ready draft and a paid claim. All quantities, checks and payments are simulated.',
    contract: { ...base.contract, reference: `${base.code}-DEMO-SCHEDULE`, date: baselineAt.slice(0, 10), mainContractor: 'Example Main Contractor (Demo)', subcontractor: base.contract.subcontractor || 'Example Finishes Subcontractor (Demo)', totalAmount: 45000, valuationBasis: 'Fictional measured work; gross values before retention and tax.', sourceKind: 'illustrative', sourceFilename: 'Claim examples — fictional schedule', scope: 'Fictional warehouse cladding and floor finishes', demo: true, sampleNote: 'Two invented measured work items. Progress, QS quantities and payments are simulated.', demoNotice: 'Claim examples only. No real work, submission, certification or payment.' },
    sourceItems, items: sourceItems.map((item, index) => ({ ...item, reported: [80, 65][index], verified: [80, 65][index] })),
    reports, locked: true, lockedAt: baselineAt, version: 1,
    baselines: [{ version: 1, items: clone(sourceItems), date: baselineAt, demo: true }],
  };
  const apply = (result, date, eventId) => {
    if (result.outcome !== 'updated') throw new Error(result.error || 'The fictional claim example could not be created.');
    project = { ...result.project, history: result.project.history.map((event, index) => index === 0 ? { ...event, date, id: `${base.id}-${eventId}`, actor: 'Fictional demo QS' } : event) };
  };
  const save = (month, assessment, day = 2) => {
    const result = saveClaimDraft(project, month, assessment);
    apply(result, at(month, day), `${month}-DRAFT`);
    project.claimDrafts = project.claimDrafts.map((draft) => draft.id === result.draft.id ? { ...draft, createdAt: at(month, day) } : draft);
    return result.draft.id;
  };
  const paidId = save(months[0], { priorConfirmed: true, work: { 'WI-001': { include: true, assessedQuantity: 200, previousValue: 0 } }, note: 'Fictional QS measurement: 200 m² independently assessed. Previous claims explicitly checked as zero. The subsequent payment is a demo record.' });
  apply(markClaimPrepared(project, paidId), at(months[0], 3), `${months[0]}-PREPARED`);
  project.claimDrafts = project.claimDrafts.map((draft) => draft.id === paidId ? { ...draft, preparedAt: at(months[0], 3) } : draft);
  for (const [action, day, value] of [['submitted', 4, null], ['certified', 5, 5000], ['payment', 6, 5000]]) {
    apply(recordClaimStage(project, paidId, action, { date: at(months[0], day).slice(0, 10), reference: `${base.code}-DEMO-${action.toUpperCase()}`, value, note: `Simulated ${action} only. No actual submission or payment.` }), at(months[0], day), `${months[0]}-${action}`);
    project.claimTracking = project.claimTracking.map((tracking) => ({ ...tracking, history: tracking.history.map((event) => event.stage === action ? { ...event, id: `${paidId}-${action}-DEMO`, recordedAt: at(months[0], day) } : event) }));
  }
  save(months[1], { priorConfirmed: true, work: { 'WI-001': { include: true, assessedQuantity: 425, previousValue: 5000 } }, note: 'Fictional QS measurement: 425 m² to date. The earlier issued example claim of 5,000 was explicitly reconciled. Ready for preview and preparation.' });
  save(months[2], { priorConfirmed: false, work: { 'WI-001': { include: true, assessedQuantity: 600, previousValue: 5000 }, 'WI-002': { include: true } }, note: 'Incomplete example: floor quantity and previous claimed amounts still need QS review. Only the paid earlier example is counted as previously issued; the intervening ready draft is not a prior claim. The cladding quantity is a separate explicit QS assessment, not calculated from physical progress.' }, 1);
  project.history.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  project.seed = clone(Object.fromEntries(workflowFields.map((field) => [field, project[field]])));
  return project;
}
