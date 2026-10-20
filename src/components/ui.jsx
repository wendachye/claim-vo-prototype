import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function Badge({ tone = 'slate', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Button({ icon: Icon, children, className = '', ...props }) {
  return <button type="button" className={`button ${className}`} {...props}>{Icon && <Icon size={15} />}{children}</button>;
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
