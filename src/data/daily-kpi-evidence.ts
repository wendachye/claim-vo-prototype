import type { Project } from '../types/domain';
import type { DailyKPIEvidence } from '../types/daily-kpi';
import { parseDailyKPIMessage } from './daily-kpi-message.ts';
import { DEMO_MESSAGE_PHOTOS } from './demo-message-intake.ts';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown, limit: number) => typeof value === 'string' && Boolean(value.trim()) && value.length <= limit
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const id = (value: unknown) => text(value, 1_000) && value === (value as string).trim();
const optionalText = (value: unknown, limit: number) => value === null || typeof value === 'string' && value.length <= limit
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const validDate = (value: unknown) => text(value, 100) && Number.isFinite(Date.parse(value as string));
const fields = ['version', 'projectId', 'projectCode', 'messageId', 'text', 'sender', 'senderRole', 'date', 'photo', 'photoAlt'] as const;
const validPhotoPair = (photo: unknown, photoAlt: unknown) => photo === null ? photoAlt === null
  : DEMO_MESSAGE_PHOTOS.some(entry => entry.photo === photo && entry.photoAlt === photoAlt);

function matchingProjectLabel(rawText: string, projectCode: string) {
  const labels = [...rawText.matchAll(/^[ \t]*project(?:[ \t]+code)?[ \t]*[:=-]+[ \t]*([^\r\n]+)$/gim)];
  return labels.every(match => match[1].trim().toUpperCase() === projectCode.toUpperCase());
}

/** Validate frozen evidence without reading today's inbox, mapping or daily report. */
export function isDailyKPIEvidenceSnapshot(value: unknown, projectId?: string, projectCode?: string): value is DailyKPIEvidence {
  return record(value) && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field))
    && value.version === 1 && id(value.projectId) && id(value.projectCode) && id(value.messageId)
    && (projectId === undefined || value.projectId === projectId) && (projectCode === undefined || value.projectCode === projectCode)
    && text(value.text, 4_000) && text(value.sender, 500) && optionalText(value.senderRole, 500)
    && validDate(value.date) && validPhotoPair(value.photo, value.photoAlt)
    && matchingProjectLabel(value.text as string, value.projectCode as string) && parseDailyKPIMessage(value.text as string) !== null;
}

/** Capture only a selected-project original saved through the explicit mock daily intake. */
export function captureDailyKPIEvidence(project: Pick<Project, 'id' | 'code'>, source: unknown): DailyKPIEvidence | null {
  if (!record(source) || source.projectId !== project.id || source.projectCode !== project.code
    || source.kind !== 'clarification' || source.replyToMessageId || source.vo || source.audio || source.originalTranscript
    || !['clarification', 'replied'].includes(String(source.status))
    || source.channel !== 'whatsapp-intake-mock' || source.demo !== true || source.origin !== 'simulated'
    || !record(source.demoIntake) || source.demoIntake.version !== 1 || source.demoIntake.status !== 'clarification'
    || typeof source.demoIntake.submissionId !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(source.demoIntake.submissionId)
    || source.id !== `DEMO-MESSAGE-${project.id}-${source.demoIntake.submissionId}`
    || !record(source.demoIntake.input) || source.demoIntake.input.projectId !== project.id || source.demoIntake.input.text !== source.text
    || typeof source.demoIntake.input.photoId !== 'string' || source.demoIntake.receivedAt !== source.date || source.receivedAt !== source.date
    || !text(source.demoIntake.previewKey, 500_000)) return null;
  const photoId = source.demoIntake.input.photoId;
  const selectedPhoto = photoId ? DEMO_MESSAGE_PHOTOS.find(entry => entry.id === photoId) : null;
  if (photoId && !selectedPhoto || (source.photo ?? null) !== (selectedPhoto?.photo || null)
    || (source.photoAlt ?? null) !== (selectedPhoto?.photoAlt || null)) return null;
  const snapshot = { version: 1, projectId: source.projectId, projectCode: source.projectCode, messageId: source.id,
    text: source.text, sender: source.sender, senderRole: source.senderRole ?? null, date: source.date,
    photo: source.photo ?? null, photoAlt: source.photoAlt ?? null };
  return isDailyKPIEvidenceSnapshot(snapshot, project.id, project.code) ? structuredClone(snapshot) : null;
}

/** Processing and clarification histories must still refer to exactly the captured original. */
export function dailyKPIEvidenceMatchesSource(snapshot: unknown, project: Pick<Project, 'id' | 'code'>, source: unknown): boolean {
  if (!isDailyKPIEvidenceSnapshot(snapshot, project.id, project.code)) return false;
  const expected = captureDailyKPIEvidence(project, source);
  return expected !== null && fields.every(field => snapshot[field] === expected[field]);
}
