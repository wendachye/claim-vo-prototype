import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectField } from '../src/components/SelectField';

function ControlledSelect({ onChange, ...props }) {
  const [value, setValue] = useState('');
  return <SelectField aria-label="Site area" value={value} onChange={event => { onChange?.(event.target.value); setValue(event.target.value); }} {...props}>
    <option value="">No linked area</option>
    <optgroup label="Block W3"><option value="W3-A">East façade</option><option value="W3-B" disabled>Previous area unavailable</option><option value="W3-C">West façade</option></optgroup>
    <optgroup label="Unavailable block" disabled><option value="W5-A">Block W5</option></optgroup>
  </SelectField>;
}

describe('shadcn SelectField compatibility', () => {
  it('selects actual values, can return to empty and emits no initial changes', async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    render(<ControlledSelect onChange={changes} />);
    const trigger = screen.getByRole('combobox', { name: 'Site area' });
    expect(changes).not.toHaveBeenCalled();
    expect(trigger.getAttribute('data-value')).toBe('');
    expect(trigger.textContent).toContain('No linked area');
    await user.click(trigger);
    expect(screen.getByRole('option', { name: 'Previous area unavailable' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('option', { name: 'Block W5' }).getAttribute('aria-disabled')).toBe('true');
    await user.click(screen.getByRole('option', { name: 'East façade' }));
    expect(changes.mock.calls).toEqual([['W3-A']]);
    expect(trigger.value).toBe('W3-A');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'No linked area' }));
    expect(changes.mock.calls).toEqual([['W3-A'], ['']]);
    expect(trigger.getAttribute('data-value')).toBe('');
  });

  it('supports keyboard selection and Escape without changing a value', async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    render(<ControlledSelect onChange={changes} />);
    const trigger = screen.getByRole('combobox', { name: 'Site area' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(changes).toHaveBeenLastCalledWith('W3-A');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await user.keyboard('{Enter}{ArrowDown}{Escape}');
    expect(changes).toHaveBeenCalledTimes(1);
    expect(trigger.value).toBe('W3-A');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('retains label/ref/error association and stays inside its app wrapper', async () => {
    const user = userEvent.setup();
    const ref = createRef();
    const { container } = render(<div className="app-shell"><label htmlFor="area-field">Linked area</label><span id="area-error">Choose an area</span><SelectField ref={ref} id="area-field" value="" aria-describedby="area-error" aria-invalid="true"><option value="">Choose area</option><option value="W3-A">East façade</option></SelectField></div>);
    const trigger = screen.getByRole('combobox', { name: 'Linked area' });
    expect(ref.current).toBe(trigger);
    expect(trigger.getAttribute('aria-describedby')).toBe('area-error');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    ref.current.focus();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    expect(container.querySelector('.app-shell').contains(screen.getByRole('listbox'))).toBe(true);
  });

  it('preserves original values, required validation and disabled controls in FormData', async () => {
    const user = userEvent.setup();
    const { container } = render(<><form id="area-form" /><ControlledSelect name="area" form="area-form" required /><SelectField aria-label="Disabled area" name="disabledArea" form="area-form" value="W5" disabled><option value="W5">Block W5</option></SelectField></>);
    const form = container.querySelector('form');
    const trigger = screen.getByRole('combobox', { name: 'Site area' });
    expect(container.querySelector('[name="area"]')).toBe(trigger);
    expect(trigger.type).toBe('button');
    expect(new FormData(form).get('area')).toBe('');
    expect(form.checkValidity()).toBe(false);
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'West façade' }));
    expect(form.checkValidity()).toBe(true);
    expect(new FormData(form).get('area')).toBe('W3-C');
    expect(new FormData(form).has('disabledArea')).toBe(false);
    expect(screen.getByRole('combobox', { name: 'Disabled area' }).disabled).toBe(true);
  });

  it('supports uncontrolled defaults and options without explicit values', async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    render(<SelectField aria-label="Country" defaultValue="Malaysia" onChange={event => changes(event.target.value)}><option>Singapore</option><option>Malaysia</option></SelectField>);
    const trigger = screen.getByRole('combobox', { name: 'Country' });
    expect(trigger.value).toBe('Malaysia');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Singapore' }));
    expect(trigger.value).toBe('Singapore');
    expect(changes).toHaveBeenCalledExactlyOnceWith('Singapore');
  });

  it('does not fire callbacks when current options or controlled values change', () => {
    const changes = vi.fn();
    const { rerender } = render(<SelectField aria-label="Area" value="A" onChange={changes}><option value="A">Area A</option></SelectField>);
    rerender(<SelectField aria-label="Area" value="B" onChange={changes}><option value="B">Area B</option><option value="A">Area A</option></SelectField>);
    expect(screen.getByRole('combobox', { name: 'Area' }).value).toBe('B');
    expect(changes).not.toHaveBeenCalled();
  });

  it('keeps native autofill changes connected to the same callback and visible value', () => {
    const changes = vi.fn();
    const { container } = render(<ControlledSelect onChange={changes} name="area" />);
    fireEvent.change(container.querySelector('.select-field-native'), { target: { value: 'W3-C' } });
    expect(changes).toHaveBeenCalledExactlyOnceWith('W3-C');
    expect(screen.getByRole('combobox', { name: 'Site area' }).value).toBe('W3-C');
  });

  it('resets an uncontrolled field to its default without submitting a change', async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    render(<form aria-label="Project form"><SelectField aria-label="Country" name="country" defaultValue="Singapore" onChange={changes}><option>Singapore</option><option>Malaysia</option></SelectField><button type="reset">Reset form</button></form>);
    const trigger = screen.getByRole('combobox', { name: 'Country' });
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Malaysia' }));
    expect(trigger.value).toBe('Malaysia');
    await user.click(screen.getByRole('button', { name: 'Reset form' }));
    await waitFor(() => expect(trigger.value).toBe('Singapore'));
    expect(changes).toHaveBeenCalledTimes(1);
    expect(new FormData(screen.getByRole('form', { name: 'Project form' })).get('country')).toBe('Singapore');
  });

  it('places popup outside a clipped modal while remaining inside the app wrapper', async () => {
    const user = userEvent.setup();
    const { container } = render(<div className="app-shell"><div className="ui-overlay-host"><div className="modal"><div className="modal-body"><ControlledSelect /></div></div></div></div>);
    await user.click(screen.getByRole('combobox', { name: 'Site area' }));
    const popup = screen.getByRole('listbox');
    expect(container.querySelector('.ui-overlay-host').contains(popup)).toBe(true);
    expect(container.querySelector('.modal').contains(popup)).toBe(false);
  });

  it('retains an unknown controlled value instead of coercing it to empty', () => {
    const { container } = render(<form><SelectField aria-label="Area" name="area" value="removed-area"><option value="">No area</option><option value="current-area">Current area</option></SelectField></form>);
    expect(screen.getByRole('combobox', { name: 'Area' }).getAttribute('data-value')).toBe('removed-area');
    expect(new FormData(container.querySelector('form')).get('area')).toBe('removed-area');
  });
});
