import { isVoiceNoteEvidenceSnapshot } from './voice-notes.ts';
import type { ClaimRow, ClaimPack, ClaimProjectDetails, ClaimEvidenceReference } from '../types/claims';
import { isMessageMatchReviewSnapshot } from './message-match.ts';
import { isClaimDocumentDetails } from './claim-document-details.ts';
import { isDailyKPIEvidenceSnapshot } from './daily-kpi-evidence.ts';
import { parseDailyKPIMessage } from './daily-kpi-message.ts';
import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput, VORelatedEvidence } from '../types/domain';
// Read-only exports of saved local assessments; never rebuild from live progress.
const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = <T>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];
const contractFields = ['name', 'projectName', 'reference', 'date', 'mainContractor', 'subcontractor',
  'currency', 'totalAmount', 'valuationBasis', 'sourceKind', 'sourceFilename', 'sourceFile',
  'sourcePage', 'sourcePageCount', 'scope', 'sampleNote', 'representativeSubset', 'demo', 'demoNotice', 'pricingNote'];

export function captureClaimProjectDetails(project: Project): ClaimProjectDetails {
  return clone({
    id: project.id, code: project.code ?? null, name: project.name ?? null,
    country: project.country ?? null, description: project.description ?? null,
    contract: Object.fromEntries(contractFields.map((field) => [field, project.contract?.[field] ?? null])),
  });
}

export function isClaimRelatedEvidence(value: unknown, projectId: string, caseId: string): value is VORelatedEvidence[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  return value.every(entry => {
    if (!record(entry) || !record(entry.link) || !record(entry.report)) return false;
    const link = entry.link;
    const report = entry.report;
    const required = ['id', 'sourceCaseId', 'targetCaseId', 'sourceReference', 'targetReference', 'reason', 'linkedAt', 'linkedBy'];
    if (link.version !== 1 || link.projectId !== projectId || link.targetCaseId !== caseId || link.sourceCaseId === caseId
      || required.some(key => typeof link[key] !== 'string' || !(link[key] as string).trim())
      || !Number.isFinite(Date.parse(link.linkedAt as string)) || seen.has(link.sourceCaseId as string)
      || report.id !== link.sourceCaseId || report.vo !== true || report.projectId && report.projectId !== projectId
      || !record(link.sourceReport) || JSON.stringify(link.sourceReport) !== JSON.stringify(report)) return false;
    seen.add(link.sourceCaseId as string);
    return true;
  });
}

/** Only frozen report evidence is used; legacy reports are never filled from the inbox. */
export function isClaimDailyKPIEvidenceValid(source: SiteReport | null | undefined, projectId: string): boolean {
  if (!record(source) || !Object.hasOwn(source, 'dailyKPIEvidence')) return true;
  return isDailyKPIEvidenceSnapshot(source.dailyKPIEvidence, projectId)
    && (!source.projectCode || source.projectCode === source.dailyKPIEvidence.projectCode)
    && source.sourceMessageId === `${source.dailyKPIEvidence.messageId}-CLARIFIED-001`;
}

function evidenceFor(row: ClaimRow, kind: 'work' | 'vo', source: SiteReport | null | undefined = row.evidence, related?: VORelatedEvidence): ClaimEvidenceReference {
  const evidence: Partial<SiteReport> = record(source) ? source : {};
  return {
    id: related ? `${kind}-${row.id}-related-${related.link.id}` : evidence.areaProgress ? `${kind}-${row.id}-${evidence.id}` : `${kind}-${row.id}`, kind, rowId: row.id,
    rowRef: (kind === 'work' ? row.ref : row.reference) ?? null,
    title: (kind === 'work' ? row.description : row.title) ?? null,
    reportId: evidence.id ?? null, sourceMessageId: evidence.sourceMessageId ?? null,
    date: evidence.date ?? null, verifiedAt: evidence.areaProgress ? evidence.verifiedAt ?? null : row.verifiedAt ?? null,
    reviewer: evidence.verifiedBy ?? row.approval?.actor ?? null,
    sender: evidence.sender ?? null, message: evidence.message ?? null,
    photo: evidence.photo ?? null, photoAlt: evidence.photoAlt ?? null,
    area: evidence.area ?? null, location: evidence.location ?? null,
    sourcePage: row.sourcePage ?? null,
    evidenceDateConfirmation: row.evidenceDateConfirmation ?? null,
    approvalReference: row.approvalReference ?? null, approvalDate: row.approvalDate ?? null,
    approver: row.approver ?? null, approvalStatus: kind === 'vo' ? row.status ?? null : null,
    ...(evidence.areaProgress ? {areaProgress:clone(evidence.areaProgress)} : {}),
    ...(isVoiceNoteEvidenceSnapshot(evidence.voiceNote) ? {voiceNote:clone(evidence.voiceNote)} : {}),
    ...(isMessageMatchReviewSnapshot(evidence.matchReview) ? {matchReview:clone(evidence.matchReview)} : {}),
    ...(isDailyKPIEvidenceSnapshot(evidence.dailyKPIEvidence) ? { dailyKPIEvidence: clone(evidence.dailyKPIEvidence) } : {}),
    ...(evidence.channel === 'manual-vo-mock' ? { channel: evidence.channel,
      reportedInstructionReference: evidence.reportedInstructionReference ?? null } : {}),
    ...(related ? { relatedVO: { linkId: related.link.id, sourceCaseId: related.link.sourceCaseId,
      sourceReference: related.link.sourceReference, reason: related.link.reason,
      linkedAt: related.link.linkedAt, linkedBy: related.link.linkedBy } } : {}),
  };
}

export function buildClaimPack(project: Project, draftId: string): { outcome: 'ready'; pack: ClaimPack } | { outcome: 'invalid'; error: string } {
  const invalid = () => ({ outcome: 'invalid' as const, error: 'Choose a saved claim draft from the selected project.' });
  if (!record(project) || typeof project.id !== 'string' || typeof draftId !== 'string') return invalid();
  const matches = list(project.claimDrafts).filter((entry) => record(entry) && entry.id === draftId);
  if (matches.length !== 1) return invalid();
  const draft = matches[0];
  const snapshot = draft.snapshot;
  if (draft.projectId !== project.id || !record(snapshot) || snapshot.projectId !== project.id
    || snapshot.period !== draft.period || !['draft', 'prepared'].includes(draft.status)
    || !Array.isArray(snapshot.workRows) || !Array.isArray(snapshot.voRows)
    || !record(snapshot.totals) || !record(snapshot.assessment) || !Array.isArray(snapshot.issues)) return invalid();
  if (draft.projectDetails != null && (!record(draft.projectDetails) || draft.projectDetails.id !== project.id)) return invalid();
  if (Object.hasOwn(draft, 'documentDetails') && !isClaimDocumentDetails(draft.documentDetails)) {
    return { outcome: 'invalid', error: 'The saved claim document details are invalid. The saved financial assessment is unchanged.' };
  }
  if (snapshot.claimBasis != null && (!record(snapshot.claimBasis) || snapshot.claimBasis.version !== 1)) return invalid();
  const hasBasis = record(snapshot.claimBasis);
  const workRows = snapshot.workRows.filter((row) => record(row) && row.included === true);
  const voRows = snapshot.voRows.filter((row) => record(row) && row.included === true);
  if ([...workRows, ...voRows].some((row) => row.evidence?.projectId && row.evidence.projectId !== project.id || row.areaEvidence?.some(evidence=>evidence.projectId && evidence.projectId!==project.id))) return invalid();
  if (voRows.some(row => row.relatedEvidence !== undefined && !isClaimRelatedEvidence(row.relatedEvidence, project.id, row.id))) return invalid();
  const sources = [...workRows, ...voRows].flatMap(row => [row.evidence, ...(row.areaEvidence || []), ...(row.relatedEvidence || []).map(entry => entry.report)]);
  if (sources.some(source => !isClaimDailyKPIEvidenceValid(source, project.id))) return {
    outcome: 'invalid', error: 'The saved daily KPI evidence is invalid or belongs to another source. The saved assessment is unchanged.',
  };
  const hasSavedDetails = record(draft.projectDetails);
  return { outcome: 'ready', pack: clone({
    id: draft.id, draftId: draft.id, projectId: draft.projectId,
    period: snapshot.period, cutoff: snapshot.cutoff, currency: snapshot.currency,
    revision: draft.revision, status: draft.status, createdAt: draft.createdAt,
    preparedAt: draft.preparedAt ?? null,
    baselineVersion: snapshot.baselineVersion, baselineLockedAt: snapshot.baselineLockedAt ?? null,
    metadataSource: hasSavedDetails ? 'snapshot' : 'current-fallback',
    metadataNotice: hasSavedDetails ? 'Project and contract details captured when this revision was saved.'
      : 'Legacy draft: project and contract details below are current workspace details, not a saved metadata snapshot. Financial values and evidence remain from the saved draft.',
    projectDetails: hasSavedDetails ? draft.projectDetails! : captureClaimProjectDetails(project),
    ...(Object.hasOwn(draft, 'documentDetails') ? { documentDetails: draft.documentDetails } : {}),
    workRows, voRows, totals: snapshot.totals, assessment: snapshot.assessment,
    ...(hasBasis ? { claimBasis: snapshot.claimBasis } : {}),
    issues: snapshot.issues, canPrepare: snapshot.canPrepare === true,
    evidenceRefs: [...workRows.flatMap((row) => row.areaEvidence?.length ? row.areaEvidence.map(evidence=>evidenceFor(row,'work',evidence)) : [evidenceFor(row, 'work')]), ...voRows.flatMap((row) => [evidenceFor(row, 'vo'), ...(row.relatedEvidence || []).map(related => evidenceFor(row, 'vo', related.report, related))])],
    prototypeNotice: hasBasis ? 'Local demonstration assessment using the saved mock claim basis. Retention is included in the net application; tax, retention releases and other deductions are not supported. Prepared status does not submit, certify or pay a claim; unknown amounts remain blank.' : 'Local demonstration assessment. Prepared status does not submit, certify or pay a claim. Values are before tax, retention and other deductions; unknown amounts remain blank.',
  }) };
}

export function claimPackFilename(pack: ClaimPack, extension = 'csv') {
  const segment = (value: unknown, fallback: string) => String(value ?? '').normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || fallback;
  const suffix = extension === 'pdf' ? 'pdf' : 'csv';
  return `claim-${segment(pack.projectDetails?.code || pack.projectId, 'project')}-${segment(pack.period, 'period')}-r${segment(pack.revision, '1')}.${suffix}`;
}

// Quote every text cell and neutralise spreadsheet formulas. Real numeric
// negatives remain numeric; an unknown value is an empty field, never zero.
function csvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

const columns = ['Section', 'Reference', 'Description', 'Quantity', 'Unit', 'Rate', 'Approved value',
  'Previous claimed', 'Assessed to date', 'This period', 'Currency', 'Evidence reference',
  'Evidence date', 'Reviewer / approver', 'Message / photo', 'Review notes'];

function photoReference(photo: unknown) {
  if (!photo) return null;
  const value = typeof photo === 'string' ? photo : record(photo) ? photo.url ?? photo.src : null;
  if (typeof value !== 'string' || /^\s*data:/i.test(value)) return 'Photo included in preview';
  return value.length > 2048 ? 'Photo reference available in preview' : value;
}

const joined = (...values: unknown[]) => values.filter((value) => value !== null && value !== undefined && value !== '' && value !== false).join('\n');

export function toClaimCSV(pack: ClaimPack) {
  const rows: string[] = [];
  const add = (entry: Record<string, unknown>) => rows.push(columns.map((column) => csvCell(entry[column])).join(','));
  const metadata = (label: string, value: unknown) => add({ Section: 'Claim details', Reference: label, Description: value });
  metadata('Project', pack.projectDetails?.name);
  metadata('Project code', pack.projectDetails?.code);
  metadata('Contract reference', pack.projectDetails?.contract?.reference);
  metadata('Claim month', pack.period);
  metadata('Saved revision', pack.revision);
  metadata('Status', pack.status === 'prepared' ? 'Prepared locally; not submitted or certified' : 'Draft; not submitted or certified');
  metadata('Evidence cutoff', pack.cutoff);
  metadata('Baseline version', pack.baselineVersion);
  metadata('Readiness at save', pack.canPrepare ? 'Ready at save' : 'Incomplete at save');
  metadata('Document notice', pack.prototypeNotice);
  metadata('Project details source', pack.metadataNotice);
  if (Object.hasOwn(pack, 'documentDetails')) {
    if (!isClaimDocumentDetails(pack.documentDetails)) throw new Error('Saved claim document details are invalid.');
    const details = pack.documentDetails;
    for (const [label, value] of [
      ['Recipient company', details.recipientCompany], ['Recipient attention', details.recipientAttention],
      ['Recipient address', details.recipientAddress], ['Printed project name', details.projectName],
      ['Printed project code', details.printedProjectCode], ['Printed contract reference', details.contractReference],
      ['Printed claim reference', details.claimReference || pack.draftId], ['Claim date', details.claimDate],
      ['Company name', details.companyName], ['Company address', details.companyAddress],
      ['Company registration', details.companyRegistration], ['Company phone', details.companyPhone],
      ['Company email', details.companyEmail],
    ]) metadata(label, value);
  }
  metadata('Previous claims checked', pack.assessment?.priorConfirmed === true ? 'Confirmed by QS' : 'Not yet confirmed');
  const basis = pack.claimBasis?.version === 1 ? pack.claimBasis : null;
  if (basis) {
    metadata('Claim basis version', basis.version);
    metadata('Billing method', basis.billingMethod === 'quantityRate' ? 'Cumulative quantity × rate' : 'Needs billing-method review');
    metadata('Retention method', basis.retentionMode === 'none' ? 'No retention' : 'Rate with cumulative cap');
    if (basis.retentionMode === 'rateCap') {
      metadata('Retention rate (%)', basis.retentionRate);
      metadata('Retention cap', basis.retentionCap);
    }
    metadata('Previous claim reference', basis.priorReference || 'Not recorded');
    metadata('Line amount basis', 'Work and variation amounts are gross, before retention. Previous net is the cumulative amount submitted, not certified or paid.');
  }
  if (pack.assessment?.note) metadata('QS note', pack.assessment.note);
  if (pack.assessment?.adjustmentReason) metadata('Adjustment reason', pack.assessment.adjustmentReason);
  for (const issue of list(pack.issues)) add({ Section: 'Review needed', 'Review notes': issue });
  for (const row of list(pack.workRows)) add({
    Section: 'Contract work', Reference: row.ref ?? row.id, Description: row.description,
    Quantity: row.assessedQuantity, Unit: row.unit, Rate: row.rate,
    'Previous claimed': row.previousValue, 'Assessed to date': row.cumulativeValue, 'This period': row.currentValue,
    Currency: pack.currency, 'Review notes': list(row.issues).join('\n'),
  });
  for (const row of list(pack.voRows)) add({
    Section: 'Variation', Reference: row.reference ?? row.id, Description: row.title,
    'Approved value': row.approvedValue, 'Previous claimed': row.previousValue,
    'Assessed to date': row.cumulativeValue, 'This period': row.currentValue, Currency: pack.currency,
    'Evidence reference': row.approvalReference, 'Evidence date': row.approvalDate,
    'Reviewer / approver': row.approver, 'Review notes': list(row.issues).join('\n'),
  });
  if (basis) {
    add({ Section: 'Total', Description: 'Selected work and variations (gross)',
      'Previous claimed': pack.totals?.previousValue, 'Assessed to date': pack.totals?.cumulativeValue,
      'This period': pack.totals?.grossCurrentValue, Currency: pack.currency });
    add({ Section: 'Reconciliation', Description: 'Retention held (cumulative)', 'Assessed to date': pack.totals?.retentionValue, Currency: pack.currency });
    add({ Section: 'Reconciliation', Description: 'Cumulative net after retention', 'Assessed to date': pack.totals?.netCumulativeValue, Currency: pack.currency });
    add({ Section: 'Reconciliation', Description: 'Previously submitted net', 'Previous claimed': pack.totals?.previousNetValue, Currency: pack.currency });
    add({ Section: 'Reconciliation', Description: 'Net claim this period', 'This period': pack.totals?.currentValue, Currency: pack.currency });
    add({ Section: 'Total', Description: 'Contract work this period (gross)', 'This period': pack.totals?.workCurrentValue, Currency: pack.currency });
    add({ Section: 'Total', Description: 'Variations this period (gross)', 'This period': pack.totals?.voCurrentValue, Currency: pack.currency });
  } else {
    add({ Section: 'Total', Description: 'Selected work and variations',
      'Previous claimed': pack.totals?.previousValue, 'Assessed to date': pack.totals?.cumulativeValue,
      'This period': pack.totals?.currentValue, Currency: pack.currency });
    add({ Section: 'Total', Description: 'Contract work this period', 'This period': pack.totals?.workCurrentValue, Currency: pack.currency });
    add({ Section: 'Total', Description: 'Variations this period', 'This period': pack.totals?.voCurrentValue, Currency: pack.currency });
  }
  for (const evidence of list(pack.evidenceRefs)) {
    add({
    Section: evidence.kind === 'vo' ? 'Variation evidence' : 'Work evidence',
    Reference: evidence.rowRef ?? evidence.rowId, Description: evidence.title,
    'Evidence reference': joined(evidence.reportId && `Report: ${evidence.reportId}`,
      evidence.sourceMessageId && `Message: ${evidence.sourceMessageId}`,
      evidence.approvalReference && `Approval: ${evidence.approvalReference}`),
    'Evidence date': joined(evidence.date && `${evidence.channel === 'manual-vo-mock' ? 'Recorded' : 'Reported'}: ${evidence.date}`,
      evidence.verifiedAt && `Verified: ${evidence.verifiedAt}`, evidence.approvalDate && `Approved: ${evidence.approvalDate}`),
    'Reviewer / approver': joined(evidence.reviewer, evidence.approver),
    'Message / photo': joined(evidence.message, photoReference(evidence.photo), evidence.voiceNote && `Synthetic demo voice note: ${evidence.voiceNote.audio.asset}`),
    'Review notes': joined(evidence.channel === 'manual-vo-mock' && 'Source: Manual entry · local demo',
      evidence.relatedVO && `Related evidence from ${evidence.relatedVO.sourceReference}; reason: ${evidence.relatedVO.reason}; linked by ${evidence.relatedVO.linkedBy} at ${evidence.relatedVO.linkedAt}. Supporting evidence only; no additional claim value.`,
      evidence.voiceNote && `Original mock transcript: ${evidence.voiceNote.originalTranscript}; reviewed transcript: ${evidence.voiceNote.reviewedTranscript || 'Not reviewed'}; correction reason: ${evidence.voiceNote.reason || (evidence.voiceNote.reviewId ? 'Original transcript confirmed' : 'Not reviewed')}; reviewed by: ${evidence.voiceNote.reviewedBy || 'Not recorded'} at ${evidence.voiceNote.reviewedAt || 'Not recorded'}`,
      evidence.reportedInstructionReference && `Reported instruction/reference: ${evidence.reportedInstructionReference}`,
      evidence.areaProgress && `Area quantity: ${evidence.areaProgress.allocatedQuantity}; contract quantity: ${evidence.areaProgress.contractQuantity}` ,
      evidence.matchReview && `Match review: ${evidence.matchReview.suggested?.itemRef || evidence.matchReview.originalSuggestion?.fields?.itemId || 'Unknown item'} / ${evidence.matchReview.suggested?.areaCode || 'Unknown area'} to ${evidence.matchReview.confirmed?.itemRef || evidence.matchReview.fields?.itemId || 'Unknown item'} / ${evidence.matchReview.confirmed?.areaCode || 'Unknown area'}; reason: ${evidence.matchReview.reason || 'Original suggestion confirmed'}; reviewed by ${evidence.matchReview.reviewedBy || 'Not recorded'} at ${evidence.matchReview.reviewedAt || 'Not recorded'}`,
      evidence.sender && `${evidence.channel === 'manual-vo-mock' ? 'Entered by' : 'Sender'}: ${evidence.sender}`,
      evidence.sourcePage != null && `Contract page: ${evidence.sourcePage}`,
      evidence.evidenceDateConfirmation?.confirmed && `Undated progress confirmed by QS as of ${evidence.evidenceDateConfirmation.asOf}`),
    });
    if (isDailyKPIEvidenceSnapshot(evidence.dailyKPIEvidence, pack.projectId)) {
      const original = evidence.dailyKPIEvidence;
      const daily = parseDailyKPIMessage(original.text)!;
      const stated = (values: string[]) => values.join('; ') || 'Not stated';
      add({ Section: 'Daily KPI evidence', Reference: evidence.rowRef ?? evidence.rowId,
        Description: 'Original daily KPI update · supporting evidence only',
        'Evidence reference': joined(`Original message: ${original.messageId}`, evidence.reportId && `Clarified report: ${evidence.reportId}`),
        'Evidence date': joined(`Received: ${original.date}`, `Reported date: ${daily.reportedDate || 'Not stated'}`),
        'Message / photo': joined(original.text, photoReference(original.photo)),
        'Review notes': joined(`Sender: ${original.sender}`,
          `Location: ${stated(daily.locations)}`, `Team: ${stated(daily.teams)}`, `Manpower: ${stated(daily.manpower)}`,
          `Work activity: ${stated(daily.activities)}`, `Reported dimensions: ${stated(daily.dimensions)}`,
          `Working hours: ${stated(daily.workingHours)}`, `Remarks: ${stated(daily.remarks)}`, ...daily.issues,
          'Daily activity context only. Dimensions, manpower and hours do not determine QS-assessed quantities, completion or claim amounts.'),
      });
    }
  }
  return `${columns.map(csvCell).join(',')}\r\n${rows.join('\r\n')}\r\n`;
}
