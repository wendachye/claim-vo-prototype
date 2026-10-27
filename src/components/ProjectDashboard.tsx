import type { AttentionTarget, Project } from '../types/domain';
import { getProjectDashboard } from '../data/project-dashboard';
import { ProjectDashboardSummary } from './ProjectDashboardSummary';
import { DashboardAnalytics } from './DashboardAnalytics';
import { PageHeader } from './ui';
import './project-dashboard.css';

export function ProjectDashboard({ project, onNavigate, onOpenRecord }: {
  project: Project; onNavigate: (route: string) => void; onOpenRecord: (target: AttentionTarget) => void;
}) {
  const dashboard = getProjectDashboard(project);
  return <section className="project-dashboard">
    <PageHeader title="Dashboard" description="Your latest claim and extra work at a glance."/>
    <DashboardAnalytics dashboard={dashboard} onNavigate={onNavigate} onOpenRecord={onOpenRecord}/>
    <ProjectDashboardSummary dashboard={dashboard} onNavigate={onNavigate} onOpenRecord={onOpenRecord}/>
  </section>;
}
