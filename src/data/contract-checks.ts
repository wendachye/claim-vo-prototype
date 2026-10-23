import type { WorkItem, ContractDetails } from "../types/domain";
export interface ContractIssue { id: string; itemId: string | null; itemRef: string; description: string; messages: string[]; fields: string[] }
type CheckProject = { id?: string; items?: Partial<WorkItem>[]; contract?: ContractDetails };
import { claimBasisDifference, claimBasisNumber, claimBasisProduct, claimBasisSum } from './claim-basis.ts';

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const present = (value: unknown) => value !== null && value !== undefined && !(typeof value === 'string' && !value.trim());
const valid = (value: number | null): value is number => value !== null && !Number.isNaN(value);
const amountText = (value: number) => value.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Read-only checks of the current work list. Sources and saved claim snapshots are never inputs. */
export function getContractChecks(project: CheckProject | null | undefined) {
  const items = Array.isArray(project?.items) ? project.items : [];
  const contract = project?.contract || {};
  const partial = contract.representativeSubset === true;
  const completeSchedule = contract.representativeSubset === false;
  const issues: ContractIssue[] = [];
  const recordedAmounts: number[] = [];
  const calculatedAmounts: number[] = [];
  const ids = new Set();
  let numericComplete = items.length > 0;

  for (const [index, value] of items.entries()) {
    const item = value && typeof value === 'object' && !Array.isArray(value) ? value : {} as Partial<WorkItem>;
    const messages: string[] = [];
    const fields: string[] = [];
    const issue = (field: string, message: string) => {
      if (!fields.includes(field)) fields.push(field);
      messages.push(message);
    };
    const itemId = text(item.id) || null;
    const itemRef = text(item.ref) || itemId || `Item ${index + 1}`;
    if (!itemId || ids.has(itemId)) {
      issue('id', 'Use a unique work item ID.');
      numericComplete = false;
    }
    if (itemId) ids.add(itemId);
    const local = item.projectId == null || item.projectId === project?.id;
    if (!local) issue('projectId', 'This item belongs to another project.');
    if (!text(item.description)) issue('description', 'Enter the description.');
    if (!text(item.unit)) issue('unit', 'Enter the unit.');
    const supportedType = ['measured', 'included', 'rateOnly'].includes(item.pricingType || '');
    if (!supportedType) issue('pricingType', 'Choose Measured, Included or Rate only pricing.');

    // Match the review form: an unresolved extracted quantity is the proposed value,
    // including an explicitly blank/unknown manual entry. Never replace it with zero.
    const proposedQuantity = item.needsReview ? item.rawExtractedQuantity ?? item.quantity : item.quantity;
    const quantity = claimBasisNumber(proposedQuantity, 4);
    const rate = claimBasisNumber(item.rate, 4);
    const amount = claimBasisNumber(item.amount, 2);
    const numberCheck = (field: string, raw: unknown, parsed: number | null, required: boolean, label: string, precision: number) => {
      if (!present(raw)) {
        if (required) issue(field, `Enter the ${label.toLowerCase()}.`);
      } else if (!valid(parsed)) {
        issue(field, `${label} must be a non-negative number with up to ${precision} decimal places.`);
      }
    };
    if (item.pricingType === 'measured') {
      const missingQuantity = !present(proposedQuantity);
      const missingRate = !present(item.rate);
      const missingAmount = !present(item.amount);
      for (const [field, missing] of [['quantity', missingQuantity], ['rate', missingRate], ['amount', missingAmount]] as const) {
        if (missing && !fields.includes(field)) fields.push(field);
      }
      if (missingQuantity || missingRate) {
        const missingInputs = missingQuantity && missingRate ? 'quantity and rate' : missingQuantity ? 'quantity' : 'rate';
        issue(missingQuantity ? 'quantity' : 'rate', `Enter the ${missingInputs}; the amount is calculated on save.`);
      } else if (missingAmount && valid(quantity) && valid(rate)) {
        issue('amount', 'Save this item to record its calculated amount.');
      }
    }
    numberCheck('quantity', proposedQuantity, quantity, false, 'Quantity', 4);
    numberCheck('rate', item.rate, rate, item.pricingType === 'rateOnly', 'Rate', 4);
    numberCheck('amount', item.amount, amount, false, 'Amount', 2);
    if (item.needsReview) issue('review', 'Check this item against the source and confirm it.');

    if (!local || !supportedType) numericComplete = false;
    if (item.pricingType === 'measured') {
      const calculated = valid(quantity) && valid(rate) ? claimBasisProduct(quantity, rate) : null;
      if (valid(quantity) && valid(rate) && calculated === null) {
        issue('amount', 'Quantity × rate exceeds the supported amount limit.');
      }
      if (!valid(quantity) || !valid(rate) || !valid(amount) || calculated === null) numericComplete = false;
      if (valid(amount)) recordedAmounts.push(amount);
      if (calculated !== null) calculatedAmounts.push(calculated);
      if (calculated !== null && valid(amount) && claimBasisDifference(calculated, amount) !== 0) {
        issue('amount', `Quantity × rate is ${amountText(calculated)}; the recorded amount is ${amountText(amount)}.`);
      }
    }
    if (messages.length) issues.push({
      id: `contract-check-${itemId || index + 1}${itemId && items.findIndex(entry => entry?.id === itemId) !== index ? `-${index + 1}` : ''}`,
      itemId, itemRef, description: text(item.description) || 'Description missing', messages, fields,
    });
  }

  // Only measured line amounts are charges. Never sum quantities, section totals,
  // durations, Included allowances, Rate Only references or the declared value.
  const recordedSum = numericComplete ? claimBasisSum(recordedAmounts) : null;
  const calculatedSum = numericComplete ? claimBasisSum(calculatedAmounts) : null;
  if (numericComplete && (recordedSum === null || calculatedSum === null)) {
    const index = items.findLastIndex(item => item?.pricingType === 'measured');
    const item = items[index]!;
    const existing = issues.find(entry => entry.itemId === item.id);
    const message = 'The work-list total exceeds the supported amount limit.';
    if (existing) {
      if (!existing.fields.includes('amount')) existing.fields.push('amount');
      existing.messages.push(message);
    } else {
      issues.push({ id: `contract-check-${item.id}`, itemId: item.id || null,
        itemRef: text(item.ref) || item.id || "Unassigned", description: text(item.description) || 'Description missing',
        messages: [message], fields: ['amount'] });
    }
  }
  const complete = numericComplete && recordedSum !== null && calculatedSum !== null;
  const recordedTotal = complete ? recordedSum : null;
  const calculatedTotal = complete ? calculatedSum : null;
  const declared = claimBasisNumber(contract.totalAmount, 2);
  const declaredTotal = valid(declared) ? declared : null;
  const difference = recordedTotal !== null && declaredTotal !== null
    ? claimBasisDifference(recordedTotal, declaredTotal) : null;
  const comparison = partial ? 'partial'
    : completeSchedule && difference !== null ? difference === 0 ? 'match' : 'difference'
      : 'unknown';
  const scopeNote = partial
    ? 'Partial schedule: these representative items do not cover the full contract. A difference from the declared value is expected.'
    : completeSchedule
      ? 'Measured item amounts are compared with the declared contract value. Included and rate-only items have no separate total.'
      : 'Schedule coverage is not specified. Confirm the scope before comparing this work list with the full contract value.';

  return {
    issues,
    issueCount: issues.reduce((sum, item) => sum + item.messages.length, 0),
    itemIssueCount: issues.length,
    canConfirm: items.length > 0 && issues.length === 0 && complete,
    totals: { currency: text(contract.currency) || null, recordedTotal, calculatedTotal, declaredTotal,
      difference, complete, partial, comparison },
    partial,
    scopeNote,
  };
}
