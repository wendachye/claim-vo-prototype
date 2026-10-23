import type { ContractDetails } from "../types/domain";
const SIT_FILENAME = 'China Con (LOA S.I.T Project).pdf';
const SIT_DOCUMENTS = Object.freeze({
  schedule: Object.freeze({ asset: '/assets/contract-schedule.jpg', label: 'Schedule', ratio: 1697 / 2400 }),
  drawing: Object.freeze({ asset: '/assets/site-plan.png', label: 'Site drawing', ratio: 1.414 }),
});

// Profiles select bundled assets; filenames or saved URLs alone never select a
// different project's source. Keep the registry independent of demo fixtures.
export function getSourceDocuments(contract: ContractDetails | null | undefined) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)
    || contract.sourceKind !== 'provided' || contract.sourceProfile !== 'sit-loa-2021'
    || contract.sourceFile !== SIT_FILENAME || contract.sourceFilename !== SIT_FILENAME) return null;
  return {
    schedule: { ...SIT_DOCUMENTS.schedule },
    drawing: contract.hasDrawing === true ? { ...SIT_DOCUMENTS.drawing } : null,
  };
}
