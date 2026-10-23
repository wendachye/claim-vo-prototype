import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageMatchReviewDetails, MessageMatchReviewPanel } from '../src/components/MessageMatchReview';
import { getMessageMatchContext } from '../src/data/message-match';
import { createDemoProject } from '../src/data/demo-project.ts';
import { getDrawingMapping, installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

vi.mock('../src/data/message-match', () => ({ getMessageMatchContext: vi.fn() }));
const now = '2026-10-24T10:00:00+08:00';
const ids = new Set();
function fixture(code = 'MATCH-UI') {
  let project = createDemoProject({ name: 'Match review UI', code }, new Date(now));
  ids.add(project.id);
  project.items = project.items.slice(0, 2).map((item, index) => ({ ...item, id: `WORK-${index + 1}`, ref: `A.${index + 1}`, quantity: 1200, pricingType: 'measured' }));
  project.items.push({ ...project.items[0], id: 'INCLUDED', ref: 'I.1', description: 'Included cost', pricingType: 'included' });
  project = installDrawing(project, { inputKind: 'sample' }, now).project;
  const oldAreas = getDrawingMapping(project).areas;
  project.drawingMapping = { ...getDrawingMapping(project), areas: oldAreas.slice(0, 4).map(area => ({ ...area, workItemIds: [] })) };
  const areas = getDrawingMapping(project).areas;
  for (const [index, area] of areas.entries()) {
    const itemId = index === 2 ? 'WORK-2' : 'WORK-1';
    const quantities = index < 2 ? { 'WORK-1': index === 0 ? 720 : 480 } : {};
    project = saveAreaMapping(project, { ...area, areaId: area.id, workItemIds: [itemId], workItemQuantities: quantities }, now).project;
  }
  const mapped = getDrawingMapping(project).areas;
  const message = { id: `${code}-MESSAGE`, projectId: project.id, projectCode: project.code, kind: 'progress', status: 'new', sender: 'Demo worker', date: now,
    text: 'Original west wall message, 50% complete.', photo: '/original-photo.jpg', completion: 50,
    uiSuggestion: { version: 1, origin: 'mock', baselineVersion: project.version, fields: { itemId: 'WORK-1', areaId: mapped[0].id, completion: 50 }, sourceExcerpt: 'west wall', reason: 'Mock area and work suggestion.' } };
  project.whatsappMessages = [message];
  project.claimDrafts = [{ id: 'SAVED', snapshot: { note: 'Original saved claim' } }];
  return { project, message, areas: mapped };
}
function reviewFor(project, message, fields, reason = '') {
  const label = values => {
    const item = project.items.find(item => item.id === values.itemId), area = getDrawingMapping(project).areas.find(area => area.id === values.areaId);
    return { itemId: values.itemId, itemRef: item.ref, itemDescription: item.description, areaId: values.areaId, areaCode: area.code, areaName: area.name };
  };
  return { id: 'MATCH-REVIEW', projectId: project.id, messageId: message.id, baselineVersion: project.version, sourceKey: 'source', originalSuggestion: message.uiSuggestion,
    fields: { ...fields, completion: 50 }, suggested: label(message.uiSuggestion.fields), confirmed: label(fields), reason, reviewedBy: 'Demo QS', reviewedAt: now,
    areaMapping: { areaId: fields.areaId } };
}
const itemPicker = () => screen.getByRole('combobox', { name: 'Contract work item', exact: true });
const areaPicker = () => screen.getByRole('combobox', { name: 'Site area', exact: true });
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  getMessageMatchContext.mockImplementation((project, messageId) => {
    const message = project.whatsappMessages.find(entry => entry.id === messageId);
    return { eligible: message?.status === 'new', requiresReview: !message?.uiReview, original: message, suggestion: message?.uiSuggestion, review: message?.uiReview || null,
      fields: message?.uiReview?.fields || message?.uiSuggestion?.fields || null, effectiveMessage: message };
  });
});
afterEach(() => { cleanup(); ids.forEach(clearProjectFormBuffers); ids.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('compact WhatsApp match review', () => {
  it('confirms a correct suggestion explicitly without changing original evidence, completion or saved claims', async () => {
    const { project, message, areas } = fixture(), before = structuredClone(project), onSave = vi.fn(() => ({ outcome: 'updated' }));
    const user = userEvent.setup();
    render(<MessageMatchReviewPanel project={project} message={message} onSave={onSave} />);
    expect(screen.getByRole('region', { name: 'Review match' }).textContent).toContain('50% cumulative');
    expect(screen.getByText('Mock suggestion · review against the original below.')).toBeTruthy();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    expect(onSave).toHaveBeenCalledWith(message.id, { itemId: 'WORK-1', areaId: areas[0].id, reason: '' });
    expect(project).toEqual(before);
  });

  it('requires a correction reason and exposes only compatible, allocated area choices', async () => {
    const { project, message, areas } = fixture(), before = structuredClone(project), onSave = vi.fn(() => ({ outcome: 'updated' })), onEditingChange = vi.fn();
    const user = userEvent.setup();
    render(<MessageMatchReviewPanel project={project} message={message} onSave={onSave} onEditingChange={onEditingChange} />);
    await user.click(screen.getByRole('button', { name: 'Edit match', exact: true }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    await user.click(areaPicker());
    expect(screen.queryByRole('option', { name: `Area ${areas[2].code} · ${areas[2].name}`, exact: true })).toBeNull();
    expect(screen.queryByRole('option', { name: `Area ${areas[3].code} · ${areas[3].name}`, exact: true })).toBeNull();
    await user.keyboard('{Escape}');
    await chooseSelect(user, areaPicker(), areas[1].id);
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    const reason = screen.getByRole('textbox', { name: /^Correction reason/ });
    expect(screen.getByText('Enter a short reason for the correction.')).toBeTruthy();
    expect(document.activeElement).toBe(reason);
    expect(onSave).not.toHaveBeenCalled();
    await user.type(reason, 'The photo shows the east wall.');
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    expect(onSave).toHaveBeenCalledWith(message.id, { itemId: 'WORK-1', areaId: areas[1].id, reason: 'The photo shows the east wall.' });
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    expect(project).toEqual(before);
  });

  it('clears an incompatible area when changing work and does not offer included work', async () => {
    const { project, message, areas } = fixture(), onSave = vi.fn(() => ({ outcome: 'updated' }));
    const user = userEvent.setup();
    render(<MessageMatchReviewPanel project={project} message={message} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Edit match', exact: true }));
    await user.click(itemPicker());
    expect(screen.queryByRole('option', { name: /Included cost/ })).toBeNull();
    await user.keyboard('{Escape}');
    await chooseSelect(user, itemPicker(), 'WORK-2');
    expect(areaPicker().getAttribute('data-value')).toBe('');
    await chooseSelect(user, areaPicker(), areas[2].id);
    await user.type(screen.getByRole('textbox', { name: /^Correction reason/ }), 'Worker identified the second contract item.');
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    expect(onSave).toHaveBeenCalledWith(message.id, { itemId: 'WORK-2', areaId: areas[2].id, reason: 'Worker identified the second contract item.' });
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('preserves an unfinished editor across navigation, isolates another project and cancels back to the saved match', async () => {
    const first = fixture('MATCH-FIRST'), second = fixture('MATCH-SECOND'), user = userEvent.setup(), callback = vi.fn(), onSave = vi.fn();
    const view = render(<MessageMatchReviewPanel project={first.project} message={first.message} onSave={onSave} onEditingChange={callback} />);
    await user.click(screen.getByRole('button', { name: 'Edit match', exact: true }));
    await chooseSelect(user, areaPicker(), first.areas[1].id);
    await user.type(screen.getByRole('textbox', { name: /^Correction reason/ }), 'Unfinished source check');
    view.rerender(<MessageMatchReviewPanel project={second.project} message={second.message} onSave={onSave} onEditingChange={callback} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(callback).toHaveBeenLastCalledWith(false);
    view.rerender(<MessageMatchReviewPanel project={first.project} message={first.message} onSave={onSave} onEditingChange={callback} />);
    expect(screen.getByRole('textbox', { name: /^Correction reason/ }).value).toBe('Unfinished source check');
    expect(areaPicker().getAttribute('data-value')).toBe(first.areas[1].id);
    expect(callback).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit match', exact: true }));
    expect(areaPicker().getAttribute('data-value')).toBe(first.areas[0].id);
    expect(screen.getByRole('textbox', { name: /^Correction reason/ }).value).toBe('');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('retains the draft and focuses a save failure, then clears its buffer after success', async () => {
    const { project, message, areas } = fixture(), user = userEvent.setup();
    const onSave = vi.fn().mockReturnValueOnce({ outcome: 'invalid', error: 'The area mapping changed. Review again.' }).mockReturnValue({ outcome: 'updated' });
    const view = render(<MessageMatchReviewPanel project={project} message={message} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Edit match', exact: true }));
    await chooseSelect(user, areaPicker(), areas[1].id);
    await user.type(screen.getByRole('textbox', { name: /^Correction reason/ }), 'East side confirmed.');
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    expect(screen.getByRole('alert').textContent).toBe('The area mapping changed. Review again.');
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(screen.getByRole('textbox', { name: /^Correction reason/ }).value).toBe('East side confirmed.');
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    view.unmount();
    render(<MessageMatchReviewPanel project={project} message={message} onSave={onSave} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit match', exact: true }));
    expect(areaPicker().getAttribute('data-value')).toBe(areas[0].id);
    expect(screen.getByRole('textbox', { name: /^Correction reason/ }).value).toBe('');
  });

  it('shows frozen suggested/confirmed labels, reason and reviewer without consulting current project values', async () => {
    const { project, message, areas } = fixture(), user = userEvent.setup();
    const review = reviewFor(project, message, { itemId: 'WORK-2', areaId: areas[2].id }, 'Original message identified roof work.');
    project.items[1].description = 'A later contract description';
    project.drawingMapping.areas[2].name = 'A later area name';
    render(<MessageMatchReviewDetails review={review} />);
    await user.click(screen.getByText('Match review', { exact: true }));
    expect(screen.getByText('Original message identified roof work.')).toBeTruthy();
    expect(screen.getByText(/Reviewed by Demo QS/)).toBeTruthy();
    expect(screen.queryByText(/A later contract description/)).toBeNull();
    expect(screen.queryByText(/A later area name/)).toBeNull();
    expect(screen.getByText('Confirmed work').nextElementSibling.textContent).toContain(review.confirmed.itemDescription);
    expect(screen.getByText('Confirmed area').nextElementSibling.textContent).toContain(review.confirmed.areaName);
  });

  it('keeps a processed reviewed message read-only', () => {
    const { project, message, areas } = fixture(), onSave = vi.fn();
    message.status = 'processed';
    message.uiReview = reviewFor(project, message, { itemId: 'WORK-1', areaId: areas[0].id });
    render(<MessageMatchReviewPanel project={project} message={message} onSave={onSave} />);
    expect(screen.queryByRole('button', { name: 'Edit match', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm match', exact: true })).toBeNull();
    expect(screen.getByText('Match review', { exact: true })).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
  it('does not throw or consult live labels when saved review details are malformed', () => {
    const view = render(<MessageMatchReviewDetails review={{ reason: 'Retained note', reviewedBy: 'Demo QS', reviewedAt: now }} />);
    expect(screen.getByText('Match review details unavailable')).toBeTruthy();
    view.rerender(<MessageMatchReviewDetails review={null} />);
    expect(screen.getByText('Match review details unavailable')).toBeTruthy();
  });

});
