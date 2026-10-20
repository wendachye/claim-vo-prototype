// Frontend-only fixtures. Fields are prefilled demonstration results, not AI output.
import { getAreaLinkStatus, snapshotMappedArea } from './drawing-mapping.js';
const clone = (value) => structuredClone(value);
const waiting = (report) => ['pending', 'needsReview'].includes(report.status);

export function seedWhatsAppMessages(project) {
  if (!project?.items?.length || project.contract?.sourceKind === 'none'
    || !['SIT01', 'WH02'].includes(project.id)) return [];
  const sit = project.id === 'SIT01';
  const first = project.items.find((item) => item.id === 'WI-001');
  const second = project.items.find((item) => item.id === (sit ? 'WI-004' : 'WI-003'));
  const photo = '/assets/demo-scaffold.jpg';
  const extraPhoto = '/assets/demo-platform.jpg';
  const base = {
    projectId: project.id, projectCode: project.code,
    senderRole: 'Site worker · demo', status: 'new', completionBasis: 'cumulative',
    processingNote: 'Prefilled mock interpretation. No AI or WhatsApp service is connected.',
    photoAlt: 'Generated construction illustration used as a demo site photo; not project evidence.',
  };
  const progress = (item, sequence, completion, sender, date) => item && ({
    ...base, id: `${project.id}-WA-${sequence}`, kind: 'progress', sender, date,
    itemId: item.id, area: item.demoArea || item.location, location: item.location,
    completion, photo,
    text: `${project.code} | ${item.location} | ${item.demoArea || item.location} | ${item.id}\nCOMPLETE=${completion}% TOTAL\n${sit ? 'Scaffold installation' : item.description} progress to date. Photo attached.`,
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
  ].filter(Boolean);
}

export function getWhatsAppMessages(project) {
  const messages = project?.whatsappMessages;
  if (Array.isArray(messages) && messages.every((message) => message
    && typeof message.id === 'string' && message.projectId === project.id
    && message.projectCode === project.code)
    && new Set(messages.map((message) => message.id)).size === messages.length) {
    return messages;
  }
  return seedWhatsAppMessages(project);
}

function markMessage(project, message, status, note, date) {
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

export function processWhatsAppMessage(project, messageId) {
  const invalid = { project, outcome: 'invalid' };
  const message = getWhatsAppMessages(project).find((entry) => entry.id === messageId);
  if (!message || message.projectId !== project.id || message.projectCode !== project.code) return invalid;
  const existing = project.reports.find((report) => report.sourceMessageId === message.id);
  if (message.status !== 'new' || existing) {
    return { project, outcome: 'duplicate', reportId: existing?.id || message.reportId };
  }
  const date = new Date().toISOString();
  const needsClarification = (note) => ({
    project: markMessage(project, message, 'clarification', note, date),
    outcome: 'clarification',
  });
  if (message.kind === 'clarification') return needsClarification(message.processingNote);
  if (!['progress', 'vo'].includes(message.kind)) return invalid;
  const item = project.items.find((entry) => entry.id === message.itemId);
  const pct = message.completion;
  if (message.kind === 'progress' && (!item || message.completionBasis !== 'cumulative'
    || typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100)) {
    return needsClarification('Match one valid contract item and confirm 0–100% total completion before updating the register.');
  }
  const areaLink = getAreaLinkStatus(project, message);
  if (message.kind === 'progress' && areaLink.conflict) {
    return needsClarification(`Area ${areaLink.area.code} is mapped to ${areaLink.area.workItemIds.join(', ')}, but this message names ${message.itemId}. Check the area or work item before updating progress.`);
  }
  if (!Number.isFinite(new Date(message.date).getTime())) return invalid;
  if (message.kind === 'progress' && project.reports.some((report) => report.itemId === item.id
    && !report.vo && !['rejected', 'superseded'].includes(report.status)
    && new Date(report.date) > new Date(message.date))) {
    return needsClarification('A newer site report already exists. Review the chronology before replacing reported progress.');
  }
  const isVo = message.kind === 'vo';
  const reportId = `WA-REPORT-${message.id}`;
  if (project.reports.some((report) => report.id === reportId)) return { project, outcome: 'duplicate', reportId };
  const report = {
    id: reportId, projectId: project.id, projectCode: project.code,
    sourceMessageId: message.id, itemId: isVo ? null : item.id,
    area: message.area, location: message.location,
    areaMapping: snapshotMappedArea(areaLink.area),
    sender: message.sender, date: message.date, completion: isVo ? null : pct,
    completionBasis: isVo ? 'unclear' : 'cumulative', status: isVo ? 'needsReview' : 'pending',
    message: message.text, photo: message.photo, photoAlt: message.photoAlt,
    vo: isVo, demo: true, origin: 'simulated', channel: 'whatsapp-mock',
    note: isVo ? 'Mock possible VO. Scope, instruction evidence, entitlement and price need QS review.'
      : 'Mock WhatsApp report. Total completion is cumulative; verified progress requires supervisor review.',
  };
  const note = isVo ? 'Possible VO flagged for QS review. Completion and price are unchanged.'
    : `${item.id} reported progress updated to ${pct}% total. Verified progress remains ${item.verified}%.`;
  const marked = markMessage(project, message, 'processed', note, date);
  return {
    outcome: 'processed', reportId,
    project: {
      ...marked,
      items: project.items.map((entry) => !isVo && entry.id === item.id ? { ...entry, reported: pct } : entry),
      reports: [...project.reports.map((entry) => !isVo && entry.itemId === item.id && !entry.vo && waiting(entry)
        ? { ...entry, status: 'superseded', supersededByReportId: reportId, supersededAt: date,
          supersededBy: 'Alex Tan · Demo reviewer',
          supersededReason: 'Replaced by a newer cumulative mock WhatsApp report. Original evidence is retained.' }
        : entry), report],
      whatsappMessages: marked.whatsappMessages.map((entry) => entry.id === message.id ? { ...entry, reportId } : entry),
      history: [{ id: `${message.id}-result`, action: isVo ? 'Possible VO flagged' : 'Reported completion updated',
        detail: note, date, actor: 'Alex Tan · Demo reviewer' }, ...marked.history],
    },
  };
}
