import { Children, cloneElement, useEffect, useId, useRef } from 'react';
import { ArrowLeft, X } from 'lucide-react';

export function Badge({ tone = 'slate', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Button({ icon: Icon, children, className = '', ...props }) {
  return <button type="button" className={`button ${className}`} {...props}>{Icon && <Icon size={15} />}{children}</button>;
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
  const controlClass = control.type === 'select' ? 'form-select' : control.type === 'textarea' ? 'form-textarea' : 'form-input';
  return <div className={`form-field ${className}`}>
    <label className="form-field-label" htmlFor={controlId}><span>{label}{required && <span className="form-required" aria-hidden="true"> *</span>}</span>{(optional || suffix) && <span className="form-field-meta">{suffix}{suffix && optional && ' · '}{optional && 'Optional'}</span>}</label>
    {cloneElement(control, { id: controlId, className: [...new Set([controlClass, ...(control.props.className || '').split(' ')])].filter(Boolean).join(' '), 'aria-describedby': describedBy, 'aria-invalid': error ? true : control.props['aria-invalid'], 'aria-required': required || control.props['aria-required'] || undefined })}
    {hint && <p className="form-field-hint" id={hintId}>{hint}</p>}
    {error && <p className="form-field-error" id={errorId} role="alert">{error}</p>}
  </div>;
}
export function FormActions({ secondary, children, className = '' }) {
  return <div className={`form-actions ${className}`}>{secondary && <div className="form-actions-secondary">{secondary}</div>}<div className="form-actions-main">{children}</div></div>;
}
export function Modal({ title, description, onClose, children, footer }) {
  const node = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prior = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...node.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href]')];
    controls()[0]?.focus();
    const key = (e) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const all = controls();
        if (e.shiftKey && document.activeElement === all[0]) { e.preventDefault(); all.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === all.at(-1)) { e.preventDefault(); all[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = previousOverflow; prior?.focus?.(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal" ref={node} role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><Button className="ghost icon" aria-label="Close dialog" onClick={onClose}><X size={18}/></Button></div>
    <div className="modal-body">{children}</div>{footer && <div className="modal-footer">{footer}</div>}
  </section></div>;
}

export const formatNumber = (n) => n == null ? '—' : Number(n).toLocaleString('en-SG', { maximumFractionDigits: 2 });
export const formatMoney = (n) => n == null ? '—' : Number(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatTime = (d) => new Date(d).toLocaleString('en-SG', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hour12:false });
