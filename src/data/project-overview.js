import { getProjectAttention } from './project-attention.js';
import { getWhatsAppMessages } from './whatsapp.js';
import { getVOCases } from './vo.js';
import { normalizeClaimDrafts } from './claims.js';
import { getClaimTracking } from './claim-tracking.js';
import { getMessageClarification } from './whatsapp-clarification.js';

const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const time = value => text(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
const inProject = (project, entry) => entry && typeof entry === 'object'
  && (!entry.projectId || entry.projectId === project.id)
  && (!entry.projectCode || text(entry.projectCode).toUpperCase() === text(project.code).toUpperCase());
function unique(entries, key = 'id') {
  const counts = new Map();
  for (const entry of list(entries)) if (text(entry?.[key])) counts.set(entry[key], (counts.get(entry[key]) || 0) + 1);
  return list(entries).filter(entry => text(entry?.[key]) && counts.get(entry[key]) === 1);
}
function monthLabel(period) {
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${period}-01T12:00:00Z`));
}
function sourceDetail(source, item) {
  return [item?.ref ? `Ref. ${item.ref}` : source?.sender, source?.area || source?.location].filter(Boolean).join(' · ') || 'Site update';
}
const trackingLabels = { prepared: 'Prepared', submitted: 'Submitted', queried: 'Needs revision', certified: 'Certified', paid: 'Paid' };
const voActivityLabels = { save: 'Extra work review saved', submit: 'Extra work marked awaiting approval', approve: 'Extra work price approved',
  reject: 'Extra work rejected', clarify: 'Extra work needs information', reopen: 'Extra work review reopened', assessEligibility: 'VO claim eligibility reviewed' };
const trackingActivityLabels = { submitted: 'Claim submission recorded', query: 'Claim query recorded', certified: 'Claim certification recorded', payment: 'Claim payment recorded' };

// This is a read-only snapshot of saved records, not another task queue or a
// complete audit log. Missing timestamps never become invented activity dates.
export function getProjectOverview(project) {
  const current = project && typeof project === 'object' ? project : {};
  const items = unique(current.items).filter(entry => inProject(current, entry));
  const itemById = new Map(items.map(item => [item.id, item]));
  const reports = unique(current.reports).filter(entry => inProject(current, entry)
    && (entry.vo || !entry.projectCode || entry.projectCode === current.code));
  const rawMessages = Array.isArray(current.whatsappMessages) ? current.whatsappMessages : getWhatsAppMessages(current);
  const messages = unique(rawMessages).filter(entry => entry.projectId === current.id && entry.projectCode === current.code);
  const scoped = { ...current, items, reports, whatsappMessages: messages,
    voReviews: unique(current.voReviews).filter(entry => inProject(current, entry)),
    claimDrafts: unique(current.claimDrafts).filter(entry => inProject(current, entry) && inProject(current, entry.snapshot)),
    claimTracking: unique(current.claimTracking, 'draftId').filter(entry => inProject(current, entry)),
    messageClarifications: unique(current.messageClarifications).filter(entry => entry.projectId === current.id),
  };
  const cases = getVOCases(scoped);
  const caseById = new Map(cases.map(entry => [entry.id, entry]));
  const tasks = getProjectAttention(scoped);
  const drafts = normalizeClaimDrafts(scoped);
  const latestPerMonth = new Map();
  for (const draft of drafts) if (!latestPerMonth.has(draft.period) || draft.revision > latestPerMonth.get(draft.period).revision) latestPerMonth.set(draft.period, draft);
  const latestDraft = [...latestPerMonth.values()].sort((a, b) => (time(b.createdAt) ?? -Infinity) - (time(a.createdAt) ?? -Infinity)
    || b.period.localeCompare(a.period) || b.revision - a.revision || a.id.localeCompare(b.id))[0];
  const stage = latestDraft?.status === 'prepared' ? getClaimTracking(scoped, latestDraft.id) : null;
  const claimStatus = !latestDraft ? 'Enter QS quantities and values separately' : stage
    ? stage.status === 'certified' && typeof stage.paidValue === 'number' && stage.paidValue !== 0 ? 'Part paid' : trackingLabels[stage.status]
    : 'Draft saved';
  const checked = items.filter(item => !item.needsReview).length;
  const pending = tasks.filter(task => task.category === 'site' && task.kind === 'progress').length;
  const newMessages = tasks.filter(task => task.category === 'site' && task.kind === 'message').length;
  const clarification = tasks.filter(task => task.category === 'site' && task.kind === 'clarification').length;
  const siteDetails = [newMessages ? countLabel(newMessages, 'new message') : '', clarification ? `${clarification} need${clarification === 1 ? 's' : ''} clarification` : ''].filter(Boolean);
  const openVOs = tasks.filter(task => task.category === 'vo').length;
  const approved = cases.filter(entry => entry.status === 'approved').length;
  const contractStatus = !items.length ? 'Not started' : checked < items.length ? 'Needs review' : current.locked ? 'Confirmed' : 'Ready to confirm';
  const cards = [
    { id: 'contract', summary: items.length ? contractStatus : 'No contract items yet', status: contractStatus,
      detail: current.locked && checked === items.length && items.length ? `Baseline v${current.version || 1}`
        : checked < items.length ? `${items.length - checked} to review` : items.length ? 'Ready to confirm the work list' : 'Add a contract to begin' },
    { id: 'site', summary: pending ? `${pending} awaiting verification` : 'No updates awaiting verification',
      status: newMessages ? 'New updates' : pending ? 'Needs verification' : clarification ? 'Needs clarification' : messages.length || reports.length ? 'Up to date' : 'Not started',
      detail: siteDetails.join(' · ') || (pending ? 'Review the latest report and photo' : messages.length || reports.length ? 'All site updates reviewed' : 'No site messages yet') },
    { id: 'vo', summary: openVOs ? `${countLabel(openVOs, 'case')} to review` : 'No cases awaiting review',
      status: openVOs ? 'Needs review' : approved ? 'Price approved' : cases.length ? 'Reviewed' : 'Optional',
      detail: approved ? `${approved} price approval${approved === 1 ? '' : 's'} recorded` : cases.length ? `${countLabel(cases.length, 'case')} recorded` : 'No extra work flagged' },
    { id: 'claims', summary: latestDraft ? `${monthLabel(latestDraft.period)} · v${latestDraft.revision}` : 'No saved claims yet', detail: claimStatus, status: latestDraft ? claimStatus : 'Not started' },
  ];

  const activities = [];
  const add = (id, title, detail, date, target) => {
    if (time(date) !== null) activities.push({ id, title, detail, date, target });
  };
  const pairedReport = message => {
    const matches = reports.filter(report => report.sourceMessageId === message.id || report.id === message.reportId);
    const report = matches.length === 1 ? matches[0] : null;
    return report && (!report.sourceMessageId || report.sourceMessageId === message.id) ? report : null;
  };
  const reportTarget = report => report.vo && caseById.has(report.id) ? { route: 'vo', caseId: report.id }
    : !report.vo && itemById.has(report.itemId) ? { route: 'completion', itemId: report.itemId, reportId: report.id } : null;
  const paired = new Set();
  for (const message of messages) {
    const report = pairedReport(message);
    const target = report && reportTarget(report);
    if (report) paired.add(report.id);
    const context = getMessageClarification(scoped, message.id);
    const sourceTarget = { route: 'whatsapp', messageId: message.id };
    const detail = sourceDetail(message, itemById.get(message.itemId));
    // Receipt and processing are distinct saved events. Do not add a second
    // report-received row for the same paired message, or repeat one timestamp.
    if (!target || time(message.processedAt) === null || time(message.processedAt) !== time(message.date)) {
      add(`message:${message.id}:received`, context?.reply?.id === message.id ? 'Clarification reply received' : 'Site message received', detail, message.date, sourceTarget);
    }
    if (target) add(`message:${message.id}:processed`, report.vo ? 'Possible VO flagged' : 'Reported progress updated', detail, message.processedAt, target);
    else if (message.status === 'clarification') add(`message:${message.id}:clarification`, 'Site message needs clarification', detail, message.processedAt, sourceTarget);
    if (context?.sourceMessageId === message.id) add(`message:${message.id}:request`, 'Clarification requested', detail, context.request.date, sourceTarget);
  }
  for (const report of reports) {
    const target = reportTarget(report);
    if (!target) continue;
    const detail = report.vo ? caseById.get(report.id).title : sourceDetail(report, itemById.get(report.itemId));
    if (!paired.has(report.id)) add(`report:${report.id}:recorded`, report.vo ? 'Possible VO flagged' : 'Site update recorded', detail, report.date, target);
    if (!report.vo) {
      add(`report:${report.id}:verified`, 'Site progress verified', detail, report.verifiedAt, target);
      add(`report:${report.id}:clarification`, 'Site update needs clarification', detail, report.clarificationRequestedAt, target);
    }
  }
  for (const entry of cases) for (const event of unique(entry.history).filter(event => inProject(scoped, event))) {
    if (voActivityLabels[event.action]) add(`vo:${entry.id}:${event.id}`, voActivityLabels[event.action], entry.title, event.date, { route: 'vo', caseId: entry.id });
  }
  for (const item of items) add(`item:${item.id}:checked`, 'Contract item checked', `Ref. ${item.ref || 'Unassigned'} · ${item.description || 'Contract work'}`, item.reviewedAt, { route: 'contract', itemId: item.id });
  for (const draft of drafts) {
    const detail = `${monthLabel(draft.period)} · Version ${draft.revision}`;
    const target = { route: 'claim-preview', draftId: draft.id };
    add(`claim:${draft.id}:saved`, draft.revisionOf ? 'Revised claim saved' : 'Claim draft saved', detail, draft.createdAt, target);
    if (draft.status !== 'prepared') continue;
    add(`claim:${draft.id}:prepared`, 'Claim marked prepared', detail, draft.preparedAt, target);
    const tracking = getClaimTracking(scoped, draft.id);
    for (const event of list(tracking?.history)) if (trackingActivityLabels[event.stage]) {
      add(`claim:${draft.id}:${event.id}`, trackingActivityLabels[event.stage], detail, event.recordedAt, { route: 'claim-status', draftId: draft.id });
    }
  }
  return { cards, activities: activities.sort((a, b) => time(b.date) - time(a.date) || a.id.localeCompare(b.id)).slice(0, 3) };
}
