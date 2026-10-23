import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimPackPreview } from '../src/components/ClaimPackPreview';
import { saveClaimDraft } from '../src/data/claims.ts';
import { createProject } from '../src/data/projects.ts';

function fixture(basis = { version: 1, billingMethod: 'quantityRate', retentionMode: 'rateCap', retentionRate: 5, retentionCap: 1000, previousNetValue: 0, priorReference: '' }, confirmed = true) {
  const project = createProject({ name: 'Saved basis example', code: 'BASIS-PREVIEW', country: 'Singapore' });
  project.locked = true;
  project.lockedAt = '2026-09-01T12:00:00+08:00';
  project.items = [{ id: 'A', ref: 'A/01', description: 'Measured scaffold', unit: 'm²', quantity: 2088,
    rate: 13.5, amount: 28188, pricingType: 'measured', verified: 50, reported: 50 }];
  project.reports = [{ id: 'R-A', projectId: project.id, itemId: 'A', status: 'verified', completion: 50,
    verifiedAt: '2026-10-20T10:00:00+08:00', date: '2026-10-20T09:00:00+08:00',
    verifiedBy: 'Original supervisor', sender: 'Original worker', message: 'Original saved update', sourceMessageId: 'WA-A' }];
  const result = saveClaimDraft(project, '2026-10', {
    work: { A: { include: true, assessedQuantity: 1044, previousValue: 0 } }, vos: {}, priorConfirmed: confirmed,
    ...(basis ? { claimBasis: basis } : {}),
  });
  expect(result.outcome).toBe('updated');
  return result;
}
const mathRow = (section, label) => within(section).getByText(label, { exact: true }).parentElement.textContent;

describe('saved claim basis preview', () => {
  it('shows saved net reconciliation and keeps original evidence and download payload after live changes', async () => {
    const user = userEvent.setup();
    const saved = fixture();
    saved.project.claimBasis = { retentionRate: 99 };
    saved.project.contract.claimBasis = { retentionRate: 90 };
    saved.project.items = [];
    saved.project.reports = [];
    const before = structuredClone(saved.project);
    const download = vi.fn();
    render(<ClaimPackPreview project={saved.project} draftId={saved.draft.id} onDownloadCSV={download} />);
    const basis = screen.getByRole('region', { name: 'Saved claim basis' });
    expect(within(basis).getByText('Mock settings · saved version 1', { exact: true })).toBeTruthy();
    expect(within(basis).getByText(/5% retention · Cap SGD 1,000.00/)).toBeTruthy();
    expect(mathRow(basis, 'Assessed gross to date')).toContain('SGD 14,094.00');
    expect(mathRow(basis, 'Less retention held')).toContain('SGD 704.70');
    expect(mathRow(basis, 'Cumulative net')).toContain('SGD 13,389.30');
    expect(mathRow(basis, 'Less previously submitted net')).toContain('SGD 0.00');
    expect(mathRow(basis, 'Net claim this month')).toContain('SGD 13,389.30');
    expect(screen.getByRole('columnheader', { name: 'This period · gross' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'View evidence for A/01', exact: true }));
    const evidence = within(screen.getByRole('dialog'));
    expect(evidence.getByText('Original saved update', { exact: true })).toBeTruthy();
    expect(evidence.getByText('Original supervisor', { exact: true })).toBeTruthy();
    await user.click(evidence.getByRole('button', { name: 'Done', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Download CSV', exact: true }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][0].claimBasis.retentionRate).toBe(5);
    expect(download.mock.calls[0][0].totals.currentValue).toBe(13389.3);
    expect(saved.project).toEqual(before);
  });

  it('retains the legacy three-total view and its gross-only notice', () => {
    const saved = fixture(null);
    saved.project.claimBasis = { retentionRate: 50 };
    render(<ClaimPackPreview project={saved.project} draftId={saved.draft.id} />);
    expect(screen.queryByRole('region', { name: 'Saved claim basis' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Claim totals' }).textContent).toContain('14,094.00');
    expect(screen.getByText('This period · before deductions', { exact: true })).toBeTruthy();
    expect(screen.getByText(/does not certify work, approve payment or include tax and retention deductions/)).toBeTruthy();
  });

  it('keeps unknown previous net and net application visibly different from recorded zero retention', () => {
    const saved = fixture({ version: 1, billingMethod: 'quantityRate', retentionMode: 'none', previousNetValue: '' }, false);
    render(<ClaimPackPreview project={saved.project} draftId={saved.draft.id} />);
    const basis = screen.getByRole('region', { name: 'Saved claim basis' });
    expect(mathRow(basis, 'Less retention held')).toContain('SGD 0.00');
    expect(mathRow(basis, 'Less previously submitted net')).toContain('SGD —');
    expect(mathRow(basis, 'Net claim this month')).toContain('SGD —');
    expect(screen.getByText(/preparation checks remain in this saved snapshot/)).toBeTruthy();
  });
});
