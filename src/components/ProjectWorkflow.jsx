import { ArrowRight, Check, ClipboardList, FileText, Flag, MapPin, MessageSquare } from 'lucide-react';
import { getProjectWorkflow } from '../data/workflow.js';
import { Badge, Button, PageHeader } from './ui.jsx';
import './project-workflow.css';

const icons = { contract: FileText, site: MessageSquare, vo: Flag, claims: ClipboardList };
const stageFor = (view) => ['contract', 'drawing'].includes(view) ? 'contract' : ['whatsapp', 'completion'].includes(view) ? 'site' : view === 'vo' ? 'vo' : ['claims', 'claim-preview', 'claim-status'].includes(view) ? 'claims' : null;
const tone = (status) => /review|pending|unread|not checked|clarification/i.test(status) ? 'amber' : /submitted|certified/i.test(status) ? 'blue' : /checked|confirmed|prepared|paid|up to date/i.test(status) ? 'green' : 'slate';

export function WorkflowNav({ project, view, onNavigate }) {
  const workflow = getProjectWorkflow(project);
  const active = stageFor(view);
  return <nav className="workflow-nav" aria-label="Project workflow">{workflow.steps.map((step, index) => <button type="button" key={step.id} className={active === step.id ? 'current' : ''} aria-current={active === step.id ? 'step' : undefined} title={step.detail} onClick={() => onNavigate(step.route)}><span>{index + 1}</span><strong>{step.label}</strong>{index < 3 && <ArrowRight size={12} className="workflow-link-arrow" />}</button>)}</nav>;
}

export function ProjectOverview({ project, onNavigate, onNext, onManage, onReviewContract }) {
  const workflow = getProjectWorkflow(project);
  const usesProvidedSource = project.contract?.sourceKind === 'provided';
  return <section className="project-overview">
    <PageHeader title="Project overview" description="Your contract, site updates and claims in one place." actions={<Button onClick={onManage}>All projects</Button>}/>
    {project.providedContractDemo && <section className="contract-scenario-guide" aria-labelledby="contract-scenario-heading">
      <div className="contract-scenario-heading"><h2 id="contract-scenario-heading">{usesProvidedSource ? 'Your contract' : 'Sample contract'}, a realistic walkthrough</h2><Badge tone="blue">{usesProvidedSource ? 'Provided sample' : 'Fictional sample'}</Badge></div>
      <p>{usesProvidedSource ? `${project.items.length} representative contract rows and the supplied site plan. Site activity, dates, photos, approvals and claim assessments are simulated.` : `${project.items.length} fictional contract rows and an illustrative campus plan. All values, parties, site activity and claim assessments are demo data.`}</p>
      <p>The demo starts with a checked contract baseline and a saved example claim.</p>
      <div className="contract-scenario-actions"><Button className="primary" icon={FileText} onClick={() => onReviewContract ? onReviewContract() : onNavigate('contract')}>Review contract</Button><Button icon={MapPin} onClick={() => onNavigate('drawing')}>Explore the drawing</Button><Button onClick={() => onNavigate('claims')}>View example claim<ArrowRight size={14}/></Button></div>
      <details><summary>What to try in this project</summary><ol>
        <li><strong>Contract:</strong> compare W3 and W5 items with the {usesProvidedSource ? 'supplied' : 'fictional'} schedule.{usesProvidedSource && ' The sample contains selected rows, not the full work list.'}</li>
        <li><strong>Drawing:</strong> select an area to see its work, messages, photos and VO flags. Pins are illustrative manual links.</li>
        <li><strong>Site updates:</strong> review the newer 65% cumulative update against the earlier 50% verification. An unclear “another 10%” message needs clarification.</li>
        <li><strong>Extra work:</strong> review an additional-platform scope query, a mock approval and an included-scope rejection.</li>
        <li><strong>Claims:</strong> open the saved example draft. QS quantities and VO values are explicit mock assessments; physical percentages do not price a claim. After preparation, use Claim status to simulate submission, certification and payment.</li>
      </ol></details>
    </section>}
    <section className="next-task" aria-labelledby="next-task-heading"><div className="next-task-heading"><span className="next-task-dot" /><h2 id="next-task-heading">Your next step</h2></div><p>{workflow.next.description}</p><Button className="primary" onClick={() => onNext(workflow.next)}>{workflow.next.label}<ArrowRight size={16} /></Button></section>
    <div className="overview-workflow-heading"><h2>How this project works</h2><span>Open any step to review it</span></div>
    <div className="overview-workflow">{workflow.steps.map((step, index) => { const Icon = icons[step.id]; return <button type="button" className="overview-step" key={step.id} onClick={() => onNavigate(step.route)}><div className="overview-step-top"><span className="overview-step-icon"><Icon size={20} /></span><span className="overview-step-number">Step {index + 1}</span><ArrowRight size={16} /></div><h3>{step.label}</h3><p>{step.detail}</p><Badge tone={tone(step.status)}>{tone(step.status) === 'green' && <Check size={11} />}{step.status}</Badge></button>; })}</div>
    <p className="overview-caption">Review site updates as work progresses. Extra work is reviewed separately before it can be added to a claim.</p>
  </section>;
}

export function SiteViewTabs({ view, onNavigate, pending = 0 }) {
  return <nav className="site-view-tabs" aria-label="Site updates sections"><button type="button" className={view === 'whatsapp' ? 'current' : ''} aria-current={view === 'whatsapp' ? 'page' : undefined} onClick={() => onNavigate('whatsapp')}>Messages</button><button type="button" className={view === 'completion' ? 'current' : ''} aria-current={view === 'completion' ? 'page' : undefined} onClick={() => onNavigate('completion')}>Progress{pending > 0 && <span>{pending} to check</span>}</button></nav>;
}
