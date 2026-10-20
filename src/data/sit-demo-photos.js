// Distinct generated illustrations for known S.I.T. demo messages only.
// Refresh is explicit: prior illustrations are archived, not treated as new
// site evidence, and saved claim revisions are never rewritten.
import { initialItems } from './sit-contract-source.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const clone = (value) => structuredClone(value);
const sourceById = new Map(initialItems.map((item) => [item.id, item]));
const scopeFields = ['ref', 'description', 'location', 'subsection', 'pricingType'];
const entry = (suffix, kind, itemId, area, file, subject, relatedIds = []) => ({
  suffix, kind, itemId, area, photo: `/assets/${file}`,
  photoAlt: `Generated demo illustration of ${subject}; not project evidence.`,
  scopeIds: [...new Set([itemId, ...relatedIds].filter(Boolean))],
});
const catalogue = [
  entry('CASE-WA-001', 'progress', 'WI-001', 'Area W3-ST31', 'demo-scaffold.jpg', 'partly erected external façade scaffolding'),
  entry('CASE-WA-002', 'progress', 'WI-002', 'Area W3-ST34', 'demo-w3-st34-complete.jpg', 'an erected façade access scaffold with working decks and guardrails'),
  entry('CASE-WA-003', 'progress', 'WI-001', 'Area W3-ST31', 'demo-w3-st31-progress.jpg', 'a later-stage view of external façade scaffold installation'),
  entry('CASE-WA-004', 'progress', 'WI-004', 'Area W5-ST51', 'demo-w5-st51-progress.jpg', 'partly erected façade access scaffold beside a concrete stair bay'),
  entry('CASE-WA-005', 'vo', null, 'Area W3-ST31', 'demo-platform.jpg', 'a temporary access platform for an additional-access scope query', ['WI-001']),
  entry('CASE-WA-006', 'clarification', null, 'W5', 'demo-w5-unclear-progress.jpg', 'several façade scaffold zones requiring location clarification', ['WI-004', 'WI-005']),
  entry('CASE-WA-007', 'vo', null, 'Area W5-EAST', 'demo-extra-workface-platform.jpg', 'temporary platform access beside a separate unfinished work face', ['WI-005']),
  entry('CASE-WA-008', 'vo', null, 'Area W3-ST34', 'demo-scaffold-safety-adjustment.jpg', 'a routine scaffold guardrail, toe-board and bracing adjustment', ['WI-002']),
  entry('SIT-AREA-W3-ST36-PROGRESS', 'progress', 'WI-003', 'Area W3-ST36', 'demo-w3-south-facade.jpg', 'partly installed façade scaffold around a concrete building corner'),
  entry('SIT-AREA-W5-NORTH-PROGRESS', 'progress', 'WI-006', 'Area W5-NORTH', 'demo-w5-north-facade.jpg', 'a partially scaffolded building elevation with safety mesh'),
  entry('SIT-AREA-W5-ESCALATOR-PROGRESS', 'progress', 'WI-007', 'Area W5-ESCALATOR', 'demo-escalator-access.jpg', 'a working access platform around an unfinished escalator opening'),
  entry('SIT-AREA-W3-COLUMNS-PROGRESS', 'progress', 'WI-008', 'Area W3-COLUMNS', 'demo-column-scaffold.jpg', 'circular-column working scaffold around concrete columns'),
  entry('SIT-AREA-W3-AMPH-A-PROGRESS', 'progress', 'WI-009', 'Area W3-AMPH-A', 'demo-w3-amphitheatre-platform.jpg', 'an internal scaffold platform beside stepped amphitheatre seating', ['WI-012']),
  entry('SIT-AREA-W5-AMPH-AB-PROGRESS', 'progress', 'WI-010', 'Area W5-AMPH-AB', 'demo-w5-amphitheatre-platform.jpg', 'partly erected internal platform scaffold across amphitheatre seating wings', ['WI-012']),
  entry('SIT-AREA-W3-LIFT-CORES-PROGRESS', 'progress', 'WI-011', 'Area W3-LIFT-CORES', 'demo-lift-core.jpg', 'a scaffold working platform within an unfinished concrete lift core'),
  entry('SIT-AREA-W3-TEMP-ACCESS-SCOPE-CHECK', 'clarification', 'WI-013', 'Area W3-TEMP-ACCESS', 'demo-temporary-stair.jpg', 'a removable temporary construction stair tower'),
  entry('SIT-AREA-W5-ESCALATOR-VO-QUERY', 'vo', null, 'Area W5-ESCALATOR', 'demo-escalator-extra-access.jpg', 'an escalator-opening work face and staged access-extension materials', ['WI-007']),
  entry('SIT-AREA-W3-COLUMNS-VO-QUERY', 'vo', null, 'Area W3-COLUMNS', 'demo-additional-column-access.jpg', 'a separate bare concrete column with scaffold materials staged nearby', ['WI-008']),
];
const knownPhotos = new Set([
  '/assets/demo-scaffold.jpg', '/assets/demo-platform.jpg',
  '/assets/demo-escalator-access.jpg', '/assets/demo-lift-core.jpg', '/assets/demo-temporary-stair.jpg',
  ...catalogue.map((item) => item.photo),
]);
const local = (project, value) => record(value) && value.projectId === project.id && value.projectCode === project.code;
const uniqueRecords = (values) => Array.isArray(values) && values.every((value) => record(value) && text(value.id))
  && new Set(values.map((value) => value.id)).size === values.length;
const sourceProject = (project) => record(project) && text(project.id) && text(project.code)
  && project.providedContractDemo === true && project.contract?.sourceKind === 'provided'
  && project.contract?.sourceProfile === 'sit-loa-2021' && project.contract?.reference === 'CCSC/SIT/SC/21.183'
  && uniqueRecords(project.items);
const scopeMatches = (project, id) => {
  const source = sourceById.get(id), item = project.items.find((value) => value.id === id);
  return Boolean(source && item
    && (item.projectId == null || item.projectId === '' || item.projectId === project.id)
    && (item.projectCode == null || item.projectCode === '' || item.projectCode === project.code)
    && scopeFields.every((field) => item[field] === source[field]));
};
const generatedPhoto = (value) => knownPhotos.has(value.photo) && /generated/i.test(value.photoAlt || '')
  && (value.demoPhotoHistory === undefined || Array.isArray(value.demoPhotoHistory));
const unchangedPhoto = (value, desired) => value.photo === desired.photo && value.photoAlt === desired.photoAlt;

/** The getter also accepts a newly constructed message, before inbox insertion. */
export function getSITDemoPhoto(project, message) {
  if (!sourceProject(project) || !local(project, message)) return null;
  const fixture = catalogue.find((value) => message.id === `${project.id}-${value.suffix}`);
  if (!fixture || message.kind !== fixture.kind || (message.itemId ?? null) !== fixture.itemId
    || message.area !== fixture.area || !fixture.scopeIds.every((id) => scopeMatches(project, id))
    || message.location !== sourceById.get(fixture.scopeIds[0])?.location
    || typeof message.text !== 'string' || !message.text.startsWith(`${project.code} |`)) return null;
  return { photo: fixture.photo, photoAlt: fixture.photoAlt };
}

const unavailable = (reason) => ({ available: false, messageCount: 0, reportCount: 0, changes: [], skipped: [], reason });

/** Preview only known generated illustrations and their consistent saved reports. */
export function getSITDemoPhotoUpdate(project) {
  if (!sourceProject(project)) return unavailable('Choose the original S.I.T. contract demo.');
  if (!uniqueRecords(project.whatsappMessages) || !uniqueRecords(project.reports)
    || !project.whatsappMessages.every((value) => local(project, value))
    || !project.reports.every((value) => local(project, value))
    || !Array.isArray(project.history) || !project.history.every(record)) {
    return unavailable('Review this project’s saved messages and reports before changing demo illustrations.');
  }
  const changes = [], skipped = [];
  for (const message of project.whatsappMessages) {
    const desired = getSITDemoPhoto(project, message);
    if (!desired) continue;
    const reports = project.reports.filter((report) => report.sourceMessageId === message.id || report.id === message.reportId);
    const expectedReportId = /-CASE-WA-00[1-4]$/.test(message.id)
      ? message.id.replace('-CASE-WA-', '-CASE-REPORT-') : `WA-REPORT-${message.id}`;
    if (reports.some((report) => report.id !== expectedReportId || report.sourceMessageId !== message.id
      || report.area !== message.area || (report.itemId ?? null) !== (message.itemId ?? null)
      || report.message !== message.text)) {
      skipped.push({ messageId: message.id, reason: 'The saved report differs from this sample. Its original illustration was retained.' });
      continue;
    }
    if (!generatedPhoto(message) || reports.some((report) => !generatedPhoto(report)
      || report.photo !== message.photo || report.photoAlt !== message.photoAlt)) {
      skipped.push({ messageId: message.id, reason: 'A photo or attachment was changed. It was retained without replacement.' });
      continue;
    }
    const messageChanges = !unchangedPhoto(message, desired);
    const reportIds = reports.filter((report) => !unchangedPhoto(report, desired)).map((report) => report.id);
    if (messageChanges || reportIds.length) changes.push({ messageId: message.id, messageChanges, reportIds, ...desired });
  }
  return { available: true, messageCount: changes.filter((value) => value.messageChanges).length,
    reportCount: changes.reduce((count, value) => count + value.reportIds.length, 0), changes, skipped, reason: null };
}

/** Explicit replacement of synthetic demo illustrations, with prior paths retained. */
export function refreshSITDemoPhotos(project, now = new Date()) {
  const preview = getSITDemoPhotoUpdate(project);
  if (!preview.available) return { ...preview, project, outcome: 'unavailable', error: preview.reason };
  if (!preview.changes.length) return { ...preview, project, outcome: 'unchanged' };
  let date;
  try { date = new Date(now).toISOString(); } catch { /* Invalid dates leave all records unchanged. */ }
  if (!date) return { ...preview, project, outcome: 'unavailable', error: 'Choose a valid date before changing demo illustrations.' };
  const archive = (value, change) => ({ ...value, photo: change.photo, photoAlt: change.photoAlt,
    demoPhotoHistory: [...clone(value.demoPhotoHistory || []), {
      photo: value.photo, photoAlt: value.photoAlt, replacedAt: date,
      reason: 'User-requested replacement with a distinct work-related generated demo illustration.',
    }] });
  const messageChanges = new Map(preview.changes.filter((value) => value.messageChanges).map((value) => [value.messageId, value]));
  const reportChanges = new Map(preview.changes.flatMap((value) => value.reportIds.map((id) => [id, value])));
  const eventBase = `${project.id}-DEMO-PHOTOS-${Date.parse(date)}`;
  const ids = new Set(project.history.map((value) => value.id));
  let eventId = eventBase, index = 1;
  while (ids.has(eventId)) eventId = `${eventBase}-${index++}`;
  return { ...preview, outcome: 'updated', project: { ...project,
    whatsappMessages: project.whatsappMessages.map((value) => messageChanges.has(value.id) ? archive(value, messageChanges.get(value.id)) : value),
    reports: project.reports.map((value) => reportChanges.has(value.id) ? archive(value, reportChanges.get(value.id)) : value),
    history: [{ id: eventId, action: 'Demo illustrations refreshed', date, actor: 'Alex Tan · Demo reviewer',
      detail: `${preview.messageCount} sample messages and ${preview.reportCount} paired reports now use work-related generated illustrations. Prior illustration paths and saved claim revisions are retained.` }, ...project.history],
  } };
}
