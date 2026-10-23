import type { Project, WorkItem } from "../types/domain";
// Read-only shortcuts from a contract row to its own site evidence or message format.
import { getAreasForItem } from './drawing-mapping.ts';
import { getMessageReport } from './whatsapp.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const code = (value: unknown) => text(value).toUpperCase();
const date = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN;

function inProject(project: Project, entry: unknown) {
  return record(entry)
    && (entry.projectId == null || entry.projectId === '' || entry.projectId === project.id)
    && (entry.projectCode == null || entry.projectCode === '' || code(entry.projectCode) === code(project.code));
}

function workItem(project: Project, itemId: string): WorkItem | null {
  if (!record(project) || !text(project.id) || !text(project.code) || !text(itemId)) return null;
  return (Array.isArray(project.items) ? project.items : [])
    .find((item) => inProject(project, item) && item.id === itemId) || null;
}

export function getWorkItemSiteMessage(project: Project, itemId: string) {
  if (!workItem(project, itemId) || !Array.isArray(project.whatsappMessages)) return null;
  const messages = project.whatsappMessages.filter((message) => inProject(project, message)
    && text(message.id) && !message.vo && message.kind !== 'vo');
  const ids = new Map<string, number>();
  for (const message of messages) ids.set(message.id, (ids.get(message.id) || 0) + 1);
  return messages.filter((message) => {
    if (ids.get(message.id) !== 1) return false;
    const report = getMessageReport(project, message);
    if (report) return !report.vo && report.kind !== 'vo' && report.itemId === itemId;
    return message.kind === 'progress' && message.itemId === itemId;
  }).sort((first, second) => {
    const firstDate = date(first.date), secondDate = date(second.date);
    const firstValid = Number.isFinite(firstDate), secondValid = Number.isFinite(secondDate);
    if (firstValid !== secondValid) return firstValid ? -1 : 1;
    return firstValid ? secondDate - firstDate : 0;
  })[0] || null;
}

export function getWorkItemMessageSample(project: Project, itemId: string) {
  const item = workItem(project, itemId);
  if (!item || ['included', 'rateOnly'].includes(item.pricingType)) return null;
  const area = getAreasForItem(project, itemId)[0];
  const reported = item.reported;
  const completion = typeof reported === 'number' && Number.isFinite(reported) && reported >= 0 && reported <= 100
    ? `${reported}%` : '[total %]';
  return [
    `${project.code} | ${text(item.location) || '[confirm location]'} | ${area ? `Area ${area.code}` : '[confirm area]'} | ${item.id}`,
    `Contract ref: ${text(item.ref) ? item.ref : '[confirm contract reference]'}`,
    text(item.description) || '[confirm work description]',
    `COMPLETE=${completion} TOTAL`,
    'Attach a site photo.',
  ].join('\n');
}
