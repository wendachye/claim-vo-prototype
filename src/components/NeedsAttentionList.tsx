import type { Project, AttentionTask } from '../types/domain';
import { CheckCheck, ChevronRight } from 'lucide-react';
import { getProjectAttention } from '../data/project-attention';
import { periodLabel } from './claim-view-utils';
import './needs-attention.css';

function taskCopy(project: Project, task: AttentionTask) {
  if (task.category === 'claims') {
    const draft = project.claimDrafts?.find(entry => entry.id === task.target.draftId);
    return { title: task.title, detail: draft ? `${periodLabel(draft.period)} · Version ${draft.revision}` : task.detail };
  }
  if (task.category === 'vo') {
    const title = task.statusLabel === 'Awaiting approval' ? 'Review extra work approval' : task.statusLabel === 'Needs information' ? 'Clarify extra work' : /^possible extra work/i.test(task.title) ? 'Review extra work' : task.title;
    return { title, detail: task.detail };
  }
  const message = project.whatsappMessages?.find(entry => entry.id === task.target.messageId);
  const report = project.reports?.find(entry => entry.id === task.target.reportId);
  const item = project.items?.find(entry => entry.id === (task.target.itemId || message?.itemId));
  const source = message || report;
  const detail = [...new Set([source?.area || source?.location, item?.ref].filter(Boolean))].join(' · ');
  return { title: task.title, detail: detail || task.detail };
}

export function NeedsAttentionList({ project, tasks: providedTasks, onOpen }: { project: Project; tasks?: AttentionTask[]; onOpen?: (task: AttentionTask) => void }) {
  const tasks = (providedTasks || getProjectAttention(project)).filter(task => task.projectId === project.id);
  return <section className="needs-attention" aria-label="Needs attention">
    {tasks.length ? <ul className="attention-list">{tasks.map(task => {
      const copy = taskCopy(project, task);
      return <li key={task.id}><button type="button" className="attention-task" disabled={!onOpen} aria-label={`${task.actionLabel}: ${task.reference || task.title}`} onClick={() => onOpen?.(task)}>
        <span><strong>{copy.title}</strong><small>{copy.detail}</small></span><ChevronRight size={16} aria-hidden="true" />
      </button></li>;
    })}</ul> : <div className="attention-empty"><CheckCheck size={20} aria-hidden="true" /><span>{project.items?.length ? 'All caught up' : 'No pending records yet'}</span></div>}
  </section>;
}
