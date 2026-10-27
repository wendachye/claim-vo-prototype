import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VOReviewView } from '../src/components/VOReviewView';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getVOCases } from '../src/data/vo.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

// Isolate list navigation from the separate QS form tests. A live child input
// makes an accidental filter-driven case swap or remount observable.
vi.mock('../src/components/VOCaseReview', () => ({
  voTone: status => status === 'approved' ? 'green' : 'amber',
  voAmountLabel: (value, currency) => value == null || value === '' ? 'Unknown' : `${currency} ${Number(value).toFixed(2)}`,
  VOCaseReview: ({ entry, headingRef }) => {
    const [note, setNote] = useState('');
    return <section aria-label="Selected VO review"><h2 ref={headingRef} tabIndex={-1}>{entry.title}</h2><p>{entry.id}</p><input aria-label="Unfinished case note" value={note} onChange={event => setNote(event.target.value)}/></section>;
  },
}));
const projectIds = new Set();
function fixture() {
  const project = createSITContractDemo({ name: 'VO list test', code: 'VO-LIST' }, new Date('2026-10-22T10:00:00+08:00'));
  projectIds.add(project.id);
  return { project, cases: getVOCases(project) };
}
const selected = () => screen.getByRole('region', { name: 'Selected VO review' });
const register = () => screen.getByRole('region', { name: 'Extra-work cases' });
beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))));
afterEach(() => { cleanup(); projectIds.forEach(clearProjectFormBuffers); projectIds.clear(); vi.unstubAllGlobals(); });

describe('compact Extra work list', () => {
  it('filters locations and statuses while retaining the exact selected case and unfinished note until explicit selection', async () => {
    const { project, cases } = fixture(), before = structuredClone(project), user = userEvent.setup(), onAction = vi.fn(), onSelect = vi.fn();
    const source = cases.find(entry => entry.status === 'flagged'), approved = cases.find(entry => entry.status === 'approved');
    render(<VOReviewView project={project} cases={cases} initialCaseId={source.id} onAction={onAction} onSelect={onSelect}/>);
    const note = within(selected()).getByRole('textbox', { name: 'Unfinished case note' });
    await user.type(note, 'Keep the unfinished review');
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Filter VO location', exact: true }), approved.report.location);
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Filter VO approval status', exact: true }), 'approved');
    expect(selected().textContent).toContain(source.id);
    expect(note.value).toBe('Keep the unfinished review');
    expect(screen.getByText('Selected case is outside these filters.')).toBeTruthy();
    expect(within(register()).queryByRole('button', { name: name => name.includes(source.reference) })).toBeNull();
    await user.click(within(register()).getByRole('button', { name: name => name.includes(approved.reference) }));
    expect(onSelect).toHaveBeenCalledWith(approved.id);
    expect(selected().textContent).toContain(approved.id);
    expect(onAction).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  });

  it('shows Clear all only when needed, clears all three filters and focuses Search without writing records', async () => {
    const { project, cases } = fixture(), before = structuredClone(project), user = userEvent.setup();
    const source = cases.find(entry => entry.status === 'approved');
    render(<VOReviewView project={project} cases={cases} initialCaseId={source.id}/>);
    const search = screen.getByRole('textbox', { name: 'Search VO records' });
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Filter VO location', exact: true }), source.report.location);
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Filter VO approval status', exact: true }), 'approved');
    await user.type(search, source.reference);
    await user.click(screen.getByRole('button', { name: 'Clear all', exact: true }));
    expect(search.value).toBe('');
    expect(screen.getByRole('combobox', { name: 'Filter VO location', exact: true }).getAttribute('data-value')).toBe('all');
    expect(screen.getByRole('combobox', { name: 'Filter VO approval status', exact: true }).getAttribute('data-value')).toBe('all');
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    expect(document.activeElement).toBe(search);
    expect(selected().textContent).toContain(source.id);
    expect(project).toEqual(before);
  });

  it('distinguishes an unknown proposed price from an explicitly approved zero', () => {
    const { project, cases } = fixture();
    const approved = cases.find(entry => entry.status === 'approved');
    const values = cases.map(entry => entry.id === approved.id ? { ...entry, approvedValue: 0 } : entry);
    render(<VOReviewView project={project} cases={values}/>);
    const list = within(register());
    expect(list.getAllByText('Price unknown').length).toBeGreaterThan(0);
    expect(list.getByLabelText('Approved price: SGD 0.00').textContent).toBe('SGD 0.00');
  });
});
