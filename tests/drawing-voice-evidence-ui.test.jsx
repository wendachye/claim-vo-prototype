import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AreaEvidencePanel } from '../src/components/AreaEvidencePanel';
import { createVoiceNoteDemo } from '../src/data/voice-note-demo';
import { getVoiceNoteContext, saveVoiceTranscriptReview } from '../src/data/voice-notes';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match';
import { processWhatsAppMessage } from '../src/data/whatsapp';

const now = new Date('2026-10-24T10:00:00+08:00');
afterEach(() => cleanup());
function fixture() {
  let project = createVoiceNoteDemo({ schemaVersion: 2, activeProjectId: null, projects: [] }, now).project;
  const message = project.whatsappMessages.find(message => message.audio.clarity === 'clear');
  project = saveVoiceTranscriptReview(project, message.id, {
    transcript: message.text.replace('wail', 'wall'), reason: 'Corrected the simulated spelling.',
    sourceKey: getVoiceNoteContext(project, message.id).sourceKey,
  }, now).project;
  project = saveMessageMatchReview(project, message.id, { ...getMessageMatchContext(project, message.id).fields, reason: '' }, now).project;
  const area = project.drawingMapping.areas.find(area => area.code === 'WEST');
  return { project, message, area };
}

it('identifies an area voice note and links to its original update without implying a missing photo or autoplaying', async () => {
  const { project, message, area } = fixture(), onOpenEvidence = vi.fn(), before = structuredClone(project);
  const view = render(<AreaEvidencePanel project={project} area={area} onOpenEvidence={onOpenEvidence}/>);
  expect(screen.getByText(/WhatsApp voice note/)).toBeTruthy();
  expect(screen.getByText('Voice recording attached. Open original update to listen.')).toBeTruthy();
  expect(screen.queryByText('No photo attached')).toBeNull();
  expect(screen.getByText(message.originalTranscript)).toBeTruthy();
  expect(view.container.querySelector('audio')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Open original update', exact: true }));
  expect(onOpenEvidence).toHaveBeenCalledWith(expect.objectContaining({ messageId: message.id, hasVoiceNote: true }), area.id);
  expect(project).toEqual(before);
});

it('retains an actual photo on a saved voice report and uses its frozen recording marker', () => {
  let { project, message, area } = fixture();
  project = processWhatsAppMessage(project, message.id).project;
  project.reports[0] = { ...project.reports[0], photo: '/assets/demo-w3-south-facade.jpg', photoAlt: 'Optional saved site attachment' };
  // A missing current inbox does not remove frozen recording evidence.
  project.whatsappMessages = [];
  render(<AreaEvidencePanel project={project} area={area} onOpenEvidence={vi.fn()}/>);
  expect(screen.getByText(/WhatsApp voice note/)).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Optional saved site attachment' })).toBeTruthy();
  expect(screen.queryByText('No photo attached')).toBeNull();
  expect(screen.getByRole('button', { name: 'Review site report', exact: true })).toBeTruthy();
});
