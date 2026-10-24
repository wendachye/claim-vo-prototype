import type { DateInput, DrawingArea, Project, SiteReport, WhatsAppMessage, WorkItem } from '../types/domain';
import { getAreaLinkStatus, getDrawingMapping } from './drawing-mapping.ts';
import { getAreaAllocationSnapshot, getAreaItemProgress, getItemAreaAllocation, sameProgressScope } from './area-allocations.ts';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const percent = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const time = (value: unknown): number | null => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const local = (project: Project, value: { projectId?: unknown; projectCode?: unknown }) => (!value.projectId || value.projectId === project.id)
  && (!value.projectCode || value.projectCode === project.code);
const statuses = new Set(['pending', 'needsReview', 'needsClarification', 'clarification', 'verified', 'approved']);
const suffixes = ['REPEATED', 'LOWER', 'OLDER'] as const;
interface Context { item: WorkItem; area: DrawingArea; latest: SiteReport; reported: number; verified: number }

function currentContext(project: Project): Context | null {
  const areas = getDrawingMapping(project).areas;
  const items = [...project.items].sort((a, b) => Number(b.id === 'WI-001') - Number(a.id === 'WI-001'));
  for (const item of items) {
    if (!record(item) || !text(item.id) || item.pricingType !== 'measured' || !local(project, item)
      || project.items.filter(entry => entry.id === item.id).length !== 1) continue;
    const allocation = getItemAreaAllocation(project, item.id);
    if (!allocation.valid) continue;
    const mapped = areas.filter(area => area.workItemIds.includes(item.id))
      .sort((a, b) => Number(b.code === 'W3-ST31') - Number(a.code === 'W3-ST31'));
    for (const area of mapped) {
      const areaProgress = allocation.split ? getAreaAllocationSnapshot(project, area.id, item.id) : null;
      if (allocation.split && !areaProgress) continue;
      const scope = { itemId: item.id, ...(areaProgress ? { areaProgress } : {}) };
      const reports = project.reports.filter(report => record(report) && local(project, report) && text(report.id)
        && project.reports.filter(entry => entry.id === report.id).length === 1 && !report.vo && report.kind !== 'vo'
        && statuses.has(report.status) && report.completionBasis === 'cumulative' && percent(report.completion) !== null
        && time(report.date) !== null && sameProgressScope(report, scope)
        && (!areaProgress || report.areaProgress?.allocatedQuantity === areaProgress.allocatedQuantity
          && report.areaProgress.contractQuantity === areaProgress.contractQuantity));
      const latest = reports.map((report, index) => ({ report, index }))
        .sort((a, b) => time(b.report.date)! - time(a.report.date)! || b.index - a.index)[0]?.report;
      if (!latest) continue;
      const linked = getAreaLinkStatus(project, latest);
      if (linked.blocked || linked.ambiguous || linked.conflict || linked.area?.id !== area.id) continue;
      const safeProject = { ...project, reports };
      const reported = areaProgress ? getAreaItemProgress(safeProject, area.id, item.id, 'reported').completion : percent(item.reported);
      const verified = areaProgress ? getAreaItemProgress(safeProject, area.id, item.id, 'verified').completion : percent(item.verified);
      // No synthetic source or verification is made to fill missing physical progress.
      if (reported === null || verified === null || reported !== latest.completion || reported < verified || reported <= 0 && verified <= 0) continue;
      return { item, area, latest, reported, verified };
    }
  }
  return null;
}

/** Reusable inbox-only examples in the selected project. Existing evidence and
 * physical/financial state are never reset, replaced or added to the seed. */
export function addProgressCheckExamples(project: Project, now: DateInput = new Date()): { project: Project; outcome: 'updated' | 'unchanged' | 'invalid'; messageId?: string; error?: string } {
  const invalid = (error: string) => ({ project, outcome: 'invalid' as const, error });
  if (!record(project) || !text(project.id) || !text(project.code) || !Number.isSafeInteger(project.version) || project.version < 1
    || !Array.isArray(project.items) || !project.items.every(record) || !Array.isArray(project.reports) || !project.reports.every(record)
    || !Array.isArray(project.history) || !project.history.every(record) || !Array.isArray(project.whatsappMessages)
    || !project.whatsappMessages.every(message => record(message) && text(message.id) && message.projectId === project.id && message.projectCode === project.code)
    || new Set(project.whatsappMessages.map(message => message.id)).size !== project.whatsappMessages.length) {
    return invalid('Choose a valid project with a saved inbox before opening progress check examples.');
  }
  const prefix = `${project.id}-PROGRESS-CHECK`;
  const ids = suffixes.map(suffix => `${prefix}-${suffix}`);
  const existing = project.whatsappMessages.find(message => ids.includes(message.id));
  // A partial/deleted set is not recreated: reopening keeps every edited source.
  if (existing) return { project, outcome: 'unchanged', messageId: existing.id };
  if (project.reports.some(report => ids.some(id => report.id === `WA-REPORT-${id}` || report.sourceMessageId === id))
    || project.history.some(event => event.id === `${prefix}-ADDED`)) {
    return invalid('These examples were already added. Existing records are kept; open another inbox update instead.');
  }
  let received: number;
  try { received = typeof now === 'string' && !now.trim() ? NaN : new Date(now).getTime(); } catch { received = NaN; }
  if (!Number.isFinite(received)) return invalid('Choose a valid received date for the demo examples.');
  const context = currentContext(project);
  if (!context) return invalid('Progress check examples need a mapped measured item with dated reported and verified progress. Review a site update first.');
  const { item, area, latest, reported, verified } = context;
  const latestTime = time(latest.date)!;
  if (latestTime > received) return invalid('The latest report is later than this demo received date. Review its date before adding examples.');
  const date = new Date(received).toISOString();
  let older: string;
  try { older = new Date(latestTime - 60_000).toISOString(); } catch { return invalid('The latest report date cannot support an older-update example.'); }
  const safePhoto = typeof latest.photo === 'string' && /^\/assets\/demo-[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/.test(latest.photo)
    && /(?:generated|demo)/i.test(latest.photoAlt || '') ? latest.photo : null;
  const lower = Math.max(0, (verified > 0 ? verified : reported) - 10);
  const messages: WhatsAppMessage[] = suffixes.map(suffix => {
    const completion = suffix === 'LOWER' ? lower : reported;
    const messageDate = suffix === 'OLDER' ? older : date;
    const description = suffix === 'REPEATED' ? 'Repeated cumulative total' : suffix === 'LOWER' ? 'Lower cumulative completion' : 'Older event received later';
    const source = `${project.code} | ${item.location || 'Site location'} | ${area.code} | ${item.id}\nCOMPLETE=${completion}% TOTAL\nSimulated progress check: ${description.toLowerCase()}.`;
    return { id: `${prefix}-${suffix}`, projectId: project.id, projectCode: project.code, kind: 'progress', status: 'new',
      sender: 'Demo worker · Progress check', senderRole: 'Site worker · demo', date: messageDate, receivedAt: date,
      itemId: item.id, area: area.code, location: item.location, completion, completionBasis: 'cumulative', text: source,
      demo: true, origin: 'simulated', channel: 'whatsapp-progress-check-mock', photo: safePhoto,
      photoAlt: safePhoto ? 'Bundled generated demo illustration reused for progress checks; not project evidence.' : null,
      processingNote: `${description} · simulated example. Worker event time: ${messageDate}; received in the mock inbox: ${date}. Confirm its match before adding progress; supervisor verification stays separate.`,
      matchSuggestion: { version: 1, origin: 'mock', baselineVersion: project.version,
        fields: { itemId: item.id, areaId: area.id, completion }, sourceExcerpt: source,
        reason: 'Deterministic demo suggestion from the exact saved item and area codes and explicit cumulative total.' },
    };
  });
  return { outcome: 'updated', messageId: messages[0].id, project: { ...project,
    whatsappMessages: [...project.whatsappMessages, ...messages],
    history: [{ id: `${prefix}-ADDED`, action: 'Progress check examples added', actor: 'Demo setup', date,
      detail: `${item.id} · ${area.code} · Three simulated inbox updates only. Existing progress and saved claims are unchanged.` }, ...project.history] } };
}
