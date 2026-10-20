import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, FolderOpen, Plus, Search, X } from 'lucide-react';
import './project-dropdown.css';

const matches = (project, search) => `${project.name ?? ''} ${project.code ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());

export function ProjectDropdown({ projects = [], activeProjectId, onSelect, onManage, onCreate }) {
  const available = Array.isArray(projects) ? projects : [];
  const activeProject = available.find((project) => project.id === activeProjectId) || available[0];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [position, setPosition] = useState({});
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const optionRefs = useRef([]);
  const id = useId();
  const popupId = `${id}-popup`;
  const listId = `${id}-list`;
  const shown = useMemo(() => available.filter((project) => matches(project, search)), [projects, search]);
  const currentIndex = shown.length ? Math.max(0, Math.min(highlighted, shown.length - 1)) : -1;
  const optionId = (index) => `${id}-option-${index}`;

  const placePopover = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(336, viewportWidth - 24);
    const below = viewportHeight - rect.bottom - 20;
    const above = rect.top - 20;
    const openAbove = below < 230 && above > below;
    setPosition({
      width,
      left: Math.max(12, Math.min(rect.left, viewportWidth - width - 12)),
      maxHeight: Math.min(440, Math.max(80, openAbove ? above : below)),
      ...(openAbove ? { bottom: viewportHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
    });
  }, []);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const openMenu = (edge) => {
    const selected = available.findIndex((project) => project.id === activeProjectId);
    setSearch('');
    setHighlighted(edge === 'first' ? 0 : edge === 'last' ? Math.max(0, available.length - 1) : Math.max(0, selected));
    placePopover();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    placePopover();
    const outside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', placePopover);
    window.addEventListener('scroll', placePopover, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', placePopover);
      window.removeEventListener('scroll', placePopover, true);
    };
  }, [open, placePopover]);

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
    if (key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
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

  function handleBlur(event) {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    else if (!event.relatedTarget) {
      // Defer until focus settles; moving between controls inside the popover is allowed.
      requestAnimationFrame(() => {
        if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
      });
    }
  }

  function updateSearch(value) {
    setSearch(value);
    setHighlighted(0);
  }

  const runAction = (action) => {
    close(true);
    action?.();
  };

  return <div className="project-dropdown" ref={rootRef} onBlur={handleBlur} onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); } }}>
    <button ref={triggerRef} type="button" className={`project-dropdown-trigger${open ? ' is-open' : ''}`} aria-label={`Project: ${activeProject?.name || 'Select a project'}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => open ? close() : openMenu()} onKeyDown={handleKeys}>
      <Building2 className="project-dropdown-trigger-icon" size={17} aria-hidden="true" />
      <span className="project-dropdown-trigger-copy"><span className="project-dropdown-eyebrow">PROJECT</span><span className="project-dropdown-active-name">{activeProject?.name || 'Select a project'}</span></span>
      {activeProject?.code && <span className="project-dropdown-active-code">{activeProject.code}</span>}
      <ChevronDown className="project-dropdown-chevron" size={15} aria-hidden="true" />
    </button>

    {open && <div id={popupId} className="project-dropdown-popover" style={position}>
      <div className="project-dropdown-search"><Search size={15} aria-hidden="true" /><input ref={searchRef} type="text" role="combobox" aria-label="Search projects by name or code" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={currentIndex >= 0 ? optionId(currentIndex) : undefined} placeholder="Search project name or code…" value={search} onChange={(event) => updateSearch(event.target.value)} onKeyDown={handleKeys} autoComplete="off" spellCheck="false" />{search && <button type="button" aria-label="Clear project search" onClick={() => { updateSearch(''); searchRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button>}</div>
      <div className="project-dropdown-list" role="listbox" id={listId} aria-label="Projects">
        {shown.map((project, index) => <button type="button" role="option" aria-selected={project.id === activeProjectId} aria-disabled={!onSelect} tabIndex={-1} key={project.id} id={optionId(index)} ref={(element) => { optionRefs.current[index] = element; }} className={`project-dropdown-option${project.id === activeProjectId ? ' is-selected' : ''}${currentIndex === index ? ' is-highlighted' : ''}`} onMouseEnter={() => setHighlighted(index)} onClick={() => selectProject(project)}>
          <span className="project-dropdown-option-icon"><Building2 size={16} aria-hidden="true" /></span><span className="project-dropdown-option-copy"><strong>{project.name || 'Untitled project'}</strong><small>{project.code}{project.country ? ` · ${project.country}` : ''}</small></span>{project.id === activeProjectId && <Check className="project-dropdown-selected-check" size={16} aria-hidden="true" />}
        </button>)}
      </div>
      {!shown.length && <div className="project-dropdown-empty" role="status"><FolderOpen size={23} aria-hidden="true" /><strong>{available.length ? 'No matching projects' : 'No projects yet'}</strong><span>{available.length ? 'Try another name or project code.' : 'Create a project to get started.'}</span></div>}
      {(onManage || onCreate) && <div className="project-dropdown-footer">{onManage && <button type="button" onClick={() => runAction(onManage)}><FolderOpen size={14} aria-hidden="true" />Manage projects</button>}{onCreate && <button type="button" className="project-dropdown-create" onClick={() => runAction(onCreate)}><Plus size={14} aria-hidden="true" />New project</button>}</div>}
    </div>}
  </div>;
}
