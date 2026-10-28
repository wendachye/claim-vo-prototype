import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedClaimsList } from '../src/components/SavedClaimsList';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.ts';
import { markClaimPrepared, saveClaimDraft } from '../src/data/claims.ts';
import { recordClaimStage } from '../src/data/claim-tracking.ts';
import { saveClaimRevision } from '../src/data/claim-revisions.ts';

const now = new Date('2026-10-22T10:00:00+08:00');
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function setup(props = {}, projectInput) {
  const project = projectInput || createClaimExamplesDemo({ name: 'Compact saved claims', code: 'COMPACT-CLAIMS' }, now);
  const groups = [...new Set(project.claimDrafts.map(draft => draft.period))].sort().reverse()
    .map(period => ({ period, drafts: project.claimDrafts.filter(draft => draft.period === period).sort((a, b) => b.revision - a.revision) }));
  const callbacks = { onContinue: vi.fn(), onPrepare: vi.fn(), onPreview: vi.fn(), onTrack: vi.fn() };
  render(<SavedClaimsList project={project} groups={groups} currency="SGD" dirtyPeriods={{}} {...callbacks} {...props} />);
  return { project, callbacks };
}

const recordFor = month => screen.getByRole('heading', { name: month, exact: true }).closest('article');
const updated = result => {
  expect(result.outcome).toBe('updated');
  return result;
};
function preparedExample() {
  const project = createClaimExamplesDemo({ name: 'Prepared claim history', code: 'PREPARED-HISTORY' }, now);
  const ready = project.claimDrafts.find(draft => draft.period === '2026-09');
  const prepared = updated(markClaimPrepared(project, ready.id)).project;
  return { project: prepared, draft: prepared.claimDrafts.find(draft => draft.id === ready.id) };
}
const stage = (project, id, action, values = {}) => updated(recordClaimStage(project, id, action,
  { date: '2026-10-22', reference: `DEMO-${action}`, ...values })).project;

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
    expect(within(paid).queryByRole('button', { name: 'New version', hidden: true })).toBeNull();
    expect(within(paid).queryByRole('button', { name: 'Mark prepared' })).toBeNull();
    await userEvent.setup().click(within(paid).getByRole('button', { name: 'View payment history' }));
    expect(callbacks.onTrack).toHaveBeenCalledWith(project.claimDrafts.find(draft => draft.period === '2026-08').id);
    expect(project).toEqual(original);
    expect(callbacks.onPrepare).not.toHaveBeenCalled();
  });

  it('offers a keyboard-accessible New version only inside History without changing the prepared claim', async () => {
    const { project, draft } = preparedExample();
    const original = structuredClone(project);
    const { callbacks } = setup({}, project);
    const record = recordFor('September 2026');
    expect(within(record).queryByRole('button', { name: /version/i })).toBeNull();
    expect(within(record).queryByRole('button', { name: 'Edit claim' })).toBeNull();
    const history = record.parentElement.querySelector('details.claim-older-versions');
    expect(history.open).toBe(false);
    expect(screen.getByRole('button', { name: 'New version', exact: true }).closest('details')).toBe(history);
    const user = userEvent.setup();
    await user.click(history.querySelector('summary'));
    const newVersion = within(history).getByRole('button', { name: 'New version', exact: true });
    expect(newVersion.textContent).toBe('New version');
    expect(within(history).getByText('Start a separate draft for changes before submission.')).toBeTruthy();
    newVersion.focus();
    await user.keyboard('{Enter}');
    expect(callbacks.onContinue).toHaveBeenCalledExactlyOnceWith(draft);
    expect(callbacks.onPrepare).not.toHaveBeenCalled();
    expect(project).toEqual(original);
  });

  it.each(['submitted', 'certified', 'paid'])('keeps New version out of History for a %s claim', status => {
    let { project, draft } = preparedExample();
    project = stage(project, draft.id, 'submitted');
    if (['certified', 'paid'].includes(status)) project = stage(project, draft.id, 'certified', { value: draft.snapshot.totals.currentValue });
    if (status === 'paid') project = stage(project, draft.id, 'payment', { value: draft.snapshot.totals.currentValue });
    const original = structuredClone(project);
    setup({}, project);
    expect(screen.queryByRole('button', { name: 'New version', exact: true, hidden: true })).toBeNull();
    expect(project).toEqual(original);
  });

  it('does not offer a generic new version for a prepared query-response child', () => {
    let { project, draft } = preparedExample();
    project = stage(project, draft.id, 'submitted');
    project = stage(project, draft.id, 'query', { note: 'Please clarify the measured quantity.' });
    const revised = updated(saveClaimRevision(project, draft.id, draft.assessment, 'The independently measured quantity is confirmed.'));
    project = updated(markClaimPrepared(revised.project, revised.draft.id)).project;
    const original = structuredClone(project);
    const { callbacks } = setup({}, project);
    expect(screen.queryByRole('button', { name: 'New version', exact: true, hidden: true })).toBeNull();
    expect(callbacks.onContinue).not.toHaveBeenCalled();
    expect(project).toEqual(original);
  });

  it('keeps an older unissued prepared version read only when a newer draft exists', () => {
    const { project, draft } = preparedExample();
    const saved = updated(saveClaimDraft(project, draft.period, { ...draft.assessment, note: 'A later independent draft assessment.' }));
    const original = structuredClone(saved.project);
    setup({}, saved.project);
    expect(saved.project.claimDrafts.filter(entry => entry.period === draft.period)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'New version', exact: true, hidden: true })).toBeNull();
    expect(saved.project).toEqual(original);
  });
});
