import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimStatusTracker } from '../src/components/ClaimStatusTracker';
import { getClaimTracking, recordClaimStage } from '../src/data/claim-tracking.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const projectIds = new Set();
afterEach(() => { for (const id of projectIds) clearProjectFormBuffers(id); projectIds.clear(); });

function fixture(claimed = 10000, id = 'BALANCE-UI', period = '2026-10') {
  projectIds.add(id);
  const assessment = { priorConfirmed: true, note: 'Saved QS assessment remains unchanged.' };
  const draft = { id: `CLAIM-${id}-${period}-R1`, projectId: id, period, revision: 1, status: 'prepared',
    preparedAt: '2026-10-01T12:00:00+08:00', createdAt: '2026-10-01T10:00:00+08:00', assessment,
    snapshot: { projectId: id, period, currency: 'SGD', baselineVersion: 1, cutoff: `${period}-${period.endsWith('-09') ? '30' : '31'}T23:59:59+08:00`,
      assessment: structuredClone(assessment), workRows: [], voRows: [], issues: [], canPrepare: true,
      totals: { currentValue: claimed, cumulativeValue: claimed, previousValue: 0, workCurrentValue: claimed, voCurrentValue: 0 } } };
  return { id, code: id, name: 'Claim balance demo', country: 'Singapore', contract: { currency: 'SGD' },
    claimDrafts: [draft], claimTracking: [], history: [], items: [], reports: [] };
}

function stage(project, draftId, action, value, note = '') {
  const result = recordClaimStage(project, draftId, action, { date: '2026-10-20', reference: `DEMO-${action}-${value ?? 'NONE'}`,
    ...(value === undefined ? {} : { value }), note });
  expect(result.outcome).toBe('updated');
  return result.project;
}
function tracked(claimed, certified, paid, id = 'BALANCE-UI', note = 'Measured amount differs from the claim.', period) {
  let project = fixture(claimed, id, period);
  const draftId = project.claimDrafts[0].id;
  project = stage(project, draftId, 'submitted');
  project = stage(project, draftId, 'certified', certified, note);
  if (paid !== undefined) project = stage(project, draftId, 'payment', paid);
  return project;
}
const summary = () => screen.getByRole('region', { name: 'Claim status summary' });
const row = label => within(summary()).getByText(label, { exact: true }).closest('div');
function renderTracker(project, props = {}) {
  return render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} onBack={() => {}} {...props}/>);
}

describe('claim status financial balance clarity', () => {
  it('separates a certified balance from the claim difference and reveals the recorded explanation without saving', async () => {
    const project = tracked(10000, 9000, 6000);
    const original = structuredClone(project);
    const pack = buildClaimPack(project, project.claimDrafts[0].id);
    expect(pack.outcome).toBe('ready');
    const csv = toClaimCSV(pack.pack);
    const onRecord = vi.fn();
    const onPreview = vi.fn();
    const user = userEvent.setup();
    renderTracker(project, { onRecord, onPreview });
    expect(within(row('Balance to receive (certified)')).getByText('SGD 3,000.00')).toBeTruthy();
    expect(within(row('Difference from claim')).getByText('SGD 1,000.00')).toBeTruthy();
    expect(screen.getByText('Claimed amount minus certified amount.')).toBeTruthy();
    const note = screen.getByText('Certification note', { exact: true }).closest('details');
    expect(note.open).toBe(false);
    await user.click(within(note).getByText('Certification note', { exact: true }));
    expect(note.open).toBe(true);
    expect(within(note).getByText('Measured amount differs from the claim.')).toBeTruthy();
    expect(screen.queryByText(/disputed/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Preview saved claim', exact: true }));
    expect(onPreview).toHaveBeenCalledWith(project.claimDrafts[0].id);
    expect(onRecord).not.toHaveBeenCalled();
    expect(getClaimTracking(project, project.claimDrafts[0].id).status).toBe('certified');
    expect(project).toEqual(original);
    expect(buildClaimPack(project, project.claimDrafts[0].id)).toEqual(pack);
    expect(toClaimCSV(buildClaimPack(project, project.claimDrafts[0].id).pack)).toBe(csv);
  });

  it('marks only the certified amount fully paid and keeps an unresolved claim difference visible', () => {
    const partial = tracked(10000, 9000, 6000, 'BALANCE-FULL');
    const full = stage(partial, partial.claimDrafts[0].id, 'payment', 9000);
    const original = structuredClone(full);
    const view = renderTracker(partial);
    view.rerender(<ClaimStatusTracker project={full} draftId={full.claimDrafts[0].id}/>);
    expect(within(row('Balance to receive (certified)')).getByText('SGD 0.00')).toBeTruthy();
    expect(within(row('Difference from claim')).getByText('SGD 1,000.00')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Certified amount fully paid', exact: true })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Payment fully recorded', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record payment', exact: true })).toBeNull();
    expect(getClaimTracking(full, full.claimDrafts[0].id).status).toBe('paid');
    expect(full.claimDrafts).toEqual(partial.claimDrafts);
    expect(full).toEqual(original);
  });

  it('does not invent a receivable from unrecorded payments and distinguishes an explicitly recorded zero', () => {
    const unknown = tracked(100, 100, undefined, 'BALANCE-UNKNOWN');
    const original = structuredClone(unknown);
    const zero = stage(unknown, unknown.claimDrafts[0].id, 'payment', 0);
    const view = renderTracker(unknown);
    expect(within(row('Total paid to date')).getByText('Not recorded')).toBeTruthy();
    expect(within(row('Balance to receive (certified)')).getByText('Not recorded')).toBeTruthy();
    expect(within(summary()).queryByText('Difference from claim')).toBeNull();
    view.rerender(<ClaimStatusTracker project={zero} draftId={zero.claimDrafts[0].id}/>);
    expect(within(row('Total paid to date')).getByText('SGD 0.00')).toBeTruthy();
    expect(within(row('Balance to receive (certified)')).getByText('SGD 100.00')).toBeTruthy();
    expect(within(summary()).queryByText('Difference from claim')).toBeNull();
    expect(unknown).toEqual(original);
  });

  it('preserves a zero certified amount and requires a recorded zero payment before showing a zero balance', () => {
    const certifiedZero = tracked(0, 0, undefined, 'BALANCE-ZERO');
    const paidZero = stage(certifiedZero, certifiedZero.claimDrafts[0].id, 'payment', 0);
    const view = renderTracker(certifiedZero);
    expect(within(row('Certified amount')).getByText('SGD 0.00')).toBeTruthy();
    expect(within(row('Balance to receive (certified)')).getByText('Not recorded')).toBeTruthy();
    expect(within(summary()).queryByText('Difference from claim')).toBeNull();
    view.rerender(<ClaimStatusTracker project={paidZero} draftId={paidZero.claimDrafts[0].id}/>);
    expect(within(row('Balance to receive (certified)')).getByText('SGD 0.00')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Certified amount fully paid', exact: true })).toBeTruthy();
  });

  it.each([
    { claimed: -100, certified: -80, paid: -30, balance: 'SGD -50.00', difference: 'SGD -20.00', id: 'NEGATIVE' },
    { claimed: 100, certified: 120, paid: 20, balance: 'SGD 100.00', difference: 'SGD -20.00', id: 'ABOVE' },
    { claimed: 0.3, certified: 0.29, paid: 0.1, balance: 'SGD 0.19', difference: 'SGD 0.01', id: 'DECIMAL' },
  ])('keeps signed and exact decimal display for $id', ({ claimed, certified, paid, balance, difference, id }) => {
    const project = tracked(claimed, certified, paid, `BALANCE-${id}`);
    const original = structuredClone(project);
    renderTracker(project);
    expect(within(row('Balance to receive (certified)')).getByText(balance)).toBeTruthy();
    expect(within(row('Difference from claim')).getByText(difference)).toBeTruthy();
    expect(project).toEqual(original);
  });

  it('updates amounts and explanation when switching exact claims or projects without changing their records', () => {
    const first = tracked(10000, 9000, 6000, 'BALANCE-SWITCH', 'October measurement difference.');
    const second = tracked(500, 500, 200, 'BALANCE-SWITCH', '', '2026-09');
    const project = { ...first, claimDrafts: [...first.claimDrafts, ...second.claimDrafts], claimTracking: [...first.claimTracking, ...second.claimTracking] };
    const other = tracked(100, 80, 20, 'BALANCE-OTHER', 'Separate project certification note.');
    const before = structuredClone({ project, other });
    const view = renderTracker(project);
    expect(within(row('Difference from claim')).getByText('SGD 1,000.00')).toBeTruthy();
    view.rerender(<ClaimStatusTracker project={project} draftId={second.claimDrafts[0].id}/>);
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(within(row('Balance to receive (certified)')).getByText('SGD 300.00')).toBeTruthy();
    expect(within(summary()).queryByText('Difference from claim')).toBeNull();
    expect(screen.queryByText('Certification note', { exact: true })).toBeNull();
    view.rerender(<ClaimStatusTracker project={other} draftId={other.claimDrafts[0].id}/>);
    expect(within(row('Balance to receive (certified)')).getByText('SGD 60.00')).toBeTruthy();
    expect(within(row('Difference from claim')).getByText('SGD 20.00')).toBeTruthy();
    expect(screen.queryByText('October measurement difference.')).toBeNull();
    expect(within(summary()).getByText('Separate project certification note.')).toBeTruthy();
    expect({ project, other }).toEqual(before);
  });
});
