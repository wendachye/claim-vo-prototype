import { useRef, useState, type ComponentProps } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Button } from './ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import './action-menu.css';

export type ActionMenuItem = { label: string; icon?: LucideIcon; onSelect?: () => void; disabled?: boolean };
type ActionMenuProps = { label?: string; items?: (ActionMenuItem | false | null | undefined)[]; className?: string; align?: ComponentProps<typeof DropdownMenuContent>['align'] };

export function ActionMenu({ label = 'More options', items = [], className = '', align = 'end' }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLSpanElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const handoff = useRef(false);

  function run(action?: () => void) {
    // Release the menu before a destination dialog captures its persistent opener.
    handoff.current = true;
    flushSync(() => setOpen(false));
    trigger.current?.focus();
    action?.();
  }

  return <span className={`action-menu ${className}`}>
    <DropdownMenu open={open} modal={false} onOpenChange={(next) => { if (next) handoff.current = false; setOpen(next); }}>
      <DropdownMenuTrigger asChild><Button ref={trigger} className="ghost action-menu-trigger">{label}<ChevronDown size={14} aria-hidden="true" /></Button></DropdownMenuTrigger>
      <span className="ui-overlay-host" ref={setPortalContainer} />
      {portalContainer && <DropdownMenuContent portalContainer={portalContainer} className="action-menu-content" align={align} sideOffset={6} collisionPadding={12} aria-label={label} onCloseAutoFocus={(event) => { if (handoff.current) event.preventDefault(); }}>
        {items.filter((item): item is ActionMenuItem => Boolean(item)).map(({ label: itemLabel, icon: Icon, onSelect, disabled }) => <DropdownMenuItem key={itemLabel} className="action-menu-item" disabled={disabled} onSelect={() => run(onSelect)}>{Icon && <Icon size={15} aria-hidden="true" />}<span>{itemLabel}</span></DropdownMenuItem>)}
      </DropdownMenuContent>}
    </DropdownMenu>
  </span>;
}
