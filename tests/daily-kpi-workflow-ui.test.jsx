import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-28T10:00:00+08:00');
const ids = new Set();
const stored = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selected = () => { const workspace = stored(); return workspace.projects.find(project => project.id === workspace.activeProjectId); };

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});

afterEach(() => {
  ids.forEach(clearProjectFormBuffers); ids.clear(); localStorage.clear();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  window.history.replaceState(null, '', '#dashboard');
});

describe('daily KPI intake', () => {
  it('previews the worker layout, then saves an original needing clarification without making progress', async () => {
    const workspace = loadShowcaseWorkspace(localStorage, now);
    workspace.projects.forEach(project => ids.add(project.id));
    const original = workspace.projects.find(project => project.id === workspace.activeProjectId);
    const others = structuredClone(workspace.projects.filter(project => project.id !== original.id));
    const raw = '26/10/26 (Monday)\nDP01\nT11,13,20 KPI\n(WDP-01 Wetwell 1)\n20×1×1\n12PM to 1PM hoisting.\nAfternoon no materials lower down due to crane breakdown';
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#whatsapp');
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add demo message', exact: true }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add demo message', exact: true }));
    fireEvent.change(dialog.getByRole('textbox', { name: /^Message text/ }), { target: { value: raw } });
    await user.click(dialog.getByRole('button', { name: 'Preview message', exact: true }));
    const preview = dialog.getByRole('region', { name: 'Message preview', exact: true });
    expect(preview.querySelector('blockquote').textContent).toBe(raw);
    const previewLogSummary = within(preview).getByText('Daily log details', { exact: true }).closest('summary');
    const previewLog = previewLogSummary.closest('details');
    expect(previewLog.open).toBe(false);
    expect(preview.querySelector('blockquote').compareDocumentPosition(previewLog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dialog.getByRole('region', { name: 'Daily KPI details', exact: true }).closest('details')).toBe(previewLog);
    await user.click(previewLogSummary);
    expect(previewLog.open).toBe(true);
    const details = within(dialog.getByRole('region', { name: 'Daily KPI details', exact: true }));
    expect(details.getByText('T11,13,20 KPI', { exact: true })).toBeTruthy();
    expect(details.getByText('20×1×1', { exact: true })).toBeTruthy();
    expect(details.getByText('Not stated', { exact: true })).toBeTruthy();
    expect(dialog.getAllByText('Needs clarification', { exact: true }).length).toBeGreaterThan(0);
    expect(selected()).toEqual(original);
    await user.click(dialog.getByRole('button', { name: 'Save to inbox', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add demo message' })).toBeNull());
    const saved = selected();
    const message = saved.whatsappMessages.find(entry => !original.whatsappMessages.some(prior => prior.id === entry.id));
    expect(message).toMatchObject({ text: raw, kind: 'clarification', completion: null, itemId: null });
    const dailyLogSummary = screen.getByText('Daily log details', { exact: true }).closest('summary');
    const dailyLog = dailyLogSummary.closest('details');
    const sourceEvidence = document.querySelector('.wa-source-evidence');
    expect(sourceEvidence.open).toBe(true);
    expect(sourceEvidence.textContent).toContain(raw);
    expect(sourceEvidence.compareDocumentPosition(dailyLog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dailyLog.open).toBe(false);
    // jsdom does not apply native closed-details visibility; the browser owns it.
    expect(screen.getByRole('region', { name: 'Daily KPI details', exact: true }).closest('details')).toBe(dailyLog);
    await user.click(dailyLogSummary);
    expect(dailyLog.open).toBe(true);
    const savedDetails = within(screen.getByRole('region', { name: 'Daily KPI details', exact: true }));
    expect(savedDetails.getByText('T11,13,20 KPI', { exact: true })).toBeTruthy();
    expect(savedDetails.getByText('20×1×1', { exact: true })).toBeTruthy();
    expect(selected()).toEqual(saved);
    expect(screen.getByRole('button', { name: 'Save clarification request', exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add progress update', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm match', exact: true })).toBeNull();
    for (const field of ['items', 'reports', 'voReviews', 'claimDrafts', 'claimTracking', 'seed']) expect(saved[field]).toEqual(original[field]);
    expect(stored().projects.filter(project => project.id !== saved.id)).toEqual(others);
  });
});
