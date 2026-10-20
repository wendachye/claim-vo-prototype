// Read-only exports of saved local assessments; never rebuild from live progress.
const clone = (value) => structuredClone(value);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = (value) => Array.isArray(value) ? value : [];
const contractFields = ['name', 'projectName', 'reference', 'date', 'mainContractor', 'subcontractor',
  'currency', 'totalAmount', 'valuationBasis', 'sourceKind', 'sourceFilename', 'sourceFile',
  'sourcePage', 'sourcePageCount', 'scope', 'sampleNote', 'representativeSubset', 'demo', 'demoNotice', 'pricingNote'];

export function captureClaimProjectDetails(project) {
  return clone({
    id: project.id, code: project.code ?? null, name: project.name ?? null,
    country: project.country ?? null, description: project.description ?? null,
    contract: Object.fromEntries(contractFields.map((field) => [field, project.contract?.[field] ?? null])),
  });
}

function evidenceFor(row, kind) {
  const evidence = record(row.evidence) ? row.evidence : {};
  return {
    id: `${kind}-${row.id}`, kind, rowId: row.id,
    rowRef: (kind === 'work' ? row.ref : row.reference) ?? null,
    title: (kind === 'work' ? row.description : row.title) ?? null,
    reportId: evidence.id ?? null, sourceMessageId: evidence.sourceMessageId ?? null,
    date: evidence.date ?? null, verifiedAt: row.verifiedAt ?? null,
    reviewer: evidence.verifiedBy ?? row.approval?.actor ?? null,
    sender: evidence.sender ?? null, message: evidence.message ?? null,
    photo: evidence.photo ?? null, photoAlt: evidence.photoAlt ?? null,
    area: evidence.area ?? null, location: evidence.location ?? null,
    sourcePage: row.sourcePage ?? null,
    evidenceDateConfirmation: row.evidenceDateConfirmation ?? null,
    approvalReference: row.approvalReference ?? null, approvalDate: row.approvalDate ?? null,
    approver: row.approver ?? null, approvalStatus: kind === 'vo' ? row.status ?? null : null,
  };
}

export function buildClaimPack(project, draftId) {
  const invalid = () => ({ outcome: 'invalid', error: 'Choose a saved claim draft from the selected project.' });
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
  const workRows = snapshot.workRows.filter((row) => record(row) && row.included === true);
  const voRows = snapshot.voRows.filter((row) => record(row) && row.included === true);
  if ([...workRows, ...voRows].some((row) => row.evidence?.projectId && row.evidence.projectId !== project.id)) return invalid();
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
    projectDetails: hasSavedDetails ? draft.projectDetails : captureClaimProjectDetails(project),
    workRows, voRows, totals: snapshot.totals, assessment: snapshot.assessment,
    issues: snapshot.issues, canPrepare: snapshot.canPrepare === true,
    evidenceRefs: [...workRows.map((row) => evidenceFor(row, 'work')), ...voRows.map((row) => evidenceFor(row, 'vo'))],
    prototypeNotice: 'Local demonstration assessment. Prepared status does not submit, certify or pay a claim. Values are before tax, retention and other deductions; unknown amounts remain blank.',
  }) };
}

export function claimPackFilename(pack, extension = 'csv') {
  const segment = (value, fallback) => String(value ?? '').normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || fallback;
  const suffix = extension === 'pdf' ? 'pdf' : 'csv';
  return `claim-${segment(pack.projectDetails?.code || pack.projectId, 'project')}-${segment(pack.period, 'period')}-r${segment(pack.revision, '1')}.${suffix}`;
}

// Quote every text cell and neutralise spreadsheet formulas. Real numeric
// negatives remain numeric; an unknown value is an empty field, never zero.
function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

const columns = ['Section', 'Reference', 'Description', 'Quantity', 'Unit', 'Rate', 'Approved value',
  'Previous claimed', 'Assessed to date', 'This period', 'Currency', 'Evidence reference',
  'Evidence date', 'Reviewer / approver', 'Message / photo', 'Review notes'];

function photoReference(photo) {
  if (!photo) return null;
  const value = typeof photo === 'string' ? photo : record(photo) ? photo.url ?? photo.src : null;
  if (typeof value !== 'string' || /^\s*data:/i.test(value)) return 'Photo included in preview';
  return value.length > 2048 ? 'Photo reference available in preview' : value;
}

const joined = (...values) => values.filter((value) => value !== null && value !== undefined && value !== '' && value !== false).join('\n');

export function toClaimCSV(pack) {
  const rows = [];
  const add = (entry) => rows.push(columns.map((column) => csvCell(entry[column])).join(','));
  const metadata = (label, value) => add({ Section: 'Claim details', Reference: label, Description: value });
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
  metadata('Previous claims checked', pack.assessment?.priorConfirmed === true ? 'Confirmed by QS' : 'Not yet confirmed');
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
  add({ Section: 'Total', Description: 'Selected work and variations',
    'Previous claimed': pack.totals?.previousValue, 'Assessed to date': pack.totals?.cumulativeValue,
    'This period': pack.totals?.currentValue, Currency: pack.currency });
  add({ Section: 'Total', Description: 'Contract work this period', 'This period': pack.totals?.workCurrentValue, Currency: pack.currency });
  add({ Section: 'Total', Description: 'Variations this period', 'This period': pack.totals?.voCurrentValue, Currency: pack.currency });
  for (const evidence of list(pack.evidenceRefs)) add({
    Section: evidence.kind === 'vo' ? 'Variation evidence' : 'Work evidence',
    Reference: evidence.rowRef ?? evidence.rowId, Description: evidence.title,
    'Evidence reference': joined(evidence.reportId && `Report: ${evidence.reportId}`,
      evidence.sourceMessageId && `Message: ${evidence.sourceMessageId}`,
      evidence.approvalReference && `Approval: ${evidence.approvalReference}`),
    'Evidence date': joined(evidence.date && `Reported: ${evidence.date}`,
      evidence.verifiedAt && `Verified: ${evidence.verifiedAt}`, evidence.approvalDate && `Approved: ${evidence.approvalDate}`),
    'Reviewer / approver': joined(evidence.reviewer, evidence.approver),
    'Message / photo': joined(evidence.message, photoReference(evidence.photo)),
    'Review notes': joined(evidence.sender && `Sender: ${evidence.sender}`,
      evidence.sourcePage != null && `Contract page: ${evidence.sourcePage}`,
      evidence.evidenceDateConfirmation?.confirmed && `Undated progress confirmed by QS as of ${evidence.evidenceDateConfirmation.asOf}`),
  });
  return `${columns.map(csvCell).join(',')}\r\n${rows.join('\r\n')}\r\n`;
}
