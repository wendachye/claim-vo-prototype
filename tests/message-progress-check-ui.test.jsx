import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MessageProgressCheck } from '../src/components/MessageProgressCheck';

afterEach(cleanup);
const fixture = changes => ({ kind: 'repeated', completion: 50, reported: 50, verified: 25, basis: 'area', itemId: 'WI-016', areaId: 'BRACKET-A', latestReportId: 'REPORT-A', latestReportDate: '2026-10-24T08:00:00+08:00', isBelowVerified: false, ...changes });

describe('compact WhatsApp progress check', () => {
  it('explains repeated area totals, retains new evidence and opens only the latest-report callback', () => {
    const check = Object.freeze(fixture()), before = JSON.stringify(check), onOpenLatest = vi.fn();
    const view = render(<MessageProgressCheck check={check} onOpenLatest={onOpenLatest} />);
    const panel = screen.getByRole('region', { name: 'Progress check' });
    expect(within(panel).getByRole('heading', { name: 'Progress check' })).toBeTruthy();
    expect(within(panel).getByText('Already reported at 50% · total stays 50%.')).toBeTruthy();
    expect(within(panel).getByText(/This area’s cumulative total\. New evidence stays with this update/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'View latest report' }));
    expect(onOpenLatest).toHaveBeenCalledExactlyOnceWith();
    expect(JSON.stringify(check)).toBe(before);
    expect(view.container.querySelector('form, input, select, details')).toBeNull();
  });

  it('uses the verified fallback honestly and preserves zero as a known total', () => {
    const view = render(<MessageProgressCheck check={fixture({ reported: null, verified: 0, completion: 0, latestReportId: null })} onOpenLatest={vi.fn()} />);
    expect(screen.getByText('Already verified at 0% · total stays 0%.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View latest report' })).toBeNull();
    view.rerender(<MessageProgressCheck check={fixture({ reported: 0, verified: null, completion: 0 })} />);
    expect(screen.getByText('Already reported at 0% · total stays 0%.')).toBeTruthy();
    expect(screen.queryByText(/null|undefined|NaN/)).toBeNull();
  });

  it('labels whole-item context and keeps older updates from replacing the latest source', () => {
    render(<MessageProgressCheck check={fixture({ kind: 'older', basis: 'whole-item', areaId: null, completion: 60 })} onOpenLatest={vi.fn()} />);
    expect(screen.getByText('A newer report exists.')).toBeTruthy();
    expect(screen.getByText('This work item’s cumulative total. This older update will not replace the latest progress or source.')).toBeTruthy();
    expect(screen.queryByText(/This area’s/)).toBeNull();
    expect(screen.getByRole('button', { name: 'View latest report' })).toBeTruthy();
  });

  it('requires supervisor review and a reason when completion is below verified progress', () => {
    const view = render(<MessageProgressCheck check={fixture({ kind: 'lower', reported: 65, verified: 50, completion: 40, isBelowVerified: true })} />);
    expect(screen.getByText('Below the verified total of 50%.')).toBeTruthy();
    expect(screen.getByText(/A supervisor must review any reduction to verified progress and record a reason/)).toBeTruthy();
    expect(screen.queryByText('Below the reported total of 65%.')).toBeNull();
    expect(view.container.querySelector('.wa-progress-check.warning')).toBeTruthy();
  });

  it('distinguishes lower reported totals from reductions in verified completion and updates on new props', () => {
    const onOpenLatest = vi.fn(), view = render(<MessageProgressCheck check={fixture({ kind: 'lower', reported: 65, verified: 20, completion: 50 })} onOpenLatest={onOpenLatest} />);
    expect(screen.getByText('Below the reported total of 65%.')).toBeTruthy();
    expect(screen.getByText(/Check the previous update before changing reported progress/)).toBeTruthy();
    expect(screen.queryByText(/A supervisor must review/)).toBeNull();
    view.rerender(<MessageProgressCheck check={fixture({ kind: 'older', latestReportId: null, latestReportDate: null, reported: null, verified: null })} onOpenLatest={onOpenLatest} />);
    expect(screen.getByText('A newer report exists.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View latest report' })).toBeNull();
    expect(onOpenLatest).not.toHaveBeenCalled();
  });
});
