import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { WhatsAppView } from '../src/components/WhatsAppView';
import { MessageMatchReviewPanel } from '../src/components/MessageMatchReview';
import { ReportDrawer } from '../src/components/ReportDrawer';
import { SupervisorReview } from '../src/components/SupervisorReview';
import { WhatsAppClarification } from '../src/components/WhatsAppClarification';
import { VoiceNoteReview } from '../src/components/VoiceNoteReview';
import { createVoiceNoteDemo } from '../src/data/voice-note-demo';
import { getVoiceNoteContext, saveVoiceTranscriptReview } from '../src/data/voice-notes';
import { saveMessageMatchReview } from '../src/data/message-match';
import { processWhatsAppMessage } from '../src/data/whatsapp';
import { saveMessageClarificationRequest, saveMockClarificationReply, getMessageClarification } from '../src/data/whatsapp-clarification';
import { clearProjectFormBuffers } from '../src/data/form-buffer';

const now = new Date('2026-10-24T10:00:00+08:00'), ids = new Set();
afterEach(() => { cleanup(); ids.forEach(clearProjectFormBuffers); ids.clear(); vi.unstubAllGlobals(); });
function updated(result) { expect(result.outcome).toBe('updated'); return result.project; }
function fixture() {
  const created = createVoiceNoteDemo({ schemaVersion: 2, activeProjectId: null, projects: [] }, now);
  expect(created.outcome).toBe('updated'); ids.add(created.project.id); return created.project;
}
function reviewed(project) {
  const message = project.whatsappMessages.find(entry => entry.audio.clarity === 'clear');
  return updated(saveVoiceTranscriptReview(project, message.id, { transcript: 'Block A west wall cladding is 50% complete in total.', reason: 'The recording says wall.', sourceKey: getVoiceNoteContext(project, message.id).sourceKey }, now));
}
function processed(project) {
  project = reviewed(project);
  const message = project.whatsappMessages.find(entry => entry.audio.clarity === 'clear'), area = project.drawingMapping.areas.find(entry => entry.code === 'WEST');
  project = updated(saveMessageMatchReview(project, message.id, { itemId: 'WI-001', areaId: area.id, reason: '' }, now));
  const result = processWhatsAppMessage(project, message.id); expect(result.outcome).toBe('processed'); return result.project;
}

describe('voice-only source evidence wording', () => {
  it('keeps sender details available without a second transcript block or missing-photo placeholder', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const project = fixture(), message = project.whatsappMessages.find(entry => entry.audio.clarity === 'clear');
    const view = render(<WhatsAppView project={project} messages={project.whatsappMessages} initialMessageId={message.id}/>);
    const source = view.container.querySelector('.wa-source-evidence');
    expect(source.open).toBe(false); expect(source.textContent).toContain('Sender & message details');
    expect(source.textContent).toContain(message.sender); expect(source.querySelector('time').getAttribute('dateTime')).toBe(message.date);
    expect(source.querySelector('blockquote')).toBeNull(); expect(source.querySelector('.wa-photo-unavailable')).toBeNull();
    expect(screen.queryByText('No photo attached to this update')).toBeNull();
    expect(screen.getByText('Check the recording and reviewed transcript above before saving.')).toBeTruthy();
  });

  it('points a voice-note match review to its reviewed transcript and recording above', () => {
    const project = reviewed(fixture()), message = project.whatsappMessages.find(entry => entry.audio.clarity === 'clear');
    render(<MessageMatchReviewPanel project={project} message={message} onSave={vi.fn()}/>);
    expect(screen.getByText('Mock suggestion · check the reviewed transcript and recording above.')).toBeTruthy();
    expect(screen.queryByText('Mock suggestion · review against the original below.')).toBeNull();
  });

  it('shows frozen voice evidence and sender details in desktop review without claiming it is text-only', () => {
    const project = processed(fixture()), report = project.reports[0], item = project.items.find(entry => entry.id === report.itemId);
    const view = render(<ReportDrawer project={project} projectCode={project.code} item={item} report={report} locked onApprove={vi.fn()}/>);
    const recording = view.container.querySelector('.wa-voice-saved-evidence');
    expect(recording.open).toBe(true);
    expect(recording.compareDocumentPosition(view.container.querySelector('.site-report-decision')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const source = view.container.querySelector('.site-report-evidence');
    expect(source.open).toBe(false); expect(source.textContent).toContain('Sender & update details');
    expect(within(source).getByText(report.sender)).toBeTruthy(); expect(source.querySelector('blockquote')).toBeNull();
    expect(screen.queryByText('No site photo attached')).toBeNull(); expect(screen.queryByText(/This update contains text only/)).toBeNull();
    expect(screen.getByText('Original voice note & transcript')).toBeTruthy();
  });

  it('keeps the recording available in mobile review and preserves an actual attached photo when present', () => {
    const project = processed(fixture()), report = project.reports[0];
    const view = render(<SupervisorReview project={project} reportId={report.id} routeProjectId={project.id} onBack={vi.fn()} onDecision={vi.fn()}/>);
    expect(screen.getByText('Check one site update against its recording, transcript and any clarification.')).toBeTruthy();
    expect(view.container.querySelector('.supervisor-review-source blockquote')).toBeNull();
    expect(screen.queryByText('No site photo attached')).toBeNull(); expect(screen.getByText(report.sender)).toBeTruthy();
    const withPhoto = { ...project, reports: [{ ...report, photo: '/assets/demo-w3-south-facade.jpg', photoAlt: 'Optional actual attachment' }] };
    view.rerender(<SupervisorReview project={withPhoto} reportId={report.id} routeProjectId={project.id} onBack={vi.fn()} onDecision={vi.fn()}/>);
    expect(screen.getByRole('img', { name: 'Optional actual attachment' })).toBeTruthy();
    expect(screen.getByText('Demonstration photo · review alongside the recording and transcript')).toBeTruthy();
  });

  it('describes retained recording evidence for a clarified text reply and stops asking for already-recorded clarification', () => {
    let project = fixture(); const original = project.whatsappMessages.find(entry => entry.audio.clarity === 'unclear');
    project = updated(saveMessageClarificationRequest(project, original.id, { question: 'Please confirm the east wall total.' }, now));
    const east = project.drawingMapping.areas.find(entry => entry.code === 'EAST');
    project = updated(saveMockClarificationReply(project, original.id, { text: 'East wall cladding is 20% complete in total.', itemId: 'WI-001', areaId: east.id, area: east.code, completion: 20 }, now));
    const reply = getMessageClarification(project, original.id).reply;
    const result = processWhatsAppMessage(project, reply.id); expect(result.outcome).toBe('processed'); project = result.project;
    const view = render(<WhatsAppClarification project={project} message={project.whatsappMessages.find(entry => entry.id === reply.id)}/>);
    expect(screen.getByText('The original recording and transcript are retained with this reply.')).toBeTruthy();
    expect(screen.getByText('Review the reply and retained recording before confirming progress.')).toBeTruthy();
    expect(screen.queryByText('No photo is attached to this mock reply.')).toBeNull();
    view.unmount();
    const voiceView = render(<VoiceNoteReview project={project} messageId={original.id}/>);
    expect(screen.getByText('This recording required clarification. The original audio is retained.')).toBeTruthy();
    expect(screen.queryByText('This recording is unclear. Ask the sender to clarify before adding progress.')).toBeNull();
    voiceView.unmount();
    const report = project.reports.find(entry => entry.sourceMessageId === reply.id), item = project.items.find(entry => entry.id === report.itemId);
    const supervisorView = render(<SupervisorReview project={project} reportId={report.id} routeProjectId={project.id} onBack={vi.fn()} onDecision={vi.fn()}/>);
    expect(supervisorView.container.querySelector('.supervisor-review-source blockquote').textContent).toBe(reply.text);
    expect(screen.getAllByText('Original voice note & transcript')).toHaveLength(1);
    supervisorView.unmount();
    const drawerView = render(<ReportDrawer project={project} projectCode={project.code} item={item} report={report} locked onApprove={vi.fn()}/>);
    const source = drawerView.container.querySelector('.site-report-evidence');
    expect(source.open).toBe(true); expect(source.textContent).toContain('Worker reply & sender details');
    expect(source.querySelector('blockquote').textContent).toBe(reply.text);
    drawerView.unmount();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    render(<WhatsAppView project={project} messages={project.whatsappMessages} initialMessageId={reply.id}/>);
    expect(screen.getAllByText('Original voice note & transcript')).toHaveLength(1);
  });
});
