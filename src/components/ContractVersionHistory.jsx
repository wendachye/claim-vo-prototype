import { ChevronDown } from 'lucide-react';
import { getContractVersions } from '../data/contract-versions.js';
import { Badge, Button, Modal } from './ui.jsx';
import './contract-versions.css';

const isUnknown = value => value === null || value === undefined;
const numberFields = new Set(['quantity', 'rate', 'amount', 'durationMonths', 'sourcePage']);
const moneyFields = new Set(['rate', 'amount']);
const pricingLabels = { measured: 'Measured', included: 'Included', rateOnly: 'Rate only', provisional: 'Provisional' };

function formattedValue(value, field, currency) {
  if (isUnknown(value)) return 'Unknown';
  if (typeof value === 'string' && value.trim() === '') return 'Not entered';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field === 'pricingType') return pricingLabels[value] || String(value);
  if (numberFields.has(field) && ['number', 'string'].includes(typeof value) && Number.isFinite(Number(value))) {
    const numeric = Number(value).toLocaleString('en-SG', { minimumFractionDigits: moneyFields.has(field) ? 2 : 0, maximumFractionDigits: field === 'amount' ? 2 : 4 });
    return moneyFields.has(field) ? `${currency ? `${currency} ` : ''}${numeric}` : numeric;
  }
  return ['string', 'number'].includes(typeof value) ? String(value) : 'Not recorded';
}

function dateLabel(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Date not recorded';
  return new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function VersionChanges({ entry, currency }) {
  if (!entry.changesAvailable) return <p className="contract-version-note">{entry.version === 1 ? 'Initial version. No earlier snapshot to compare.' : 'Earlier item values were not recorded, so a comparison is unavailable.'}</p>;
  if (!entry.changes.length) return <p className="contract-version-note">No saved item values changed{!entry.locked ? ' yet' : ''}.</p>;
  return <details className="contract-version-changes">
    <summary>View changes <span>{entry.changes.length} {entry.changes.length === 1 ? 'item' : 'items'}</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="contract-version-change-list">{entry.changes.map((change, index) => <section className="contract-version-item" key={`${change.itemId || change.itemRef}-${index}`}>
      <h4>{change.itemRef && <span>{change.itemRef} · </span>}{change.description || 'Work item'}{change.type !== 'changed' && <Badge>{change.type === 'added' ? 'Added' : 'Removed'}</Badge>}</h4>
      <dl>{change.fields.map((field, fieldIndex) => <div className="contract-version-value" key={`${field.field}-${fieldIndex}`}>
        <dt>{field.label}</dt>
        <dd><div><span>Old</span><p>{formattedValue(field.oldValue, field.field, currency)}</p></div><div><span>New</span><p>{formattedValue(field.newValue, field.field, currency)}</p></div></dd>
      </div>)}</dl>
    </section>)}</div>
  </details>;
}

export function ContractVersionHistory({ project, onClose }) {
  const versions = getContractVersions(project);
  return <Modal title="Contract versions" description={project.name} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
    <div className="contract-version-history">
      <p className="contract-version-note">Only changed item values appear below. Saved claims keep the contract version used when they were saved.</p>
      {!versions.length && <p className="contract-version-note">No contract versions are available.</p>}
      <ol className="contract-version-list">{versions.map(entry => <li key={entry.version} className={entry.current ? 'is-current' : ''}>
        <div className="contract-version-heading"><h3>Version {entry.version}</h3>{entry.current && <Badge tone="blue">Current</Badge>}<Badge tone={entry.locked ? 'green' : 'amber'}>{entry.locked ? 'Confirmed' : 'Unconfirmed'}</Badge></div>
        <p className="contract-version-meta">{entry.locked ? 'Confirmed' : 'Created'} {dateLabel(entry.locked ? entry.confirmedAt : entry.createdAt)} · {entry.locked ? entry.confirmedBy || 'Reviewer not recorded' : entry.createdBy || 'Author not recorded'}</p>
        <p className="contract-version-reason"><span>Reason</span>{entry.reason || (entry.current ? 'Not recorded.' : 'Not recorded for this earlier version.')}</p>
        {!entry.locked && <p className="contract-version-note">Unconfirmed changes may still be edited.</p>}
        <VersionChanges entry={entry} currency={project.contract?.currency} />
      </li>)}</ol>
    </div>
  </Modal>;
}
