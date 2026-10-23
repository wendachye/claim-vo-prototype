import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimEvidencePanel } from '../src/components/ClaimEvidencePanel.jsx';

const work = () => ({
  id: 'A', ref: 'A/01', description: 'Example scaffold', verified: 50,
  verifiedAt: '2026-10-03T10:00:00+08:00',
  evidence: { id: 'REPORT-A', projectId: 'P1', sourceMessageId: 'MESSAGE-A', sender: 'Example worker',
    date: '2026-10-02T09:00:00+08:00', message: 'Area A | 50% complete total', area: 'Area A',
    photo: '/assets/demo-evidence-a.jpg', photoAlt: 'Saved scaffold photo',
    verifiedBy: 'Example supervisor', reviewReason: 'Checked against the original observation.' },
});
const props = { projectId: 'P1', kind: 'work', period: '2026-10', cutoff: '2026-10-31' };

function Journey({ row, close }) {
  const [open, setOpen] = useState(false);
  return <div className="app-shell"><button onClick={() => setOpen(true)}>View evidence</button>{open && <ClaimEvidencePanel {...props} row={row} onClose={() => { close(); setOpen(false); }} />}</div>;
}

describe('read-only claim evidence panel', () => {
  it('preserves the supplied evidence and returns keyboard focus after dismissal', async () => {
    const row = work();
    const original = structuredClone(row);
    const close = vi.fn();
    const user = userEvent.setup();
    render(<Journey row={row} close={close} />);
    const opener = screen.getByRole('button', { name: 'View evidence', exact: true });
    await user.click(opener);
    const panel = screen.getByRole('dialog', { name: 'Evidence · A/01' });
    expect(within(panel).getByText('Current assessment')).toBeTruthy();
    expect(within(panel).getByText(row.evidence.message)).toBeTruthy();
    expect(within(panel).getByText('Example supervisor')).toBeTruthy();
    expect(within(panel).getByRole('img', { name: row.evidence.photoAlt }).getAttribute('src')).toBe(row.evidence.photo);
    expect(within(panel).getByText(/Generated demo photo/)).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(close).toHaveBeenCalledTimes(1);
    expect(row).toEqual(original);
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Done', exact: true }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(row).toEqual(original);
  });

  it('does not fabricate a report, photo, sender or supervisor for legacy progress', () => {
    render(<ClaimEvidencePanel {...props} row={{ id: 'A', ref: 'A/01', verified: 0 }} revision={1} />);
    const panel = screen.getByRole('dialog', { name: 'Evidence · A/01' });
    expect(within(panel).getByText('Saved version 1')).toBeTruthy();
    expect(within(panel).getByText('No original report was saved for this item.')).toBeTruthy();
    expect(within(panel).getByText('No photo was saved with this item.')).toBeTruthy();
    expect(within(panel).getByText('0%')).toBeTruthy();
    expect(within(panel).queryByRole('img')).toBeNull();
    expect(within(panel).getByText('Reviewer').nextElementSibling.textContent).toBe('Not recorded');
    expect(within(panel).getByText('Verified', { exact: true }).nextElementSibling.textContent).toBe('Not recorded');
  });

  it('never exposes a report belonging to another project', () => {
    const row = work();
    row.evidence.projectId = 'OTHER';
    row.evidence.message = 'Foreign confidential observation';
    render(<ClaimEvidencePanel {...props} row={row} revision={2} />);
    const panel = screen.getByRole('dialog', { name: 'Evidence', exact: true });
    expect(within(panel).getByText('Choose an item from the selected project to view its evidence.')).toBeTruthy();
    expect(within(panel).queryByText(row.evidence.message)).toBeNull();
    expect(within(panel).queryByText(row.evidence.sender)).toBeNull();
    expect(within(panel).queryByRole('img')).toBeNull();
  });

  it('keeps price approval separate from the saved VO claim decision', () => {
    const row = { id: 'VO-A', reference: 'VO/01', title: 'Extra platform', status: 'approved',
      approvedValue: 200, approvalReference: 'PRICE-001', approvalDate: '2026-10-04T12:00:00+08:00',
      approver: 'Example QS', evidence: work().evidence, eligible: false,
      eligibilityReview: { scopeDisposition: 'variation', instructionStatus: 'documented', instructionReference: 'INSTRUCTION-001',
        executionStatus: 'verified', executionReference: 'CHECK-001', executionVerifiedAt: '2026-10-05T12:00:00+08:00',
        claimEligibility: 'excluded', eligibilityNote: 'Not part of this claim period.', eligibilityReviewedAt: '2026-10-06T12:00:00+08:00' } };
    const original = structuredClone(row);
    render(<ClaimEvidencePanel {...props} kind="vo" row={row} revision={3} />);
    const panel = screen.getByRole('dialog', { name: 'Evidence · VO/01' });
    expect(within(panel).getByText('Price approved')).toBeTruthy();
    expect(within(panel).getByText('Excluded from claim')).toBeTruthy();
    expect(within(panel).getByText('INSTRUCTION-001')).toBeTruthy();
    expect(within(panel).getByText('CHECK-001')).toBeTruthy();
    expect(within(panel).getByText('Not part of this claim period.')).toBeTruthy();
    expect(within(panel).getByText('Saved version 3')).toBeTruthy();
    expect(row).toEqual(original);
  });

  it('retains the saved message when a photo fails and resets for a new attachment', () => {
    const row = work();
    const view = render(<ClaimEvidencePanel {...props} row={row} />);
    fireEvent.error(screen.getByRole('img', { name: row.evidence.photoAlt }));
    expect(screen.getByText('Photo could not be displayed. The saved message and review remain available.')).toBeTruthy();
    expect(screen.getByText(row.evidence.message)).toBeTruthy();
    const next = { ...row, evidence: { ...row.evidence, photo: '/assets/demo-evidence-b.jpg' } };
    view.rerender(<ClaimEvidencePanel {...props} row={next} />);
    expect(screen.getByRole('img', { name: row.evidence.photoAlt }).getAttribute('src')).toBe(next.evidence.photo);
  });

  it.each([['reported', 'Reported only'], ['disputed', 'Disputed']])('retains the %s instruction state and recorded references', (status, label) => {
    const row = { id: 'VO-A', title: 'Extra access', eligible: false, evidence: work().evidence,
      eligibilityReview: { scopeDisposition: 'clarification', instructionStatus: status, instructionReference: 'REPORTED-INSTRUCTION',
        executionStatus: 'notVerified', executionReference: 'UNVERIFIED-CHECK', claimEligibility: 'needsReview' } };
    render(<ClaimEvidencePanel {...props} kind="vo" row={row} revision={2} />);
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('Needs clarification')).toBeTruthy();
    expect(within(panel).getByText('Instruction').nextElementSibling.textContent).toContain(label);
    expect(within(panel).getByText('REPORTED-INSTRUCTION')).toBeTruthy();
    expect(within(panel).getByText('Work verification').nextElementSibling.textContent).toContain('Not verified');
    expect(within(panel).getByText('UNVERIFIED-CHECK')).toBeTruthy();
    expect(within(panel).queryByText('Documented', { exact: true })).toBeNull();
  });
});
