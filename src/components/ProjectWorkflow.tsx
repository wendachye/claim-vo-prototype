import type { Project, AttentionTask } from '../types/domain';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Bell, Check, CheckCheck, ChevronDown, ClipboardList, FileText, Flag, MapPin, MessageSquare } from 'lucide-react';
import { getProjectWorkflow } from '../data/workflow';
import { getProjectAttention } from '../data/project-attention';
import { getProjectOverview } from '../data/project-overview';
import { getSITShowcaseFeatureTargets } from '../data/sit-showcase-features';
import { periodLabel } from './claim-view-utils';
import { Badge, Button, formatTime, PageHeader } from './ui';
import './project-workflow.css';

const moduleSteps = [
  { id: 'contract', label: 'Contract', route: 'contract', views: ['contract', 'drawing'] },
  { id: 'site', label: 'Site updates', route: 'whatsapp', views: ['whatsapp', 'completion'] },
  { id: 'vo', label: 'Extra work', route: 'vo', views: ['vo'] },
  { id: 'claims', label: 'Monthly claims', route: 'claims', views: ['claims', 'claim-preview', 'claim-status'] },
];

const overviewIcons: Record<string, LucideIcon> = { contract: FileText, site: MessageSquare, vo: Flag, claims: ClipboardList };
const overviewTone = (status: string) => /needs|awaiting|pending|part paid|ready to confirm/i.test(status) ? 'amber'
  : /^(price approved|new updates|submitted|certified)$/i.test(status) ? 'blue'
    : /^(confirmed|prepared|paid|up to date|reviewed|completed)$/i.test(status) ? 'green' : 'slate';

export function WorkflowNav({ project, view, onNavigate }: { project: Project; view: string; onNavigate: (route: string) => void }) {
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
          <span className="workflow-step-copy"><strong>{step.label}</strong><small id={statusId}>{state?.status}</small></span>
        </button>
      </li>;
    })}</ol>
  </nav>;
}

function nextTaskContext(project: Project, task: AttentionTask) {
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

type WorkflowNext = ReturnType<typeof getProjectWorkflow>['next'];
type OverviewActivity = ReturnType<typeof getProjectOverview>['activities'][number];
interface ProjectOverviewProps { project: Project; onNavigate: (route: string) => void; onNext: (next: WorkflowNext) => void; onOpenTask?: (task: AttentionTask) => void; onOpenActivity?: (activity: OverviewActivity) => void; onReviewContract?: () => void; onOpenMessage?: (messageId: string) => void; onOpenAttention?: () => void; attentionOpen?: boolean }

export function ProjectOverview({ project, onNavigate, onNext, onOpenTask, onOpenActivity, onReviewContract, onOpenMessage, onOpenAttention, attentionOpen }: ProjectOverviewProps) {
  const workflow = getProjectWorkflow(project);
  const overview = getProjectOverview(project);
  const attentionTasks = getProjectAttention(project).filter(task => task.projectId === project.id);
  const nextTask = workflow.next.route === 'contract' ? null : attentionTasks[0];
  const usesProvidedSource = project.contract?.sourceKind === 'provided';
  const showcaseExamples = getSITShowcaseFeatureTargets(project);
  const taskCount = attentionTasks.length;
  const attentionHeading = taskCount ? `${taskCount} task${taskCount === 1 ? '' : 's'} need${taskCount === 1 ? 's' : ''} attention` : !project.items?.length ? 'Ready to get started' : workflow.next.route === 'contract' ? 'Contract setup' : 'All caught up';
  const nextTitle = nextTask ? nextTask.title : workflow.next.label;
  const nextDescription = nextTask ? nextTaskContext(project, nextTask) : workflow.next.description;
  const openNext = () => nextTask ? onOpenTask ? onOpenTask(nextTask) : onOpenAttention?.() : onNext(workflow.next);

  return <section className="project-overview">
    <PageHeader title="Project overview" description="Your project at a glance, and what to do next." />
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
    <div className="overview-workflow-heading"><h2>How this project works</h2><span>Open any step to review it</span></div>
    <nav className="overview-workflow" aria-label="Project steps">{workflow.steps.map((step, index) => {
      const card = overview.cards.find(entry => entry.id === step.id);
      const Icon = overviewIcons[step.id];
      const status = card?.status || step.status;
      const summary = card?.summary || step.detail;
      const detail = card?.detail;
      const tone = overviewTone(status);
      return <button type="button" className="overview-step" key={step.id} onClick={() => onNavigate(step.route)}>
        <span className="overview-step-top"><span className="overview-step-icon"><Icon size={20} aria-hidden="true" /></span><span className="overview-step-number">Step {index + 1}</span><ArrowRight size={16} aria-hidden="true" /></span>
        <h3>{step.label}</h3>
        <span className="overview-step-copy">
          {summary !== status && <span className="overview-step-summary">{summary}</span>}
          {detail && detail !== status && detail !== summary && <span className="overview-step-detail">{detail}</span>}
        </span>
        <Badge tone={tone}>{tone === 'green' && <Check size={11} aria-hidden="true" />}{status}</Badge>
      </button>;
    })}</nav>
    <section className="overview-activity" aria-labelledby="overview-activity-heading">
      <header><h2 id="overview-activity-heading">Recent activity</h2><p>Latest updates in this project.</p></header>
      {overview.activities.length ? <ul>{overview.activities.slice(0, 3).map(activity => <li key={activity.id}>
        <button type="button" className="overview-activity-row" aria-label={`${activity.title}: ${activity.detail} · ${formatTime(activity.date)}`} onClick={() => onOpenActivity?.(activity)} disabled={!onOpenActivity}>
          <span className="overview-activity-copy"><strong>{activity.title}</strong><span>{activity.detail}</span></span>
          <time dateTime={activity.date}>{formatTime(activity.date)}</time><ArrowRight size={15} aria-hidden="true" />
        </button>
      </li>)}</ul> : <p className="overview-activity-empty">No activity yet. Updates will appear as you work on this project.</p>}
    </section>
    {project.providedContractDemo && <details className="contract-scenario-guide">
      <summary><span>About this demo<small>{usesProvidedSource ? 'Provided contract · simulated site activity' : 'Fictional contract · simulated site activity'}</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="contract-scenario-content">
        <p>{usesProvidedSource ? `${project.items.length} representative contract rows and the supplied site plan. The sample contains selected rows, not the full work list. Site activity, dates, photos, approvals and claim assessments are simulated.` : `${project.items.length} fictional contract rows and an illustrative campus plan. All values, parties, site activity and claim assessments are demo data.`}</p>
        <p>The demo starts with a checked contract baseline and a saved example claim. {showcaseExamples.available ? 'The newer examples are included here; opening them keeps you in this project.' : showcaseExamples.reason || ''}</p>
        <ol>
          <li><strong>Contract:</strong> compare W3 and W5 items with the {usesProvidedSource ? 'supplied' : 'fictional'} schedule.</li>
          <li><strong>Drawing:</strong> select an area for its work, messages, photos and VO flags. Pins are illustrative manual links.{showcaseExamples.available && ' D.5 includes two unplaced demo zones, with 90 brackets each and separate completion.'}</li>
          <li><strong>Site updates:</strong> review messages, photos and voice notes; correct transcripts and matches before adding progress. Clarify unclear recordings and shared area names, then verify separately on desktop or mobile.</li>
          <li><strong>Extra work:</strong> check the scope query, recorded approval and included-scope rejection. Add manual extra work or preview a mock customer confirmation in the same project.</li>
          <li><strong>Claims:</strong> review the saved example. QS quantities and VO values are mock assessments; physical percentages do not price a claim. Claim status separately simulates submission, queries, revisions, certification and payment.</li>
        </ol>
        <div className="contract-scenario-actions"><Button className="ghost" icon={FileText} onClick={() => onReviewContract ? onReviewContract() : onNavigate('contract')}>Review contract</Button><Button className="ghost" icon={MapPin} onClick={() => onNavigate('drawing')}>Explore the drawing</Button><Button className="ghost" onClick={() => onNavigate('claims')}>View example claim<ArrowRight size={14} /></Button>{showcaseExamples.voiceMessageId && onOpenMessage && <Button className="ghost" onClick={()=>onOpenMessage(showcaseExamples.voiceMessageId!)}>Review voice note<ArrowRight size={14}/></Button>}{showcaseExamples.matchMessageId && onOpenMessage && <Button className="ghost" onClick={()=>onOpenMessage(showcaseExamples.matchMessageId!)}>Review match<ArrowRight size={14}/></Button>}{showcaseExamples.unclearVoiceMessageId && onOpenMessage && <Button className="ghost" onClick={()=>onOpenMessage(showcaseExamples.unclearVoiceMessageId!)}>Clarify recording<ArrowRight size={14}/></Button>}</div>
      </div>
    </details>}
  </section>;
}

export function SiteViewTabs({ view, onNavigate, pending = 0 }: { view: string; onNavigate: (route: string) => void; pending?: number }) {
  return <nav className="site-view-tabs" aria-label="Site updates sections"><button type="button" className={view === 'whatsapp' ? 'current' : ''} aria-current={view === 'whatsapp' ? 'page' : undefined} onClick={() => onNavigate('whatsapp')}>Messages</button><button type="button" className={view === 'completion' ? 'current' : ''} aria-current={view === 'completion' ? 'page' : undefined} onClick={() => onNavigate('completion')}>Progress{pending > 0 && <span>{pending} to check</span>}</button></nav>;
}
