import { Children, cloneElement, createElement, useId, useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Button as ShadcnButton } from './ui/button.jsx';
import { Badge as ShadcnBadge } from './ui/badge.jsx';
import { Input } from './ui/input.jsx';
import { Textarea } from './ui/textarea.jsx';
import { NativeSelect } from './ui/native-select.jsx';
import { Checkbox as ShadcnCheckbox } from './ui/checkbox.jsx';
import { Label } from './ui/label.jsx';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog.jsx';
import './shadcn-compat.css';

export { Input, Textarea, NativeSelect };

// Keep existing screen callbacks while Radix owns the checkbox interaction.
export function Checkbox({ onChange, onCheckedChange, className = '', type: _type, ...props }) {
  return <ShadcnCheckbox className={`control-checkbox ${className}`} {...props} onCheckedChange={(checked) => {
    onCheckedChange?.(checked);
    const target = { checked: checked === true, name: props.name, value: props.value };
    onChange?.({ target, currentTarget: target });
  }} />;
}
export function Badge({ tone = 'slate', children, className = '', ...props }) {
  return <ShadcnBadge variant="outline" className={`badge ${tone} ${className}`} {...props}>{children}</ShadcnBadge>;
}
export function Button({ icon: Icon, children, className = '', variant, type = 'button', ...props }) {
  const names = className.split(/\s+/);
  const appearance = variant || (names.includes('primary') ? 'default' : names.includes('danger') ? 'destructive' : names.includes('ghost') || names.includes('back-button') ? 'ghost' : 'outline');
  return <ShadcnButton type={type} variant={appearance} className={`button ${className}`} {...props}>{Icon && <Icon size={15} />}{children}</ShadcnButton>;
}
export function BackButton({ children = 'Back', className = '', ...props }) {
  return <Button icon={ArrowLeft} className={`back-button ${className}`} {...props}>{children}</Button>;
}
export function PageHeader({ title, description, actions, onBack, backLabel = 'Back', className = '' }) {
  return <header className={`page-header page-heading ${className}`}>
    {onBack && <div className="page-back"><BackButton onClick={onBack}>{backLabel}</BackButton></div>}
    <div className="page-heading-row"><div className="page-heading-copy"><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>
  </header>;
}
export function FormField({ label, children, hint, error, optional, required, suffix, className = '', id }) {
  const generatedId = useId();
  const control = Children.only(children);
  const controlId = control.props.id || id || generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [...new Set([control.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ').split(/\s+/))].filter(Boolean).join(' ') || undefined;
  const isSelect = control.type === 'select' || control.type === NativeSelect;
  const isTextarea = control.type === 'textarea' || control.type === Textarea;
  const controlClass = isSelect ? 'form-select' : isTextarea ? 'form-textarea' : 'form-input';
  const fieldProps = { id: controlId, className: [...new Set([controlClass, ...(control.props.className || '').split(' ')])].filter(Boolean).join(' '), 'aria-describedby': describedBy, 'aria-invalid': error ? true : control.props['aria-invalid'], 'aria-required': required || control.props['aria-required'] || undefined };
  const primitive = control.type === 'select' ? NativeSelect : control.type === 'textarea' ? Textarea : control.type === 'input' && control.props.type !== 'file' ? Input : null;
  return <div className={`form-field ${className}`}>
    <Label className="form-field-label" htmlFor={controlId}><span>{label}{required && <span className="form-required" aria-hidden="true"> *</span>}</span>{(optional || suffix) && <span className="form-field-meta">{suffix}{suffix && optional && ' · '}{optional && 'Optional'}</span>}</Label>
    {primitive ? createElement(primitive, { ...control.props, ...fieldProps, key: control.key }) : cloneElement(control, fieldProps)}
    {hint && <p className="form-field-hint" id={hintId}>{hint}</p>}
    {error && <p className="form-field-error" id={errorId} role="alert">{error}</p>}
  </div>;
}
export function FormActions({ secondary, children, className = '' }) {
  return <div className={`form-actions ${className}`}>{secondary && <div className="form-actions-secondary">{secondary}</div>}<div className="form-actions-main">{children}</div></div>;
}
export function Modal({ title, description, onClose, children, footer, onCloseAutoFocus }) {
  const [portalContainer, setPortalContainer] = useState(null);
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement);
  return <div className="ui-overlay-host" ref={setPortalContainer}>
    <Dialog open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      {portalContainer && <DialogContent portalContainer={portalContainer} className="modal" overlayClassName="modal-backdrop" showCloseButton={false} {...(!description ? { 'aria-describedby': undefined } : {})} onCloseAutoFocus={(event) => { onCloseAutoFocus?.(event); if (event.defaultPrevented) return; event.preventDefault(); if (opener.current?.isConnected) opener.current.focus?.(); }}>
        <div className="modal-header"><div><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</div><DialogClose asChild><Button className="ghost icon" aria-label="Close dialog"><X size={18} /></Button></DialogClose></div>
        <div className="modal-body">{children}</div>{footer && <div className="modal-footer">{footer}</div>}
      </DialogContent>}
    </Dialog>
  </div>;
}

export const formatNumber = (n) => n == null ? '—' : Number(n).toLocaleString('en-SG', { maximumFractionDigits: 2 });
export const formatMoney = (n) => n == null ? '—' : Number(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatTime = (d) => new Date(d).toLocaleString('en-SG', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hour12:false });
