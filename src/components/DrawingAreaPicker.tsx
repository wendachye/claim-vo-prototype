import { useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent, type RefObject } from 'react';
import { Check, ChevronDown, MapPin, Search, X } from 'lucide-react';
import type { DrawingArea } from '../types/domain';
import { Input } from './ui';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface DrawingAreaPickerProps extends Omit<ComponentProps<'button'>, 'onSelect'> {
  areas: DrawingArea[];
  value: string;
  onSelect: (areaId: string) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  imagePlan: boolean;
}

export function DrawingAreaPicker({ areas, value, onSelect, triggerRef, imagePlan, className = '', ...props }: DrawingAreaPickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const restoreFocus = useRef(false);
  const selected = areas.find((area) => area.id === value);
  const query = search.trim().toLowerCase();
  const shown = areas.filter((area) => !query || [area.code, area.name, ...(area.aliases || [])].some((text) => text.toLowerCase().includes(query)));
  const current = Math.min(highlighted, Math.max(0, shown.length - 1));
  const optionId = (index: number) => `${id}-area-${index}`;
  useEffect(() => { if (open && shown.length) document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' }); }, [open, current, search]);

  function toggle(nextOpen: boolean) {
    if (nextOpen) { setSearch(''); setHighlighted(Math.max(0, areas.findIndex((area) => area.id === value))); }
    setOpen(nextOpen);
  }
  function select(area: DrawingArea) {
    restoreFocus.current = true;
    setOpen(false);
    onSelect(area.id);
  }
  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? Math.max(0, shown.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length);
      setHighlighted(next);
      document.getElementById(optionId(next))?.scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter' && shown[current]) { event.preventDefault(); select(shown[current]); }
  }
  return <div className="drawing-area-select">
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild><button {...props} ref={triggerRef} type="button" className={`drawing-area-select-trigger ${className}`} aria-label="Choose site area" aria-expanded={open} aria-controls={open ? `${id}-popup` : undefined} data-value={selected?.id || ''}>
        <MapPin size={16} aria-hidden="true" /><span>{selected ? `${selected.code} · ${selected.name}` : 'Choose a site area'}</span><ChevronDown size={15} aria-hidden="true" />
      </button></PopoverTrigger>
      <div ref={setPortalContainer} />
      {portalContainer && <PopoverContent id={`${id}-popup`} className="drawing-area-select-popover" align="start" sideOffset={6} collisionPadding={16} portalContainer={portalContainer} aria-label="Choose site area"
        onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (restoreFocus.current) triggerRef.current?.focus(); restoreFocus.current = false; }}
        onEscapeKeyDown={() => { restoreFocus.current = true; }} onInteractOutside={() => { restoreFocus.current = false; }}>
        <div className="drawing-area-select-search"><Search size={15} aria-hidden="true" /><Input ref={searchRef} role="combobox" aria-label="Search site areas" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={shown.length ? optionId(current) : undefined} value={search} placeholder="Search area name, code or alternate name…" onChange={(event) => { setSearch(event.target.value); setHighlighted(0); }} onKeyDown={keys} />{search && <button type="button" aria-label="Clear area search" onClick={() => { setSearch(''); setHighlighted(0); searchRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button>}</div>
        <div className="drawing-area-select-list" id={`${id}-list`} role="listbox" aria-label="Site areas">
          {shown.map((area, index) => <button type="button" role="option" id={optionId(index)} key={area.id} data-value={area.id} aria-selected={area.id === value} tabIndex={-1} className={`drawing-area-select-option${index === current ? ' is-highlighted' : ''}`} onMouseEnter={() => setHighlighted(index)} onClick={() => select(area)}><span><strong>{area.code} · {area.name}</strong>{imagePlan ? !area.position && <small>Pin not placed</small> : <small>Drawing page {area.page}</small>}</span>{area.id === value && <Check size={15} aria-hidden="true" />}</button>)}
        </div>
        {!shown.length && <p className="drawing-area-select-empty" role="status">No matching areas. Try another name or code.</p>}
      </PopoverContent>}
    </Popover>
  </div>;
}
