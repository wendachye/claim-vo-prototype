import type { ReactNode } from 'react';
import type { AttentionTarget } from '../types/domain';
import type { getProjectDashboard } from '../data/project-dashboard';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, ClipboardCheck, FileText, Flag } from 'lucide-react';
import { Badge, formatMoney } from './ui';
import { periodLabel } from './claim-view-utils';

type Dashboard = ReturnType<typeof getProjectDashboard>;

function MonetaryValue({ value, currency }: { value: number | null; currency: string | null }) {
  return value === null ? <>Not recorded</> : <><span className="dashboard-kpi-currency">{currency || 'Currency unknown'}</span>{formatMoney(value)}</>;
}

function KPICard({ label, value, note, icon: Icon, actionLabel, actionText, onOpen }: {
  label: string; value: ReactNode; note: ReactNode; icon: LucideIcon;
  actionLabel: string; actionText: string; onOpen?: () => void;
}) {
  return <article className="dashboard-kpi" aria-label={label}>
    <button type="button" className="dashboard-kpi-link" aria-label={actionLabel} disabled={!onOpen} onClick={onOpen}>
      <span className="dashboard-kpi-top"><span className="dashboard-kpi-label">{label}</span><span className="dashboard-kpi-icon"><Icon size={18} aria-hidden="true" /></span></span>
      <strong className="dashboard-kpi-value">{value}</strong>
      <span className="dashboard-kpi-note">{note}</span>
      <span className="dashboard-kpi-action">{actionText}<ArrowRight size={14} aria-hidden="true" /></span>
    </button>
  </article>;
}

export function DashboardAnalytics({ dashboard, onNavigate, onOpenRecord }: {
  dashboard: Dashboard; onNavigate?: (route: string) => void; onOpenRecord?: (target: AttentionTarget) => void;
}) {
  const { latestClaim, vo, contract } = dashboard;
  const latestTone = latestClaim?.status === 'paid' ? 'green' : latestClaim?.status === 'queried' ? 'amber' : latestClaim?.status === 'draft' ? 'slate' : 'blue';
  return <section className="dashboard-kpi-grid" aria-label="Project summary">
    <KPICard label="Latest claim" value={<MonetaryValue value={latestClaim?.amount ?? null} currency={latestClaim?.currency ?? null} />}
      note={latestClaim ? <>{periodLabel(latestClaim.period)}<Badge tone={latestTone}>{latestClaim.statusLabel}</Badge>{latestClaim.netAmount && <span>Net</span>}</> : 'No saved claim yet'}
      icon={FileText} actionLabel={latestClaim ? `Open latest claim: ${periodLabel(latestClaim.period)}, version ${latestClaim.revision}, ${latestClaim.statusLabel}` : 'Open monthly claims'}
      actionText={latestClaim ? 'View claim' : 'Open monthly claims'} onOpen={latestClaim ? onOpenRecord ? () => onOpenRecord(latestClaim.target) : undefined : onNavigate ? () => onNavigate('claims') : undefined} />
    <KPICard label="Extra work to review" value={vo.reviewCount} note="Cases waiting for QS review" icon={Flag}
      actionLabel="Review extra work" actionText="Review extra work" onOpen={onNavigate ? () => onNavigate('vo') : undefined} />
    <KPICard label="Claim-eligible extra work" value={<MonetaryValue value={vo.eligibleValue} currency={contract.currency} />}
      note={`${vo.eligibleCount} ${vo.eligibleCount === 1 ? 'case' : 'cases'} passed QS checks`} icon={ClipboardCheck}
      actionLabel="View claim-eligible extra work" actionText="View extra work" onOpen={onNavigate ? () => onNavigate('vo') : undefined} />
  </section>;
}
