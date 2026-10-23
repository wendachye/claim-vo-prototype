import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput } from '../types/domain';
const metadataLine = /^(?:CONTRACT(?:\s+CONTEXT)?|SCOPE|COMPLETE|RELATED\s+INCLUDED\s+SCOPE|OPTION\s+\d+)\s*=/i;
const demoNote = /^(?:Simulated\b|The source row is context only\.|Possible source context \(not matched\):)/i;
const fallbackDetail = 'Open the original message and photo.';

function withoutHeader(line: string, message: Partial<WhatsAppMessage>) {
  const parts = line.split('|').map((part) => part.trim());
  if (parts.length < 2 || !message.projectCode || parts[0] !== message.projectCode) return line;
  const fields = [message.location, message.area, message.itemId].filter((value) => typeof value === 'string');
  return parts.slice(1).filter((part) => part && !fields.includes(part)
    && !/^WI-[\w-]+$/i.test(part)).join(' | ');
}

// List summaries use saved demo fields and an excerpt. They never interpret a photo or price work.
// The original message remains unchanged and is displayed in the review panel.
export function getMessageSummary(message: Partial<WhatsAppMessage> = {}) {
  const validTotal = message.kind === 'progress' && message.completionBasis === 'cumulative'
    && typeof message.completion === 'number' && Number.isFinite(message.completion)
    && message.completion >= 0 && message.completion <= 100;
  const title = message.kind === 'vo' ? 'Possible extra work'
    : message.kind === 'clarification' ? 'Unclear site update'
      : validTotal ? `${message.completion}% reported total`
        : message.kind === 'progress' ? 'Progress update' : 'Site update';
  const detail = (typeof message.text === 'string' ? message.text : '').split(/\r?\n/)
    .map((line) => withoutHeader(line.trim(), message))
    .find((line) => line && !metadataLine.test(line) && !demoNote.test(line)) || fallbackDetail;
  return { title, detail };
}
