import type { AttentionTarget } from '../types/domain';
import type { ReactNode } from 'react';
import type { getProjectDashboard } from '../data/project-dashboard';
import { ArrowRight } from 'lucide-react';
import { Badge, Button, formatMoney } from './ui';
import { periodLabel } from './claim-view-utils';
import './project-dashboard.css';

type Dashboard = ReturnType<typeof getProjectDashboard>;
const money = (value: number | null, currency: string | null) => value === null ? 'Not recorded' : `${currency || 'Currency not recorded'} ${formatMoney(value)}`;
const claimTone = (status: string) => status === 'paid' ? 'green' : status === 'queried' ? 'amber' : ['prepared', 'submitted', 'certified'].includes(status) ? 'blue' : 'slate';

export function ProjectSummaryMetric({ step, dashboard }: { step: string; dashboard: Dashboard }) {
  const amount = (value: number | null, currency: string | null) => value === null ? 'Not recorded'
    : <><span className="overview-currency">{currency || 'Currency unknown'}</span>{formatMoney(value)}</>;
  if (step === 'contract') return <span className="overview-step-metric">
    {amount(dashboard.contract.declaredValue, dashboard.contract.currency)}
    <small>Declared contract value{dashboard.contract.partialSchedule && ' · partial schedule'}</small>
  </span>;
  if (step === 'site') return <span className="overview-step-metric">
    {dashboard.site.completed}<span className="overview-currency"> / {dashboard.site.total}</span>
    <small>Measured items fully verified{dashboard.site.unknown > 0 && ` · ${dashboard.site.unknown} unknown`}</small>
    {dashboard.site.total > 0 && <span className="overview-site-bar" aria-hidden="true"><span style={{width:`${dashboard.site.completed / dashboard.site.total * 100}%`}} /></span>}
  </span>;
  if (step === 'vo') return <span className="overview-step-metric">{dashboard.vo.total}<small>Extra-work {dashboard.vo.total === 1 ? 'case' : 'cases'}</small></span>;
  return <span className="overview-step-metric">
    {dashboard.latestClaim ? amount(dashboard.latestClaim.amount, dashboard.latestClaim.currency) : 'No amount yet'}
    <small>Latest saved claim{dashboard.latestClaim?.netAmount && ' · net'}</small>
  </span>;
}

export function ProjectDashboardSummary({ dashboard, onNavigate, onOpenRecord, children }: {
  dashboard: Dashboard; onNavigate: (route: string) => void; onOpenRecord?: (target: AttentionTarget) => void; children?: ReactNode;
}) {
  return <div className="dashboard-summaries">
    <div className="dashboard-main-column">
    <section className="dashboard-panel" aria-labelledby="dashboard-claims-heading">
      <header className="dashboard-panel-header"><div><h2 id="dashboard-claims-heading">Monthly claims</h2><p>Latest saved claim for each month</p></div><Button className="ghost" aria-label="View all monthly claims" onClick={() => onNavigate('claims')}>View all<ArrowRight size={14} /></Button></header>
      {dashboard.claims.length ? <ul className="dashboard-records">{dashboard.claims.map(claim => <li key={claim.id}>
        <button type="button" className="dashboard-record" disabled={!onOpenRecord} onClick={() => onOpenRecord?.(claim.target)} aria-label={`Open ${periodLabel(claim.period)} claim, version ${claim.revision}, ${claim.statusLabel}`}>
          <span className="dashboard-claim-main"><span className="dashboard-record-title">{periodLabel(claim.period)}<Badge tone={claimTone(claim.status)}>{claim.statusLabel}</Badge></span><strong className="dashboard-claim-amount">{money(claim.amount, claim.currency)}</strong></span>
          {claim.certifiedValue !== null ? <span className="dashboard-record-detail">Certified {money(claim.certifiedValue, claim.currency)}<span>Received {money(claim.paidValue, claim.currency)}</span>{claim.balanceValue !== null && <span>Balance {money(claim.balanceValue, claim.currency)}</span>}</span> : <span className="dashboard-record-detail">{claim.status === 'draft' ? 'Saved assessment' : 'Saved claim amount'}{claim.netAmount && ' · net'} · Open to review {claim.status === 'draft' ? 'and prepare' : 'status'}</span>}
          <ArrowRight size={15} className="dashboard-record-arrow" aria-hidden="true" />
        </button>
      </li>)}</ul> : <div className="dashboard-empty"><strong>No saved claims yet</strong><p>Prepare a claim from verified work and eligible extra work.</p><Button className="ghost" onClick={() => onNavigate('claims')}>Prepare a claim<ArrowRight size={14} /></Button></div>}
      {!!dashboard.claims.length && <p className="dashboard-panel-note">Amounts belong to individual saved claims. Status and payments are simulated.</p>}
    </section>
    {children}
    </div>
    <section className="dashboard-panel" aria-labelledby="dashboard-vo-heading">
      <header className="dashboard-panel-header"><div><h2 id="dashboard-vo-heading">Extra work</h2><p>Price approval and claim readiness</p></div><Button className="ghost" aria-label="View all extra work" onClick={() => onNavigate('vo')}>View all<ArrowRight size={14} /></Button></header>
      {dashboard.vo.total ? <>
        <dl className="dashboard-vo-values"><div><dt>{dashboard.vo.approvedUnknownCount > 0 ? 'Known approved prices' : 'Price approved'}</dt><dd>{money(dashboard.vo.approvedValue, dashboard.contract.currency)}</dd><small>{dashboard.vo.approvedCount} {dashboard.vo.approvedCount === 1 ? 'case' : 'cases'}{dashboard.vo.approvedUnknownCount > 0 && ` · ${dashboard.vo.approvedUnknownCount} with no price`}</small></div><div><dt>Eligible for claim</dt><dd>{money(dashboard.vo.eligibleValue, dashboard.contract.currency)}</dd><small>{dashboard.vo.eligibleCount} {dashboard.vo.eligibleCount === 1 ? 'case' : 'cases'} passed QS checks</small></div></dl>
        <div className="dashboard-vo-counts"><span><i aria-hidden="true" />{dashboard.vo.reviewCount} to review</span><span>{dashboard.vo.rejectedCount} rejected</span></div>
        <ul className="dashboard-records dashboard-vo-records">{dashboard.vo.items.map(entry => <li key={entry.id}><button type="button" className="dashboard-record" disabled={!onOpenRecord} onClick={() => onOpenRecord?.(entry.target)} aria-label={`Open extra work: ${entry.title}`}><span className="dashboard-record-title">{entry.title}</span><span className="dashboard-record-detail">{entry.label}{entry.amount !== null && <span>{money(entry.amount, dashboard.contract.currency)}</span>}</span><ArrowRight size={15} className="dashboard-record-arrow" aria-hidden="true" /></button></li>)}</ul>
        <p className="dashboard-panel-note">An approved price needs separate QS checks before it can be claimed.</p>
      </> : <div className="dashboard-empty"><strong>No extra work recorded</strong><p>Flag a site message or add extra work for QS review.</p><Button className="ghost" onClick={() => onNavigate('vo')}>Open extra work<ArrowRight size={14} /></Button></div>}
    </section>
  </div>;
}
