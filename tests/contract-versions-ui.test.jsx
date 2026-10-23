import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContractRevisionForm } from '../src/components/ContractRevisionForm';
import { ContractVersionHistory } from '../src/components/ContractVersionHistory';
import { clearProjectFormBuffers, readFormBuffer } from '../src/data/form-buffer.ts';

const versions = vi.hoisted(() => ({ rows: [] }));
vi.mock('../src/data/contract-versions.ts', () => ({ getContractVersions: vi.fn(() => versions.rows) }));
const ids = new Set();
const project = (id = 'HISTORY-ONE', version = 1) => {
  ids.add(id);
  return { id, version, name: 'Contract history example', contract: { currency: 'SGD' }, items: [] };
};
const reason = () => screen.getByRole('textbox', { name: /^Change reason/ });
const create = () => screen.getByRole('button', { name: 'Create version', exact: true });
afterEach(() => { for (const id of ids) clearProjectFormBuffers(id); ids.clear(); versions.rows = []; });

describe('compact contract revision entry', () => {
  it('requires a short reason, focuses its error and creates only on explicit submit', async () => {
    const current = project();
    const before = structuredClone(current);
    const onCreate = vi.fn(() => ({ outcome: 'updated' }));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ContractRevisionForm project={current} onClose={onClose} onCreate={onCreate} />);
    expect(screen.getByRole('dialog', { name: 'Edit contract' })).toBeTruthy();
    expect(screen.getByText('Version 1')).toBeTruthy();
    expect(screen.getByText('Version 2')).toBeTruthy();
    await user.click(create());
    expect(screen.getByRole('alert').textContent).toContain('short reason');
    expect(document.activeElement).toBe(reason());
    expect(onCreate).not.toHaveBeenCalled();
    await user.type(reason(), '  Correct quantity against the schedule  ');
    expect(onCreate).not.toHaveBeenCalled();
    await user.click(create());
    expect(onCreate).toHaveBeenCalledExactlyOnceWith('Correct quantity against the schedule');
    expect(onClose).toHaveBeenCalledOnce();
    expect(current).toEqual(before);
    expect(readFormBuffer(current.id, 'contract:revision:1')).toBeUndefined();
  });

  it('preserves cancelled reasons while isolating projects and current versions', async () => {
    const first = project('REASON-ONE');
    const second = project('REASON-TWO');
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(<ContractRevisionForm project={first} onClose={onClose} onCreate={vi.fn()} />);
    await user.type(reason(), 'Correct first project quantity');
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    const other = render(<ContractRevisionForm project={second} onCreate={vi.fn()} />);
    expect(reason().value).toBe('');
    await user.type(reason(), 'Different project instruction');
    other.unmount();
    const newer = render(<ContractRevisionForm project={{ ...first, version: 2 }} onCreate={vi.fn()} />);
    expect(reason().value).toBe('');
    newer.unmount();
    render(<ContractRevisionForm project={first} onCreate={vi.fn()} />);
    expect(reason().value).toBe('Correct first project quantity');
    expect(readFormBuffer(second.id, 'contract:revision:1')).toBe('Different project instruction');
  });

  it('blocks overlong and multiline reasons before mutation', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(<ContractRevisionForm project={project()} onCreate={onCreate} />);
    fireEvent.change(reason(), { target: { value: 'x'.repeat(301) } });
    await user.click(create());
    expect(screen.getByRole('alert').textContent).toContain('300 characters');
    fireEvent.change(reason(), { target: { value: 'First line\nSecond line' } });
    await user.click(create());
    expect(screen.getByRole('alert').textContent).toContain('one short sentence');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('keeps a failed reason for retry and blocks duplicate pending submissions', async () => {
    const current = project();
    const onClose = vi.fn();
    let resolve;
    const onCreate = vi.fn(() => new Promise(done => { resolve = done; }));
    const user = userEvent.setup();
    render(<ContractRevisionForm project={current} onClose={onClose} onCreate={onCreate} />);
    await user.type(reason(), 'Correction after source review');
    await user.click(create());
    expect(screen.getByRole('button', { name: 'Creating…' }).disabled).toBe(true);
    fireEvent.submit(document.querySelector('.contract-revision-form'));
    expect(onCreate).toHaveBeenCalledOnce();
    resolve({ outcome: 'invalid', field: 'reason', error: 'Recheck the saved contract version.' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Recheck the saved contract version'));
    expect(document.activeElement).toBe(reason());
    expect(onClose).not.toHaveBeenCalled();
    expect(readFormBuffer(current.id, 'contract:revision:1')).toBe('Correction after source review');
    expect(create().disabled).toBe(false);
  });
});

describe('compact contract version history', () => {
  it('lists versions with honest review metadata, hides comparisons until opened and shows only changed values', async () => {
    versions.rows = [
      { version: 2, current: true, locked: false, createdAt: '2026-10-23T08:15:00Z', createdBy: 'Alex Tan · Demo QS reviewer', reason: 'Correct measured quantity', changesAvailable: true, changes: [
        { itemId: 'INTERNAL-SECRET', itemRef: 'A.1', description: 'Access scaffold', type: 'changed', fields: [{ field: 'quantity', label: 'Contract quantity', oldValue: 100, newValue: 120 }, { field: 'rate', label: 'Unit rate', oldValue: 13.5012, newValue: 13.5025 }] },
      ] },
      { version: 1, current: false, locked: true, confirmedAt: null, confirmedBy: null, reason: null, legacy: true, changesAvailable: false, changes: [] },
    ];
    const current = project();
    const before = structuredClone(current);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ContractVersionHistory project={current} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Contract versions' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: /^Version/ }).map(node => node.textContent)).toEqual(['Version 2', 'Version 1']);
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByText('Unconfirmed')).toBeTruthy();
    expect(screen.getByText('Confirmed', { exact: true })).toBeTruthy();
    expect(screen.getByText(/Reviewer not recorded/)).toBeTruthy();
    expect(screen.getByText('Not recorded for this earlier version.')).toBeTruthy();
    expect(document.querySelector('details').open).toBe(false);
    expect(screen.queryByText('INTERNAL-SECRET')).toBeNull();
    expect(screen.queryByText('Work description', { exact: true })).toBeNull();
    await user.click(screen.getByText('View changes'));
    expect(document.querySelector('details').open).toBe(true);
    const changed = document.querySelectorAll('.contract-version-value');
    expect(changed).toHaveLength(2);
    expect(within(changed[0]).getByText('Old')).toBeTruthy();
    expect(within(changed[0]).getByText('100')).toBeTruthy();
    expect(within(changed[0]).getByText('New')).toBeTruthy();
    expect(within(changed[0]).getByText('120')).toBeTruthy();
    expect(screen.getByText('SGD 13.5012')).toBeTruthy();
    expect(screen.getByText('SGD 13.5025')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(current).toEqual(before);
  });

  it('keeps unknown, blank and zero distinct and labels added or removed scopes', async () => {
    versions.rows = [{ version: 2, current: true, locked: true, confirmedAt: '2026-10-23T08:15:00Z', confirmedBy: 'Demo QS', reason: 'Review access scope', changesAvailable: true, changes: [
      { itemId: 'A', itemRef: 'A.1', description: 'Added access', type: 'added', fields: [{ field: 'quantity', label: 'Contract quantity', oldValue: null, newValue: 0 }, { field: 'location', label: 'Location', oldValue: '', newValue: 'Block A' }] },
      { itemId: 'B', itemRef: 'B.1', description: 'Removed access', type: 'removed', fields: [{ field: 'rate', label: 'Unit rate', oldValue: 0, newValue: null }] },
    ] }];
    const user = userEvent.setup();
    render(<ContractVersionHistory project={project()} />);
    await user.click(screen.getByText('View changes'));
    expect(screen.getByText('Added', { exact: true })).toBeTruthy();
    expect(screen.getByText('Removed', { exact: true })).toBeTruthy();
    expect(screen.getByText('0', { exact: true })).toBeTruthy();
    expect(screen.getByText('SGD 0.00')).toBeTruthy();
    expect(screen.getAllByText('Unknown')).toHaveLength(2);
    expect(screen.getByText('Not entered')).toBeTruthy();
  });

  it('does not invent a comparison or an actor for the original unrecorded version', () => {
    versions.rows = [{ version: 1, current: true, locked: false, legacy: true, changesAvailable: false, changes: [] }];
    render(<ContractVersionHistory project={project()} />);
    expect(screen.getByText('Initial version. No earlier snapshot to compare.')).toBeTruthy();
    expect(screen.getByText(/Author not recorded/)).toBeTruthy();
    expect(screen.queryByText('View changes')).toBeNull();
    expect(screen.queryByRole('button', { name: /Restore|Edit|Apply/ })).toBeNull();
  });
});
