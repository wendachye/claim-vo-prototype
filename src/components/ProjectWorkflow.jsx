import { ArrowRight, Check, ClipboardList, FileText, Flag, MessageSquare } from 'lucide-react';
import { getProjectWorkflow } from '../data/workflow.js';
import { Badge, Button, PageHeader } from './ui.jsx';
import './project-workflow.css';

const icons = { contract: FileText, site: MessageSquare, vo: Flag, claims: ClipboardList };
const stageFor = (view) => view === 'contract' ? 'contract' : ['whatsapp', 'completion'].includes(view) ? 'site' : view === 'vo' ? 'vo' : ['claims', 'claim-preview'].includes(view) ? 'claims' : null;
const tone = (status) => /review|pending|unread|not checked/i.test(status) ? 'amber' : /checked|confirmed|prepared|up to date/i.test(status) ? 'green' : 'slate';

export function WorkflowNav({ project, view, onNavigate }) {
  const workflow = getProjectWorkflow(project);
  const active = stageFor(view);
  return <nav className="workflow-nav" aria-label="Project workflow">{workflow.steps.map((step, index) => <button type="button" key={step.id} className={active === step.id ? 'current' : ''} aria-current={active === step.id ? 'step' : undefined} title={step.detail} onClick={() => onNavigate(step.route)}><span>{index + 1}</span><strong>{step.label}</strong>{index < 3 && <ArrowRight size={12} className="workflow-link-arrow" />}</button>)}</nav>;
}

export function ProjectOverview({ project, onNavigate, onNext, onManage }) {
  const workflow = getProjectWorkflow(project);
  return <section className="project-overview">
    <PageHeader title="Project overview" description="Your contract, site updates and claims in one place." actions={<Button onClick={onManage}>All projects</Button>}/>
    <section className="next-task" aria-labelledby="next-task-heading"><div className="next-task-heading"><span className="next-task-dot" /><h2 id="next-task-heading">Your next step</h2></div><p>{workflow.next.description}</p><Button className="primary" onClick={() => onNext(workflow.next)}>{workflow.next.label}<ArrowRight size={16} /></Button></section>
    <div className="overview-workflow-heading"><h2>How this project works</h2><span>Open any step to review it</span></div>
    <div className="overview-workflow">{workflow.steps.map((step, index) => { const Icon = icons[step.id]; return <button type="button" className="overview-step" key={step.id} onClick={() => onNavigate(step.route)}><div className="overview-step-top"><span className="overview-step-icon"><Icon size={20} /></span><span className="overview-step-number">Step {index + 1}</span><ArrowRight size={16} /></div><h3>{step.label}</h3><p>{step.detail}</p><Badge tone={tone(step.status)}>{tone(step.status) === 'green' && <Check size={11} />}{step.status}</Badge></button>; })}</div>
    <p className="overview-caption">Review site updates as work progresses. Extra work is reviewed separately before it can be added to a claim.</p>
  </section>;
}

export function SiteViewTabs({ view, onNavigate, pending = 0 }) {
  return <nav className="site-view-tabs" aria-label="Site updates sections"><button type="button" className={view === 'whatsapp' ? 'current' : ''} aria-current={view === 'whatsapp' ? 'page' : undefined} onClick={() => onNavigate('whatsapp')}>Messages</button><button type="button" className={view === 'completion' ? 'current' : ''} aria-current={view === 'completion' ? 'page' : undefined} onClick={() => onNavigate('completion')}>Progress{pending > 0 && <span>{pending} to check</span>}</button></nav>;
}
