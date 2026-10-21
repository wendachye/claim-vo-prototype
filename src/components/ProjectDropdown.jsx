import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, FolderOpen, Plus, Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.jsx';
import { Input } from './ui.jsx';
import './project-dropdown.css';

const matches = (project, search) => `${project.name ?? ''} ${project.code ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());

export function ProjectDropdown({ projects = [], activeProjectId, showcaseProjectId, onSelect, onManage, onCreate }) {
  const available = Array.isArray(projects) ? projects : [];
  const activeProject = available.find((project) => project.id === activeProjectId) || available[0];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [portalContainer, setPortalContainer] = useState(null);
  const restoreFocusOnClose = useRef(false);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const optionRefs = useRef([]);
  const id = useId();
  const popupId = `${id}-popup`;
  const listId = `${id}-list`;
  const shown = useMemo(() => available.filter((project) => matches(project, search)), [projects, search]);
  const currentIndex = shown.length ? Math.max(0, Math.min(highlighted, shown.length - 1)) : -1;
  const optionId = (index) => `${id}-option-${index}`;

  const close = (restoreFocus = false) => {
    restoreFocusOnClose.current = restoreFocus;
    setOpen(false);
  };

  const openMenu = (edge) => {
    const selected = available.findIndex((project) => project.id === activeProjectId);
    setSearch('');
    setHighlighted(edge === 'first' ? 0 : edge === 'last' ? Math.max(0, available.length - 1) : Math.max(0, selected));
    restoreFocusOnClose.current = false;
    setOpen(true);
  };

  useEffect(() => {
    if (open && currentIndex >= 0) optionRefs.current[currentIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, currentIndex, search]);

  function selectProject(project) {
    if (!project || !onSelect) return;
    close(true);
    onSelect(project.id);
  }

  function handleKeys(event) {
    if (event.nativeEvent.isComposing) return;
    const { key } = event;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      if (!open) {
        openMenu(key === 'Home' ? 'first' : key === 'End' ? 'last' : undefined);
      } else {
        if (key === 'Home') setHighlighted(0);
        else if (key === 'End') setHighlighted(Math.max(0, shown.length - 1));
        else if (shown.length) setHighlighted((currentIndex + (key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
        searchRef.current?.focus();
      }
    } else if (key === 'Enter' && open) {
      event.preventDefault();
      selectProject(shown[currentIndex]);
    }
  }

  function updateSearch(value) {
    setSearch(value);
    setHighlighted(0);
  }

  const runAction = (action) => {
    // Let the next dialog capture a persistent opener before the menu unmounts.
    // Suppress the popover’s later focus effect so it cannot steal dialog focus.
    close(false);
    triggerRef.current?.focus();
    action?.();
  };

  return <div className="project-dropdown">
    <Popover open={open} onOpenChange={(nextOpen) => nextOpen ? openMenu() : setOpen(false)}>
    <PopoverTrigger asChild><button ref={triggerRef} type="button" className={`project-dropdown-trigger${open ? ' is-open' : ''}`} aria-label={`Project: ${activeProject?.name || 'Select a project'}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined} onKeyDown={handleKeys}>
      <Building2 className="project-dropdown-trigger-icon" size={17} aria-hidden="true" />
      <span className="project-dropdown-trigger-copy"><span className="project-dropdown-eyebrow">PROJECT</span><span className="project-dropdown-active-name">{activeProject?.name || 'Select a project'}</span></span>
      {activeProject?.code && <span className="project-dropdown-active-code">{activeProject.code}</span>}
      <ChevronDown className="project-dropdown-chevron" size={15} aria-hidden="true" />
    </button></PopoverTrigger>
    <div className="project-dropdown-portal" ref={setPortalContainer} />

    {portalContainer && <PopoverContent id={popupId} className="project-dropdown-popover" portalContainer={portalContainer} align="start" sideOffset={8} collisionPadding={12} aria-label="Choose project"
      onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus(); }}
      onCloseAutoFocus={(event) => { event.preventDefault(); if (restoreFocusOnClose.current) triggerRef.current?.focus(); restoreFocusOnClose.current = false; }}
      onEscapeKeyDown={() => { restoreFocusOnClose.current = true; }}
      onInteractOutside={() => { restoreFocusOnClose.current = false; }}>
      <div className="project-dropdown-search"><Search size={15} aria-hidden="true" /><Input ref={searchRef} type="text" role="combobox" aria-label="Search projects by name or code" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={currentIndex >= 0 ? optionId(currentIndex) : undefined} placeholder="Search project name or code…" value={search} onChange={(event) => updateSearch(event.target.value)} onKeyDown={handleKeys} autoComplete="off" spellCheck="false" />{search && <button type="button" aria-label="Clear project search" onClick={() => { updateSearch(''); searchRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button>}</div>
      <div className="project-dropdown-list" role="listbox" id={listId} aria-label="Projects">
        {shown.map((project, index) => <button type="button" role="option" aria-selected={project.id === activeProjectId} aria-disabled={!onSelect} tabIndex={-1} key={project.id} id={optionId(index)} ref={(element) => { optionRefs.current[index] = element; }} className={`project-dropdown-option${project.id === activeProjectId ? ' is-selected' : ''}${currentIndex === index ? ' is-highlighted' : ''}`} onMouseEnter={() => setHighlighted(index)} onClick={() => selectProject(project)}>
          <span className="project-dropdown-option-icon"><Building2 size={16} aria-hidden="true" /></span><span className="project-dropdown-option-copy"><strong>{project.name || 'Untitled project'}</strong><small>{project.code}{project.country ? ` · ${project.country}` : ''}{project.id===showcaseProjectId ? ' · Showcase' : ''}</small></span>{project.id === activeProjectId && <Check className="project-dropdown-selected-check" size={16} aria-hidden="true" />}
        </button>)}
      </div>
      {!shown.length && <div className="project-dropdown-empty" role="status"><FolderOpen size={23} aria-hidden="true" /><strong>{available.length ? 'No matching projects' : 'No projects yet'}</strong><span>{available.length ? 'Try another name or project code.' : 'Create a project to get started.'}</span></div>}
      {(onManage || onCreate) && <div className="project-dropdown-footer">{onManage && <button type="button" onClick={() => runAction(onManage)}><FolderOpen size={14} aria-hidden="true" />Manage projects</button>}{onCreate && <button type="button" className="project-dropdown-create" onClick={() => runAction(onCreate)}><Plus size={14} aria-hidden="true" />New project</button>}</div>}
    </PopoverContent>}
    </Popover>
  </div>;
}
