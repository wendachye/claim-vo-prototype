import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthlyClaimView } from '../src/components/MonthlyClaimView.jsx';
import { createProject } from '../src/data/projects.js';
import { getVOCases } from '../src/data/vo.js';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.js';

const projectIds = new Set();
const evidenceButton = (reference = 'A/01') => screen.getByRole('button', { name: `View evidence for ${reference}`, exact: true });
const dialog = () => screen.getByRole('dialog');
const quantity = () => screen.getByRole('spinbutton', { name: 'A QS cumulative quantity' });
const previous = () => screen.getByRole('spinbutton', { name: 'A previously claimed value' });
const checked = (element) => element.getAttribute('aria-checked') === 'true' || element.checked === true;

function fixture(code = 'EVIDENCE-UI') {
  const project = createProject({ name: `Claim evidence ${code}`, code, country: 'Singapore' });
  projectIds.add(project.id);
  Object.assign(project, {
    locked: true, lockedAt: '2026-09-01T12:00:00+08:00',
    items: [{ id: 'A', ref: 'A/01', description: 'Measured scaffold', unit: 'm²', quantity: 100,
      rate: 10, amount: 1000, pricingType: 'measured', verified: 90, reported: 100, needsReview: false }],
    reports: [{ id: 'R-A', projectId: project.id, itemId: 'A', status: 'verified', completion: 50,
      approvedCompletion: 50, date: '2026-10-14T09:00:00+08:00', verifiedAt: '2026-10-16T12:00:00+08:00',
      verifiedBy: 'Demo supervisor A', sender: 'Demo worker A', sourceMessageId: 'WA-A', area: 'Area A',
      message: 'Original scaffold update: 50% total.', photo: '/assets/demo-scaffold-original.jpg', photoAlt: 'Original mock scaffold photo' },
    { id: 'R-VO', projectId: project.id, vo: true, status: 'voApproved', date: '2026-10-17T10:00:00+08:00',
      sender: 'Demo worker VO', sourceMessageId: 'WA-VO', area: 'Area A', message: 'Original additional access-platform request.',
      photo: '/assets/demo-platform-original.jpg', photoAlt: 'Original mock extra-platform photo' }],
    voReviews: [{ id: 'R-VO', reportId: 'R-VO', projectId: project.id, status: 'approved', title: 'Additional access platform',
      approvedValue: 500, approvalReference: 'DEMO-PRICE-01', approver: 'Demo price approver',
      reviewChecksVersion: 1, scopeDisposition: 'variation', scopeAssessment: 'Separate instructed access outside original scope.',
      instructionStatus: 'documented', instructionReference: 'DEMO-INSTRUCTION-01', executionStatus: 'verified',
      executionReference: 'DEMO-WORK-CHECK-01', executionVerifiedAt: '2026-10-19T10:00:00+08:00',
      claimEligibility: 'eligible', eligibilityNote: 'QS checked the separate work and instruction.', eligibilityReviewedAt: '2026-10-20T10:00:00+08:00',
      history: [{ id: 'DEMO-APPROVAL', action: 'approve', to: 'approved', date: '2026-10-18T10:00:00+08:00', actor: 'Demo QS' }] }],
    whatsappMessages: [{ id: 'WA-A', projectId: project.id, text: 'Changed inbox copy is not the claim evidence.' }],
    claimDrafts: [], claimTracking: [],
  });
  writeFormBuffer(project.id, 'claims:period', '2026-10');
  return project;
}

function seedEditing(project, step = 2) {
  writeFormBuffer(project.id, 'claims:forms', { '2026-10': {
    work: { A: { include: true, assessedQuantity: '', previousValue: '' } }, vos: {},
    priorConfirmed: false, adjustmentReason: '', note: '',
  } });
  writeFormBuffer(project.id, 'claims:dirty', { '2026-10': true });
  writeFormBuffer(project.id, 'claims:step', step);
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  for (const id of projectIds) clearProjectFormBuffers(id);
  projectIds.clear();
  vi.restoreAllMocks();
});

describe('monthly claim evidence is a read-only detour', () => {
  it('opens the original work report without selecting the item or changing the claim', async () => {
    const user = userEvent.setup();
    const project = fixture();
    const original = structuredClone(project);
    const save = vi.fn(); const prepare = vi.fn();
    render(<MonthlyClaimView project={project} onSave={save} onPrepare={prepare} />);
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true }));
    const include = screen.getByRole('checkbox', { name: 'Include A in claim' });
    expect(checked(include)).toBe(false);
    const opener = evidenceButton();
    await user.click(opener);
    expect(within(dialog()).getByText('Original scaffold update: 50% total.')).toBeTruthy();
    expect(within(dialog()).getByText('Demo worker A')).toBeTruthy();
    expect(within(dialog()).getByText('Demo supervisor A')).toBeTruthy();
    expect(within(dialog()).getByRole('img', { name: 'Original mock scaffold photo' })).toBeTruthy();
    expect(within(dialog()).queryByText('Changed inbox copy is not the claim evidence.')).toBeNull();
    await user.click(within(dialog()).getByRole('button', { name: 'Done', exact: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(checked(include)).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(save).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
    expect(readFormBuffer(project.id, 'claims:forms')).toBeUndefined();
    expect(project).toEqual(original);
  });

  it('preserves unfinished quantity, prior value, note and reduction reason through Escape and remount', async () => {
    const user = userEvent.setup();
    const project = fixture(); seedEditing(project);
    const original = structuredClone(project);
    const save = vi.fn(); const prepare = vi.fn();
    const props = { project, onSave: save, onPrepare: prepare };
    const view = render(<MonthlyClaimView {...props} />);
    await user.type(quantity(), '33.5');
    await user.type(previous(), '450');
    await user.type(screen.getByRole('textbox', { name: 'Reason for the reduction' }), 'Rechecking an earlier measurement.');
    await user.click(screen.getByText(/Add a QS note/));
    await user.type(screen.getByRole('textbox', { name: 'QS note' }), 'Unfinished QS measurement note.');
    const buffered = readFormBuffer(project.id, 'claims:forms');
    expect(checked(screen.getByRole('checkbox', { name: /Confirm previous claims/ }))).toBe(false);
    const opener = evidenceButton(); await user.click(opener); await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(quantity().value).toBe('33.5'); expect(previous().value).toBe('450');
    expect(screen.getByRole('textbox', { name: 'QS note' }).value).toBe('Unfinished QS measurement note.');
    expect(screen.getByRole('textbox', { name: 'Reason for the reduction' }).value).toBe('Rechecking an earlier measurement.');
    expect(readFormBuffer(project.id, 'claims:forms')).toEqual(buffered);
    expect(readFormBuffer(project.id, 'claims:step')).toBe(2);
    view.unmount(); render(<MonthlyClaimView {...props} />);
    expect(quantity().value).toBe('33.5'); expect(previous().value).toBe('450');
    expect(screen.getByRole('textbox', { name: 'QS note' }).value).toBe('Unfinished QS measurement note.');
    expect(checked(screen.getByRole('checkbox', { name: /Confirm previous claims/ }))).toBe(false);
    expect(save).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
    expect(project).toEqual(original);
  });

  it('opens separate VO evidence and decision references without selecting or approving it', async () => {
    const user = userEvent.setup(); const project = fixture(); const original = structuredClone(project);
    const entry = getVOCases(project)[0]; const save = vi.fn(); const prepare = vi.fn();
    render(<MonthlyClaimView project={project} onSave={save} onPrepare={prepare} />);
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true }));
    const include = screen.getByRole('checkbox', { name: `Include ${entry.reference} in claim` });
    await user.click(evidenceButton(entry.reference));
    const panel = within(dialog());
    expect(panel.getByText('Original additional access-platform request.')).toBeTruthy();
    expect(panel.getByText('Demo worker VO')).toBeTruthy();
    expect(panel.getByRole('img', { name: 'Original mock extra-platform photo' })).toBeTruthy();
    expect(panel.getByText('DEMO-PRICE-01')).toBeTruthy();
    expect(panel.getByText('DEMO-INSTRUCTION-01')).toBeTruthy();
    expect(panel.getByText('DEMO-WORK-CHECK-01')).toBeTruthy();
    expect(panel.getByText('QS checked the separate work and instruction.')).toBeTruthy();
    expect(panel.queryByRole('button', { name: /Approve|Save|Verify|Prepare/ })).toBeNull();
    await user.click(panel.getByRole('button', { name: 'Close evidence', exact: true }));
    expect(checked(include)).toBe(false);
    expect(save).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled(); expect(project).toEqual(original);
  });

  it('uses the verified report available by the cutoff instead of a newer or foreign report', async () => {
    const user = userEvent.setup(); const project = fixture();
    project.reports.push({ ...project.reports[0], id: 'R-LATE', date: '2026-11-01T09:00:00+08:00',
      verifiedAt: '2026-11-02T10:00:00+08:00', completion: 90, message: 'Later November evidence must stay outside October.', photo: '/late.jpg' },
    { ...project.reports[0], id: 'R-FOREIGN', projectId: 'OTHER', verifiedAt: '2026-10-27T10:00:00+08:00',
      message: 'Foreign project evidence must never be shown.' });
    const original = structuredClone(project);
    render(<MonthlyClaimView project={project} />);
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true })); await user.click(evidenceButton());
    expect(within(dialog()).getByText('Original scaffold update: 50% total.')).toBeTruthy();
    expect(within(dialog()).queryByText(/Later November evidence|Foreign project evidence/)).toBeNull();
    expect(within(dialog()).getByRole('img', { name: 'Original mock scaffold photo' }).getAttribute('src')).toBe('/assets/demo-scaffold-original.jpg');
    expect(project).toEqual(original);
  });

  it('closes stale evidence when the month or project changes and keeps independent buffers', async () => {
    const user = userEvent.setup(); const project = fixture('EVIDENCE-ONE'); seedEditing(project);
    const other = fixture('EVIDENCE-TWO'); seedEditing(other);
    other.reports[0].message = 'Other project original report.';
    writeFormBuffer(other.id, 'claims:forms', { '2026-10': { work: { A: { include: true, assessedQuantity: '21', previousValue: '10' } }, vos: {}, priorConfirmed: false, note: 'Other unfinished form.' } });
    const original = structuredClone(project); const originalOther = structuredClone(other);
    const view = render(<MonthlyClaimView project={project} />);
    await user.type(quantity(), '12.5');
    const firstBuffer = readFormBuffer(project.id, 'claims:forms');
    await user.click(evidenceButton());
    view.rerender(<MonthlyClaimView project={other} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Original scaffold update: 50% total.')).toBeNull();
    expect(quantity().value).toBe('21');
    await user.click(evidenceButton()); expect(within(dialog()).getByText('Other project original report.')).toBeTruthy();
    await user.click(within(dialog()).getByRole('button', { name: 'Done', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Back to choose work', exact: true }));
    await user.click(evidenceButton());
    fireEvent.change(screen.getByLabelText('Claim period'), { target: { value: '2026-11' } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Claim period').value).toBe('2026-11');
    expect(readFormBuffer(project.id, 'claims:forms')).toEqual(firstBuffer);
    expect(readFormBuffer(other.id, 'claims:forms')['2026-10'].work.A.assessedQuantity).toBe('21');
    expect(project).toEqual(original); expect(other).toEqual(originalOther);
  });

  it('keeps missing report evidence empty instead of borrowing an inbox attachment', async () => {
    const user = userEvent.setup(); const project = fixture();
    project.reports = []; project.voReviews = [];
    const original = structuredClone(project);
    render(<MonthlyClaimView project={project} />);
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true })); await user.click(evidenceButton());
    expect(within(dialog()).queryByRole('img')).toBeNull();
    expect(within(dialog()).queryByText('Changed inbox copy is not the claim evidence.')).toBeNull();
    expect(dialog().textContent).toMatch(/no (?:site |saved |original |supporting )?(?:report|evidence|message)/i);
    expect(dialog().textContent).not.toContain('Demo supervisor A');
    expect(project).toEqual(original);
  });

  it('returns to the review step without saving or changing its checks', async () => {
    const user = userEvent.setup(); const project = fixture(); seedEditing(project, 3);
    const original = structuredClone(project); const save = vi.fn();
    render(<MonthlyClaimView project={project} onSave={save} />);
    const checks = [...screen.getAllByText(/Enter the total measured quantity|Confirm that you checked previous claims/)];
    expect(checks.length).toBeGreaterThan(0);
    await user.click(screen.getByText('View 1 selected item'));
    const opener = evidenceButton(); await user.click(opener);
    expect(within(dialog()).getByText('Original scaffold update: 50% total.')).toBeTruthy();
    await user.click(within(dialog()).getByRole('button', { name: 'Done', exact: true }));
    expect(screen.getByRole('heading', { name: 'Review your claim' })).toBeTruthy();
    expect(readFormBuffer(project.id, 'claims:step')).toBe(3);
    expect(document.activeElement).toBe(opener);
    expect(save).not.toHaveBeenCalled(); expect(project).toEqual(original);
  });
});
