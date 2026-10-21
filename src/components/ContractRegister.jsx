import { useId } from 'react';
import { Check, ChevronRight, CircleAlert, Download, MessageSquare, Search, X } from 'lucide-react';
import { getAreasForItem } from '../data/drawing-mapping.js';
import { getWorkItemSiteMessage } from '../data/contract-work-links.js';
import { Badge, Button, FormField, formatMoney, formatNumber, Input, NativeSelect } from './ui.jsx';
import './contract-workspace.css';

export function ContractFilters({ items, resultCount, search, block, filter, blocks, onSearch, onBlock, onFilter, onClear, onExport }) {
  const searchId = useId();
  return <div className="contract-controls">
    <div className="contract-filter-fields">
      <div className="form-field"><label className="form-field-label" htmlFor={searchId}>Find work</label><div className="search-box"><Search size={16} aria-hidden="true" /><Input id={searchId} aria-label="Search work items" placeholder="Search work items or areas…" value={search} onChange={(event) => onSearch(event.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => onSearch('')}><X size={14} /></button>}</div></div>
      <FormField label="Block / location"><NativeSelect aria-label="Filter by block" value={block} onChange={(event) => onBlock(event.target.value)}><option value="all">All blocks</option>{blocks.map((value) => <option key={value} value={value}>{value}</option>)}</NativeSelect></FormField>
      <FormField label="Review status"><NativeSelect aria-label="Filter contract review status" value={filter} onChange={(event) => onFilter(event.target.value)}><option value="all">All items ({items.length})</option><option value="review">Needs review ({items.filter((item) => item.needsReview).length})</option><option value="verified">Reviewed ({items.filter((item) => !item.needsReview).length})</option></NativeSelect></FormField>
    </div>
    <div className="contract-list-tools"><span>{resultCount} of {items.length} work items</span><div>{(search || block !== 'all' || filter !== 'all') && <Button className="ghost" onClick={onClear}>Clear filters</Button>}<Button className="ghost" icon={Download} onClick={onExport}>Export CSV</Button></div></div>
  </div>;
}

export function ContractRegister({ project, items, currencySymbol, onReview, onOpenMessage }) {
  return <div className="contract-register"><table className="data-table contract-table">
    <thead><tr><th>Work item</th><th>Location / area</th><th className="amount">Quantity</th><th className="amount">Rate ({currencySymbol})</th><th className="amount">Amount ({currencySymbol})</th><th>Review</th></tr></thead>
    <tbody>{items.map((item) => {
      const areas = getAreasForItem(project, item.id);
      return <tr key={item.id} className="table-row" onClick={() => onReview(item)}>
        <td className="contract-work-item"><div className="cell-primary">{item.description}</div><div className="cell-secondary mono">{item.ref} · {item.id}</div><div className="contract-subsection">{item.subsection}</div></td>
        <td className="contract-location"><span>{item.location || 'Not specified'}</span><div className="contract-area-links">{areas.map((area) => <a key={area.id} className="area-mapping-link" href={`#drawing?area=${encodeURIComponent(area.id)}`} title={area.name} aria-label={`View area ${area.code} mapping`} onClick={(event) => event.stopPropagation()}>Area {area.code}</a>)}</div>{getWorkItemSiteMessage(project, item.id) && <button type="button" className="contract-site-message-link" aria-label={`Open site update for ${item.ref}`} onClick={(event) => { event.stopPropagation(); onOpenMessage(item.id); }}><MessageSquare size={13} />Site update</button>}</td>
        <td className={`amount contract-quantity${item.needsReview ? ' text-amber' : ''}`}><span className="contract-card-label">Quantity</span><strong>{formatNumber(item.needsReview ? item.rawExtractedQuantity ?? item.quantity : item.quantity)} <small>{item.unit}</small></strong>{item.needsReview && <CircleAlert size={13} aria-label="Check source quantity" />}</td>
        <td className="amount contract-rate"><span className="contract-card-label">Rate ({currencySymbol})</span>{formatMoney(item.rate)}</td>
        <td className="amount contract-amount"><span className="contract-card-label">Amount ({currencySymbol})</span>{item.pricingType === 'measured' ? formatMoney(item.amount) : <Badge>{item.pricingType === 'included' ? 'Included' : 'Rate only'}</Badge>}</td>
        <td className="contract-review-action"><Badge tone={item.needsReview ? 'amber' : 'green'}>{item.needsReview ? <CircleAlert size={11} /> : <Check size={11} />}{item.needsReview ? 'Needs review' : 'Reviewed'}</Badge><Button className={item.needsReview ? 'contract-check-button' : 'ghost'} aria-label={`Review ${item.id}`} onClick={(event) => { event.stopPropagation(); onReview(item); }}>{item.needsReview ? 'Check item' : 'View item'}<ChevronRight size={14} /></Button></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
