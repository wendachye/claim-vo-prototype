import type { InputNumber } from '../types/domain';
import type { ClaimSnapshot, ClaimRow } from '../types/claims';
import { formatMoney } from './ui';

export const periodLabel = (period: string | null | undefined) => /^\d{4}-\d{2}$/.test(period || '') ? new Date(`${period}-01T12:00:00`).toLocaleDateString('en-SG', { month: 'long', year: 'numeric' }) : 'Choose a month';
export const amount = (value: InputNumber | undefined) => value == null || value === '' ? '—' : formatMoney(value);
export const selectedRows = (snapshot: ClaimSnapshot | null | undefined): ClaimRow[] => [...(snapshot?.workRows || []), ...(snapshot?.voRows || [])].filter((row) => row.included);
