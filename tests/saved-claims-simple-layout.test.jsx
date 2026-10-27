import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedClaimsList } from '../src/components/SavedClaimsList';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.ts';

const now = new Date('2026-10-22T10:00:00+08:00');
afterEach(() => vi.restoreAllMocks());

function setup(props = {}) {
  const project = createClaimExamplesDemo({ name: 'Compact saved claims', code: 'COMPACT-CLAIMS' }, now);
  const groups = [...new Set(project.claimDrafts.map(draft => draft.period))].sort().reverse()
    .map(period => ({ period, drafts: project.claimDrafts.filter(draft => draft.period === period).sort((a, b) => b.revision - a.revision) }));
  const callbacks = { onContinue: vi.fn(), onPrepare: vi.fn(), onPreview: vi.fn(), onTrack: vi.fn() };
  render(<SavedClaimsList project={project} groups={groups} currency="SGD" dirtyPeriods={{}} {...callbacks} {...props} />);
  return { project, callbacks };
}

const recordFor = month => screen.getByRole('heading', { name: month, exact: true }).closest('article');

describe('compact saved claims layout', () => {
  it('keeps the named pencil control direct while version and save details stay in History', async () => {
    const { project, callbacks } = setup();
    const original = structuredClone(project);
    const ready = project.claimDrafts.find(draft => draft.period === '2026-09');
    const record = recordFor('September 2026');
    expect(within(record).queryByText(/^Version /)).toBeNull();
    expect(within(record).queryByText(/^Saved /)).toBeNull();
    const edit = within(record).getByRole('button', { name: 'Edit claim', exact: true });
    expect(edit.closest('details')).toBeNull();
    expect(edit.textContent).toBe('');
    const user = userEvent.setup();
    await user.click(edit);
    expect(callbacks.onContinue).toHaveBeenCalledWith(ready);
    const history = record.parentElement.querySelector('details.claim-older-versions');
    expect(history.open).toBe(false);
    await user.click(history.querySelector('summary'));
    expect(history.open).toBe(true);
    expect(within(history).getByText('Version 1', { exact: true })).toBeTruthy();
    expect(within(history).getByText(/^Saved /)).toBeTruthy();
    expect(project).toEqual(original);
    expect(callbacks.onPrepare).not.toHaveBeenCalled();
  });

  it('gives each latest record one primary action while preserving incomplete and Paid guards', async () => {
    const { project, callbacks } = setup();
    const original = structuredClone(project);
    const incomplete = recordFor('October 2026');
    const ready = recordFor('September 2026');
    const paid = recordFor('August 2026');
    for (const record of [incomplete, ready, paid]) expect(record.querySelectorAll('button.primary')).toHaveLength(1);
    expect(within(incomplete).getByRole('button', { name: 'Mark prepared' }).disabled).toBe(true);
    expect(within(incomplete).getByRole('button', { name: 'Continue editing' }).classList.contains('primary')).toBe(true);
    expect(within(ready).getByRole('button', { name: 'Mark prepared' }).classList.contains('primary')).toBe(true);
    expect(within(paid).queryByRole('button', { name: 'Edit claim' })).toBeNull();
    expect(within(paid).queryByRole('button', { name: 'Start new version' })).toBeNull();
    expect(within(paid).queryByRole('button', { name: 'Mark prepared' })).toBeNull();
    await userEvent.setup().click(within(paid).getByRole('button', { name: 'View payment history' }));
    expect(callbacks.onTrack).toHaveBeenCalledWith(project.claimDrafts.find(draft => draft.period === '2026-08').id);
    expect(project).toEqual(original);
    expect(callbacks.onPrepare).not.toHaveBeenCalled();
  });
});
