import { Children, cloneElement, createElement, useId, useRef, useState, type AriaAttributes, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { ArrowLeft, X, type LucideIcon } from 'lucide-react';
import { Button as ShadcnButton } from './ui/button';
import { Badge as ShadcnBadge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { SelectField } from './SelectField';
import { Checkbox as ShadcnCheckbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import './shadcn-compat.css';

export { Input, Textarea, SelectField };

export type CheckboxChangeEvent = { target: { checked: boolean; name?: string; value?: ComponentProps<typeof ShadcnCheckbox>['value'] }; currentTarget: CheckboxChangeEvent['target'] };
export type CheckboxProps = Omit<ComponentProps<typeof ShadcnCheckbox>, 'onChange'> & { type?: string; onChange?: (event: CheckboxChangeEvent) => void };
type BadgeProps = ComponentProps<typeof ShadcnBadge> & { tone?: string };
export type ButtonProps = ComponentProps<typeof ShadcnButton> & { icon?: LucideIcon };
type PageHeaderProps = { title: ReactNode; description?: ReactNode; actions?: ReactNode; onBack?: () => void; backLabel?: ReactNode; className?: string };
type ControlAppearanceProps = AriaAttributes & { id?: string; className?: string; type?: string; children?: ReactNode };
type FormFieldProps = { label: ReactNode; children: ReactElement<ControlAppearanceProps>; hint?: ReactNode; error?: ReactNode; optional?: boolean; required?: boolean; suffix?: ReactNode; className?: string; id?: string };
type FormActionsProps = { secondary?: ReactNode; children?: ReactNode; className?: string };
type ModalProps = { title: ReactNode; description?: ReactNode; onClose?: () => void; children?: ReactNode; footer?: ReactNode; onCloseAutoFocus?: ComponentProps<typeof DialogContent>['onCloseAutoFocus'] };

// Keep existing screen callbacks while Radix owns the checkbox interaction.
export function Checkbox({ onChange, onCheckedChange, className = '', type: _type, ...props }: CheckboxProps) {
  return <ShadcnCheckbox className={`control-checkbox ${className}`} {...props} onCheckedChange={(checked) => {
    onCheckedChange?.(checked);
    const target = { checked: checked === true, name: props.name, value: props.value };
    onChange?.({ target, currentTarget: target });
  }} />;
}
export function Badge({ tone = 'slate', children, className = '', ...props }: BadgeProps) {
  return <ShadcnBadge variant="outline" className={`badge ${tone} ${className}`} {...props}>{children}</ShadcnBadge>;
}
export function Button({ icon: Icon, children, className = '', variant, type = 'button', ...props }: ButtonProps) {
  const names = className.split(/\s+/);
  const appearance = variant || (names.includes('primary') ? 'default' : names.includes('danger') ? 'destructive' : names.includes('ghost') || names.includes('back-button') ? 'ghost' : 'outline');
  return <ShadcnButton type={type} variant={appearance} className={`button ${className}`} {...props}>{Icon && <Icon size={15} />}{children}</ShadcnButton>;
}
export function BackButton({ children = 'Back', className = '', ...props }: ButtonProps) {
  return <Button icon={ArrowLeft} className={`back-button ${className}`} {...props}>{children}</Button>;
}
export function PageHeader({ title, description, actions, onBack, backLabel = 'Back', className = '' }: PageHeaderProps) {
  return <header className={`page-header page-heading ${className}`}>
    {onBack && <div className="page-back"><BackButton onClick={onBack}>{backLabel}</BackButton></div>}
    <div className="page-heading-row"><div className="page-heading-copy"><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>
  </header>;
}
export function FormField({ label, children, hint, error, optional, required, suffix, className = '', id }: FormFieldProps) {
  const generatedId = useId();
  const control = Children.only(children);
  const controlId = control.props.id || id || generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [...new Set([control.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ').split(/\s+/))].filter(Boolean).join(' ') || undefined;
  const isSelect = control.type === 'select' || control.type === SelectField;
  const isTextarea = control.type === 'textarea' || control.type === Textarea;
  const controlClass = isSelect ? 'form-select' : isTextarea ? 'form-textarea' : 'form-input';
  const fieldProps = { id: controlId, className: [...new Set([controlClass, ...(control.props.className || '').split(' ')])].filter(Boolean).join(' '), 'aria-describedby': describedBy, 'aria-invalid': error ? true : control.props['aria-invalid'], 'aria-required': required || control.props['aria-required'] || undefined };
  const { type: _nativeType, ...selectProps } = control.props;
  const upgraded = control.type === 'select' ? createElement(SelectField, { ...selectProps, ...fieldProps, key: control.key }) : control.type === 'textarea' ? createElement(Textarea, { ...control.props, ...fieldProps, key: control.key }) : control.type === 'input' && control.props.type !== 'file' ? createElement(Input, { ...control.props, ...fieldProps, key: control.key }) : cloneElement(control, fieldProps);
  return <div className={`form-field ${className}`}>
    <Label className="form-field-label" htmlFor={controlId}><span>{label}{required && <span className="form-required" aria-hidden="true"> *</span>}</span>{(optional || suffix) && <span className="form-field-meta">{suffix}{suffix && optional && ' · '}{optional && 'Optional'}</span>}</Label>
    {upgraded}
    {hint && <p className="form-field-hint" id={hintId}>{hint}</p>}
    {error && <p className="form-field-error" id={errorId} role="alert">{error}</p>}
  </div>;
}
export function FormActions({ secondary, children, className = '' }: FormActionsProps) {
  return <div className={`form-actions ${className}`}>{secondary && <div className="form-actions-secondary">{secondary}</div>}<div className="form-actions-main">{children}</div></div>;
}
export function Modal({ title, description, onClose, children, footer, onCloseAutoFocus }: ModalProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement);
  return <div className="ui-overlay-host" ref={setPortalContainer}>
    <Dialog open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      {portalContainer && <DialogContent portalContainer={portalContainer} className="modal" overlayClassName="modal-backdrop" showCloseButton={false} {...(!description ? { 'aria-describedby': undefined } : {})} onCloseAutoFocus={(event) => { onCloseAutoFocus?.(event); if (event.defaultPrevented) return; event.preventDefault(); if (opener.current?.isConnected && opener.current instanceof HTMLElement) opener.current.focus(); }}>
        <div className="modal-header"><div><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</div><DialogClose asChild><Button className="ghost icon" aria-label="Close dialog"><X size={18} /></Button></DialogClose></div>
        <div className="modal-body">{children}</div>{footer && <div className="modal-footer">{footer}</div>}
      </DialogContent>}
    </Dialog>
  </div>;
}

export const formatNumber = (n: string | number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('en-SG', { maximumFractionDigits: 2 });
export const formatMoney = (n: string | number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatTime = (d: string | number | Date) => new Date(d).toLocaleString('en-SG', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hour12:false });
