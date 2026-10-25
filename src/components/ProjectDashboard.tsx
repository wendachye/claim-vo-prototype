import type { AttentionTarget, Project } from '../types/domain';
import { ArrowRight } from 'lucide-react';
import { getProjectDashboard } from '../data/project-dashboard';
import { ProjectDashboardSummary } from './ProjectDashboardSummary';
import { Button, PageHeader } from './ui';
import './project-dashboard.css';

export function ProjectDashboard({ project, onNavigate, onOpenRecord }: {
  project: Project; onNavigate: (route: string) => void; onOpenRecord: (target: AttentionTarget) => void;
}) {
  const dashboard = getProjectDashboard(project);
  return <section className="project-dashboard">
    <PageHeader title="Dashboard" description="Monthly claims and extra work for your selected project."
      actions={<Button className="ghost" onClick={() => onNavigate('projects')}>Project overview<ArrowRight size={15}/></Button>}/>
    <ProjectDashboardSummary dashboard={dashboard} onNavigate={onNavigate} onOpenRecord={onOpenRecord}/>
  </section>;
}
