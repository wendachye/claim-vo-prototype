import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedClaimsList } from '../src/components/SavedClaimsList.jsx';
import { createProject } from '../src/data/projects.js';
import { saveClaimDraft, markClaimPrepared } from '../src/data/claims.js';
import { recordClaimStage } from '../src/data/claim-tracking.js';
import { saveClaimRevision } from '../src/data/claim-revisions.js';

function queriedProject() {
  const project = createProject({ name: 'Claim query guidance', code: 'QUERY-LIST' });
  Object.assign(project, {
    locked: true, lockedAt: '2026-10-01T12:00:00+08:00',
    items: [{ id: 'A', ref: 'A/01', description: 'Measured scaffold', unit: 'm²', quantity: 100,
      rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 50 }],
    reports: [{ id: 'R-A', projectId: project.id, itemId: 'A', status: 'verified', completion: 50,
      date: '2026-10-02T09:00:00+08:00', verifiedAt: '2026-10-02T12:00:00+08:00' }],
  });
  const assessment = { work: { A: { include: true, assessedQuantity: 50, previousValue: 0 } }, priorConfirmed: true };
  const saved = saveClaimDraft(project, '2026-10', assessment);
  const prepared = markClaimPrepared(saved.project, saved.draft.id);
  const submitted = recordClaimStage(prepared.project, saved.draft.id, 'submitted', { date: '2026-10-22', reference: 'DEMO-SUB' });
  const queried = recordClaimStage(submitted.project, saved.draft.id, 'query', { date: '2026-10-23', reference: 'DEMO-QUERY', note: 'Check the measured quantity.', targetType: 'work', targetId: 'A' });
  expect(queried.outcome).toBe('updated');
  return { project: queried.project, original: saved.draft.id, assessment };
}
const groupsFor = (project) => [{ period: '2026-10', drafts: [...project.claimDrafts].sort((a, b) => b.revision - a.revision) }];
const show = (project, props = {}) => render(<SavedClaimsList project={project} groups={groupsFor(project)} currency="SGD" dirtyPeriods={{}} onContinue={vi.fn()} onPrepare={vi.fn()} onPreview={vi.fn()} onTrack={vi.fn()} {...props} />);
// Keep preparation on the fixture's submission day as real time advances.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T10:00:00+08:00'));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('saved claim query and revision guidance', () => {
  it('opens the exact latest query and prevents a generic new-version action', async () => {
    const { project, original } = queriedProject();
    const before = structuredClone(project);
    const onTrack = vi.fn();
    show(project, { onTrack });
    expect(screen.getByText('Needs revision · demo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start new version' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Review query' }));
    expect(onTrack).toHaveBeenCalledWith(original);
    expect(project).toEqual(before);
  });

  it('continues a revision with its query context and respects unfinished-edit preparation guards', async () => {
    const { project, original, assessment } = queriedProject();
    const revised = saveClaimRevision(project, original, { ...assessment, work: { A: { include: true, assessedQuantity: 40, previousValue: 0 } } }, 'Rechecked the measurement at 40 m².');
    expect(revised.outcome).toBe('updated');
    const before = structuredClone(revised.project);
    const onRevise = vi.fn();
    show(revised.project, { onRevise, dirtyPeriods: { '2026-10': true } });
    expect(screen.getByText('Revision draft')).toBeTruthy();
    expect(screen.getByText('Revises version 1 · Query DEMO-QUERY')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark prepared' }).disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue revision' }));
    expect(onRevise).toHaveBeenCalledWith(original);
    expect(revised.project).toEqual(before);
  });

  it('keeps the historical query separate from the resubmitted revised version', async () => {
    const { project, original, assessment } = queriedProject();
    const revised = saveClaimRevision(project, original, assessment, 'Measurement is confirmed; clarification supplied.');
    expect(revised.outcome).toBe('updated');
    const prepared = markClaimPrepared(revised.project, revised.draft.id);
    expect(prepared.outcome).toBe('updated');
    const resubmitted = recordClaimStage(prepared.project, revised.draft.id, 'submitted', { date: '2026-10-24', reference: 'DEMO-RESUB' });
    expect(resubmitted.outcome).toBe('updated');
    const onTrack = vi.fn();
    show(resubmitted.project, { onTrack });
    expect(screen.getByText('Resubmitted · demo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start new version' })).toBeNull();
    expect(screen.getByText('Query recorded · demo')).toBeTruthy();
    expect(screen.queryByText('Needs revision · demo')).toBeNull();
    expect(screen.getByText('Revised in version 2. Original assessment retained.')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Track claim status' }));
    expect(onTrack).toHaveBeenLastCalledWith(revised.draft.id);
    await user.click(document.querySelector('.claim-older-versions > summary'));
    await user.click(screen.getByRole('button', { name: 'View query history' }));
    expect(onTrack).toHaveBeenLastCalledWith(original);
    expect(resubmitted.project.claimDrafts[0]).toEqual(project.claimDrafts[0]);
  });
});
