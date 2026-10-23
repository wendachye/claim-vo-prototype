import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContractChecks } from '../src/components/ContractChecks';
import { clearProjectFormBuffers, readFormBuffer } from '../src/data/form-buffer.ts';

const project = (overrides = {}) => ({ id: 'TOTAL-REVIEW-ONE', name: 'Warehouse demo', locked: false, version: 1, contract: { representativeSubset: false }, items: [{ id: 'WI-001' }], ...overrides });
const checks = (overrides = {}) => ({ issues: [], itemIssueCount: 0, canConfirm: true, partial: false, totals: { currency: 'SGD', recordedTotal: 90, calculatedTotal: 90, declaredTotal: 100, difference: -10, complete: true, partial: false, comparison: 'difference' }, ...overrides });
const totalReview = (overrides = {}) => ({ required: true, status: 'required', scopeKey: 'ONE-SCOPE', review: null, ...overrides });
const saved = { reason: 'The declared sum includes a separately priced allowance.', reviewedBy: 'Demo QS', reviewedAt: '2026-10-24T03:00:00.000Z', baselineVersion: 1, recordedTotal: 90, declaredTotal: 100, difference: -10, currency: 'SGD' };
const openReview = () => fireEvent.click(screen.getByRole('button', { name: 'Review total difference', exact: true }));
const reasonField = () => screen.getByRole('textbox', { name: 'Reason for total difference' });
const saveButton = () => screen.getByRole('button', { name: 'Save reason', exact: true });
const props = (overrides = {}) => ({ project: project(), checks: checks(), totalReview: totalReview(), open: true, onSaveTotalReview: vi.fn(() => ({ outcome: 'updated' })), ...overrides });

afterEach(() => {
  clearProjectFormBuffers('TOTAL-REVIEW-ONE');
  clearProjectFormBuffers('TOTAL-REVIEW-TWO');
});

describe('inline contract total difference review', () => {
  it('keeps the form hidden until needed and validates an empty or oversized reason with focus', async () => {
    const input = props();
    const before = structuredClone(input.project);
    render(<ContractChecks {...input} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('SGD -10.00')).toBeTruthy();
    openReview();
    expect(document.activeElement).toBe(reasonField());
    expect(reasonField().getAttribute('maxlength')).toBe('500');
    fireEvent.click(saveButton());
    expect(screen.getByRole('alert').textContent).toBe('Add a short reason for the total difference.');
    expect(document.activeElement).toBe(reasonField());
    fireEvent.change(reasonField(), { target: { value: 'x'.repeat(501) } });
    fireEvent.click(saveButton());
    expect(screen.getByRole('alert').textContent).toBe('Keep the reason within 500 characters.');
    expect(input.onSaveTotalReview).not.toHaveBeenCalled();
    expect(input.project).toEqual(before);
  });

  it('keeps an unfinished reason after cancel, panel close and reopening', () => {
    render(<ContractChecks {...props({ open: undefined })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Contract checks/ }));
    openReview();
    fireEvent.change(reasonField(), { target: { value: 'Checking the provisional allowance.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Review total difference', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /^Contract checks/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Contract checks/ }));
    openReview();
    expect(reasonField().value).toBe('Checking the provisional allowance.');
    expect(readFormBuffer('TOTAL-REVIEW-ONE', 'contract:total-review:ONE-SCOPE')).toBe('Checking the provisional allowance.');
  });

  it('isolates unfinished reasons across projects, changed bases and module remounts', () => {
    const input = props();
    const view = render(<ContractChecks {...input} />);
    openReview();
    fireEvent.change(reasonField(), { target: { value: 'Only the first project reason.' } });
    view.rerender(<ContractChecks {...props({ project: project({ id: 'TOTAL-REVIEW-TWO' }), totalReview: totalReview({ scopeKey: 'TWO-SCOPE' }) })} />);
    openReview();
    expect(reasonField().value).toBe('');
    fireEvent.change(reasonField(), { target: { value: 'Only the second project reason.' } });
    view.rerender(<ContractChecks {...props({ totalReview: totalReview({ scopeKey: 'CHANGED-SCOPE', status: 'stale', review: saved }) })} />);
    openReview();
    expect(reasonField().value).toBe('');
    expect(screen.queryByText(saved.reason)).toBeNull();
    view.unmount();
    render(<ContractChecks {...input} />);
    openReview();
    expect(reasonField().value).toBe('Only the first project reason.');
  });

  it('saves a trimmed reason against the exact scope once, clears its buffer, and keeps the original totals', async () => {
    let finish;
    const onSaveTotalReview = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const input = props({ onSaveTotalReview });
    const view = render(<ContractChecks {...input} />);
    openReview();
    fireEvent.change(reasonField(), { target: { value: `  ${saved.reason}  ` } });
    fireEvent.click(saveButton());
    fireEvent.submit(reasonField().closest('form'));
    expect(onSaveTotalReview).toHaveBeenCalledExactlyOnceWith(saved.reason, 'ONE-SCOPE');
    expect(screen.getByRole('button', { name: 'Saving…' }).disabled).toBe(true);
    await act(async () => { finish({ outcome: 'updated' }); });
    view.rerender(<ContractChecks {...input} totalReview={totalReview({ status: 'reviewed', review: saved })} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(readFormBuffer('TOTAL-REVIEW-ONE', 'contract:total-review:ONE-SCOPE')).toBeUndefined();
    expect(screen.getByText(saved.reason)).toBeTruthy();
    expect(screen.getByText(/Recorded by Demo QS/)).toBeTruthy();
    expect(screen.getByText('Difference reviewed')).toBeTruthy();
    expect(screen.getByText('SGD -10.00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit reason', exact: true })).toBeTruthy();
  });

  it('keeps the reason and focuses the field when saving fails, then allows retry', async () => {
    const onSaveTotalReview = vi.fn().mockResolvedValueOnce({ outcome: 'invalid', error: 'The contract changed. Review its current values.' }).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ outcome: 'unchanged' });
    render(<ContractChecks {...props({ onSaveTotalReview })} />);
    openReview();
    fireEvent.change(reasonField(), { target: { value: saved.reason } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The contract changed. Review its current values.'));
    expect(reasonField().value).toBe(saved.reason);
    expect(document.activeElement).toBe(reasonField());
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Your entry is kept; try again.'));
    expect(reasonField().value).toBe(saved.reason);
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(onSaveTotalReview).toHaveBeenCalledTimes(3);
  });

  it('requires a fresh reason for a stale review without presenting the previous reason as current', () => {
    render(<ContractChecks {...props({ totalReview: totalReview({ status: 'stale', scopeKey: 'CHANGED-SCOPE', review: saved }) })} />);
    expect(screen.getByText(/Contract values have changed/)).toBeTruthy();
    expect(screen.queryByText(saved.reason)).toBeNull();
    expect(screen.getByText('Total needs review')).toBeTruthy();
    openReview();
    expect(reasonField().value).toBe('');
  });

  it('keeps a saved review read-only after confirmation and treats a legacy missing reason as historical', () => {
    const input = props({ project: project({ locked: true }), totalReview: totalReview({ status: 'reviewed', review: saved }) });
    const view = render(<ContractChecks {...input} />);
    expect(screen.getByText(saved.reason)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Edit reason|Review total difference/ })).toBeNull();
    view.rerender(<ContractChecks {...input} totalReview={totalReview()} />);
    expect(screen.getByText(/This confirmed version has no recorded total-difference review/)).toBeTruthy();
    expect(screen.queryByText(saved.reason)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Unlock|Reopen|Review total difference/ })).toBeNull();
  });

  it('offers no reason action for partial, matching or unknown schedules', () => {
    const view = render(<ContractChecks {...props({ project: project({ contract: { representativeSubset: true } }), checks: checks({ partial: true, totals: { ...checks().totals, comparison: 'partial', partial: true } }), totalReview: totalReview({ required: false, status: 'notRequired' }) })} />);
    expect(screen.getByText('Partial schedule')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Review total difference|Edit reason/ })).toBeNull();
    for (const comparison of ['match', 'unknown']) {
      view.rerender(<ContractChecks {...props({ checks: checks({ totals: { ...checks().totals, comparison } }), totalReview: totalReview({ required: false, status: 'notRequired' }) })} />);
      expect(screen.queryByRole('button', { name: /Review total difference|Edit reason/ })).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
    }
  });

  it('requires item checks to be resolved before opening the review form', () => {
    render(<ContractChecks {...props({ checks: checks({ canConfirm: false, itemIssueCount: 1 }), reviewRequested: 1 })} />);
    expect(screen.getByRole('button', { name: 'Review total difference', exact: true }).disabled).toBe(true);
    expect(screen.getByText('Resolve the item checks before reviewing the total.')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens and focuses the inline reason after the header requests total review', () => {
    const input = props({ open: undefined });
    const view = render(<ContractChecks {...input} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    view.rerender(<ContractChecks {...input} reviewRequested={1} />);
    expect(screen.getByRole('button', { name: /^Contract checks/ }).getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(reasonField());
  });

  it('reports active reason editing to confirmation controls and clears that state on cancel or navigation', () => {
    const onReviewEditingChange = vi.fn();
    const view = render(<ContractChecks {...props({ onReviewEditingChange })} />);
    expect(onReviewEditingChange).toHaveBeenLastCalledWith(false);
    openReview();
    expect(onReviewEditingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(onReviewEditingChange).toHaveBeenLastCalledWith(false);
    openReview();
    expect(onReviewEditingChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    expect(onReviewEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('does not close or clear another project form when an earlier save completes', async () => {
    let finish;
    const onSaveTotalReview = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<ContractChecks {...props({ onSaveTotalReview })} />);
    openReview();
    fireEvent.change(reasonField(), { target: { value: saved.reason } });
    fireEvent.click(saveButton());
    view.rerender(<ContractChecks {...props({ project: project({ id: 'TOTAL-REVIEW-TWO' }), totalReview: totalReview({ scopeKey: 'TWO-SCOPE' }) })} />);
    openReview();
    fireEvent.change(reasonField(), { target: { value: 'Second project unfinished entry.' } });
    await act(async () => { finish({ outcome: 'updated' }); });
    expect(reasonField().value).toBe('Second project unfinished entry.');
    expect(readFormBuffer('TOTAL-REVIEW-TWO', 'contract:total-review:TWO-SCOPE')).toBe('Second project unfinished entry.');
    expect(readFormBuffer('TOTAL-REVIEW-ONE', 'contract:total-review:ONE-SCOPE')).toBeUndefined();
  });

  it('keeps newer edits made after navigating away while an earlier save is finishing', async () => {
    let finish;
    const onSaveTotalReview = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<ContractChecks {...props({ onSaveTotalReview })} />);
    openReview();
    fireEvent.change(reasonField(), { target: { value: saved.reason } });
    fireEvent.click(saveButton());
    view.unmount();
    render(<ContractChecks {...props()} />);
    openReview();
    fireEvent.change(reasonField(), { target: { value: 'A newer unfinished review after returning.' } });
    await act(async () => { finish({ outcome: 'updated' }); });
    expect(reasonField().value).toBe('A newer unfinished review after returning.');
    expect(readFormBuffer('TOTAL-REVIEW-ONE', 'contract:total-review:ONE-SCOPE')).toBe('A newer unfinished review after returning.');
  });
});
