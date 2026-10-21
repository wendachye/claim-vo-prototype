import { formatMoney } from './ui.jsx';

export const periodLabel = (period) => /^\d{4}-\d{2}$/.test(period || '') ? new Date(`${period}-01T12:00:00`).toLocaleDateString('en-SG', { month: 'long', year: 'numeric' }) : 'Choose a month';
export const amount = (value) => value == null || value === '' ? '—' : formatMoney(value);
export const selectedRows = (snapshot) => [...(snapshot?.workRows || []), ...(snapshot?.voRows || [])].filter((row) => row.included);
