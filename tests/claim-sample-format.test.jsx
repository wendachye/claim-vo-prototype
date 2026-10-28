import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimPackPreview } from '../src/components/ClaimPackPreview';
import { createProject } from '../src/data/projects.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function fixture({ basis, previous = 100, quantity = 40, withVO = true, priorConfirmed = true } = {}) {
  const project = createProject({ name: 'Saved claim format demo', code: 'FORMAT', country: 'Singapore' });
  Object.assign(project, { locked: true, lockedAt: '2026-09-01T12:00:00+08:00',
    contract: { ...project.contract, subcontractor: 'Saved Scaffold Subcontractor', mainContractor: 'Saved Main Contractor',
      reference: 'SAVED-CONTRACT-001', currency: 'SGD', totalAmount: 1000 },
    items: [{ id: 'A', ref: 'A/01', description: 'Measured external scaffold', location: 'Block A', unit: 'm²', quantity: 100,
      rate: 10, amount: 1000, pricingType: 'measured', reported: 80, verified: 80 }],
    reports: [{ id: 'WORK-1', projectId: project.id, itemId: 'A', status: 'verified', completion: 80,
      date: '2026-10-15T09:00:00+08:00', verifiedAt: '2026-10-16T10:00:00+08:00',
      sender: 'Saved work sender', verifiedBy: 'Saved supervisor', message: 'Original saved scaffold update.',
      sourceMessageId: 'WORK-MESSAGE', photo: '/assets/demo-scaffold.jpg', photoAlt: 'Saved scaffold evidence', area: 'Area A' },
    { id: 'VO-1', projectId: project.id, vo: true, status: 'voApproved', date: '2026-10-17T09:00:00+08:00',
      sender: 'Saved extra-work sender', message: 'Original saved extra access request.', sourceMessageId: 'VO-MESSAGE',
      photo: '/assets/demo-platform.jpg', photoAlt: 'Saved extra access evidence', area: 'Area A' }],
    voReviews: [{ id: 'VO-1', reportId: 'VO-1', projectId: project.id, status: 'approved', title: 'Additional access platform',
      approvedValue: 200, approvalReference: 'SAVED-APPROVAL', approver: 'Saved approver', reviewChecksVersion: 1,
      scopeDisposition: 'variation', scopeAssessment: 'Extra access outside the saved contract scope.',
      instructionStatus: 'documented', instructionReference: 'SAVED-INSTRUCTION', executionStatus: 'verified',
      executionReference: 'SAVED-WORK-CHECK', executionVerifiedAt: '2026-10-19T10:00:00+08:00', claimEligibility: 'eligible',
      eligibilityNote: 'Saved QS review of this instructed work.', eligibilityReviewedAt: '2026-10-19T11:00:00+08:00',
      history: [{ id: 'VO-APPROVAL', action: 'approve', to: 'approved', actor: 'Saved QS', date: '2026-10-18T10:00:00+08:00' }] }],
  });
  const result = saveClaimDraft(project, '2026-10', { work: { A: { include: true, assessedQuantity: quantity, previousValue: previous } },
    vos: withVO ? { 'VO-1': { include: true, assessedValue: 80, previousValue: 20 } } : {}, priorConfirmed,
    adjustmentReason: previous > quantity * 10 ? 'QS corrected the earlier measured quantity.' : '',
    note: 'Saved QS assessment note.', ...(basis ? { claimBasis: basis } : {}) });
  expect(result.outcome).toBe('updated');
  return { project: result.project, draft: result.draft, pack: buildClaimPack(result.project, result.draft.id).pack };
}

const rowFor = (table, description) => within(table).getByText(description, { exact: true }).closest('tr');
const summaryValue = (section, label) => within(section).getByText(label, { exact: true }).parentElement.textContent;
const before = (first, second) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('sample-based progressive claim format', () => {
  it('uses the seven-column claim schedule and puts saved evidence after the summary and unsigned acknowledgements', () => {
    const saved = fixture();
    const original = structuredClone(saved.project);
    render(<ClaimPackPreview project={saved.project} draftId={saved.draft.id} onBack={() => {}} />);
    const table = screen.getByRole('table', { name: 'Progressive claim schedule' });
    expect(within(table.querySelector('thead')).getAllByRole('columnheader').map(header => header.textContent.replace(/\s+/g, ' ').trim()))
      .toEqual(['S/No', 'Description', 'Contract amount', 'Previous claim', 'Current claim', 'Cumulative claim', 'Remark']);
    const work = rowFor(table, 'Measured external scaffold');
    const vo = rowFor(table, 'Additional access platform');
    expect(work.textContent).toContain('1,000.00');
    expect(work.textContent).toContain('100.00');
    expect(work.textContent).toContain('300.00');
    expect(work.textContent).toContain('400.00');
    expect(work.textContent).toContain('40');
    expect(work.textContent).toContain('m²');
    expect(work.textContent).toContain('80%'); // Physical verification remains distinct from the QS quantity.
    expect(vo.textContent).toContain('SAVED-APPROVAL');
    expect(vo.textContent).toContain('200.00');
    expect(vo.textContent).toContain('20.00');
    expect(vo.textContent).toContain('60.00');
    expect(vo.textContent).toContain('80.00');
    expect(screen.getAllByText('Saved Scaffold Subcontractor', { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Saved Main Contractor', { exact: true }).length).toBeGreaterThan(0);
    const summary = screen.getByRole('region', { name: 'Claim totals' });
    expect(summaryValue(summary, 'Cumulative gross claim')).toContain('480.00');
    expect(summaryValue(summary, 'Less previously claimed')).toContain('120.00');
    expect(summaryValue(summary, 'Total amount of progressive claim for work done')).toContain('360.00');
    const signature = screen.getByRole('region', { name: 'Signature and acknowledgement' });
    expect(within(signature).queryByRole('img')).toBeNull();
    const appendix = screen.getByRole('heading', { name: /Evidence index/ }).closest('section');
    expect(before(table, summary)).toBe(true);
    expect(before(summary, signature)).toBe(true);
    expect(before(signature, appendix)).toBe(true);
    expect([...screen.getByRole('article').children].filter(element => element.tagName === 'SECTION').at(-1)).toBe(appendix);
    expect(within(appendix).getByText('Original saved scaffold update.', { exact: true })).toBeTruthy();
    expect(within(appendix).getByText('Original saved extra access request.', { exact: true })).toBeTruthy();
    expect(within(appendix).getByRole('img', { name: 'Saved scaffold evidence', exact: true }).getAttribute('src')).toBe('/assets/demo-scaffold.jpg');
    expect(within(appendix).getByRole('img', { name: 'Saved extra access evidence', exact: true }).getAttribute('src')).toBe('/assets/demo-platform.jpg');
    expect(saved.project).toEqual(original);
  });

  it('reconciles saved retention and previous submitted net once, without confusing gross line movements with the payable assessment', () => {
    const saved = fixture({ basis: { version: 1, billingMethod: 'quantityRate', retentionMode: 'rateCap', retentionRate: 5,
      retentionCap: 1000, previousNetValue: 50, priorReference: 'SAVED-PRIOR' } });
    const original = structuredClone(saved.project);
    expect(saved.pack.totals.currentValue).toBe(406);
    render(<ClaimPackPreview project={saved.project} draftId={saved.draft.id} onBack={() => {}} />);
    const summary = screen.getByRole('region', { name: 'Saved claim basis' });
    expect(summaryValue(summary, 'Assessed gross to date')).toContain('480.00');
    expect(summaryValue(summary, 'Less retention held')).toContain('24.00');
    expect(summaryValue(summary, 'Cumulative net')).toContain('456.00');
    expect(summaryValue(summary, 'Less previously submitted net')).toContain('50.00');
    expect(summaryValue(summary, 'Net claim this month')).toContain('406.00');
    expect(saved.project).toEqual(original);
  });

  it('keeps unknown previous values blank while explicit zero amounts remain zero', () => {
    const missing = fixture({ basis: { version: 1, billingMethod: 'quantityRate', retentionMode: 'none', previousNetValue: '' },
      previous: null, withVO: false, priorConfirmed: false });
    missing.project.claimDrafts[0].snapshot.workRows[0].contractAmount = null;
    render(<ClaimPackPreview project={missing.project} draftId={missing.draft.id} onBack={() => {}} />);
    const summary = screen.getByRole('region', { name: 'Saved claim basis' });
    expect(summaryValue(summary, 'Less retention held')).toContain('0.00');
    expect(summaryValue(summary, 'Less previously submitted net')).toContain('—');
    expect(summaryValue(summary, 'Net claim this month')).toContain('—');
    const missingTable = screen.getByRole('table', { name: 'Progressive claim schedule' });
    const missingCells = within(rowFor(missingTable, 'Measured external scaffold')).getAllByRole('cell');
    expect(missingCells[2].textContent).toBe('—');
    expect(missingCells[3].textContent).toBe('—');
    cleanup();
    const zero = fixture({ quantity: 0, previous: 0, withVO: false });
    render(<ClaimPackPreview project={zero.project} draftId={zero.draft.id} onBack={() => {}} />);
    const zeroSummary = screen.getByRole('region', { name: 'Claim totals' });
    expect(summaryValue(zeroSummary, 'Cumulative gross claim')).toContain('0.00');
    expect(summaryValue(zeroSummary, 'Total amount of progressive claim for work done')).toContain('0.00');
    const zeroTable = screen.getByRole('table', { name: 'Progressive claim schedule' });
    expect(within(rowFor(zeroTable, 'Measured external scaffold')).getAllByRole('cell')[4].textContent).toBe('0.00');
  });

  it('retains signed QS adjustments rather than clamping a negative current claim to zero', () => {
    const saved = fixture({ previous: 450, withVO: false });
    expect(saved.pack.totals.currentValue).toBe(-50);
    render(<ClaimPackPreview project={saved.project} draftId={saved.draft.id} onBack={() => {}} />);
    const summary = screen.getByRole('region', { name: 'Claim totals' });
    expect(summaryValue(summary, 'Total amount of progressive claim for work done')).toContain('-50.00');
    expect(screen.getByText('QS corrected the earlier measured quantity.', { exact: true })).toBeTruthy();
  });

  it('renders and exports the same frozen revision after live sources change without copying sample-party or signature data', async () => {
    const user = userEvent.setup();
    const saved = fixture();
    const pack = structuredClone(saved.pack), csv = toClaimCSV(saved.pack);
    saved.project.contract.subcontractor = 'Changed live subcontractor';
    saved.project.contract.mainContractor = 'Changed live main contractor';
    saved.project.items = []; saved.project.reports = []; saved.project.voReviews = [];
    saved.project.claimTracking = [{ projectId: saved.project.id, draftId: saved.draft.id, status: 'paid', paidValue: 99999,
      certifiedValue: 99999, submittedAt: '2026-10-27', paidAt: '2026-10-28', submissionReference: 'LIVE-SUBMISSION', history: [] }];
    const original = structuredClone(saved.project);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {}), download = vi.fn();
    render(<ClaimPackPreview project={saved.project} draftId={saved.draft.id} onBack={() => {}} onDownloadCSV={download} />);
    expect(screen.getAllByText('Saved Scaffold Subcontractor', { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Saved Main Contractor', { exact: true }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Changed live subcontractor', { exact: true })).toBeNull();
    expect(screen.queryByText('LIVE-SUBMISSION', { exact: true })).toBeNull();
    const document = screen.getByRole('article');
    expect(document.textContent).not.toMatch(/99,999|Jacob General|Jalan Beringin|Tai Tzu Cheng|GKH\.com\.sg|07\/10\/21/i);
    expect(document.querySelector('img[src$=".pdf"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Download CSV', exact: true }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][0]).toEqual(pack);
    expect(toClaimCSV(download.mock.calls[0][0])).toBe(csv);
    expect(buildClaimPack(saved.project, saved.draft.id).pack).toEqual(pack);
    expect(saved.project).toEqual(original);
  });
});
