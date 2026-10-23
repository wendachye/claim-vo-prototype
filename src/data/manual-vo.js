// Manual QS capture is a local evidence source, not an instruction or price approval.
import { getDrawingMapping, snapshotMappedArea } from './drawing-mapping.js';
import { getVOCases } from './vo.js';

export const MANUAL_VO_PHOTOS = Object.freeze([
  { value: '/assets/demo-extra-workface-platform.jpg', label: 'Additional access platform', alt: 'Generated demo illustration of an additional access platform; not project evidence.' },
  { value: '/assets/demo-escalator-extra-access.jpg', label: 'Escalator access', alt: 'Generated demo illustration of extra escalator access; not project evidence.' },
  { value: '/assets/demo-additional-column-access.jpg', label: 'Column access', alt: 'Generated demo illustration of additional column access; not project evidence.' },
].map(Object.freeze));

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const clone = value => structuredClone(value);
const allowed = new Set(['projectId', 'submissionId', 'title', 'description', 'areaId', 'areaText', 'relatedItemId', 'instructionReference', 'photo']);
const singleLine = value => !/[\u0000-\u001f\u007f]/.test(value);
function timestamp(now) {
  try { const date = new Date(now); return Number.isFinite(date.getTime()) ? date.toISOString() : null; } catch { return null; }
}

export function createManualVO(project, input, now = new Date()) {
  const invalid = (error, field) => ({ project, outcome: 'invalid', error, ...(field ? { field } : {}) });
  if (!record(project) || !text(project.id) || !text(project.code) || !Array.isArray(project.items)
    || !Array.isArray(project.reports) || !Array.isArray(project.history)
    || (project.voReviews != null && !Array.isArray(project.voReviews))) return invalid('Choose a valid project before adding extra work.');
  if (!record(input)) return invalid('Enter the extra-work details.');
  if (input.projectId != null && input.projectId !== project.id) return invalid('Add extra work to the selected project only.');
  if (Object.keys(input).some(key => !allowed.has(key))) return invalid('Use the manual extra-work fields; review approval and price separately.');
  for (const field of ['submissionId', 'title', 'description', 'areaId', 'areaText', 'relatedItemId', 'instructionReference', 'photo']) {
    if (input[field] != null && typeof input[field] !== 'string') return invalid('Use text for the extra-work details.', field);
  }
  const values = Object.fromEntries(['submissionId', 'title', 'description', 'areaId', 'areaText', 'relatedItemId', 'instructionReference', 'photo'].map(field => [field, text(input[field])]));
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(values.submissionId)) return invalid('Reopen the entry form before saving.');
  if (!values.title || values.title.length > 160 || !singleLine(values.title)) return invalid('Describe the extra work in up to 160 characters.', 'title');
  if (!values.description || values.description.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(values.description)) return invalid('Add the original notes in up to 4,000 characters.', 'description');
  if (values.areaText.length > 120 || !singleLine(values.areaText)) return invalid('Enter an area or location up to 120 characters.', 'areaText');
  if (values.areaId && values.areaText) return invalid('Choose a mapped area or enter an unlisted location, not both.', 'areaText');
  if (values.instructionReference.length > 500 || !singleLine(values.instructionReference)) return invalid('Enter an instruction source or reference up to 500 characters.', 'instructionReference');
  const photo = values.photo ? MANUAL_VO_PHOTOS.find(entry => entry.value === values.photo) : null;
  if (values.photo && !photo) return invalid('Choose a bundled demo photo or leave the attachment blank.', 'photo');

  // A retry returns the original case even if its mapped area was later changed.
  const previous = project.reports.find(report => record(report) && report.projectId === project.id
    && report.channel === 'manual-vo-mock' && report.manualEntry?.submissionId === values.submissionId);
  if (previous) {
    if (JSON.stringify(previous.manualEntry.input) !== JSON.stringify(values)) return invalid('This entry was already saved. Open its review instead of replacing the original notes.');
    if (!getVOCases(project).some(entry => entry.id === previous.id)) return invalid('The saved extra-work case is unavailable. Reopen the extra-work list.');
    return { project, outcome: 'unchanged', caseId: previous.id, reportId: previous.id };
  }

  const area = values.areaId ? getDrawingMapping(project).areas.find(entry => entry.id === values.areaId) : null;
  if (values.areaId && !area) return invalid('Choose an area from the selected project, or enter an unlisted location.', 'areaId');
  const item = values.relatedItemId ? project.items.find(entry => record(entry) && entry.id === values.relatedItemId
    && (entry.projectId == null || entry.projectId === project.id)) : null;
  if (values.relatedItemId && !item) return invalid('Choose a contract item from the selected project.', 'relatedItemId');
  const date = timestamp(now);
  if (!date) return invalid('Use a valid entry date.');
  const reportId = `MANUAL-VO-${project.id}-${values.submissionId}`;
  if (project.reports.some(entry => entry?.id === reportId) || (project.voReviews || []).some(entry => entry?.id === reportId)) return invalid('This entry reference is already in use. Reopen the form.');
  const actor = 'Alex Tan · Demo QS reviewer';
  const report = {
    id: reportId, projectId: project.id, projectCode: project.code,
    itemId: null, location: '', area: area?.code || values.areaText,
    // Explicitly unknown mapping prevents legacy code/item fallbacks inventing a site association.
    areaMapping: area ? snapshotMappedArea(area) : { areaId: null },
    scopeLabel: values.title, message: values.description,
    reportedInstructionReference: values.instructionReference,
    sender: actor, date, receivedAt: date,
    channel: 'manual-vo-mock', origin: 'simulated', demo: true,
    completion: null, completionBasis: 'notApplicable', status: 'needsReview', vo: true,
    photo: photo?.value || null, photoAlt: photo?.alt || null,
    manualEntry: { version: 1, submissionId: values.submissionId, input: clone(values) },
  };
  const reports = [...project.reports, report];
  const entry = getVOCases({ ...project, reports }).find(candidate => candidate.id === reportId);
  const { report: evidence, ...review } = entry;
  review.instructionReference = values.instructionReference;
  review.instructionStatus = values.instructionReference ? 'reported' : 'notRecorded';
  review.relatedItemId = item?.id || null;
  review.createdAt = date;
  return {
    outcome: 'updated', caseId: reportId, reportId,
    project: {
      ...project, reports, voReviews: [...(project.voReviews || []), review],
      history: [{ id: `MANUAL-VO-ADDED-${project.id}-${values.submissionId}`, action: 'Manual extra work added',
        detail: `${review.reference} · ${values.title} · Awaiting QS review`, date, actor }, ...project.history],
    },
  };
}
