import { useId } from 'react';
import { Check, ChevronRight, Clock3, Flag, History, Search, X } from 'lucide-react';
import { getAreasForItem, getDrawingMapping } from '../data/drawing-mapping.js';
import { getItemProgressReview } from '../data/progress-review.js';
import { Badge, Button, FormField, formatNumber, formatTime, Input, NativeSelect } from './ui.jsx';
import './progress-register.css';

const hasTotal = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

function ProgressTotal({ value, verified = false }) {
  if (!hasTotal(value)) return <span className="progress-not-recorded">Not recorded</span>;
  return <div className="progress-cell"><span className="progress-number">{formatNumber(value)}<small>%</small></span><div className="progress-track" aria-hidden="true"><div className={`progress-fill ${verified ? 'verified' : 'reported'}`} style={{ width: `${value}%` }}/></div></div>;
}

export function ProgressFilters({ project, items, search, block, filter, blocks, onSearch, onBlock, onFilter, onClear, onActivity, onExtraWork, extraWorkCount }) {
  const searchId = useId();
  const reviews = items.map((item) => getItemProgressReview(project, item));
  const count = (key) => reviews.filter((review) => review.key === key).length;
  const options = [
    ['all', 'All work items', items.length],
    ['review', 'To check', count('review')],
    ['clarification', 'Needs clarification', count('clarification')],
    ['verified', 'Checked progress', count('verified')],
    ['rejected', 'Update rejected', count('rejected')],
  ];
  return <div className="progress-controls">
    <div className="progress-filter-fields">
      <div className="form-field"><label className="form-field-label" htmlFor={searchId}>Find work</label><div className="search-box"><Search size={16} aria-hidden="true"/><Input id={searchId} aria-label="Search completion list" placeholder="Search work items or areas…" value={search} onChange={(event) => onSearch(event.target.value)}/>{search && <button type="button" aria-label="Clear search" onClick={() => onSearch('')}><X size={14}/></button>}</div></div>
      <FormField label="Block / location"><NativeSelect value={block} onChange={(event) => onBlock(event.target.value)}><option value="all">All blocks</option>{blocks.map((value) => <option key={value} value={value}>{value}</option>)}</NativeSelect></FormField>
      <FormField label="Review status"><NativeSelect value={filter} onChange={(event) => onFilter(event.target.value)}>{options.map(([key, label, total]) => <option key={key} value={key}>{label} ({total})</option>)}{filter === 'vo' && <option value="vo">Extra work</option>}</NativeSelect></FormField>
    </div>
    <div className="progress-list-tools">
      <span>Totals are for the whole work item.</span>
      <div>{(search || block !== 'all' || filter !== 'all') && <Button className="ghost" onClick={onClear}>Clear filters</Button>}<Button className="ghost" icon={Flag} onClick={onExtraWork}>Extra work ({extraWorkCount})</Button><Button className="ghost" icon={History} onClick={onActivity}>Activity</Button></div>
    </div>
  </div>;
}

export function ProgressRegister({ project, items, onReview }) {
  const drawing = getDrawingMapping(project).drawing;
  return <div className="site-progress-container"><table className="data-table site-progress-table">
    <thead><tr><th>Work item</th><th>Location / area</th><th>Reported total</th><th>Verified total</th><th>Review status</th><th>Latest update</th><th><span className="sr-only">Action</span></th></tr></thead>
    <tbody>{items.map((item) => {
      const review = getItemProgressReview(project, item);
      const report = review.report;
      const areas = getAreasForItem(project, item.id);
      const open = () => onReview(item, report);
      const date = report?.date && !Number.isNaN(new Date(report.date).getTime()) ? formatTime(report.date) : 'Date not recorded';
      return <tr key={item.id} className="table-row" onClick={open}>
        <td className="progress-item"><div className="cell-primary">{item.description}</div><div className="cell-secondary mono">{item.id} · {item.ref}</div></td>
        <td className="progress-location"><span>{item.location}</span><div className="progress-area-links">{areas.length ? areas.map((area) => <a key={area.id} className="area-mapping-link" href={`#drawing?area=${encodeURIComponent(area.id)}`} title={area.name} aria-label={`View area ${area.code}: ${area.name}`} onClick={(event) => event.stopPropagation()}>Area {area.code}</a>) : <span className="cell-secondary">{drawing ? 'Not mapped' : item.demoArea ? `${item.demoArea} (demo)` : 'Not mapped'}</span>}</div></td>
        <td className="progress-reported"><span className="progress-card-label">Reported total</span><ProgressTotal value={item.reported}/></td>
        <td className="progress-verified"><span className="progress-card-label">Verified total</span><ProgressTotal value={item.verified} verified/></td>
        <td className="progress-review-status"><Badge tone={review.tone}>{review.key === 'review' || review.key === 'clarification' ? <Clock3 size={11} aria-hidden="true"/> : review.checked ? <Check size={11} aria-hidden="true"/> : null}{review.label}</Badge></td>
        <td className="progress-latest">{report ? <><span className="progress-source">{report.channel === 'whatsapp-mock' || report.sourceMessageId ? 'WhatsApp update' : 'Site update'}</span><time dateTime={report.date || undefined}>{date}</time></> : <span className="cell-secondary">No site update yet</span>}</td>
        <td className="progress-action"><Button className={review.key === 'review' ? 'progress-review-button' : 'ghost'} aria-label={`${review.actionLabel} for ${item.id}`} onClick={(event) => { event.stopPropagation(); open(); }}>{review.actionLabel}<ChevronRight size={14} aria-hidden="true"/></Button></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
