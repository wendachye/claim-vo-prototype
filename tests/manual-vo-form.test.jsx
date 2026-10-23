import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManualVOForm } from '../src/components/ManualVOForm.jsx';
import { clearProjectFormBuffers, readFormBuffer } from '../src/data/form-buffer.js';
import { createProject } from '../src/data/projects.js';
import { getDrawingMapping, installDrawing } from '../src/data/drawing-mapping.js';
import { MANUAL_VO_PHOTOS } from '../src/data/manual-vo.js';

const ids = new Set();
afterEach(() => { for (const id of ids) clearProjectFormBuffers(id); ids.clear(); });
function fixture(code = 'MANUAL-FORM') {
  let project = createProject({ name: 'Manual extra-work example', code, country: 'Singapore' });
  project.items = [{ id: 'WI-A', ref: 'A.1', description: 'Listed façade scaffold', location: 'Block A' }];
  project = installDrawing(project, { inputKind: 'sample' }, '2026-10-23T08:00:00Z').project;
  ids.add(project.id);
  return project;
}
const text = name => screen.getByRole('textbox', { name: new RegExp(`^${name}`) });
const combo = name => screen.getByRole('combobox', { name: new RegExp(`^${name}`) });
const add = () => screen.getByRole('button', { name: 'Add for review', exact: true });
async function enter(user) {
  await user.type(text('Work description'), 'Additional access platform');
  await user.type(text('Details'), 'Reported during the mock site meeting; QS to check the extra scope.');
}

describe('manual extra-work entry', () => {
  it('keeps initial entry small and records a mapped area, comparison link and optional demo photo only on save', async () => {
    const project = fixture();
    const before = structuredClone(project);
    const onSave = vi.fn(() => ({ outcome: 'updated', caseId: 'MANUAL-VO-SAVED' }));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ManualVOForm project={project} onSave={onSave} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Add extra work' })).toBeTruthy();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(document.querySelector('.manual-vo-optional').open).toBe(false);
    expect(screen.getByText(/Manual demo record · price unknown/)).toBeTruthy();
    await enter(user);
    await user.type(text('Location'), 'Previous unlisted location');
    const area = getDrawingMapping(project).areas[0];
    await user.selectOptions(combo('Site area'), area.id);
    expect(screen.queryByRole('textbox', { name: /^Location/ })).toBeNull();
    await user.type(text('Instruction or reference'), 'REPORTED-MEETING-01');
    await user.click(screen.getByText('Contract link & demo photo'));
    await user.selectOptions(combo('Contract item for comparison'), 'WI-A');
    await user.selectOptions(combo('Demo photo'), MANUAL_VO_PHOTOS[1].value);
    expect(screen.getByAltText(MANUAL_VO_PHOTOS[1].alt)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(add());
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toMatchObject({ title: 'Additional access platform', areaId: area.id, areaText: '', relatedItemId: 'WI-A', instructionReference: 'REPORTED-MEETING-01', photo: MANUAL_VO_PHOTOS[1].value });
    expect(onSave.mock.calls[0][0].submissionId).toMatch(/^[A-Za-z0-9_-]{8,120}$/);
    expect(project).toEqual(before);
    expect(onClose).toHaveBeenCalledOnce();
    expect(readFormBuffer(project.id, 'vo:manual-entry')).toBeUndefined();
  });

  it('validates required description/details and focuses the missing field without creating a record', async () => {
    const project = fixture();
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<ManualVOForm project={project} onSave={onSave} />);
    await user.click(add());
    expect(screen.getByRole('alert').textContent).toContain('Describe the extra work');
    expect(document.activeElement).toBe(text('Work description'));
    await user.type(text('Work description'), 'Extra scaffold');
    await user.click(add());
    expect(screen.getByRole('alert').textContent).toContain('Add the work details');
    expect(document.activeElement).toBe(text('Details'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('preserves cancelled edits and submission identity across remounts while isolating projects', async () => {
    const first = fixture('MANUAL-FIRST');
    const second = fixture('MANUAL-SECOND');
    const user = userEvent.setup();
    const onClose = vi.fn();
    const firstView = render(<ManualVOForm project={first} onSave={vi.fn()} onClose={onClose} />);
    await enter(user);
    await user.type(text('Location'), 'Unlisted work face');
    const savedBuffer = readFormBuffer(first.id, 'vo:manual-entry');
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(onClose).toHaveBeenCalledOnce();
    firstView.unmount();
    const secondView = render(<ManualVOForm project={second} onSave={vi.fn()} />);
    expect(text('Work description').value).toBe('');
    await user.type(text('Work description'), 'Different project work');
    secondView.unmount();
    render(<ManualVOForm project={first} onSave={vi.fn()} />);
    expect(text('Work description').value).toBe('Additional access platform');
    expect(text('Details').value).toContain('mock site meeting');
    expect(text('Location').value).toBe('Unlisted work face');
    expect(readFormBuffer(first.id, 'vo:manual-entry').submissionId).toBe(savedBuffer.submissionId);
    expect(readFormBuffer(second.id, 'vo:manual-entry').title).toBe('Different project work');
  });

  it('keeps failed entries for retry, focuses domain field errors and clears only a successful idempotent replay', async () => {
    const project = fixture();
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn()
      .mockReturnValueOnce({ outcome: 'invalid', error: 'Review the reported instruction reference.', field: 'instructionReference' })
      .mockReturnValueOnce({ outcome: 'unchanged', caseId: 'EXISTING-MANUAL-VO' });
    const view = render(<ManualVOForm project={project} onClose={onClose} onSave={onSave} />);
    await enter(user);
    await user.click(add());
    expect(screen.getByRole('alert').textContent).toContain('Review the reported instruction reference');
    expect(document.activeElement).toBe(text('Instruction or reference'));
    expect(onClose).not.toHaveBeenCalled();
    const submissionId = onSave.mock.calls[0][0].submissionId;
    expect(readFormBuffer(project.id, 'vo:manual-entry').title).toBe('Additional access platform');
    await user.click(add());
    expect(onSave.mock.calls[1][0].submissionId).toBe(submissionId);
    expect(onClose).toHaveBeenCalledOnce();
    expect(readFormBuffer(project.id, 'vo:manual-entry')).toBeUndefined();
    view.unmount();
    render(<ManualVOForm project={project} onSave={vi.fn()} />);
    expect(text('Work description').value).toBe('');
    expect(text('Details').value).toBe('');
  });

  it('blocks repeated save clicks while pending and retains entries after a failed save', async () => {
    const project = fixture();
    const user = userEvent.setup();
    let reject;
    const onSave = vi.fn(() => new Promise((resolve, rejected) => { reject = rejected; }));
    render(<ManualVOForm project={project} onSave={onSave} />);
    await enter(user);
    await user.click(add());
    expect(screen.getByRole('button', { name: 'Adding…' }).disabled).toBe(true);
    fireEvent.submit(document.querySelector('.manual-vo-form'));
    expect(onSave).toHaveBeenCalledOnce();
    reject(new Error('Simulated save failure'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Your entries are kept'));
    expect(text('Work description').value).toBe('Additional access platform');
    expect(add().disabled).toBe(false);
  });
});
