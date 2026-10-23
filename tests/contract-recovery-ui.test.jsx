import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ContractUploadFlow } from '../src/components/ContractUploadFlow.jsx';
import { createProject } from '../src/data/projects.js';
import { DEMO_CONTRACT_PDF } from '../src/data/contract-import.js';
import { createContractRecovery } from '../src/data/contract-recovery.js';

const objectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const click = name => fireEvent.click(screen.getByRole('button', { name, exact: true }));
const tick = duration => act(async () => { vi.advanceTimersByTime(duration); });
const fill = (name, value) => fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-23T09:00:00+08:00'));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:selected-contract-preview') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
  if (objectUrl) Object.defineProperty(URL, 'createObjectURL', objectUrl); else delete URL.createObjectURL;
  if (revokeUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeUrl); else delete URL.revokeObjectURL;
});

function mount(onApply = vi.fn().mockResolvedValue({ outcome: 'applied' })) {
  const project = createProject({ name: 'Recovery showcase', code: 'RECOVERY-UI', country: 'Singapore' });
  const view = render(<ContractUploadFlow project={project} onClose={vi.fn()} onApply={onApply} />);
  return { ...view, project, onApply };
}

async function failedPage() {
  click('Use demo PDF');
  fireEvent.click(screen.getByRole('checkbox', { name: /^Try failed-page demo/ }));
  click('Start demo extraction');
  await tick(2100);
  expect(screen.getByRole('heading', { name: 'Page 1 needs attention', exact: true })).toBeTruthy();
}

function enterManualRow(id, values = {}) {
  fill(`Description · ${id}`, values.description || `${id} manually recorded work`);
  fill(`Location · ${id}`, values.location || 'Block A');
  fill(`Unit · ${id}`, values.unit || 'm²');
  if (values.quantity !== undefined) fill(`Quantity · ${id}`, values.quantity);
  if (values.rate !== undefined) fill(`Rate · ${id}`, values.rate);
}

describe('compact mock extraction recovery', () => {
  it('keeps normal successful extraction as the default and prevents a duplicate apply', async () => {
    let resolve;
    const onApply = vi.fn(() => new Promise(done => { resolve = done; }));
    mount(onApply);
    click('Use demo PDF');
    expect(screen.getByRole('checkbox', { name: /^Try failed-page demo/ }).getAttribute('aria-checked')).toBe('false');
    click('Start demo extraction');
    await tick(2100);
    expect(screen.getByRole('heading', { name: 'Demo work list ready', exact: true })).toBeTruthy();
    click('Review work list');
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0].recovery).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Opening…', exact: true }).disabled).toBe(true);
    await act(async () => resolve({ outcome: 'applied' }));
    click('Review work list');
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('keeps four successful items, blocks review until resolved and cancels a retry without a late completion', async () => {
    const { onApply, project } = mount();
    const before = structuredClone(project);
    await failedPage();
    expect(screen.getByText('Successful results kept · 4 of 6 items')).toBeTruthy();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Review work list', exact: true }).disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Demo source PDF', exact: true }).getAttribute('href')).toBe(DEMO_CONTRACT_PDF);
    click('Retry page');
    await tick(400);
    click('Cancel retry');
    await tick(1000);
    expect(screen.getByRole('heading', { name: 'Page 1 needs attention', exact: true })).toBeTruthy();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(5);
    expect(onApply).not.toHaveBeenCalled();
    expect(project).toEqual(before);
    click('Retry page');
    await tick(900);
    expect(screen.getByRole('heading', { name: 'All 6 items ready for review', exact: true })).toBeTruthy();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(7);
    expect(screen.getByText('Source: 1,200 m²')).toBeTruthy();
    await act(async () => click('Review work list'));
    expect(onApply).toHaveBeenCalledOnce();
    const recovery = onApply.mock.calls[0][0].recovery;
    const first = createContractRecovery(project.id, { inputKind: 'sample', fileName: 'warehouse-contract-demo.pdf', fileSize: 0 });
    for (const row of first.items) expect(recovery.items.find(item => item.id === row.id)).toEqual(row);
    expect(recovery.pages[0]).toMatchObject({ page: 1, resolution: 'retry', retryCount: 1 });
    expect(project).toEqual(before);
  });

  it('keeps cancelled manual edits and validates required fields before adding only the missing rows', async () => {
    const { onApply, project } = mount();
    await failedPage();
    click('Enter manually');
    click('Save manual entries');
    expect(screen.getByRole('alert').textContent).toContain('Enter the description');
    expect(document.activeElement).toBe(screen.getByLabelText('Description · WI-002', { exact: true }));
    enterManualRow('WI-002', { quantity: '0', rate: '0' });
    click('Back to results');
    expect(screen.getByRole('heading', { name: 'Page 1 needs attention', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review work list', exact: true }).disabled).toBe(true);
    click('Enter manually');
    expect(screen.getByLabelText('Description · WI-002', { exact: true }).value).toBe('WI-002 manually recorded work');
    expect(screen.getByLabelText('Quantity · WI-002', { exact: true }).value).toBe('0');
    enterManualRow('WI-004', { location: 'Block B', unit: 'set' });
    click('Save manual entries');
    expect(screen.getByRole('heading', { name: 'Manual entries recorded', exact: true })).toBeTruthy();
    expect(screen.getByText(/Manual entries and unknown values still need source review/)).toBeTruthy();
    expect(screen.getAllByText('Unknown')).toHaveLength(2);
    await act(async () => click('Review work list'));
    const recovery = onApply.mock.calls[0][0].recovery;
    const zero = recovery.items.find(item => item.id === 'WI-002');
    const unknown = recovery.items.find(item => item.id === 'WI-004');
    expect(zero).toMatchObject({ quantity: 0, rate: 0, needsReview: true });
    expect(unknown).toMatchObject({ quantity: null, rate: null, needsReview: true });
    const first = createContractRecovery(project.id, { inputKind: 'sample', fileName: 'warehouse-contract-demo.pdf', fileSize: 0 });
    for (const row of first.items) expect(recovery.items.find(item => item.id === row.id)).toEqual(row);
  });

  it('retains the same selected PDF preview across recovery and keeps fictional source evidence separate', async () => {
    mount();
    const file = new File(['%PDF-1.4 selected document'], 'my-contract.pdf', { type: 'application/pdf' });
    file.slice = () => ({ text: async () => '%PDF-1.4' });
    await act(async () => fireEvent.change(screen.getByLabelText('Contract PDF'), { target: { files: [file] } }));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Preview PDF', exact: true }).getAttribute('href')).toBe('blob:selected-contract-preview');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Try failed-page demo/ }));
    click('Start demo extraction');
    await tick(2100);
    expect(screen.getByRole('link', { name: 'Demo source PDF', exact: true }).getAttribute('href')).toBe(DEMO_CONTRACT_PDF);
    expect(screen.getByRole('link', { name: 'Preview selected PDF', exact: true }).getAttribute('href')).toBe('blob:selected-contract-preview');
    click('Enter manually');
    click('Back to results');
    click('Retry page');
    await tick(900);
    expect(screen.getByRole('link', { name: 'Preview selected PDF', exact: true }).getAttribute('href')).toBe('blob:selected-contract-preview');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    click('Back to file');
    click('Change file');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:selected-contract-preview');
  });

  it('cancels the initial simulated extraction without allowing stale results to replace the file chooser', async () => {
    const { onApply } = mount();
    click('Use demo PDF');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Try failed-page demo/ }));
    click('Start demo extraction');
    await tick(650);
    click('Cancel extraction');
    await tick(3000);
    expect(screen.getByRole('button', { name: 'Start demo extraction', exact: true })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Page 1 needs attention', exact: true })).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });
});
