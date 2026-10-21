import { ArrowRight, Bell, CheckCheck, ChevronDown, FileText, MapPin } from 'lucide-react';
import { getProjectWorkflow } from '../data/workflow.js';
import { getProjectAttention } from '../data/project-attention.js';
import { periodLabel } from './claim-view-utils.js';
import { Button, PageHeader } from './ui.jsx';
import './project-workflow.css';

const moduleSteps = [
  { id: 'contract', label: 'Contract', route: 'contract', views: ['contract', 'drawing'] },
  { id: 'site', label: 'Site updates', route: 'whatsapp', views: ['whatsapp', 'completion'] },
  { id: 'vo', label: 'Extra work', route: 'vo', views: ['vo'] },
  { id: 'claims', label: 'Monthly claims', route: 'claims', views: ['claims', 'claim-preview', 'claim-status'] },
];

export function WorkflowNav({ project, view, onNavigate }) {
  if (!moduleSteps.some(step => step.views.includes(view))) return null;
  const workflow = getProjectWorkflow(project);

  return <nav className="workflow-nav" aria-label="Project workflow">
    <ol>{moduleSteps.map((step, index) => {
      const current = step.views.includes(view);
      const state = workflow.steps.find(entry => entry.id === step.id);
      const statusId = `workflow-status-${step.id}`;
      return <li key={step.route}>
        <button type="button" aria-label={step.label} aria-describedby={statusId} aria-current={current ? 'step' : undefined} disabled={current} onClick={() => onNavigate(step.route)}>
          <span className="workflow-step-number" aria-hidden="true">{index + 1}</span>
          <span className="workflow-step-copy"><strong>{step.label}</strong><small id={statusId}>{state.status}</small></span>
        </button>
      </li>;
    })}</ol>
  </nav>;
}

function nextTaskContext(project, task) {
  if (task.category === 'claims') {
    const draft = project.claimDrafts?.find(entry => entry.id === task.target.draftId);
    return draft ? `${periodLabel(draft.period)} · Version ${draft.revision}` : task.detail;
  }
  const message = project.whatsappMessages?.find(entry => entry.id === task.target.messageId);
  const report = project.reports?.find(entry => entry.id === task.target.reportId);
  const item = project.items?.find(entry => entry.id === (task.target.itemId || message?.itemId));
  const source = message || report;
  return [...new Set([source?.area || source?.location, item?.description].filter(Boolean))].join(' · ') || task.detail;
}

export function ProjectOverview({ project, onNavigate, onNext, onOpenTask, onReviewContract, onOpenAttention, attentionOpen }) {
  const workflow = getProjectWorkflow(project);
  const attentionTasks = getProjectAttention(project).filter(task => task.projectId === project.id);
  const nextTask = workflow.next.route === 'contract' ? null : attentionTasks[0];
  const usesProvidedSource = project.contract?.sourceKind === 'provided';
  const taskCount = attentionTasks.length;
  const attentionHeading = taskCount ? `${taskCount} task${taskCount === 1 ? '' : 's'} need${taskCount === 1 ? 's' : ''} attention` : !project.items?.length ? 'Ready to get started' : workflow.next.route === 'contract' ? 'Contract setup' : 'All caught up';
  const nextTitle = nextTask ? nextTask.title : workflow.next.label;
  const nextDescription = nextTask ? nextTaskContext(project, nextTask) : workflow.next.description;
  const openNext = () => nextTask ? onOpenTask ? onOpenTask(nextTask) : onOpenAttention?.() : onNext(workflow.next);

  return <section className="project-overview">
    <PageHeader title="Project overview" description="Your next task and the steps in this project." />
    <section className="overview-next-task" aria-labelledby="overview-attention-heading">
      <header className="overview-next-header">
        <div>{taskCount ? <Bell size={16} aria-hidden="true" /> : <CheckCheck size={16} aria-hidden="true" />}<h2 id="overview-attention-heading">{attentionHeading}</h2></div>
        {taskCount > 0 && <Button className="ghost" onClick={onOpenAttention} aria-haspopup="dialog" aria-expanded={!!attentionOpen}>View tasks<ArrowRight size={14} /></Button>}
      </header>
      <div className="overview-next-body">
        <div><span className="overview-next-label">Your next step</span><h3>{nextTitle}</h3><p>{nextDescription}</p></div>
        <Button className="primary" onClick={openNext}>{nextTask ? nextTask.actionLabel : workflow.next.label}<ArrowRight size={16} /></Button>
      </div>
    </section>
    <nav className="overview-workflow" aria-label="Project steps">{workflow.steps.map((step, index) => <button type="button" className="overview-step" key={step.id} onClick={() => onNavigate(step.route)} title={step.detail}><span className="overview-step-number" aria-hidden="true">{index + 1}</span><span className="overview-step-copy"><strong>{step.label}</strong><small>{step.status}</small></span><ArrowRight size={15} aria-hidden="true" /></button>)}</nav>
    {project.providedContractDemo && <details className="contract-scenario-guide">
      <summary><span>About this demo<small>{usesProvidedSource ? 'Provided contract · simulated site activity' : 'Fictional contract · simulated site activity'}</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="contract-scenario-content">
        <p>{usesProvidedSource ? `${project.items.length} representative contract rows and the supplied site plan. The sample contains selected rows, not the full work list. Site activity, dates, photos, approvals and claim assessments are simulated.` : `${project.items.length} fictional contract rows and an illustrative campus plan. All values, parties, site activity and claim assessments are demo data.`}</p>
        <p>The demo starts with a checked contract baseline and a saved example claim.</p>
        <ol>
          <li><strong>Contract:</strong> compare W3 and W5 items with the {usesProvidedSource ? 'supplied' : 'fictional'} schedule.</li>
          <li><strong>Drawing:</strong> select an area for its work, messages, photos and VO flags. Pins are illustrative manual links.</li>
          <li><strong>Site updates:</strong> compare reported and verified totals. An unclear “another 10%” message needs clarification.</li>
          <li><strong>Extra work:</strong> check the scope query, recorded approval and included-scope rejection.</li>
          <li><strong>Claims:</strong> review the saved example. QS quantities and VO values are mock assessments; physical percentages do not price a claim. Claim status separately simulates submission, queries, revisions, certification and payment.</li>
        </ol>
        <div className="contract-scenario-actions"><Button className="ghost" icon={FileText} onClick={() => onReviewContract ? onReviewContract() : onNavigate('contract')}>Review contract</Button><Button className="ghost" icon={MapPin} onClick={() => onNavigate('drawing')}>Explore the drawing</Button><Button className="ghost" onClick={() => onNavigate('claims')}>View example claim<ArrowRight size={14} /></Button></div>
      </div>
    </details>}
  </section>;
}

export function SiteViewTabs({ view, onNavigate, pending = 0 }) {
  return <nav className="site-view-tabs" aria-label="Site updates sections"><button type="button" className={view === 'whatsapp' ? 'current' : ''} aria-current={view === 'whatsapp' ? 'page' : undefined} onClick={() => onNavigate('whatsapp')}>Messages</button><button type="button" className={view === 'completion' ? 'current' : ''} aria-current={view === 'completion' ? 'page' : undefined} onClick={() => onNavigate('completion')}>Progress{pending > 0 && <span>{pending} to check</span>}</button></nav>;
}
