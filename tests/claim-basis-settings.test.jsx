import { chooseSelect } from './select-helpers.mjs';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimBasisSettings } from '../src/components/ClaimBasisSettings.jsx';
import { defaultClaimBasis } from '../src/data/claim-basis.js';

function Editor({ initial = defaultClaimBasis(), previousGrossValue = 0, onChange = () => {} }) {
  const [value, setValue] = useState(initial);
  return <ClaimBasisSettings value={value} previousGrossValue={previousGrossValue} onChange={next => { setValue(next); onChange(next); }} />;
}

const open = async (user) => user.click(screen.getByText('Claim basis', { exact: true }));

describe('compact claim basis settings', () => {
  it('leaves a legacy assessment unchanged until Set claim basis is explicitly chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ClaimBasisSettings currency="SGD" previousGrossValue={null} onChange={onChange} />);
    expect(document.querySelector('details').open).toBe(false);
    expect(screen.getByText('Legacy gross-only assessment')).toBeTruthy();
    await open(user);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Billing method', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Set claim basis', exact: true }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(defaultClaimBasis());
  });

  it('keeps typed values through collapsing and retention mode changes without mutating the original', async () => {
    const user = userEvent.setup();
    const initial = defaultClaimBasis();
    const before = structuredClone(initial);
    const onChange = vi.fn();
    render(<Editor initial={initial} previousGrossValue={14094} onChange={onChange} />);
    await open(user);
    expect(onChange).not.toHaveBeenCalled();
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Retention', exact: true }), 'rateCap');
    await user.type(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }), '5');
    await user.type(screen.getByRole('spinbutton', { name: 'Retention cap', exact: true }), '1000');
    await user.type(screen.getByRole('spinbutton', { name: 'Previously submitted net', exact: true }), '13389.30');
    await user.type(screen.getByRole('textbox', { name: 'Previous claim reference', exact: true }), 'DEMO-CLAIM-001');
    const enteredNet = screen.getByRole('spinbutton', { name: 'Previously submitted net', exact: true }).value;
    expect(screen.getByText('Applies to cumulative gross work and eligible VOs; capped across all months.')).toBeTruthy();
    const last = onChange.mock.calls.at(-1)[0];
    expect(last).toMatchObject({ retentionMode: 'rateCap', retentionRate: '5', retentionCap: '1000', previousNetValue: enteredNet, priorReference: 'DEMO-CLAIM-001' });
    await open(user);
    expect(document.querySelector('details').open).toBe(false);
    await open(user);
    expect(screen.getByRole('spinbutton', { name: 'Retention cap', exact: true }).value).toBe('1000');
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Retention', exact: true }), 'none');
    expect(screen.queryByRole('spinbutton', { name: 'Retention rate', exact: true })).toBeNull();
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Retention', exact: true }), 'rateCap');
    expect(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }).value).toBe('5');
    expect(screen.getByRole('spinbutton', { name: 'Retention cap', exact: true }).value).toBe('1000');
    expect(screen.getByRole('spinbutton', { name: 'Previously submitted net', exact: true }).value).toBe(enteredNet);
    expect(screen.getByRole('textbox', { name: 'Previous claim reference', exact: true }).required).toBe(true);
    expect(initial).toEqual(before);
  });

  it('shows unknown prior values as unknown and preserves explicit zero rate, cap and prior net', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClaimBasisSettings value={defaultClaimBasis()} previousGrossValue={null} />);
    expect(document.querySelector('summary').textContent).toContain('Prior net —');
    rerender(<ClaimBasisSettings value={{ ...defaultClaimBasis(), retentionMode: 'rateCap', retentionRate: 0, retentionCap: 0, previousNetValue: 0 }} previousGrossValue={0} />);
    expect(document.querySelector('summary').textContent).toContain('0% retention · cap SGD 0.00 · Prior net SGD 0.00');
    await open(user);
    expect(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }).value).toBe('0');
    expect(screen.getByRole('spinbutton', { name: 'Retention cap', exact: true }).value).toBe('0');
    expect(screen.getByRole('spinbutton', { name: 'Previously submitted net', exact: true }).value).toBe('0');
    expect(screen.getByRole('textbox', { name: 'Previous claim reference', exact: true }).required).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.claim-basis-prior').textContent).toContain('SGD 0.00');
  });

  it('keeps an unsupported billing method visible for review instead of replacing it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Editor onChange={onChange} />);
    await open(user);
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Billing method', exact: true }), 'unsupported');
    expect(screen.getByRole('status').textContent).toContain('needs review before the claim can be prepared');
    expect(onChange.mock.calls.at(-1)[0].billingMethod).toBe('unsupported');
    expect(screen.getByRole('combobox', { name: 'Billing method', exact: true }).getAttribute('data-value')).toBe('unsupported');
  });

  it('shows invalid numeric input without silently correcting the unfinished values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Editor initial={{ ...defaultClaimBasis(), retentionMode: 'rateCap' }} onChange={onChange} />);
    await open(user);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }), { target: { value: '101' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Retention cap', exact: true }), { target: { value: '-1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Previously submitted net', exact: true }), { target: { value: '-3' } });
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }).getAttribute('aria-invalid')).toBe('true');
    expect(onChange.mock.calls.at(-1)[0]).toMatchObject({ retentionRate: '101', retentionCap: '-1', previousNetValue: '-3' });
  });

  it('explains an unsupported currency without converting or changing its entered amounts', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value = { ...defaultClaimBasis(), previousNetValue: '500' };
    render(<ClaimBasisSettings value={value} currency="MYR" previousGrossValue={500} onChange={onChange} />);
    await open(user);
    expect(screen.getByRole('status').textContent).toContain('not supported for MYR. No currency conversion is applied.');
    expect(screen.getByRole('spinbutton', { name: 'Previously submitted net', exact: true }).value).toBe('500');
    expect(document.querySelector('.claim-basis-prior').textContent).toContain('MYR 500.00');
    expect(onChange).not.toHaveBeenCalled();
    expect(value.previousNetValue).toBe('500');
  });
});
