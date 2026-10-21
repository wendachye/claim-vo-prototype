import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthlyClaimView } from '../src/components/MonthlyClaimView.jsx';
import { createProject } from '../src/data/projects.js';
import { saveClaimDraft, markClaimPrepared } from '../src/data/claims.js';
import { getVOCases } from '../src/data/vo.js';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.js';

const projects = new Set();
afterEach(() => { for (const id of projects) clearProjectFormBuffers(id); projects.clear(); vi.restoreAllMocks(); });

function fixture(approvalDate = '2026-10-17T12:00:00+08:00') {
  const project = createProject({ name: 'Claim handoff test', code: 'CLAIMUI', country: 'Singapore' });
  projects.add(project.id);
  project.locked = true;
  project.lockedAt = '2026-09-01T12:00:00+08:00';
  project.items = [{ id: 'A', ref: 'A/01', description: 'Measured scaffold', unit: 'm²', quantity: 100,
    rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 50 }];
  project.reports = [{ id: 'R-A', projectId: project.id, itemId: 'A', status: 'verified', completion: 50,
    date: '2026-10-15T09:00:00+08:00', verifiedAt: '2026-10-16T12:00:00+08:00' }, ...['OLD', 'NEW'].map((kind) => ({
    id: `R-${kind}`, projectId: project.id, vo: true, status: 'voApproved', date: '2026-10-15T10:00:00+08:00', message: `Extra access ${kind}`,
  }))];
  project.voReviews = ['OLD', 'NEW'].map((kind) => ({ id: `R-${kind}`, reportId: `R-${kind}`, projectId: project.id,
    status: 'approved', title: kind === 'NEW' ? 'Newly approved platform' : 'Existing approved access',
    approvedValue: kind === 'NEW' ? 500 : 200, approvalReference: `APP-${kind}`, approver: 'Example approver',
    history: [{ id: `APP-EVENT-${kind}`, action: 'approve', to: 'approved', date: kind === 'NEW' ? approvalDate : '2026-10-17T12:00:00+08:00', actor: 'Example QS' }] }));
  const saved = saveClaimDraft(project, '2026-10', { work: { A: { include: true, assessedQuantity: 40, previousValue: 5 } },
    vos: { 'R-OLD': { include: true, assessedValue: 100, previousValue: 20 } }, priorConfirmed: true, note: 'Saved measurement note.' });
  const prepared = markClaimPrepared(saved.project, saved.draft.id);
  writeFormBuffer(project.id, 'claims:period', '2026-10');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  return { project: prepared.project, target: getVOCases(prepared.project).find((entry) => entry.id === 'R-NEW') };
}

describe('approved VO handoff to monthly claims', () => {
  it('opens Choose work and highlights the requested VO without changing the saved prepared claim', async () => {
    const user = userEvent.setup();
    const { project, target } = fixture();
    const before = structuredClone(project);
    const save = vi.fn();
    const back = vi.fn();
    render(<MonthlyClaimView project={project} initialVOId={target.id} onBackToVO={back} onSave={save} />);
    expect(screen.getByRole('heading', { name: 'Prepare a monthly claim' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /1\s*Choose work/ }).getAttribute('aria-current')).toBe('step');
    const notice = screen.getByRole('region', { name: 'Extra work from VO review' });
    expect(notice.textContent).toContain('Newly approved platform');
    expect(notice.textContent).toContain('500.00');
    const checkbox = screen.getByRole('checkbox', { name: `Include ${target.reference} in claim` });
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    await user.click(within(notice).getByRole('button', { name: 'Back to VO review' }));
    expect(back).toHaveBeenCalledTimes(1);
    await user.click(within(notice).getByRole('button', { name: 'Find this VO' }));
    expect(document.activeElement).toBe(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    await user.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(readFormBuffer(project.id, 'claims:forms')['2026-10'].vos[target.id]).toEqual({ include: true });
    await user.click(screen.getByRole('button', { name: 'Enter totals', exact: true }));
    expect(screen.getByRole('spinbutton', { name: 'A QS cumulative quantity' }).value).toBe('40');
    expect(screen.getByRole('spinbutton', { name: 'R-NEW QS cumulative value' }).value).toBe('');
    expect(save).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  });

  it('retains the buffered month and unfinished values when opened from VO review', async () => {
    const user = userEvent.setup();
    const { project, target } = fixture();
    const unfinished = { work: { A: { include: true, assessedQuantity: 33.5, previousValue: 0 } },
      vos: {}, priorConfirmed: false, note: 'Unfinished measured total', adjustmentReason: '' };
    writeFormBuffer(project.id, 'claims:period', '2026-11');
    writeFormBuffer(project.id, 'claims:forms', { '2026-11': unfinished });
    writeFormBuffer(project.id, 'claims:dirty', { '2026-11': true });
    writeFormBuffer(project.id, 'claims:step', 3);
    render(<MonthlyClaimView project={project} initialVOId={target.id} />);
    expect(screen.getByLabelText('Claim period').value).toBe('2026-11');
    expect(readFormBuffer(project.id, 'claims:forms')['2026-11']).toEqual(unfinished);
    await user.click(screen.getByRole('button', { name: 'Enter totals', exact: true }));
    expect(screen.getByRole('spinbutton', { name: 'A QS cumulative quantity' }).value).toBe('33.5');
    expect(screen.getByRole('textbox', { name: 'QS note' }).value).toBe('Unfinished measured total');
    expect(screen.queryByRole('spinbutton', { name: 'R-NEW QS cumulative value' })).toBeNull();
  });

  it('explains a later approval cutoff and leaves the VO unselected after changing month', () => {
    const { project, target } = fixture('2026-11-02T12:00:00+08:00');
    render(<MonthlyClaimView project={project} initialVOId={target.id} />);
    const notice = screen.getByRole('region', { name: 'Extra work from VO review' });
    expect(notice.textContent).toContain('after this month’s cutoff');
    expect(screen.queryByRole('button', { name: 'Find this VO' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: `Include ${target.reference} in claim` })).toBeNull();
    fireEvent.change(screen.getByLabelText('Claim period'), { target: { value: '2026-11' } });
    expect(screen.getByRole('checkbox', { name: `Include ${target.reference} in claim` }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('button', { name: 'Find this VO' })).toBeTruthy();
  });

  it('shows an unavailable notice for a foreign ID and keeps ordinary claim history unchanged', () => {
    const { project } = fixture();
    const save = vi.fn();
    render(<MonthlyClaimView project={project} initialVOId="FOREIGN-CASE" onSave={save} />);
    expect(screen.getByRole('region', { name: 'Extra work from VO review' }).textContent).toContain('Extra work unavailable');
    expect(screen.getByRole('heading', { name: 'Monthly claims' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview & export' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Find this VO' })).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(readFormBuffer(project.id, 'claims:forms')).toBeUndefined();
  });

  it('keeps the saved-claims entry screen when no VO handoff was requested', async () => {
    const user = userEvent.setup();
    const { project } = fixture();
    render(<MonthlyClaimView project={project} />);
    expect(screen.getByRole('heading', { name: 'Monthly claims' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Extra work from VO review' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true }));
    expect(screen.getByLabelText('Claim period').value).toBe('2026-10');
    expect(screen.queryByRole('region', { name: 'Extra work from VO review' })).toBeNull();
  });
});
