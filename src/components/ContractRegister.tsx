import type { WorkItem } from '../types/domain';
import { useId, useRef } from 'react';
import { ChevronRight, CircleAlert, Search, X } from 'lucide-react';
import { Badge, Button, FormField, formatMoney, formatNumber, Input, SelectField } from './ui';
import './contract-workspace.css';

interface FilterProps { items: WorkItem[]; reviewItemIds?: Set<string>; resultCount: number; search: string; block: string; filter: string; blocks: string[]; onSearch: (value: string) => void; onBlock: (value: string) => void; onFilter: (value: string) => void; onClear: () => void }

export function ContractFilters({ items, reviewItemIds, resultCount, search, block, filter, blocks, onSearch, onBlock, onFilter, onClear }: FilterProps) {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const needsReview = (item: WorkItem) => reviewItemIds ? reviewItemIds.has(item.id) : item.needsReview;
  const reviewCount = items.filter(needsReview).length;
  const hasFilters = Boolean(search) || block !== 'all' || filter !== 'all';
  return <div className="contract-controls">
    <div className="contract-filter-bar" role="region" aria-label="Contract filters">
      <div className="form-field contract-search-field"><label className="form-field-label" htmlFor={searchId}>Search</label><div className="search-box"><Search size={16} aria-hidden="true" /><Input ref={searchRef} id={searchId} aria-label="Search work items" placeholder="Search work items…" value={search} onChange={(event) => onSearch(event.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => { onSearch(''); searchRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button>}</div></div>
      <FormField label="Location"><SelectField aria-label="Filter by block" value={block} onChange={(event) => onBlock(event.target.value)}><option value="all">All blocks</option>{blocks.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField></FormField>
      <FormField label="Review status"><SelectField aria-label="Filter contract review status" value={filter} onChange={(event) => onFilter(event.target.value)}><option value="all">All items ({items.length})</option><option value="review">Needs review ({reviewCount})</option><option value="verified">Reviewed ({items.length - reviewCount})</option></SelectField></FormField>
    </div>
    {(hasFilters || reviewCount > 0) && <div className="contract-list-tools"><div>{hasFilters && <span role="status">{resultCount} of {items.length} work items</span>}{reviewCount > 0 && <Button className="ghost contract-review-shortcut" aria-pressed={filter === 'review'} onClick={() => { onSearch(''); onBlock('all'); onFilter('review'); }}><CircleAlert size={14} aria-hidden="true" />Needs review ({reviewCount})</Button>}</div>{hasFilters && <Button className="ghost" onClick={() => { onClear(); searchRef.current?.focus(); }}>Clear all</Button>}</div>}
  </div>;
}

export function ContractRegister({ items, reviewItemIds, currencySymbol, onReview }: { items: WorkItem[]; reviewItemIds?: Set<string>; currencySymbol: string; onReview: (item: WorkItem) => void }) {
  const reviewStatusId = useId();
  return <div className="contract-register"><table className="data-table contract-table">
    <thead><tr><th>Work item</th><th className="amount">Quantity</th><th className="amount">Rate ({currencySymbol})</th><th className="amount">Amount ({currencySymbol})</th><th>Review</th></tr></thead>
    <tbody>{items.map((item) => {
      const requiresReview = reviewItemIds ? reviewItemIds.has(item.id) : item.needsReview;
      return <tr key={item.id} className="table-row" onClick={() => onReview(item)}>
        <td className="contract-work-item"><div className="cell-primary">{item.description}</div><div className="cell-secondary contract-item-reference" title={item.subsection || undefined}>Ref. <span className="mono">{item.ref || 'Not recorded'}</span><span aria-hidden="true"> · </span><span>{item.location || 'Not specified'}</span></div></td>
        <td className={`amount contract-quantity${item.needsReview ? ' text-amber' : ''}`}><span className="contract-card-label">Quantity</span><strong>{formatNumber(item.needsReview ? item.rawExtractedQuantity ?? item.quantity : item.quantity)} <small>{item.unit}</small></strong>{item.needsReview && <CircleAlert size={13} aria-label={item.extractionRecovery?.method === 'manual' ? 'Check manual entry against source' : 'Check source quantity'} />}</td>
        <td className="amount contract-rate"><span className="contract-card-label">Rate ({currencySymbol})</span>{formatMoney(item.rate)}</td>
        <td className="amount contract-amount"><span className="contract-card-label">Amount ({currencySymbol})</span>{item.pricingType === 'measured' ? formatMoney(item.amount) : <Badge>{item.pricingType === 'included' ? 'Included' : 'Rate only'}</Badge>}</td>
        <td className="contract-review-action"><Button className={`contract-row-action ${requiresReview ? 'contract-check-button' : 'ghost'}`} aria-label={`Review ${item.id}`} aria-describedby={`${reviewStatusId}-${item.id}`} onClick={(event) => { event.stopPropagation(); onReview(item); }}>{requiresReview && <CircleAlert size={14} aria-hidden="true" />}<span>{requiresReview ? 'Review' : 'View'}</span><span id={`${reviewStatusId}-${item.id}`} className="sr-only">{requiresReview ? 'Needs review' : 'Reviewed'}</span><ChevronRight size={14} aria-hidden="true" /></Button></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
