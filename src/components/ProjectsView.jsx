import { useId, useRef, useState } from 'react';
import { ArrowRight, Building2, Check, CircleAlert, Clock3, FileText, FolderOpen, Info, ListChecks, LockKeyhole, MapPin, Plus, Search, X } from 'lucide-react';
import { Badge, Button, FormField, Modal, PageHeader } from './ui.jsx';
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

export function ProjectsView({ projects = [], activeProjectId, onOpen, onCreate, onBack }) {
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('all');
  const available = list(projects);
  const shown = available.filter((project) => matchesProject(project, search) && (country === 'all' || project.country === country));
  return <div className="projects-view">
    <PageHeader title="All projects" description="Open a project to see its next steps." onBack={onBack} backLabel="Back to overview" actions={<Button className="primary" icon={Plus} onClick={onCreate}>New project</Button>} />
    <div className="section-toolbar projects-toolbar"><label className="search-box"><Search size={16}/><input aria-label="Search projects" placeholder="Find a project…" value={search} onChange={event=>setSearch(event.target.value)}/>{search&&<button aria-label="Clear project search" onClick={()=>setSearch('')}><X size={14}/></button>}</label><select className="form-select" aria-label="Filter projects by country" value={country} onChange={event=>setCountry(event.target.value)}><option value="all">All countries</option>{COUNTRIES.map(value=><option key={value}>{value}</option>)}</select></div>
    <div className="projects-simple-list">{shown.map(project=>{const counts=projectStats(project);return <article key={project.id} className={`project-list-row${project.id===activeProjectId?' active':''}`}><div className="project-list-icon"><Building2 size={22}/></div><div className="project-list-copy"><h2>{project.name}</h2><p>{project.code} · {project.country||'Country not set'}</p><div><Badge tone={project.locked?'green':counts.items?'amber':'slate'}>{project.locked?'Contract checked':counts.items?'Contract to check':'No contract yet'}</Badge>{counts.pending>0&&<span>{counts.pending} site {counts.pending===1?'update':'updates'} to check</span>}</div></div><Button onClick={()=>onOpen?.(project.id,'projects')}>{project.id===activeProjectId?'View overview':'Open project'}<ArrowRight size={14}/></Button></article>;})}</div>
    {!shown.length&&<div className="empty-state"><FolderOpen size={28}/><h3>No matching projects</h3><p>Try a different name or country.</p><Button onClick={()=>{setSearch('');setCountry('all');}}>Clear filters</Button></div>}
  </div>;
}

export function CreateProjectModal({ projects = [], onClose, onCreate }) {
  const formId = useId();
  const nameRef = useRef(null);
  const codeRef = useRef(null);
  const [form, setForm] = useState({ name: '', code: '', country: 'Singapore', subcontractor: '', description: '', template: 'warehouse' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const update = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: undefined, submit: undefined })); };

  async function submit(event) {
    event.preventDefault();
    if (submitting || !onCreate) return;
    const values = { name: form.name.trim(), code: form.code.trim().toUpperCase(), country: form.country, subcontractor: form.subcontractor.trim(), description: form.description.trim(), template: form.template };
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

  return <Modal title="New project" description="Choose sample data to try the full workflow, or start empty." onClose={onClose} footer={<><Button onClick={onClose} disabled={submitting}>Cancel</Button><Button className="primary" icon={Plus} type="submit" form={formId} disabled={submitting || !onCreate}>{submitting ? 'Creating…' : form.template === 'warehouse' ? 'Create mock project' : 'Create empty project'}</Button></>}>
    <form id={formId} className="projects-create-form" onSubmit={submit} noValidate>
      <FormField className="projects-form-field" label="Project data" id={`${formId}-template`} hint={form.template === 'warehouse' ? 'Six fictional work items and four mock messages, ready for the full walkthrough.' : 'PDF uploads are previews only. This option has no work items or messages.'}><select id={`${formId}-template`} className="form-select" value={form.template} onChange={(event) => update('template', event.target.value)} disabled={submitting}><option value="warehouse">Sample warehouse — full workflow</option><option value="empty">Empty project — PDF preview only</option></select></FormField>
      <FormField className="projects-form-field" label="Project name" id={`${formId}-name`} required error={errors.name}><input ref={nameRef} id={`${formId}-name`} className="form-input" value={form.name} maxLength={100} placeholder="e.g. Riverside residences" required aria-invalid={Boolean(errors.name)} onChange={(event) => update('name', event.target.value)} disabled={submitting} /></FormField>
      <div className="projects-form-row">
        <FormField className="projects-form-field" label="Project code" id={`${formId}-code`} required hint="A unique code for site reports." error={errors.code}><input ref={codeRef} id={`${formId}-code`} className="form-input projects-code-input" value={form.code} maxLength={20} placeholder="e.g. RIV01" required aria-invalid={Boolean(errors.code)} onChange={(event) => update('code', event.target.value.toUpperCase())} disabled={submitting} /></FormField>
        <FormField className="projects-form-field" label="Country" id={`${formId}-country`} required error={errors.country}><select id={`${formId}-country`} className="form-select" value={form.country} required aria-invalid={Boolean(errors.country)} onChange={(event) => update('country', event.target.value)} disabled={submitting}>{COUNTRIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></FormField>
      </div>
      <FormField className="projects-form-field" label="Subcontractor" id={`${formId}-subcontractor`} optional><input id={`${formId}-subcontractor`} className="form-input" value={form.subcontractor} maxLength={120} placeholder="Company or team name" onChange={(event) => update('subcontractor', event.target.value)} disabled={submitting} /></FormField>
      <FormField className="projects-form-field" label="Description" id={`${formId}-description`} optional><textarea id={`${formId}-description`} className="form-textarea" value={form.description} maxLength={240} rows={3} placeholder="A short note about this project's work scope…" onChange={(event) => update('description', event.target.value)} disabled={submitting} /></FormField>
      <div className="projects-create-note"><Info size={14} aria-hidden="true" /><span>{form.template === 'warehouse' ? 'Sample data is fictional and starts fresh in this project. Your existing projects stay unchanged. No AI or live WhatsApp is connected.' : 'This project starts empty. Your existing projects stay unchanged; PDF preview does not extract a work list.'}</span></div>
      {errors.submit && <p className="projects-field-error projects-submit-error" role="alert">{errors.submit}</p>}
    </form>
  </Modal>;
}
