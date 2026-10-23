import { useId, useRef, useState } from 'react';
import { ArrowRight, Building2, Check, CircleAlert, Clock3, FileText, FolderOpen, Info, ListChecks, LockKeyhole, MapPin, Plus, Search, X } from 'lucide-react';
import { Badge, Button, FormField, Modal, PageHeader, Input, SelectField, Textarea } from './ui.jsx';
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

export function ProjectsView({ projects = [], activeProjectId, showcaseProjectId, onOpen, onCreate, onBack }) {
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('all');
  const available = list(projects);
  const shown = available.filter((project) => matchesProject(project, search) && (country === 'all' || project.country === country));
  return <div className="projects-view">
    <PageHeader title="All projects" description={showcaseProjectId ? 'Open the S.I.T. showcase or choose another project.' : 'Open a project to see its next steps.'} onBack={onBack} backLabel="Back to overview" actions={<Button className="primary" icon={Plus} onClick={onCreate}>New project</Button>} />
    <div className="section-toolbar projects-toolbar"><label className="search-box"><Search size={16}/><Input aria-label="Search projects" placeholder="Find a project…" value={search} onChange={event=>setSearch(event.target.value)}/>{search&&<button aria-label="Clear project search" onClick={()=>setSearch('')}><X size={14}/></button>}</label><SelectField className="form-select" aria-label="Filter projects by country" value={country} onChange={event=>setCountry(event.target.value)}><option value="all">All countries</option>{COUNTRIES.map(value=><option key={value}>{value}</option>)}</SelectField></div>
    <div className="projects-simple-list">{shown.map(project=>{const counts=projectStats(project);return <article key={project.id} className={`project-list-row${project.id===activeProjectId?' active':''}`}><div className="project-list-icon"><Building2 size={22}/></div><div className="project-list-copy"><h2>{project.name}</h2><p>{project.code} · {project.country||'Country not set'}</p><div>{project.id===showcaseProjectId&&<Badge tone="blue">Default showcase</Badge>}<Badge tone={project.locked?'green':counts.items?'amber':'slate'}>{project.locked?'Contract checked':counts.items?'Contract to check':'No contract yet'}</Badge>{counts.pending>0&&<span>{counts.pending} site {counts.pending===1?'update':'updates'} to check</span>}</div></div><Button onClick={()=>onOpen?.(project.id,'projects')}>{project.id===showcaseProjectId?'Open showcase':project.id===activeProjectId?'View overview':'Open project'}<ArrowRight size={14}/></Button></article>;})}</div>
    {!shown.length&&<div className="empty-state"><FolderOpen size={28}/><h3>No matching projects</h3><p>Try a different name or country.</p><Button onClick={()=>{setSearch('');setCountry('all');}}>Clear filters</Button></div>}
  </div>;
}

export function CreateProjectModal({ projects = [], providedContract = null, originalContract = null, onClose, onCreate }) {
  const formId = useId();
  const nameRef = useRef(null);
  const codeRef = useRef(null);
  const [form, setForm] = useState({ name: '', code: '', country: 'Singapore', subcontractor: '', description: '', template: 'warehouse' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const suggestions = useRef({ name: '', code: '' });
  const scenario = form.template === 'sit-original' ? originalContract : form.template === 'provided' ? providedContract : null;
  const isProvided = Boolean(scenario);
  const usesProvidedSource = scenario?.contract?.sourceKind === 'provided';
  const update = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: undefined, submit: undefined })); };
  function chooseTemplate(template) {
    const source = template === 'sit-original' ? originalContract : template === 'provided' ? providedContract : null;
    if (!source) return update('template', template);
    const used = new Set(list(projects).flatMap(project => [project.id, project.code].map(value => String(value).toUpperCase())));
    const prefix = template === 'sit-original' ? 'SIT-DEMO' : 'CASE';
    let index = 1;
    while (used.has(`${prefix}${String(index).padStart(2, '0')}`)) index += 1;
    const next = { name: `${source.name.replace(/\s*\(Demo\)\s*$/i, '')} — Scenario (Demo)`, code: `${prefix}${String(index).padStart(2, '0')}` };
    const previous = suggestions.current;
    suggestions.current = next;
    setForm(current => ({ ...current, template, name: !current.name || current.name === previous.name ? next.name : current.name, code: !current.code || current.code === previous.code ? next.code : current.code, country: source.country || 'Singapore', subcontractor: source.contract.subcontractor || '' }));
    setErrors({});
  }
  const templateHint = isProvided
    ? `${scenario.items.length} ${usesProvidedSource ? 'original schedule rows, the supplied drawing' : 'fictional schedule rows, a demo plan'} and a simulated site-to-claim scenario.`
    : form.template === 'warehouse' ? 'Six fictional work items and four mock messages, ready for the full walkthrough.' : 'Start without work items, then try the mock contract upload.';

  async function submit(event) {
    event.preventDefault();
    if (submitting || !onCreate) return;
    const values = { name: form.name.trim(), code: form.code.trim().toUpperCase(), country: form.country, subcontractor: form.subcontractor.trim(), description: form.description.trim(), template: form.template };
    const nextErrors = {};
    if (!values.name) nextErrors.name = 'Enter a project name.';
    if (!values.code) nextErrors.code = 'Enter a project code.';
    else if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(values.code)) nextErrors.code = 'Use letters, numbers, hyphens or underscores, without spaces.';
    else if (list(projects).some((project) => [project.id, project.code].some(value => String(value ?? '').trim().toUpperCase() === values.code))) nextErrors.code = 'This code is already used by another project.';
    if (!COUNTRIES.includes(values.country)) nextErrors.country = 'Choose Singapore or Malaysia.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { (nextErrors.name ? nameRef : codeRef).current?.focus(); return; }
    setSubmitting(true);
    try { await onCreate(values); } catch (error) { setErrors({ submit: error?.message || 'The project could not be created. Please try again.' }); } finally { setSubmitting(false); }
  }

  return <Modal title="New project" description="Choose sample data to try the full workflow, or start empty." onClose={onClose} footer={<><Button onClick={onClose} disabled={submitting}>Cancel</Button><Button className="primary" icon={Plus} type="submit" form={formId} disabled={submitting || !onCreate}>{submitting ? 'Creating…' : form.template === 'empty' ? 'Create empty project' : 'Create mock project'}</Button></>}>
    <form id={formId} className="projects-create-form" onSubmit={submit} noValidate>
      <FormField className="projects-form-field" label="Project data" id={`${formId}-template`} hint={templateHint}><SelectField id={`${formId}-template`} className="form-select" value={form.template} onChange={(event) => chooseTemplate(event.target.value)} disabled={submitting}><option value="warehouse">Sample warehouse — full workflow</option>{providedContract && <option value="provided">{providedContract.contract?.sourceKind === 'provided' ? 'Uploaded contract' : 'Sample campus contract'} — realistic scenario</option>}{originalContract && <option value="sit-original">Original S.I.T. contract — realistic scenario</option>}<option value="empty">Empty project — upload a contract</option></SelectField></FormField>
      <FormField className="projects-form-field" label="Project name" id={`${formId}-name`} required error={errors.name}><Input ref={nameRef} id={`${formId}-name`} className="form-input" value={form.name} maxLength={100} placeholder="e.g. Riverside residences" required aria-invalid={Boolean(errors.name)} onChange={(event) => update('name', event.target.value)} disabled={submitting} /></FormField>
      <div className="projects-form-row">
        <FormField className="projects-form-field" label="Project code" id={`${formId}-code`} required hint="A unique code for site reports." error={errors.code}><Input ref={codeRef} id={`${formId}-code`} className="form-input projects-code-input" value={form.code} maxLength={20} placeholder="e.g. RIV01" required aria-invalid={Boolean(errors.code)} onChange={(event) => update('code', event.target.value.toUpperCase())} disabled={submitting} /></FormField>
        <FormField className="projects-form-field" label="Country" id={`${formId}-country`} required error={errors.country}><SelectField id={`${formId}-country`} className="form-select" value={form.country} required aria-invalid={Boolean(errors.country)} onChange={(event) => update('country', event.target.value)} disabled={submitting || isProvided}>{COUNTRIES.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField></FormField>
      </div>
      <FormField className="projects-form-field" label="Subcontractor" id={`${formId}-subcontractor`} optional hint={isProvided ? `Country, parties and rates stay as stated in the ${usesProvidedSource ? 'supplied' : 'sample'} contract.` : undefined}><Input id={`${formId}-subcontractor`} className="form-input" value={form.subcontractor} maxLength={120} placeholder="Company or team name" onChange={(event) => update('subcontractor', event.target.value)} disabled={submitting || isProvided} /></FormField>
      <FormField className="projects-form-field" label="Description" id={`${formId}-description`} optional><Textarea id={`${formId}-description`} className="form-textarea" value={form.description} maxLength={240} rows={3} placeholder="A short note about this project's work scope…" onChange={(event) => update('description', event.target.value)} disabled={submitting} /></FormField>
      <div className="projects-create-note"><Info size={14} aria-hidden="true" /><span>{isProvided ? usesProvidedSource ? 'Uses the provided contract and drawing. Messages, photos, progress, VO decisions and the example claim are simulated. Creates a separate project.' : 'All contract values, parties, drawings and activity are fictional. Creates a separate project with simulated progress, VO decisions and an example claim.' : form.template === 'warehouse' ? 'Sample data is fictional and starts fresh in this project. Your existing projects stay unchanged. No AI or live WhatsApp is connected.' : 'This project starts empty. Use Upload contract to try a simulated extraction with the fictional demo work list.'}</span></div>
      {errors.submit && <p className="projects-field-error projects-submit-error" role="alert">{errors.submit}</p>}
    </form>
  </Modal>;
}
