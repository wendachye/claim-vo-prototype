import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput } from '../types/domain';
// Frontend-only fixtures. Fields are prefilled demonstration results, not AI output.
import { getAreaLinkStatus, snapshotMappedArea } from './drawing-mapping.ts';
import { getMessageMatchContext } from './message-match.ts';
import { getVoiceNoteContext } from './voice-notes.ts';
import { getMessageInboxDecision } from './message-dismissal.ts';
import { isUnresolvedProgressReport } from './report-status.ts';
import { getAreaAllocationSnapshot, getItemAreaAllocation, sameProgressScope, syncAreaItemProgress } from './area-allocations.ts';
export interface WhatsAppProcessingResult { project: Project; outcome: string; reportId?: string; error?: string }

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clone = <T>(value: T): T => structuredClone(value);
const inProject = (project: Project, report: SiteReport) => (!report.projectId || report.projectId === project.id)
  && (!report.projectCode || report.projectCode === project.code);

type MessageSeedProject = Pick<Project, 'id' | 'code' | 'items' | 'contract'>;

export function seedWhatsAppMessages(project: MessageSeedProject): WhatsAppMessage[] {
  if (!project?.items?.length || project.contract?.sourceKind === 'none'
    || !['SIT01', 'WH02'].includes(project.id)) return [];
  const sit = project.id === 'SIT01';
  const first = project.items.find((item) => item!.id === 'WI-001');
  const second = project.items.find((item) => item!.id === (sit ? 'WI-004' : 'WI-003'));
  const photo = '/assets/demo-scaffold.jpg';
  const extraPhoto = '/assets/demo-platform.jpg';
  const base = {
    projectId: project.id, projectCode: project.code,
    senderRole: 'Site worker · demo', status: 'new', completionBasis: 'cumulative',
    processingNote: 'Prefilled mock interpretation. No AI or WhatsApp service is connected.',
    photoAlt: 'Generated construction illustration used as a demo site photo; not project evidence.',
  };
  const progress = (item: WorkItem | undefined, sequence: string, completion: number, sender: string, date: string): WhatsAppMessage | undefined => item && ({
    ...base, id: `${project.id}-WA-${sequence}`, kind: 'progress', sender, date,
    itemId: item!.id, area: item.demoArea || item.location, location: item.location,
    completion, photo,
    text: `${project.code} | ${item.location} | ${item.demoArea || item.location} | ${item!.id}\nCOMPLETE=${completion}% TOTAL\n${sit ? 'Scaffold installation' : item.description} progress to date. Photo attached.`,
  });
  return [
    progress(first, '001', 65, 'Worker 01 (demo)', '2026-10-20T09:15:00+08:00'),
    {
      ...base, id: `${project.id}-WA-002`, kind: 'vo', sender: 'Worker 01 (demo)',
      date: '2026-10-20T09:32:00+08:00', itemId: null,
      area: first?.demoArea || 'Area unassigned', location: first?.location || '',
      completion: null, completionBasis: 'unclear', photo: extraPhoto,
      text: `${project.code} | ${first?.location || ''} | ${first?.demoArea || ''}\n${sit ? 'Supervisor requested an extra access platform outside the existing scaffold scope.' : 'Supervisor requested additional loading-bay protection outside the existing schedule.'}\nPlease check if this is additional work. Photo attached.`,
      processingNote: 'Mock scope exception: possible additional work. QS must check scope, instruction and entitlement; price is unknown.',
    },
    progress(second, '003', 70, 'Worker 03 (demo)', '2026-10-20T09:45:00+08:00'),
    {
      ...base, id: `${project.id}-WA-004`, kind: 'clarification', sender: 'Worker 02 (demo)',
      date: '2026-10-20T10:05:00+08:00', itemId: null,
      area: first?.demoArea || 'Area unassigned', location: '', completion: 50,
      completionBasis: 'unclear', photo,
      text: `${project.code} | ${first?.demoArea || 'Area B'} done 50%.`,
      processingNote: 'Work item and completion basis are unclear. Ask for the item reference and total completion before changing the register.',
    },
  ].filter((message): message is WhatsAppMessage => Boolean(message));
}

export function getWhatsAppMessages(project: MessageSeedProject & { whatsappMessages?: WhatsAppMessage[] }): WhatsAppMessage[] {
  const messages = project?.whatsappMessages;
  if (Array.isArray(messages) && messages.every((message) => message
    && typeof message.id === 'string' && message.projectId === project.id
    && message.projectCode === project.code)
    && new Set(messages.map((message) => message.id)).size === messages.length) {
    return messages;
  }
  return seedWhatsAppMessages(project);
}

export function getMessageReport(project: Project, message: WhatsAppMessage | null | undefined): SiteReport | null {
  const inProject = (entry: unknown): entry is Record<string, unknown> => record(entry)
    && (entry.projectId == null || entry.projectId === '' || entry.projectId === project?.id)
    && (entry.projectCode == null || entry.projectCode === '' || (typeof entry.projectCode === 'string'
      && entry.projectCode.trim().toUpperCase() === String(project?.code || '').trim().toUpperCase()));
  if (!project || !message || !inProject(message) || typeof message.id !== 'string' || !message.id.trim()) return null;
  const reports = (Array.isArray(project.reports) ? project.reports : []).filter((report) => inProject(report)
    && typeof report.id === 'string' && report.id.trim());
  return reports.find((report) => report.id === message.reportId)
    || reports.find((report) => report.sourceMessageId === message.id) || null;
}

function markMessage(project: Project, message: WhatsAppMessage, status: string, note: string | undefined, date: string): Project {
  return {
    ...project,
    whatsappMessages: getWhatsAppMessages(project).map((entry) => entry.id === message.id
      ? { ...entry, status, processingNote: note, processedAt: date } : entry),
    history: [{
      id: `${message.id}-${status}`, action: status === 'clarification'
        ? 'WhatsApp clarification needed' : 'Mock WhatsApp message processed',
      detail: `${message.id} · ${note}`, date, actor: 'Alex Tan · Demo reviewer',
    }, ...project.history],
  };
}

export function processWhatsAppMessage(project: Project, messageId: string): WhatsAppProcessingResult {
  const invalid = { project, outcome: 'invalid' };
  const messages = getWhatsAppMessages(project);
  // A malformed stored inbox must not replace an opted-in reviewed source
  // with a legacy fixture bearing the same ID.
  if (Array.isArray(project.whatsappMessages) && project.whatsappMessages.some(entry => record(entry)
    && entry.id === messageId && Object.hasOwn(entry, 'matchSuggestion')) && messages !== project.whatsappMessages) return invalid;
  const originalMessage = messages.find((entry) => entry.id === messageId);
  let message = originalMessage;
  if (!message || message.projectId !== project.id || message.projectCode !== project.code) return invalid;
  const inboxDecision = getMessageInboxDecision(project, messageId);
  if (inboxDecision.dismissed || inboxDecision.blocked) return { ...invalid, error: inboxDecision.issue || 'Reopen this dismissed message with a reason before processing it.' };
  const existing = project.reports.find((report) => report.sourceMessageId === messageId);
  if (message.status !== 'new' || existing) {
    return { project, outcome: 'duplicate', reportId: existing?.id || message.reportId };
  }
  const date = new Date().toISOString();
  const needsClarification = (note?: string) => ({
    project: markMessage(project, originalMessage!, 'clarification', note, date),
    outcome: 'clarification',
  });
  const voice=Object.hasOwn(message,'audio') || Object.hasOwn(message,'originalTranscript') ? getVoiceNoteContext(project,message.id) : null;
  if (voice) {
    if (!voice.eligible) return { ...invalid,error:voice.issue || 'Review the original voice note before processing.' };
    if (voice.needsClarification) return needsClarification(voice.issue || 'Confirm the area and cumulative total with the worker.');
    if (!voice.effectiveMessage) return { ...invalid,error:'Review and confirm the transcript before adding progress.' };
    message=voice.effectiveMessage;
  }
  if (message.kind === 'clarification') return needsClarification(message.processingNote);
  if (!['progress', 'vo'].includes(message.kind)) return invalid;
  const matchContext = Object.hasOwn(message, 'matchSuggestion') ? getMessageMatchContext(project, message.id) : null;
  if (matchContext) {
    if (matchContext.clarificationRequired) return needsClarification(matchContext.issue);
    if (!matchContext.review || !matchContext.effectiveMessage) return { ...invalid, error: matchContext.issue || 'Review the suggested match before adding progress.' };
    message = matchContext.effectiveMessage;
  }
  const item = project.items.find((entry) => entry.id === message.itemId);
  const pct = message.completion;
  if (message.kind === 'progress' && (!item || message.completionBasis !== 'cumulative'
    || typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100)) {
    return needsClarification('Match one valid contract item and confirm 0–100% total completion before updating the register.');
  }
  let areaLink: Omit<ReturnType<typeof getAreaLinkStatus>, 'area'> & { area: Partial<DrawingArea> | null } = getAreaLinkStatus(project, message);
  if (message.replyToMessageId) {
    const threads = (Array.isArray(project.messageClarifications) ? project.messageClarifications : []).filter(entry => entry?.projectId === project.id
      && entry.id === message.clarificationThreadId && entry.sourceMessageId === message.replyToMessageId && entry.replyMessageId === message.id);
    const parent = getWhatsAppMessages(project).find(entry => entry.id === message.replyToMessageId);
    if (threads.length !== 1 || !parent || parent.clarificationReplyMessageId !== message.id || item?.pricingType !== 'measured') return invalid;
    if (message.areaId) {
      const saved = message.areaMapping;
      if (!saved || saved.areaId !== message.areaId || saved.code !== message.area || !saved.drawingId
        || !Array.isArray(saved.workItemIds) || !saved.workItemIds.includes(item!.id)) return invalid;
      // The reply already captured its selected area. Renaming or reusing an
      // area code must not move that original evidence to another saved area.
      areaLink = { ...areaLink, area: { ...clone(saved), id: saved.areaId }, conflict: false, ambiguous: false, blocked: false, candidates: [] };
    }
  }
  if (areaLink.ambiguous) {
    return needsClarification(`The area name “${message.area}” matches ${areaLink.candidates.map(area => area.code).join(' and ')}. Ask the worker to confirm one area code before updating progress or flagging extra work.`);
  }
  if (areaLink.blocked) return needsClarification('The saved area names or reference need review. Confirm the site area before processing this message.');
  if ((message.areaId || message.areaMapping?.areaId || message.areaProgress?.areaId) && !areaLink.area) {
    return needsClarification('The saved area reference is unavailable or conflicts with this message. Confirm the site area before processing.');
  }
  if (message.kind === 'progress' && areaLink.conflict) {
    return needsClarification(`Area ${areaLink.area?.code} is mapped to ${areaLink.area?.workItemIds?.join(', ')}, but this message names ${message.itemId}. Check the area or work item before updating progress.`);
  }
  const allocation = item && message.kind === 'progress' ? getItemAreaAllocation(project, item.id) : null;
  const areaProgress = allocation?.split && item && areaLink.area?.id
    ? getAreaAllocationSnapshot(project, areaLink.area.id, item.id) : null;
  if (allocation?.split && (!areaProgress || (message.areaId && message.areaId !== areaProgress.areaId))) {
    return needsClarification('Choose an area with a saved quantity allocation for this contract item before updating area completion.');
  }
  if ((message.areaProgress || message.replyToMessageId && allocation?.split) && (!message.areaProgress || !areaProgress
    || message.areaProgress.areaId !== areaProgress.areaId || message.areaProgress.itemId !== areaProgress.itemId
    || message.areaProgress.allocatedQuantity !== areaProgress.allocatedQuantity
    || message.areaProgress.contractQuantity !== areaProgress.contractQuantity)) {
    return needsClarification('The saved area quantity changed. Review the allocation before processing this reply.');
  }
  if (!Number.isFinite(new Date(message.date).getTime())) return invalid;
  const scope = { itemId: item?.id, areaProgress: areaProgress || undefined };
  if (message.kind === 'progress' && project.reports.some((report) => inProject(project, report) && sameProgressScope(report, scope)
    && !report.vo && !['rejected', 'superseded'].includes(report.status)
    && new Date(report.date!) > new Date(message.date))) {
    return needsClarification('A newer site report already exists. Review the chronology before replacing reported progress.');
  }
  const isVo = message.kind === 'vo';
  const reportId = `WA-REPORT-${message.id}`;
  if (project.reports.some((report) => report.id === reportId)) return { project, outcome: 'duplicate', reportId };
  const report: SiteReport = {
    id: reportId, projectId: project.id, projectCode: project.code,
    sourceMessageId: message.id, itemId: isVo ? null : item!.id,
    area: voice ? message.area : originalMessage!.area, location: voice ? message.location : originalMessage!.location,
    areaMapping: snapshotMappedArea(areaLink.area),
    ...(areaProgress ? { areaProgress: clone(areaProgress) } : {}),
    ...(matchContext?.review ? { matchReview: clone(matchContext.review) } : {}),
    ...(voice?.evidence || originalMessage!.originalVoiceNote ? { voiceNote:clone(voice?.evidence || originalMessage!.originalVoiceNote!) } : {}),
    sender: message.sender, date: message.date, completion: isVo ? null : pct,
    completionBasis: isVo ? 'unclear' : 'cumulative', status: isVo ? 'needsReview' : 'pending',
    message: voice ? originalMessage!.text : message.text, photo: message.photo, photoAlt: message.photoAlt,
    vo: isVo, demo: true, origin: 'simulated', channel: 'whatsapp-mock',
    note: isVo ? 'Mock possible VO. Scope, instruction evidence, entitlement and price need QS review.'
      : areaProgress ? 'Mock WhatsApp report. Completion is cumulative for this allocated area; verified progress requires supervisor review.'
        : 'Mock WhatsApp report. Total completion is cumulative; verified progress requires supervisor review.',
  };
  const note = isVo ? 'Possible VO flagged for QS review. Completion and price are unchanged.'
    : areaProgress ? `${areaLink.area?.code} reported completion saved at ${pct}% of its allocated quantity. Supervisor verification is still required.`
      : `${item!.id} reported progress updated to ${pct}% total. Verified progress remains ${item!.verified}%.`;
  const marked = markMessage(project, originalMessage!, 'processed', note, date);
  return {
    outcome: 'processed', reportId,
    project: syncAreaItemProgress({
      ...marked,
      items: project.items.map((entry) => !isVo && !areaProgress && entry.id === item!.id ? { ...entry, reported: pct! } : entry),
      reports: [...project.reports.map((entry) => !isVo && inProject(project, entry) && sameProgressScope(entry, scope) && isUnresolvedProgressReport(entry)
        ? { ...entry, status: 'superseded', supersededByReportId: reportId, supersededAt: date,
          supersededBy: 'Alex Tan · Demo reviewer',
          supersededReason: 'Replaced by a newer cumulative mock WhatsApp report. Original evidence is retained.' }
        : entry), report],
      whatsappMessages: marked.whatsappMessages.map((entry) => entry.id === message.id ? { ...entry, reportId } : entry),
      history: [{ id: `${message.id}-result`, action: isVo ? 'Possible VO flagged' : 'Reported completion updated',
        detail: note, date, actor: 'Alex Tan · Demo reviewer' }, ...marked.history],
    }, isVo ? '' : item!.id),
  };
}
