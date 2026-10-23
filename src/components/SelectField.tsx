"use client"

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './ui/select';
import './select-field.css';

type OptionGroup = { id: number; label?: string; disabled?: boolean };
type OptionEntry = { value: string; label: string; disabled: boolean; selected?: boolean; group: OptionGroup | null; key: string };
type OptionNodeProps = { children?: React.ReactNode; label?: string; value?: string | number | readonly string[]; disabled?: boolean; selected?: boolean };
export type SelectFieldChangeEvent = React.ChangeEvent<HTMLSelectElement> | {
  target: HTMLSelectElement; currentTarget: HTMLSelectElement; type: 'change'; nativeEvent: null;
  preventDefault: () => void; stopPropagation: () => void;
};
export type SelectFieldProps = Omit<React.ComponentPropsWithoutRef<typeof SelectTrigger>, 'children' | 'value' | 'defaultValue' | 'onChange' | 'onInvalid' | 'dir'> & {
  children?: React.ReactNode; value?: React.ComponentProps<'select'>['value']; defaultValue?: React.ComponentProps<'select'>['defaultValue'];
  onChange?: (event: SelectFieldChangeEvent) => void; onValueChange?: (value: string) => void;
  wrapperClassName?: string; required?: boolean; autoComplete?: React.ComponentProps<'select'>['autoComplete'];
  onInvalid?: React.ComponentProps<'select'>['onInvalid']; placeholder?: string;
  open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; dir?: 'ltr' | 'rtl';
};

function optionText(children: React.ReactNode): string {
  return React.Children.toArray(children).map(child => React.isValidElement<OptionNodeProps>(child) ? optionText(child.props.children) : String(child ?? '')).join('');
}

function readOptions(children: React.ReactNode, entries: OptionEntry[] = [], group: OptionGroup | null = null): OptionEntry[] {
  React.Children.forEach(children, child => {
    if (!React.isValidElement<OptionNodeProps>(child)) return;
    if (child.type === React.Fragment) readOptions(child.props.children, entries, group);
    else if (child.type === 'optgroup') {
      const nextGroup = { id: entries.length, label: child.props.label, disabled: child.props.disabled };
      readOptions(child.props.children, entries, nextGroup);
    } else if (child.type === 'option') {
      const label = child.props.label ?? optionText(child.props.children);
      const value = String(child.props.value ?? optionText(child.props.children));
      entries.push({ value, label, disabled: Boolean(child.props.disabled || group?.disabled), selected: child.props.selected, group, key: `value:${value}` });
    }
  });
  return entries;
}

// Preserve existing explicit-save form callbacks while Radix owns the visible
// selection, keyboard navigation and popup. The native mirror keeps real values
// (including an optional empty string) available to browser form submission.
export const SelectField = React.forwardRef<HTMLButtonElement, SelectFieldProps>(function SelectField({
  children, value, defaultValue, onChange, onValueChange, className, wrapperClassName,
  name, form, required, disabled, autoComplete, onInvalid, size = 'default',
  placeholder, open, defaultOpen, onOpenChange, dir, ...props
}, forwardedRef) {
  const options = readOptions(children);
  const defaultSelection = String(defaultValue ?? options.find(option => option.selected)?.value ?? options.find(option => !option.disabled)?.value ?? '');
  const [localValue, setLocalValue] = React.useState(defaultSelection);
  const selectedValue = String(value === undefined ? localValue : value ?? '');
  const selected = options.find(option => option.value === selectedValue);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const nativeRef = React.useRef<HTMLSelectElement | null>(null);
  const resettingRef = React.useRef(false);
  const [portalHost, setPortalHost] = React.useState<Element | null>(null);
  const setShell = React.useCallback((node: HTMLDivElement | null) => {
    // Dialog and Sheet wrappers live outside their clipping/translated panels.
    // Keep their dropdown there, while retaining the app's theme and focus scope.
    setPortalHost(node?.closest('.ui-overlay-host') || node?.closest('.app-shell') || node);
  }, []);

  React.useEffect(() => {
    const native = nativeRef.current;
    const owner = native?.form;
    if (!owner) return;
    const reset = (event: Event) => {
      resettingRef.current = true;
      queueMicrotask(() => {
        resettingRef.current = false;
        if (event.defaultPrevented) return;
        if (value === undefined) setLocalValue(defaultSelection);
        else if (native.isConnected) native.value = selectedValue;
      });
    };
    owner.addEventListener('reset', reset, true);
    return () => owner.removeEventListener('reset', reset, true);
  }, [defaultSelection, form, selectedValue, value]);

  const setTrigger = React.useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  const changeValue = (nextValue: string, originalEvent?: React.ChangeEvent<HTMLSelectElement>) => {
    if (resettingRef.current) return;
    if (nextValue === selectedValue) return;
    if (value === undefined) setLocalValue(nextValue);
    if (nativeRef.current) nativeRef.current.value = nextValue;
    const target = nativeRef.current;
    if (!target) return;
    onChange?.(originalEvent || { target, currentTarget: target, type: 'change', nativeEvent: null, preventDefault() {}, stopPropagation() {} });
    onValueChange?.(nextValue);
  };

  const renderOption = (option: OptionEntry) => <SelectItem key={option.key} value={option.key} data-value={option.value} disabled={option.disabled} textValue={option.label}>{option.label}</SelectItem>;
  const rendered: React.ReactNode[] = [];
  for (let index = 0; index < options.length;) {
    const option = options[index];
    if (!option.group) { rendered.push(renderOption(option)); index += 1; continue; }
    const groupOptions: OptionEntry[] = [];
    while (index < options.length && options[index].group === option.group) groupOptions.push(options[index++]);
    rendered.push(<SelectGroup key={`group-${option.group.id}`}><SelectLabel>{option.group.label}</SelectLabel>{groupOptions.map(renderOption)}</SelectGroup>);
  }

  return <div ref={setShell} className={cn('select-field-shell', wrapperClassName)} data-slot="select-field-wrapper">
    <Select value={selected?.key || ''} onValueChange={key => {
      const next = options.find(option => option.key === key);
      if (next && !next.disabled) changeValue(next.value);
    }} disabled={disabled} open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} dir={dir}>
      <SelectTrigger {...props} ref={setTrigger} value={selectedValue} data-value={selectedValue} name={name} form={form} size={size} disabled={disabled}
        aria-required={required || props['aria-required'] || undefined} className={cn('form-select select-field-trigger', className)}>
        <SelectValue placeholder={selectedValue ? 'Unavailable selection' : placeholder || 'Choose an option'}>{selected?.label}</SelectValue>
      </SelectTrigger>
      {portalHost && <SelectContent portalContainer={portalHost} className="select-field-content">{rendered}</SelectContent>}
    </Select>
    <select ref={nativeRef} className="select-field-native" aria-hidden="true" tabIndex={-1} value={selectedValue}
      name={name} form={form} required={required} disabled={disabled} autoComplete={autoComplete}
      onChange={event => changeValue(event.target.value, event)} onInvalid={event => {
        onInvalid?.(event);
        event.preventDefault();
        triggerRef.current?.focus();
      }}>
      {!selected && selectedValue && <option value={selectedValue} hidden>Unavailable selection</option>}
      {children}
    </select>
  </div>;
});
