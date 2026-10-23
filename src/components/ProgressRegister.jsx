import { useId } from 'react';
import { Check, ChevronRight, Clock3, Flag, History, Plus, Search, X } from 'lucide-react';
import { getAreasForItem, getDrawingMapping } from '../data/drawing-mapping.js';
import { getItemProgressReview } from '../data/progress-review.js';
import { Button, FormField, formatNumber, formatTime, Input, SelectField } from './ui.jsx';
import './progress-register.css';
import { ActionMenu } from './ActionMenu.jsx';

const hasTotal = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const reviewLabel = (review) => review.key === 'review' ? 'Needs verification' : review.key === 'verified' ? 'Verified progress' : review.label;

function ProgressTotal({ value, verified = false }) {
  if (!hasTotal(value)) return <span className="progress-not-recorded">Not recorded</span>;
  return <div className="progress-cell"><span className="progress-number">{formatNumber(value)}<small>%</small></span><div className="progress-track" aria-hidden="true"><div className={`progress-fill ${verified ? 'verified' : 'reported'}`} style={{ width: `${value}%` }}/></div></div>;
}

export function ProgressFilters({ project, items, search, block, filter, blocks, onSearch, onBlock, onFilter, onClear, onActivity, onExtraWork, onAdd, extraWorkCount }) {
  const searchId = useId();
  const reviews = items.map((item) => getItemProgressReview(project, item));
  const count = (key) => reviews.filter((review) => review.key === key).length;
  const options = [
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

export function ProgressRegister({ project, items, onReview }) {
  const drawing = getDrawingMapping(project).drawing;
  return <div className="site-progress-container"><table className="data-table site-progress-table">
    <thead><tr><th>Work item / area</th><th>Reported total<small>Worker report</small></th><th>Verified total<small>Supervisor checked</small></th><th>Supervisor review</th></tr></thead>
    <tbody>{items.map((item) => {
      const review = getItemProgressReview(project, item);
      const report = review.report;
      const areas = getAreasForItem(project, item.id);
      const open = () => onReview(item, report);
      const date = report?.date && !Number.isNaN(new Date(report.date).getTime()) ? formatTime(report.date) : 'Date not recorded';
      return <tr key={item.id} className="table-row" onClick={open}>
        <td className="progress-item"><div className="cell-primary">{item.description}</div><div className="cell-secondary">Ref. {item.ref}</div><div className="progress-location"><span>{item.location}</span><div className="progress-area-links">{areas.length ? areas.map((area) => <a key={area.id} className="area-mapping-link" href={`#drawing?area=${encodeURIComponent(area.id)}`} title={area.name} aria-label={`View area ${area.code}: ${area.name}`} onClick={(event) => event.stopPropagation()}>Area {area.code}</a>) : <span className="cell-secondary">{drawing ? 'Not mapped' : item.demoArea ? `${item.demoArea} (demo)` : 'Not mapped'}</span>}</div></div></td>
        <td className="progress-reported"><span className="progress-card-label">Reported total<small>Worker report</small></span><ProgressTotal value={item.reported}/></td>
        <td className="progress-verified"><span className="progress-card-label">Verified total<small>Supervisor checked</small></span><ProgressTotal value={item.verified} verified/></td>
        <td className="progress-action"><Button className={review.key === 'review' ? 'progress-review-button' : 'ghost'} aria-label={`${review.actionLabel} for ${item.id}`} onClick={(event) => { event.stopPropagation(); open(); }}><span><span className={`progress-review-label ${review.tone}`}>{review.key === 'review' || review.key === 'clarification' ? <Clock3 size={12} aria-hidden="true"/> : review.checked ? <Check size={12} aria-hidden="true"/> : null}{reviewLabel(review)}</span><span className="progress-review-action">{review.actionLabel}<ChevronRight size={14} aria-hidden="true"/></span></span></Button>{report && <time className="progress-latest" dateTime={report.date || undefined} title="Latest site update">Update · {date}</time>}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}
