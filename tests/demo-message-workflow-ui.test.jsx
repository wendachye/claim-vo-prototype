import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { getSITShowcaseFeatureTargets } from '../src/data/sit-showcase-features.ts';
import { getAreaItemProgress, getItemAreaRollup } from '../src/data/area-allocations.ts';
import { getAreaEvidence } from '../src/data/drawing-evidence.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { selectOptions } from './select-helpers.mjs';
import { chooseProjectOption } from './project-select-helpers.mjs';

const now = new Date('2026-10-24T10:00:00+08:00');
const ids = new Set();
const stored = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selected = () => { const workspace = stored(); return workspace.projects.find(project => project.id === workspace.activeProjectId); };
const oldClaims = project => project.claimDrafts.map(draft => ({ draft, csv: toClaimCSV(buildClaimPack(project, draft.id).pack) }));
const checked = element => element.getAttribute('aria-checked') === 'true' || element.checked === true;
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});

afterEach(() => {
  cleanup(); ids.forEach(clearProjectFormBuffers); ids.clear(); localStorage.clear();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (scrollDescriptor) Object.defineProperty(Element.prototype, 'scrollTo', scrollDescriptor);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

function fixture() {
  const workspace = loadShowcaseWorkspace(localStorage, now);
  workspace.projects.forEach(project => ids.add(project.id));
  const main = workspace.projects.find(project => project.id === workspace.sitShowcase.projectId);
  const targets = getSITShowcaseFeatureTargets(main);
  const [areaA, areaB] = targets.areaIds.map(id => main.drawingMapping.areas.find(area => area.id === id));
  return { workspace, main, areaA, areaB, item: main.items.find(item => item.id === 'WI-016') };
}

async function openForm(user) {
  await user.click(screen.getByRole('button', { name: 'Add demo message', exact: true }));
  return within(screen.getByRole('dialog', { name: 'Add demo message', exact: true }));
}

async function switchProject(user, target) {
  await user.click(screen.getByRole('button', { name: /^Project:/ }));
  await chooseProjectOption(user, target);
  await waitFor(() => expect(selected().id).toBe(target.id));
}

describe('a composed mock WhatsApp message joins the selected project workflow', () => {
  it('previews without changing progress, saves one inbox original, then separately matches, verifies and assesses its allocated area', async () => {
    const { workspace, main, areaA, areaB, item } = fixture();
    const beforeClaims = oldClaims(main);
    const others = structuredClone(workspace.projects.filter(project => project.id !== main.id));
    const text = `${main.code} | ${item.location} | BRACKET-A | WI-016 | COMPLETE=50% TOTAL`;
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#whatsapp');
    let view = render(<App />);
    let form = await openForm(user);
    await user.type(form.getByRole('textbox', { name: /^Message text/ }), text);
    const photoOptions = await selectOptions(user, form.getByRole('combobox', { name: /^Demo photo/ }));
    const photoOption = photoOptions.find(option => option.getAttribute('data-value'));
    await user.click(photoOption);
    await user.click(form.getByRole('button', { name: 'Preview message', exact: true }));
    const preview = form.getByRole('region', { name: 'Message preview', exact: true });
    expect(preview.textContent).toContain('Ready for review');
    expect(preview.textContent).toContain('BRACKET-A');
    expect(preview.textContent).toContain(item.description);
    expect(preview.textContent).toContain('50%');
    const photo = preview.querySelector('img').getAttribute('src');
    expect(photo).toMatch(/^\/assets\//);
    expect(selected()).toEqual(main);
    await user.click(form.getByRole('button', { name: 'Save to inbox', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add demo message' })).toBeNull());
    const saved = selected();
    const message = saved.whatsappMessages.find(entry => !main.whatsappMessages.some(original => original.id === entry.id));
    expect(message).toMatchObject({ projectId: main.id, projectCode: main.code, text, photo, demo: true, origin: 'simulated', channel: 'whatsapp-intake-mock' });
    expect(saved.whatsappMessages).toHaveLength(main.whatsappMessages.length + 1);
    expect(location.hash).toContain(message.id);
    expect(saved.reports).toEqual(main.reports);
    expect(saved.items).toEqual(main.items);
    expect(oldClaims(saved)).toEqual(beforeClaims);
    expect(stored().projects.filter(project => project.id !== main.id)).toEqual(others);

    // Reload opens this exact saved original; confirmation is distinct from processing.
    view.unmount(); view = render(<App />);
    expect(screen.getAllByText(text, { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getByText('Mock incoming message · saved in this browser', { exact: true })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Review match', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add progress update', exact: true }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    expect(selected().reports).toEqual(main.reports);
    await user.click(screen.getByRole('button', { name: 'Add progress update', exact: true }));
    await waitFor(() => expect(selected().reports.some(report => report.sourceMessageId === message.id)).toBe(true));
    let project = selected();
    const report = project.reports.find(entry => entry.sourceMessageId === message.id);
    expect(report).toMatchObject({ status: 'pending', message: text, photo,
      areaMapping: { areaId: areaA.id }, areaProgress: { allocatedQuantity: 90, contractQuantity: 180 },
      matchReview: { fields: { itemId: item.id, areaId: areaA.id, completion: 50 } } });
    expect(getItemAreaRollup(project, item.id, 'reported')).toMatchObject({ completion: 25, completedQuantity: 45 });
    expect(getAreaItemProgress(project, areaA.id, item.id).completion).toBeNull();
    expect(getAreaItemProgress(project, areaB.id, item.id).completion).toBeNull();
    const duplicate = processWhatsAppMessage(project, message.id);
    expect(duplicate.outcome).toBe('duplicate');
    expect(duplicate.project).toEqual(project);
    await user.click(screen.getByRole('button', { name: 'Review progress', exact: true }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Verify progress', exact: true }));
    await waitFor(() => expect(selected().reports.find(entry => entry.id === report.id).status).toBe('verified'));
    project = selected();
    expect(getAreaItemProgress(project, areaA.id, item.id)).toMatchObject({ completion: 50, completedQuantity: 45 });
    expect(getAreaItemProgress(project, areaB.id, item.id).completion).toBeNull();
    expect(getItemAreaRollup(project, item.id)).toMatchObject({ completion: 25, completedQuantity: 45 });
    expect(getAreaEvidence(project, areaA.id).entries.filter(entry => entry.messageId === message.id)).toHaveLength(1);
    expect(getAreaEvidence(project, areaB.id).entries.some(entry => entry.messageId === message.id)).toBe(false);
    expect(oldClaims(project)).toEqual(beforeClaims);

    // Only an explicit QS quantity values the new source, leaving the first claim frozen.
    view.unmount(); window.history.replaceState(null, '', '#claims'); view = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true }));
    for (const choice of screen.getAllByRole('checkbox', { name: /^Include .* in claim$/ })) if (checked(choice)) await user.click(choice);
    await user.click(screen.getByRole('checkbox', { name: 'Include WI-016 in claim', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Enter totals', exact: true }));
    const quantity = screen.getByRole('spinbutton', { name: 'WI-016 QS cumulative quantity', exact: true });
    expect(quantity.value).toBe('');
    await user.type(quantity, '45');
    await user.type(screen.getByRole('spinbutton', { name: 'WI-016 previously claimed value', exact: true }), '0');
    await user.click(screen.getByRole('button', { name: 'View evidence for D.5', exact: true }));
    let evidence = within(await screen.findByRole('dialog'));
    expect(evidence.getByText(text, { exact: true })).toBeTruthy();
    await user.click(evidence.getByRole('button', { name: 'Done', exact: true }));
    expect(quantity.value).toBe('45');
    const prior = screen.getByRole('checkbox', { name: /Confirm previous claims/ });
    if (!checked(prior)) await user.click(prior);
    await user.click(screen.getByRole('button', { name: 'Review claim', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Save claim draft', exact: true }));
    await waitFor(() => expect(selected().claimDrafts).toHaveLength(main.claimDrafts.length + 1));
    project = selected();
    const claim = project.claimDrafts.find(draft => !main.claimDrafts.some(original => original.id === draft.id));
    expect(claim).toMatchObject({ revision: 2, status: 'draft', snapshot: { totals: { currentValue: 4050 } } });
    expect(claim.snapshot.workRows.find(row => row.id === item.id)).toMatchObject({ assessedQuantity: 45, verified: 25, currentValue: 4050 });
    const csv = toClaimCSV(buildClaimPack(project, claim.id).pack);
    expect(csv).toContain(text); expect(csv).toContain(photo);
    expect(oldClaims({ ...project, claimDrafts: project.claimDrafts.filter(draft => draft.id !== claim.id) })).toEqual(beforeClaims);
    expect(stored().projects.filter(entry => entry.id !== main.id)).toEqual(others);
    expect(stored().projects).toHaveLength(workspace.projects.length);
    const later = structuredClone(project);
    later.reports = later.reports.map(entry => entry.id === report.id ? { ...entry, message: 'Later changed live message', photo: null } : entry);
    expect(toClaimCSV(buildClaimPack(later, claim.id).pack)).toBe(csv);
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ ...stored(), projects: stored().projects.map(entry => entry.id === later.id ? later : entry) }));
    view.unmount(); window.history.replaceState(null, '', `#claim-preview?draft=${claim.id}`); view = render(<App />);
    await user.click(screen.getByRole('button', { name: 'View evidence for D.5', exact: true }));
    evidence = within(await screen.findByRole('dialog'));
    expect(evidence.getByText(text, { exact: true })).toBeTruthy();
    expect(evidence.queryByText('Later changed live message', { exact: true })).toBeNull();
  }, 30000);

  it('retains unfinished entries per project and saves an ambiguous area only for clarification', async () => {
    const { workspace, main, item } = fixture();
    const other = workspace.projects.find(project => project.id !== main.id);
    const ambiguous = `${main.code} | ${item.location} | Bracket zone | WI-016 | COMPLETE=25% TOTAL`;
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#whatsapp');
    render(<App />);
    let form = await openForm(user);
    await user.type(form.getByRole('textbox', { name: /^Message text/ }), ambiguous);
    await user.click(form.getByRole('button', { name: 'Cancel', exact: true }));
    await switchProject(user, other);
    form = await openForm(user);
    expect(form.getByRole('textbox', { name: /^Message text/ }).value).toBe('');
    await user.type(form.getByRole('textbox', { name: /^Message text/ }), 'Unfinished entry for a different project');
    await user.click(form.getByRole('button', { name: 'Cancel', exact: true }));
    await switchProject(user, main);
    form = await openForm(user);
    expect(form.getByRole('textbox', { name: /^Message text/ }).value).toBe(ambiguous);
    await user.click(form.getByRole('button', { name: 'Preview message', exact: true }));
    expect(form.getByRole('region', { name: 'Message preview', exact: true }).textContent).toContain('Needs clarification');
    expect(selected().reports).toEqual(main.reports);
    await user.click(form.getByRole('button', { name: 'Save to inbox', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add demo message' })).toBeNull());
    const saved = selected();
    const message = saved.whatsappMessages.find(entry => !main.whatsappMessages.some(original => original.id === entry.id));
    expect(message.text).toBe(ambiguous);
    expect(message.areaId ?? null).toBeNull();
    expect(message.photo ?? null).toBeNull();
    expect(saved.reports).toEqual(main.reports);
    expect(saved.items).toEqual(main.items);
    expect(saved.claimDrafts).toEqual(main.claimDrafts);
    expect(screen.getByRole('button', { name: 'Save clarification request', exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add progress update', exact: true })).toBeNull();
    expect(stored().projects.find(project => project.id === other.id)).toEqual(other);
    await switchProject(user, other);
    form = await openForm(user);
    expect(form.getByRole('textbox', { name: /^Message text/ }).value).toBe('Unfinished entry for a different project');
  }, 30000);
});
