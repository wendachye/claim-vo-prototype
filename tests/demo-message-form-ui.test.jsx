import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoMessageForm } from '../src/components/DemoMessageForm';
import { DEMO_MESSAGE_PHOTOS, getDemoMessageSample, previewDemoMessage } from '../src/data/demo-message-intake';
import { clearProjectFormBuffers, readFormBuffer } from '../src/data/form-buffer';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace';
import { chooseSelect } from './select-helpers.mjs';

const scope = 'whatsapp:demo-message';
const ids = new Set();
afterEach(() => { ids.forEach(clearProjectFormBuffers); ids.clear(); });
function fixture() {
  const workspace = loadShowcaseWorkspace(null, new Date('2026-10-24T10:00:00+08:00'));
  workspace.projects.forEach(project => ids.add(project.id));
  return workspace.projects.find(project => project.id === workspace.sitShowcase.projectId);
}
const message = () => screen.getByRole('textbox', { name: /^Message text/ });
const previewButton = () => screen.getByRole('button', { name: 'Preview message', exact: true });
const saveButton = () => screen.getByRole('button', { name: 'Save to inbox', exact: true });
async function useExample(user) { await user.click(screen.getByRole('button', { name: 'Use example', exact: true })); }
async function previewExample(user) { await useExample(user); await user.click(previewButton()); }

describe('Add demo message', () => {
  it('requires a read-only preview and preserves exact formatted source and optional generated photo on explicit save', async () => {
    const project = fixture(), original = structuredClone(project), user = userEvent.setup();
    const onSave = vi.fn(() => ({ outcome: 'updated', messageId: 'NEW-INBOX-MESSAGE' })), onClose = vi.fn();
    render(<DemoMessageForm project={project} onSave={onSave} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Add demo message' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save to inbox', exact: true })).toBeNull();
    expect(document.querySelector('input[type=file]')).toBeNull();
    await useExample(user);
    const entered = `${message().value}\nWorker note: original spelling kept.`;
    fireEvent.change(message(), { target: { value: entered } });
    await chooseSelect(user, screen.getByRole('combobox', { name: /^Demo photo/ }), DEMO_MESSAGE_PHOTOS[0].id);
    expect(onSave).not.toHaveBeenCalled();
    await user.click(previewButton());
    const panel = screen.getByRole('region', { name: 'Message preview' });
    expect(panel.querySelector('blockquote').textContent).toBe(entered);
    expect(screen.getAllByText('Needs clarification', { exact: true }).length).toBeGreaterThan(0);
    const logSummary = within(panel).getByText('Daily log details', { exact: true }).closest('summary');
    const logDetails = logSummary.closest('details');
    expect(logDetails.open).toBe(false);
    expect(panel.querySelector('blockquote').compareDocumentPosition(logDetails) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const daily = screen.getByRole('region', { name: 'Daily KPI details', exact: true });
    expect(daily.closest('details')).toBe(logDetails);
    await user.click(logSummary);
    expect(logDetails.open).toBe(true);
    expect(daily.textContent).toContain('3man');
    expect(daily.textContent).toContain('14 x 4.5 x 4 T');
    expect(daily.textContent).toContain('Hrs:8:00 to 19:00hrs');
    expect(project).toEqual(original);
    expect(screen.getByText('Not confirmed', { exact: true })).toBeTruthy();
    expect(screen.getByRole('img', { name: DEMO_MESSAGE_PHOTOS[0].photoAlt }).getAttribute('src')).toBe(DEMO_MESSAGE_PHOTOS[0].photo);
    expect(screen.getByText('Generated demo photo · illustrative only', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledOnce();
    const values = onSave.mock.calls[0][0];
    expect(values).toMatchObject({ projectId: project.id, text: entered, photoId: DEMO_MESSAGE_PHOTOS[0].id });
    expect(values.submissionId).toMatch(/^[A-Za-z0-9_-]{8,120}$/);
    expect(values.previewKey).toBe(previewDemoMessage(project, values).sourceKey);
    expect(onClose).toHaveBeenCalledOnce();
    expect(readFormBuffer(project.id, scope)).toBeUndefined();
    expect(project).toEqual(original);
  });

  it('validates malformed input without saving and allows a no-photo preview after correction', async () => {
    const project = fixture(), user = userEvent.setup(), onSave = vi.fn();
    render(<DemoMessageForm project={project} onSave={onSave} onClose={vi.fn()} />);
    await user.type(message(), 'Area B done');
    await user.click(previewButton());
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(document.activeElement).toBe(message());
    expect(screen.queryByRole('region', { name: 'Message preview' })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    await previewExample(user);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('No photo attached.', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows an ambiguous area as clarification before inbox save and never fabricates a matched area', async () => {
    const project = fixture(), user = userEvent.setup(), onSave = vi.fn(() => ({ outcome: 'updated', messageId: 'UNCLEAR-INBOX' }));
    render(<DemoMessageForm project={project} onSave={onSave} onClose={vi.fn()} />);
    const text = `${project.code} | Unspecified bracket location | Bracket zone | WI-016\nCOMPLETE=10% TOTAL`;
    fireEvent.change(message(), { target: { value: text } });
    await user.click(previewButton());
    expect(screen.getByText('Needs clarification', { exact: true })).toBeTruthy();
    expect(screen.getByText('Saving adds to the inbox only; it does not update progress.', { exact: true })).toBeTruthy();
    expect(screen.getByText('Clarify before updating progress:', { exact: true })).toBeTruthy();
    expect(screen.getByText('Completion in message', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Cumulative completion', { exact: true })).toBeNull();
    expect(screen.getByRole('region', { name: 'Message preview' }).querySelector('blockquote').textContent).toBe(text);
    expect(onSave).not.toHaveBeenCalled();
    await user.click(saveButton());
    expect(onSave.mock.calls[0][0].text).toBe(text);
  });

  it('keeps cancelled and Escape-dismissed fields with a stable replay identity, isolated by project', async () => {
    const first = fixture(), second = { ...structuredClone(first), id: 'INTAKE-OTHER', code: 'INTAKE-OTHER', name: 'Other project' };
    ids.add(second.id);
    const user = userEvent.setup(), onClose = vi.fn();
    let view = render(<DemoMessageForm project={first} onSave={vi.fn()} onClose={onClose} />);
    await useExample(user);
    await chooseSelect(user, screen.getByRole('combobox', { name: /^Demo photo/ }), DEMO_MESSAGE_PHOTOS[1].id);
    const buffer = readFormBuffer(first.id, scope);
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    view = render(<DemoMessageForm project={second} onSave={vi.fn()} onClose={onClose} />);
    expect(message().value).toBe('');
    await user.type(message(), 'Other unfinished text');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    view.unmount();
    render(<DemoMessageForm project={first} onSave={vi.fn()} onClose={onClose} />);
    expect(message().value).toBe(buffer.text);
    expect(screen.getByRole('combobox', { name: /^Demo photo/ }).getAttribute('data-value')).toBe(buffer.photoId);
    expect(readFormBuffer(first.id, scope).submissionId).toBe(buffer.submissionId);
    expect(readFormBuffer(second.id, scope).text).toBe('Other unfinished text');
    expect(screen.queryByRole('button', { name: 'Save to inbox', exact: true })).toBeNull();
  });

  it('requires a fresh preview after edits or mapping changes and keeps failed saves for an idempotent retry', async () => {
    const project = fixture(), user = userEvent.setup(), onClose = vi.fn();
    const onSave = vi.fn().mockReturnValueOnce({ outcome: 'invalid', error: 'The baseline changed. Preview this message again.' })
      .mockReturnValueOnce({ outcome: 'duplicate', messageId: 'ALREADY-IN-INBOX' });
    const view = render(<DemoMessageForm project={project} onSave={onSave} onClose={onClose} />);
    await previewExample(user);
    await user.click(screen.getByRole('button', { name: 'Back to edit', exact: true }));
    fireEvent.change(message(), { target: { value: `${message().value}\nSecond note.` } });
    expect(screen.queryByRole('button', { name: 'Save to inbox', exact: true })).toBeNull();
    await user.click(previewButton());
    const changed = structuredClone(project);
    changed.drawingMapping.areas[0].name = 'Reviewed area name';
    view.rerender(<DemoMessageForm project={changed} onSave={onSave} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Save to inbox', exact: true })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Preview your message again');
    expect(onSave).not.toHaveBeenCalled();
    await user.click(previewButton());
    await user.click(saveButton());
    expect(screen.getByRole('alert').textContent).toContain('The baseline changed');
    expect(onClose).not.toHaveBeenCalled();
    const buffer = readFormBuffer(project.id, scope), firstAttempt = onSave.mock.calls[0][0];
    expect(buffer.text).toBe(firstAttempt.text);
    await user.click(saveButton());
    expect(onSave.mock.calls[1][0]).toEqual(firstAttempt);
    expect(onClose).toHaveBeenCalledOnce();
    expect(readFormBuffer(project.id, scope)).toBeUndefined();
  });
});
