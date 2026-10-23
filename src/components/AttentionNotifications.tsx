import type { Project, AttentionTask } from '../types/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui';
import { NeedsAttentionList } from './NeedsAttentionList';
import './attention-notifications.css';

export function AttentionNotifications({ project, tasks = [], open, onOpenChange, onOpenTask }: { project: Project; tasks?: AttentionTask[]; open: boolean; onOpenChange?: (open: boolean) => void; onOpenTask?: (task: AttentionTask) => void }) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusOnClose = useRef(false);
  const popupId = useId();
  const scopedTasks = tasks.filter((task) => task.projectId === project.id);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [open, project.id]);
  const visibleTasks = expanded ? scopedTasks : scopedTasks.slice(0, 3);

  function close(restoreFocus = false) {
    restoreFocusOnClose.current = restoreFocus;
    onOpenChange?.(false);
  }
  function openTask(task: AttentionTask) {
    close(false);
    // The destination may open a review dialog. Give it a persistent opener,
    // then suppress the popover's later focus restoration.
    triggerRef.current?.focus();
    onOpenTask?.(task);
  }

  return <div className="attention-notifications">
    <Popover open={open} onOpenChange={(nextOpen) => { if (nextOpen) restoreFocusOnClose.current = false; onOpenChange?.(nextOpen); }}>
      <PopoverTrigger asChild><Button ref={triggerRef} className={`ghost icon attention-bell${open ? ' is-open' : ''}`} aria-label={`Needs attention, ${scopedTasks.length} pending tasks`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined} title="Needs attention"><Bell size={18} aria-hidden="true" />{scopedTasks.length > 0 && <span className="attention-bell-count" aria-hidden="true">{scopedTasks.length > 99 ? '99+' : scopedTasks.length}</span>}</Button></PopoverTrigger>
      <div className="attention-notifications-portal" ref={setPortalContainer} />
      {portalContainer && <PopoverContent id={popupId} className="attention-notifications-popover" portalContainer={portalContainer} align="end" sideOffset={10} collisionPadding={12} aria-label="Project notifications"
        onOpenAutoFocus={(event) => { event.preventDefault(); closeRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (restoreFocusOnClose.current) triggerRef.current?.focus(); restoreFocusOnClose.current = false; }}
        onEscapeKeyDown={() => { restoreFocusOnClose.current = true; }}
        onInteractOutside={() => { restoreFocusOnClose.current = false; }}>
        <header className="attention-notifications-header"><div><h2>Needs attention</h2><p>{project.name}</p></div><Button ref={closeRef} className="ghost icon" aria-label="Close notifications" onClick={() => close(true)}><X size={16} aria-hidden="true" /></Button></header>
        <div className="attention-notifications-body"><NeedsAttentionList key={project.id} project={project} tasks={visibleTasks} onOpen={openTask} /></div>
        {scopedTasks.length > 3 && <footer className="attention-notifications-footer"><Button className="ghost" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer tasks' : `View all ${scopedTasks.length} tasks`}</Button></footer>}
      </PopoverContent>}
    </Popover>
  </div>;
}
