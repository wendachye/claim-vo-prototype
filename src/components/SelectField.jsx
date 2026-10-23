"use client"

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './ui/select.jsx';
import './select-field.css';

function optionText(children) {
  return React.Children.toArray(children).map(child => React.isValidElement(child) ? optionText(child.props.children) : String(child ?? '')).join('');
}

function readOptions(children, entries = [], group = null) {
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
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
export const SelectField = React.forwardRef(function SelectField({
  children, value, defaultValue, onChange, onValueChange, className, wrapperClassName,
  name, form, required, disabled, autoComplete, onInvalid, size = 'default',
  placeholder, open, defaultOpen, onOpenChange, dir, ...props
}, forwardedRef) {
  const options = readOptions(children);
  const defaultSelection = String(defaultValue ?? options.find(option => option.selected)?.value ?? options.find(option => !option.disabled)?.value ?? '');
  const [localValue, setLocalValue] = React.useState(defaultSelection);
  const selectedValue = String(value === undefined ? localValue : value ?? '');
  const selected = options.find(option => option.value === selectedValue);
  const triggerRef = React.useRef(null);
  const nativeRef = React.useRef(null);
  const resettingRef = React.useRef(false);
  const [portalHost, setPortalHost] = React.useState(null);
  const setShell = React.useCallback(node => {
    // Dialog and Sheet wrappers live outside their clipping/translated panels.
    // Keep their dropdown there, while retaining the app's theme and focus scope.
    setPortalHost(node?.closest('.ui-overlay-host') || node?.closest('.app-shell') || node);
  }, []);

  React.useEffect(() => {
    const native = nativeRef.current;
    const owner = native?.form;
    if (!owner) return;
    const reset = event => {
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

  const setTrigger = React.useCallback(node => {
    triggerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  const changeValue = (nextValue, originalEvent) => {
    if (resettingRef.current) return;
    if (nextValue === selectedValue) return;
    if (value === undefined) setLocalValue(nextValue);
    if (nativeRef.current) nativeRef.current.value = nextValue;
    const target = nativeRef.current;
    onChange?.(originalEvent || { target, currentTarget: target, type: 'change', nativeEvent: null, preventDefault() {}, stopPropagation() {} });
    onValueChange?.(nextValue);
  };

  const renderOption = option => <SelectItem key={option.key} value={option.key} data-value={option.value} disabled={option.disabled} textValue={option.label}>{option.label}</SelectItem>;
  const rendered = [];
  for (let index = 0; index < options.length;) {
    const option = options[index];
    if (!option.group) { rendered.push(renderOption(option)); index += 1; continue; }
    const groupOptions = [];
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
