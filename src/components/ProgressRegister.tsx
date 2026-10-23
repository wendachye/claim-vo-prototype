import type { Project, WorkItem, SiteReport, DrawingArea } from '../types/domain';
import { Fragment, useId } from 'react';
import { Check, ChevronRight, Clock3, Flag, History, Plus, Search, X } from 'lucide-react';
import { getAreasForItem, getDrawingMapping } from '../data/drawing-mapping';
import { getItemProgressReview } from '../data/progress-review';
import { getAreaItemProgress, getItemAreaAllocation, getItemAreaRollup } from '../data/area-allocations';
import { Button, FormField, formatNumber, formatTime, Input, SelectField } from './ui';
import './progress-register.css';
import { ActionMenu } from './ActionMenu';

const hasTotal = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const reviewLabel = (review: ReturnType<typeof getItemProgressReview>) => review.key === 'review' ? 'Needs verification' : review.key === 'verified' ? 'Verified progress' : review.label;

function ProgressTotal({ value, verified = false }: { value?: number | null; verified?: boolean }) {
  if (!hasTotal(value)) return <span className="progress-not-recorded">Not recorded</span>;
  return <div className="progress-cell"><span className="progress-number">{formatNumber(value)}<small>%</small></span><div className="progress-track" aria-hidden="true"><div className={`progress-fill ${verified ? 'verified' : 'reported'}`} style={{ width: `${value}%` }}/></div></div>;
}

interface ProgressFiltersProps { project: Project; items: WorkItem[]; search: string; block: string; filter: string; blocks: string[]; onSearch: (value: string) => void; onBlock: (value: string) => void; onFilter: (value: string) => void; onClear: () => void; onActivity: () => void; onExtraWork: () => void; onAdd?: () => void; extraWorkCount: number }

export function ProgressFilters({ project, items, search, block, filter, blocks, onSearch, onBlock, onFilter, onClear, onActivity, onExtraWork, onAdd, extraWorkCount }: ProgressFiltersProps) {
  const searchId = useId();
  const reviews = items.map((item) => getItemProgressReview(project, item));
  const count = (key: string) => reviews.filter((review) => review.key === key).length;
  const options: [string, string, number][] = [
    ['all', 'All work items', items.length],
    ['review', 'Needs verification', count('review')],
    ['clarification', 'Needs clarification', count('clarification')],
    ['verified', 'Verified progress', count('verified')],
    ['rejected', 'Update rejected', count('rejected')],
  ];
  return <div className="progress-controls">
    <div className="progress-filter-fields">
      <div className="form-field"><label className="form-field-label" htmlFor={searchId}>Find work</label><div className="search-box"><Search size={16} aria-hidden="true"/><Input id={searchId} aria-label="Search completion list" placeholder="Search references, work or areas…" value={search} onChange={(event) => onSearch(event.target.value)}/>{search && <button type="button" aria-label="Clear search" onClick={() => onSearch('')}><X size={14}/></button>}</div></div>
      <FormField label="Block / location"><SelectField value={block} onChange={(event) => onBlock(event.target.value)}><option value="all">All blocks</option>{blocks.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField></FormField>
      <FormField label="Review status"><SelectField value={filter} onChange={(event) => onFilter(event.target.value)}>{options.map(([key, label, total]) => <option key={key} value={key}>{label} ({total})</option>)}</SelectField></FormField>
    </div>
    <div className="progress-list-tools">
      <span>Whole-item totals · claim assessment stays separate.</span>
      <div>{(search || block !== 'all' || filter !== 'all') && <Button className="ghost" onClick={onClear}>Clear filters</Button>}<ActionMenu items={[onAdd && {label:'Add demo update',icon:Plus,onSelect:onAdd},{label:`Extra work (${extraWorkCount})`,icon:Flag,onSelect:onExtraWork},{label:'Activity',icon:History,onSelect:onActivity}]} /></div>
    </div>
  </div>;
}

export function ProgressRegister({ project, items, onReview, areaId }: { project: Project; items: WorkItem[]; onReview: (item: WorkItem, report: SiteReport | null) => void; areaId?: string | null }) {
  const drawing = getDrawingMapping(project).drawing;
  return <div className="site-progress-container"><table className="data-table site-progress-table">
    <thead><tr><th>Work item / area</th><th>Reported total<small>Worker report</small></th><th>Verified total<small>Supervisor checked</small></th><th>Supervisor review</th></tr></thead>
    <tbody>{items.map((item) => {
      const allocation = getItemAreaAllocation(project, item.id);
      const areaContext = allocation.split && areaId;
      const scopedArea = areaContext ? allocation.areas.find(area => area.areaId === areaId) : null;
      const review = getItemProgressReview(project, item, areaContext || undefined);
      const report = review.report;
      const reported = areaContext ? scopedArea ? getAreaItemProgress(project, scopedArea.areaId, item.id, 'reported').completion : null : allocation.split ? getItemAreaRollup(project, item.id, 'reported').completion : item.reported;
      const verified = areaContext ? scopedArea ? getAreaItemProgress(project, scopedArea.areaId, item.id, 'verified').completion : null : allocation.split ? getItemAreaRollup(project, item.id, 'verified').completion : item.verified;
      const areas: DrawingArea[] = getAreasForItem(project, item.id);
      const open = () => onReview(item, report);
      const date = report?.date && !Number.isNaN(new Date(report.date).getTime()) ? formatTime(report.date) : 'Date not recorded';
      return <Fragment key={item.id}><tr className="table-row" onClick={open}>
        <td className="progress-item"><div className="cell-primary">{item.description}</div><div className="cell-secondary">Ref. {item.ref}</div>{allocation.split && <div className="cell-secondary">{scopedArea ? `Area ${scopedArea.code} · ${formatNumber(scopedArea.quantity)} ${item.unit} allocated` : areaContext ? 'Link only · quantity not set' : `${formatNumber(allocation.allocatedQuantity)} of ${formatNumber(allocation.contractQuantity)} ${item.unit} allocated · weighted total`}{!areaContext && allocation.remainingQuantity !== null && allocation.remainingQuantity > 0 && ` · ${formatNumber(allocation.remainingQuantity)} ${item.unit} unallocated`}</div>}<div className="progress-location"><span>{item.location}</span><div className="progress-area-links">{areas.length ? areas.map((area) => <a key={area.id} className="area-mapping-link" href={`#drawing?area=${encodeURIComponent(area.id)}`} title={area.name} aria-label={`View area ${area.code}: ${area.name}`} onClick={(event) => event.stopPropagation()}>Area {area.code}</a>) : <span className="cell-secondary">{drawing ? 'Not mapped' : item.demoArea ? `${item.demoArea} (demo)` : 'Not mapped'}</span>}</div></div></td>
        <td className="progress-reported"><span className="progress-card-label">Reported total<small>Worker report</small></span><ProgressTotal value={reported}/></td>
        <td className="progress-verified"><span className="progress-card-label">Verified total<small>Supervisor checked</small></span><ProgressTotal value={verified} verified/></td>
        <td className="progress-action"><Button className={review.key === 'review' ? 'progress-review-button' : 'ghost'} aria-label={`${review.actionLabel} for ${item.id}`} onClick={(event) => { event.stopPropagation(); open(); }}><span><span className={`progress-review-label ${review.tone}`}>{review.key === 'review' || review.key === 'clarification' ? <Clock3 size={12} aria-hidden="true"/> : review.checked ? <Check size={12} aria-hidden="true"/> : null}{reviewLabel(review)}</span><span className="progress-review-action">{review.actionLabel}<ChevronRight size={14} aria-hidden="true"/></span></span></Button>{report && <time className="progress-latest" dateTime={report.date || undefined} title="Latest site update">Update · {date}</time>}</td>
      </tr>{allocation.split && !areaContext && <tr><td colSpan={4}><details className="progress-area-details"><summary>Area breakdown · {allocation.areas.length} areas</summary>{allocation.areas.map(area => {
        const areaReview = getItemProgressReview(project, item, area.areaId);
        const areaReported = getAreaItemProgress(project, area.areaId, item.id, 'reported');
        const areaVerified = getAreaItemProgress(project, area.areaId, item.id, 'verified');
        return <div className="area-mapping-reference" key={area.areaId}><div><strong>Area {area.code} · {formatNumber(area.quantity)} {item.unit}</strong><p>Reported {hasTotal(areaReported.completion) ? `${formatNumber(areaReported.completion)}%` : 'Not recorded'} · Verified {hasTotal(areaVerified.completion) ? `${formatNumber(areaVerified.completion)}%` : 'Not recorded'}</p></div>{areaReview.report && <Button className="ghost" aria-label={`${areaReview.actionLabel} for area ${area.code} and ${item.id}`} onClick={() => onReview(item, areaReview.report || null)}>{areaReview.actionLabel}<ChevronRight size={14}/></Button>}</div>;
      })}<p className="cell-secondary">Each percentage applies to that area’s allocated quantity. Unknown areas stay unrecorded; claim assessment is separate.</p>{allocation.issues.map(issue => <p className="cell-secondary" key={issue}>{issue}</p>)}</details></td></tr>}</Fragment>;
    })}</tbody>
  </table></div>;
}
