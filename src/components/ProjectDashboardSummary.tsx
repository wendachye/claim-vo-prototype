import type { AttentionTarget } from '../types/domain';
import type { getProjectDashboard } from '../data/project-dashboard';
import { ArrowRight } from 'lucide-react';
import { Badge, Button, formatMoney } from './ui';
import { periodLabel } from './claim-view-utils';
import './project-dashboard.css';

type Dashboard = ReturnType<typeof getProjectDashboard>;
const money = (value: number | null, currency: string | null) => value === null ? 'Not recorded' : `${currency || 'Currency not recorded'} ${formatMoney(value)}`;
const claimTone = (status: string) => status === 'paid' ? 'green' : status === 'queried' ? 'amber' : ['prepared', 'submitted', 'certified'].includes(status) ? 'blue' : 'slate';

export function ProjectDashboardSummary({ dashboard, onNavigate, onOpenRecord }: {
  dashboard: Dashboard; onNavigate: (route: string) => void; onOpenRecord?: (target: AttentionTarget) => void;
}) {
  return <section className="dashboard-panel" aria-labelledby="dashboard-claims-heading">
    <header className="dashboard-panel-header"><h2 id="dashboard-claims-heading">Recent claims</h2><Button className="ghost" aria-label="View all monthly claims" onClick={() => onNavigate('claims')}>View all claims<ArrowRight size={14} aria-hidden="true" /></Button></header>
    {dashboard.claims.length ? <ul className="dashboard-records">{dashboard.claims.slice(0, 3).map(claim => <li key={claim.id}>
      <button type="button" className="dashboard-record" disabled={!onOpenRecord} onClick={() => onOpenRecord?.(claim.target)} aria-label={`Open ${periodLabel(claim.period)} claim, version ${claim.revision}, ${claim.statusLabel}`}>
        <span className="dashboard-record-title">{periodLabel(claim.period)}<Badge tone={claimTone(claim.status)}>{claim.statusLabel}</Badge></span>
        <strong className="dashboard-claim-amount">{money(claim.amount, claim.currency)}</strong>
        <ArrowRight size={16} className="dashboard-record-arrow" aria-hidden="true" />
      </button>
    </li>)}</ul> : <div className="dashboard-empty"><strong>No saved claims yet</strong><p>Open Monthly claims to prepare your first claim.</p></div>}
  </section>;
}
