import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimEvidencePanel } from '../src/components/ClaimEvidencePanel';
import { ClaimPackPreview } from '../src/components/ClaimPackPreview';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function row() {
  const report = { id: 'VO-RELATED', projectId: 'P', vo: true, status: 'needsReview', sourceMessageId: 'WA-RELATED',
    date: '2026-10-02T08:00:00Z', sender: 'Related worker', message: 'Second photo of the same instructed platform.',
    photo: '/assets/demo-platform-related.jpg', photoAlt: 'Saved related platform photo', area: 'Area A' };
  return { id: 'VO-MAIN', caseId: 'VO-MAIN', reference: 'P-VO-001', title: 'Additional platform', status: 'approved',
    included: true, eligible: true, issues: [], previousValue: 0, cumulativeValue: 120, currentValue: 120, assessedValue: 120,
    approvedValue: 200, approvalReference: 'APPROVAL', approver: 'Demo customer', approvalDate: '2026-10-04T08:00:00Z',
    evidence: { id: 'VO-MAIN', projectId: 'P', vo: true, status: 'voApproved', date: '2026-10-01T08:00:00Z',
      sender: 'Original worker', message: 'Original platform request.', photo: '/assets/demo-platform-main.jpg' },
    relatedEvidence: [{ report: structuredClone(report), link: { version: 1, id: 'LINK-1', projectId: 'P', sourceCaseId: 'VO-RELATED',
      targetCaseId: 'VO-MAIN', sourceReference: 'P-VO-002', targetReference: 'P-VO-001',
      reason: 'Both messages concern the same platform.', linkedAt: '2026-10-03T08:00:00Z', linkedBy: 'Demo QS', sourceReport: structuredClone(report) } }] };
}
const props = item => ({ row: item, kind: 'vo', projectId: 'P', period: '2026-10', revision: 2, cutoff: '2026-10-31' });

describe('claim related evidence remains a saved read-only snapshot', () => {
  it('keeps supporting originals collapsed and reveals their photo, sender and link reason without edits', async () => {
    const user = userEvent.setup();
    const item = row(); const original = structuredClone(item); const close = vi.fn();
    render(<ClaimEvidencePanel {...props(item)} onClose={close}/>);
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Original platform request.')).toBeTruthy();
    const summary = dialog.getByText('Related evidence (1)');
    expect(summary.closest('details').open).toBe(false);
    await user.click(summary);
    expect(summary.closest('details').open).toBe(true);
    expect(dialog.getByText('Second photo of the same instructed platform.')).toBeTruthy();
    expect(dialog.getByText('Related worker')).toBeTruthy();
    expect(dialog.getByText('Both messages concern the same platform.')).toBeTruthy();
    expect(dialog.getByRole('img', { name: 'Saved related platform photo' }).getAttribute('src')).toBe('/assets/demo-platform-related.jpg');
    expect(dialog.getByText(/They add no separate claim amount/)).toBeTruthy();
    expect(dialog.queryByRole('button', { name: /Save|Approve|Verify|Prepare/ })).toBeNull();
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalledTimes(1);
    expect(item).toEqual(original);
  });

  it('rejects foreign saved related evidence rather than borrowing another source', () => {
    const item = row(); item.relatedEvidence[0].link.projectId = 'OTHER';
    render(<ClaimEvidencePanel {...props(item)} onClose={() => {}}/>);
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Choose an item from the selected project to view its evidence.')).toBeTruthy();
    expect(dialog.queryByText('Second photo of the same instructed platform.')).toBeNull();
    expect(dialog.queryByText('Original platform request.')).toBeNull();
  });

  it('prints related evidence with its link reason while retaining one variation value and frozen sources', async () => {
    const user = userEvent.setup(); const item = row();
    const snapshot = { projectId: 'P', period: '2026-10', cutoff: '2026-10-31', currency: 'SGD', baselineVersion: 1,
      baselineLockedAt: null, workRows: [], voRows: [item], totals: { currentValue: 120, cumulativeValue: 120, previousValue: 0, voCurrentValue: 120, workCurrentValue: 0 },
      assessment: { work: {}, vos: { 'VO-MAIN': { include: true, assessedValue: 120, previousValue: 0 } }, priorConfirmed: true }, issues: [], canPrepare: true };
    const project = { id: 'P', code: 'P', name: 'Evidence snapshot site', contract: { currency: 'SGD' }, items: [],
      reports: [{ ...item.relatedEvidence[0].report, message: 'Changed live source must not replace the saved report.' }],
      claimDrafts: [{ id: 'CLAIM-P-2026-10-R2', projectId: 'P', period: '2026-10', revision: 2, status: 'draft',
        createdAt: '2026-10-20T08:00:00Z', assessment: snapshot.assessment, snapshot }] };
    const original = structuredClone(project);
    render(<ClaimPackPreview project={project} draftId="CLAIM-P-2026-10-R2" onBack={() => {}}/>);
    expect(screen.getByText('Related VO evidence')).toBeTruthy();
    expect(screen.getByText('Second photo of the same instructed platform.')).toBeTruthy();
    expect(screen.getByText(/Supporting evidence only; no additional claim value/)).toBeTruthy();
    expect(screen.queryByText('Changed live source must not replace the saved report.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View evidence for P-VO-001', exact: true }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Saved version 2')).toBeTruthy();
    await user.click(dialog.getByText('Related evidence (1)'));
    expect(dialog.getByText('Second photo of the same instructed platform.')).toBeTruthy();
    expect(project).toEqual(original);
  });
});
