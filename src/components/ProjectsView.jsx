import { useId, useRef, useState } from 'react';
import { ArrowRight, Building2, Check, CircleAlert, Clock3, FileText, FolderOpen, Info, ListChecks, LockKeyhole, MapPin, Plus, Search, X } from 'lucide-react';
import { Badge, Button, Modal } from './ui.jsx';
import { getVOCases } from '../data/vo.js';
import './projects.css';

const COUNTRIES = ['Singapore', 'Malaysia'];
const isWaiting = (report) => !report.vo && ['pending', 'needsReview'].includes(report.status);
const list = (value) => Array.isArray(value) ? value : [];

function projectStats(project) {
  const items = list(project.items);
  const reports = list(project.reports);
  return {
    items: items.length,
    pending: reports.filter(isWaiting).length,
    review: items.filter((item) => item.needsReview).length,
    variations: getVOCases(project).filter((entry) => !['approved', 'rejected'].includes(entry.status)).length,
    verified: items.filter((item) => Number(item.verified) > 0).length,
  };
}

function sourceBadge(project) {
  const kind = project.contract?.sourceKind ?? project.sourceKind;
  if (kind === 'provided') return { label: 'Provided sample', tone: 'blue' };
  if (kind === 'illustrative') return { label: 'Illustrative demo', tone: 'violet' };
  if (kind === 'none' || kind === 'empty' || !list(project.items).length) return { label: 'Empty', tone: 'slate' };
  if (project.contract?.representativeSubset && project.contract?.sourceFile) return { label: 'Provided sample', tone: 'blue' };
  return { label: 'Illustrative demo', tone: 'violet' };
}

function matchesProject(project, search) {
  const value = search.trim().toLowerCase();
  return !value || `${project.name ?? ''} ${project.code ?? ''}`.toLowerCase().includes(value);
}

export function ProjectsView({ projects = [], activeProjectId, onOpen, onCreate }) {
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('all');
  const available = list(projects);
  const stats = available.map(projectStats);
  const totals = stats.reduce((sum, current) => ({
    pending: sum.pending + current.pending,
    review: sum.review + current.review,
    variations: sum.variations + current.variations,
  }), { pending: 0, review: 0, variations: 0 });
  const shown = available.filter((project) => matchesProject(project, search) && (country === 'all' || project.country === country));
  const clearFilters = () => { setSearch(''); setCountry('all'); };
  const summary = [
    { label: 'PROJECTS', value: available.length, detail: 'Separate project workspaces', icon: Building2 },
    { label: 'AWAITING VERIFICATION', value: totals.pending, detail: 'Site reports · excludes possible VOs', icon: Clock3 },
    { label: 'CONTRACT ITEMS TO REVIEW', value: totals.review, detail: 'Source checks before confirmation', icon: ListChecks },
    { label: 'POSSIBLE VARIATIONS', value: totals.variations, detail: 'For QS review · not approved', icon: CircleAlert },
  ];

  return <div className="projects-view">
    <div className="page-header projects-header">
      <div><h1>Projects</h1><p className="page-description">Keep each contract, site update and review in its own workspace.</p></div>
      <Button className="primary" icon={Plus} onClick={() => onCreate?.()} disabled={!onCreate}>New project</Button>
    </div>

    <div className="summary-grid projects-summary">
      {summary.map(({ label, value, detail, icon: Icon }) => <div className="summary-card" key={label}>
        <div className="summary-label">{label}<Icon size={16} aria-hidden="true" /></div>
        <div className="summary-value">{value}</div><div className="summary-detail">{detail}</div>
      </div>)}
    </div>

    <div className="section-toolbar projects-toolbar">
      <label className="search-box"><Search size={16} aria-hidden="true" /><input aria-label="Search projects" placeholder="Search project name or code…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" className="projects-search-clear" aria-label="Clear project search" onClick={() => setSearch('')}><X size={14} /></button>}</label>
      <div className="filter-group"><span className="projects-result-count" aria-live="polite">{shown.length} {shown.length === 1 ? 'project' : 'projects'}</span><select className="form-select" aria-label="Filter projects by country" value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">All countries</option>{COUNTRIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
    </div>

    {shown.length ? <div className="projects-grid">
      {shown.map((project) => {
        const counts = projectStats(project);
        const source = sourceBadge(project);
        const active = project.id === activeProjectId;
        return <article className={`projects-card${active ? ' projects-card-active' : ''}`} key={project.id} aria-labelledby={`project-title-${project.id}`}>
          <div className="projects-card-heading"><div className="projects-card-icon"><Building2 size={21} aria-hidden="true" /></div><div className="projects-card-identifiers"><span className="projects-code">{project.code}</span><span className="projects-country"><MapPin size={11} aria-hidden="true" />{project.country || 'Country not set'}</span></div>{active && <Badge tone="blue"><span className="projects-active-dot" />Active</Badge>}</div>
          <h2 id={`project-title-${project.id}`}>{project.name || 'Untitled project'}</h2>
          <p className="projects-card-description">{project.description || project.contract?.name || 'Add a contract to set up the scope and start reviewing site updates.'}</p>
          <div className="projects-card-badges"><Badge tone={source.tone}>{source.label}</Badge>{counts.items > 0 ? <Badge tone={project.locked ? 'green' : 'amber'}>{project.locked ? <LockKeyhole size={11} aria-hidden="true" /> : <Clock3 size={11} aria-hidden="true" />}v{project.version || 1} · {project.locked ? 'Confirmed' : 'In review'}</Badge> : <Badge>No baseline</Badge>}</div>
          <div className="projects-card-stats"><div><strong>{counts.items}</strong><span>Work items</span></div><div><strong className={counts.pending ? 'projects-stat-amber' : ''}>{counts.pending}</strong><span>Pending reports</span></div><div><strong className={counts.review ? 'projects-stat-amber' : ''}>{counts.review}</strong><span>Source checks</span></div></div>
          <div className="projects-card-progress"><span><Check size={13} aria-hidden="true" />{counts.verified} {counts.verified === 1 ? 'item' : 'items'} with verified progress</span>{counts.variations > 0 && <span className="projects-vo-count">{counts.variations} possible {counts.variations === 1 ? 'VO' : 'VOs'}</span>}</div>
          <div className="projects-card-actions"><Button icon={FileText} onClick={() => onOpen?.(project.id, 'contract')} disabled={!onOpen}>Review contract</Button><Button icon={ListChecks} onClick={() => onOpen?.(project.id, 'completion')} disabled={!onOpen}>Completion list<ArrowRight size={13} aria-hidden="true" /></Button></div>
        </article>;
      })}
    </div> : <div className="projects-empty empty-state"><FolderOpen size={31} aria-hidden="true" /><h3>{available.length ? 'No matching projects' : 'Your first project starts here'}</h3><p>{available.length ? 'Try another project name, code or country.' : 'Create a workspace for your contract and site reports.'}</p><Button icon={available.length ? X : Plus} className={available.length ? '' : 'primary'} onClick={available.length ? clearFilters : () => onCreate?.()} disabled={!available.length && !onCreate}>{available.length ? 'Clear filters' : 'New project'}</Button></div>}

    <div className="projects-footnote"><Info size={13} aria-hidden="true" /><span>Progress is shown as item counts. Completion percentages and contract values are not combined across projects.</span></div>
  </div>;
}

export function CreateProjectModal({ projects = [], onClose, onCreate }) {
  const formId = useId();
  const nameRef = useRef(null);
  const codeRef = useRef(null);
  const [form, setForm] = useState({ name: '', code: '', country: 'Singapore', subcontractor: '', description: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const update = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: undefined, submit: undefined })); };

  async function submit(event) {
    event.preventDefault();
    if (submitting || !onCreate) return;
    const values = { name: form.name.trim(), code: form.code.trim().toUpperCase(), country: form.country, subcontractor: form.subcontractor.trim(), description: form.description.trim() };
    const nextErrors = {};
    if (!values.name) nextErrors.name = 'Enter a project name.';
    if (!values.code) nextErrors.code = 'Enter a project code.';
    else if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(values.code)) nextErrors.code = 'Use letters, numbers, hyphens or underscores, without spaces.';
    else if (list(projects).some((project) => String(project.code ?? '').trim().toUpperCase() === values.code)) nextErrors.code = 'This code is already used by another project.';
    if (!COUNTRIES.includes(values.country)) nextErrors.country = 'Choose Singapore or Malaysia.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { (nextErrors.name ? nameRef : codeRef).current?.focus(); return; }
    setSubmitting(true);
    try { await onCreate(values); } catch (error) { setErrors({ submit: error?.message || 'The project could not be created. Please try again.' }); } finally { setSubmitting(false); }
  }

  return <Modal title="New project" description="Give the workspace a name, then add its contract." onClose={onClose} footer={<><Button onClick={onClose} disabled={submitting}>Cancel</Button><Button className="primary" icon={Plus} type="submit" form={formId} disabled={submitting || !onCreate}>{submitting ? 'Creating…' : 'Create project'}</Button></>}>
    <form id={formId} className="projects-create-form" onSubmit={submit} noValidate>
      <div className="projects-form-field"><label htmlFor={`${formId}-name`}>Project name <span aria-hidden="true">*</span></label><input ref={nameRef} id={`${formId}-name`} className="form-input" value={form.name} maxLength={100} placeholder="e.g. Riverside residences" required aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${formId}-name-error` : undefined} onChange={(event) => update('name', event.target.value)} disabled={submitting} />{errors.name && <p id={`${formId}-name-error`} className="projects-field-error" role="alert">{errors.name}</p>}</div>
      <div className="projects-form-row"><div className="projects-form-field"><label htmlFor={`${formId}-code`}>Project code <span aria-hidden="true">*</span></label><input ref={codeRef} id={`${formId}-code`} className="form-input projects-code-input" value={form.code} maxLength={20} placeholder="e.g. RIV01" required aria-invalid={Boolean(errors.code)} aria-describedby={`${formId}-code-note${errors.code ? ` ${formId}-code-error` : ''}`} onChange={(event) => update('code', event.target.value.toUpperCase())} disabled={submitting} /><p id={`${formId}-code-note`} className="projects-field-hint">A unique code for site reports.</p>{errors.code && <p id={`${formId}-code-error`} className="projects-field-error" role="alert">{errors.code}</p>}</div><div className="projects-form-field"><label htmlFor={`${formId}-country`}>Country <span aria-hidden="true">*</span></label><select id={`${formId}-country`} className="form-select" value={form.country} required aria-invalid={Boolean(errors.country)} aria-describedby={errors.country ? `${formId}-country-error` : undefined} onChange={(event) => update('country', event.target.value)} disabled={submitting}>{COUNTRIES.map((value) => <option key={value} value={value}>{value}</option>)}</select>{errors.country && <p id={`${formId}-country-error`} className="projects-field-error" role="alert">{errors.country}</p>}</div></div>
      <div className="projects-form-field"><label htmlFor={`${formId}-subcontractor`}>Subcontractor <span className="projects-optional">Optional</span></label><input id={`${formId}-subcontractor`} className="form-input" value={form.subcontractor} maxLength={120} placeholder="Company or team name" onChange={(event) => update('subcontractor', event.target.value)} disabled={submitting} /></div>
      <div className="projects-form-field"><label htmlFor={`${formId}-description`}>Description <span className="projects-optional">Optional</span></label><textarea id={`${formId}-description`} className="form-textarea" value={form.description} maxLength={240} rows={3} placeholder="A short note about this project's work scope…" onChange={(event) => update('description', event.target.value)} disabled={submitting} /></div>
      <div className="projects-create-note"><Info size={14} aria-hidden="true" /><span>New projects start empty. Contract items and site reports are not copied from the sample projects.</span></div>
      {errors.submit && <p className="projects-field-error projects-submit-error" role="alert">{errors.submit}</p>}
    </form>
  </Modal>;
}
