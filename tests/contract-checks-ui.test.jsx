import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ContractChecks } from '../src/components/ContractChecks';

const project = (overrides = {}) => ({ id: 'CHECKS-ONE', items: [{ id: 'WI-001' }, { id: 'WI-002' }], locked: false, ...overrides });
const checks = (overrides = {}) => ({
  issues: [{ id: 'WI-001', itemId: 'WI-001', itemRef: 'A.1', description: 'Roof scaffold', messages: ['Quantity is missing.', 'Check the extracted value against the source.'], fields: ['quantity', 'needsReview'] }],
  issueCount: 2,
  itemIssueCount: 1,
  partial: false,
  canConfirm: false,
  totals: { currency: 'SGD', recordedTotal: 200, calculatedTotal: null, declaredTotal: 200, difference: 0, complete: false, partial: false, comparison: 'unknown' },
  scopeNote: 'Schedule coverage is not recorded. Check the source before comparing with the full contract value.',
  ...overrides,
});
const toggle = () => screen.getByRole('button', { name: /^Contract checks/ });

describe('compact contract checks panel', () => {
  it('starts compact, reveals only affected items and opens their exact record without mutating the project', () => {
    const current = project();
    const result = checks();
    const before = structuredClone({ current, result });
    const onOpenItem = vi.fn();
    render(<ContractChecks project={current} checks={result} onOpenItem={onOpenItem} />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('1 item to check')).toBeTruthy();
    expect(screen.queryByText('Quantity is missing.')).toBeNull();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Quantity is missing.')).toBeTruthy();
    expect(screen.getByText('Check the extracted value against the source.')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Items to check' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Review checks for WI-001', exact: true }));
    expect(onOpenItem).toHaveBeenCalledExactlyOnceWith('WI-001');
    expect({ current, result }).toEqual(before);
    fireEvent.click(toggle());
    expect(screen.queryByRole('list', { name: 'Items to check' })).toBeNull();
  });

  it('labels the selected S.I.T. rows as partial and keeps their declared-value difference neutral', () => {
    const current = project({ items: Array.from({ length: 18 }, (_, index) => ({ id: `SIT-${index}` })) });
    render(<ContractChecks project={current} open checks={checks({
      issues: [], issueCount: 0, itemIssueCount: 0, canConfirm: true, partial: true,
      totals: { currency: 'SGD', recordedTotal: 100, calculatedTotal: 100, declaredTotal: 1000, difference: -900, complete: true, partial: true, comparison: 'partial' },
    })} />);
    expect(screen.getByText('Partial schedule')).toBeTruthy();
    expect(screen.getByText('Selected work total')).toBeTruthy();
    expect(screen.getByText(/18 selected rows/).textContent).toContain('Their total is not expected to match the full contract value.');
    expect(screen.getByText('SGD -900.00')).toBeTruthy();
    expect(screen.getByText('No item issues')).toBeTruthy();
    expect(screen.queryByText('Total needs review')).toBeNull();
    expect(screen.queryByText(/work-list total differs/)).toBeNull();
    expect(document.querySelector('.contract-checks-total-difference')).toBeNull();
    expect(screen.getByText('Totals include measured items only. Included and rate-only items have no separate priced total.')).toBeTruthy();
  });

  it('keeps unknown totals distinct from a valid zero and does not infer a currency', () => {
    render(<ContractChecks project={project()} open checks={checks({
      issues: [], itemIssueCount: 0,
      totals: { currency: null, recordedTotal: null, calculatedTotal: null, declaredTotal: 0, difference: null, complete: false, partial: false, comparison: 'unknown' },
    })} />);
    const totalRows = document.querySelectorAll('.contract-checks-totals > div');
    expect(within(totalRows[0]).getByText('Unknown')).toBeTruthy();
    expect(within(totalRows[1]).getByText('0.00')).toBeTruthy();
    expect(within(totalRows[2]).getByText('Unknown')).toBeTruthy();
    expect(screen.queryByText(/SGD/)).toBeNull();
    expect(screen.getByText(/Schedule coverage is not recorded/)).toBeTruthy();
  });

  it('shows a full-schedule total difference as a review warning without inventing a correction action', () => {
    render(<ContractChecks project={project()} open checks={checks({
      issues: [], itemIssueCount: 0, issueCount: 0,
      totals: { currency: 'SGD', recordedTotal: 90, calculatedTotal: 100, declaredTotal: 100, difference: -10, complete: true, partial: false, comparison: 'difference' },
      scopeNote: 'Full schedule recorded.',
    })} />);
    expect(toggle().textContent).toContain('Total needs review');
    expect(screen.queryByText('No item issues', { exact: true })).toBeNull();
    expect(screen.getByText('SGD -10.00')).toBeTruthy();
    expect(screen.getByText(/The work-list total differs from the declared contract value/)).toBeTruthy();
    expect(screen.getByText(/Quantity × rate total:/).textContent).toContain('SGD 100.00');
    expect(screen.queryByRole('button', { name: /Apply|Adjust|Confirm|Fix/ })).toBeNull();
  });

  it('supports a parent opening the panel after confirmation checks without changing its own values', () => {
    const current = project();
    const result = checks();
    const onOpenChange = vi.fn();
    const view = render(<ContractChecks project={current} checks={result} open={false} onOpenChange={onOpenChange} />);
    fireEvent.click(toggle());
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    view.rerender(<ContractChecks project={current} checks={result} open onOpenChange={onOpenChange} />);
    expect(screen.getByText('Quantity is missing.')).toBeTruthy();
    fireEvent.click(toggle());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('closes the disclosure on project switch and shows only the selected project’s items', () => {
    const view = render(<ContractChecks project={project()} checks={checks()} />);
    fireEvent.click(toggle());
    expect(screen.getByText('Roof scaffold')).toBeTruthy();
    view.rerender(<ContractChecks project={project({ id: 'CHECKS-TWO', locked: true })} checks={checks({
      issues: [{ id: 'TWO', itemId: 'WI-TWO', itemRef: 'B.2', description: 'Loading-bay access', messages: ['Rate is missing.'], fields: ['rate'] }],
    })} />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Roof scaffold')).toBeNull();
    fireEvent.click(toggle());
    expect(screen.getByText('Loading-bay access')).toBeTruthy();
    expect(screen.getByText('Current values; confirmed baseline unchanged.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Unlock|Reopen|Confirm/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review checks for WI-001' })).toBeNull();
  });
});
