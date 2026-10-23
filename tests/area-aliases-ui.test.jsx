import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrawingMappingView } from '../src/components/DrawingMappingView';
import { createDemoProject } from '../src/data/demo-project.ts';
import { getDrawingMapping, installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { clearProjectFormBuffers, writeFormBuffer } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

const now = new Date('2026-10-24T10:00:00+08:00');
const projectIds = new Set();
const summary = area => screen.getByRole('region', { name: `Area ${area.code} completion`, exact: true });
const aliasesInput = () => screen.getByRole('textbox', { name: /^Also known as/ });
const picker = () => screen.getByRole('combobox', { name: 'Choose site area', exact: true });
const edit = async (user, area) => user.click(within(summary(area)).getByRole('button', { name: 'Edit area mapping', exact: true }));
const save = async user => user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));

function fixture() {
  let project = createDemoProject({ name: 'Alternate area names UI', code: 'ALIASES-UI' }, now);
  projectIds.add(project.id);
  project = installDrawing(project, { inputKind: 'sample', fileName: 'warehouse-area-plan.svg', fileSize: 0, mimeType: 'image/svg+xml' }, now).project;
  for (const area of getDrawingMapping(project).areas.slice(0, 2)) project = saveAreaMapping(project, { ...area, areaId: area.id, workItemIds: [project.items[0].id] }, now).project;
  project.claimDrafts = [{ id: 'FROZEN-ALIASES-CLAIM', projectId: project.id, status: 'paid', snapshot: { note: 'Saved original names and evidence' } }];
  return { project, areas: getDrawingMapping(project).areas };
}
function mount(initial, overrideSave) {
  let current = initial;
  const onSave = vi.fn();
  function Harness() {
    const [project, setProject] = useState(initial);
    return <DrawingMappingView project={project} initialAreaId={getDrawingMapping(initial).areas[0].id} onBack={() => {}} onSaveArea={values => {
      onSave(values);
      const result = overrideSave?.(project, values) || saveAreaMapping(project, values, now);
      if (result.outcome !== 'invalid') { current = result.project; setProject(result.project); }
      return result;
    }} />;
  }
  return { ...render(<Harness />), current: () => current, onSave };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  window.history.replaceState(null, '', '#drawing');
});
afterEach(() => {
  cleanup();
  for (const id of projectIds) clearProjectFormBuffers(id);
  projectIds.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('simple alternate area names field', () => {
  it('saves comma-separated alternate names only on explicit save and leaves evidence and claims unchanged', async () => {
    const { project, areas: [west] } = fixture();
    const original = structuredClone(project);
    const view = mount(project);
    const user = userEvent.setup();
    await edit(user, west);
    expect(aliasesInput().value).toBe('');
    await user.type(aliasesInput(), ' West wall, West façade ');
    expect(view.current()).toEqual(original);
    await save(user);
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    expect(view.onSave.mock.calls[0][0].aliases).toEqual(['West wall', 'West façade']);
    expect(getDrawingMapping(view.current()).areas.find(area => area.id === west.id).aliases).toEqual(['West wall', 'West façade']);
    expect(summary(west).textContent).toContain('Also known as West wall, West façade');
    for (const field of ['items', 'sourceItems', 'reports', 'whatsappMessages', 'claimDrafts', 'baselines']) expect(view.current()[field]).toEqual(original[field]);
    await edit(user, west);
    expect(aliasesInput().value).toBe('West wall, West façade');
    await user.clear(aliasesInput());
    await save(user);
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    expect(getDrawingMapping(view.current()).areas.find(area => area.id === west.id).aliases || []).toEqual([]);
  });

  it('keeps unsaved alternate names per area while browsing and merges a new pin without losing names or quantities', async () => {
    const { project, areas: [west, east] } = fixture();
    const view = mount(project);
    const user = userEvent.setup();
    fireEvent.load(document.querySelector('.drawing-image-stage > img'));
    await edit(user, west);
    await user.type(aliasesInput(), 'West wall, West façade');
    const item = project.items.find(entry => west.workItemIds.includes(entry.id) && entry.pricingType === 'measured');
    const quantity = () => screen.getByRole('spinbutton', { name: `Quantity in this area for ${item.ref}`, exact: true });
    await user.type(quantity(), '120');
    await chooseSelect(user, picker(), east.id);
    await edit(user, east);
    expect(aliasesInput().value).toBe('');
    await user.type(aliasesInput(), 'East wall');
    await chooseSelect(user, picker(), west.id);
    await edit(user, west);
    expect(aliasesInput().value).toBe('West wall, West façade');
    expect(quantity().value).toBe('120');
    await user.click(screen.getByRole('button', { name: /^(Move|Place) pin$/, exact: true }));
    fireEvent.keyDown(screen.getByRole('button', { name: /Drawing pin placement/ }), { key: 'Enter' });
    expect(aliasesInput().value).toBe('West wall, West façade');
    expect(quantity().value).toBe('120');
    expect(screen.getByText(/Pin at 50% across, 50% down/)).toBeTruthy();
    expect(view.current()).toEqual(project);
    await save(user);
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    const saved = getDrawingMapping(view.current()).areas.find(area => area.id === west.id);
    expect(saved.aliases).toEqual(['West wall', 'West façade']);
    expect(saved.position).toEqual({ x: .5, y: .5 });
    expect(saved.workItemQuantities).toEqual({ [item.id]: 120 });
    await chooseSelect(user, picker(), east.id);
    await edit(user, east);
    expect(aliasesInput().value).toBe('East wall');
  });

  it('retains legacy unfinished form buffers and treats saving a blank field as unchanged', async () => {
    const { project, areas: [area] } = fixture();
    const drawing = getDrawingMapping(project).drawing;
    const initial = { code: area.code, name: area.name, page: String(area.page || 1), workItemIds: [...area.workItemIds], pinX: String(Math.round(area.position.x * 1000) / 10), pinY: String(Math.round(area.position.y * 1000) / 10) };
    const scope = `drawing:area:${JSON.stringify([drawing.id, area.id, area.updatedAt || '', initial])}`;
    writeFormBuffer(project.id, scope, { ...initial, name: 'Unfinished legacy area name' });
    const view = mount(project);
    const user = userEvent.setup();
    await edit(user, area);
    expect(screen.getByRole('textbox', { name: /^Area name/ }).value).toBe('Unfinished legacy area name');
    expect(aliasesInput().value).toBe('');
    await user.clear(screen.getByRole('textbox', { name: /^Area name/ }));
    await user.type(screen.getByRole('textbox', { name: /^Area name/ }), area.name);
    await save(user);
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    expect(view.current()).toEqual(project);
  });

  it('focuses invalid alternate names and preserves them for correction', async () => {
    const { project, areas: [area] } = fixture();
    const view = mount(project);
    const user = userEvent.setup();
    await edit(user, area);
    await user.type(aliasesInput(), Array.from({ length: 9 }, (_, index) => `Name ${index + 1}`).join(', '));
    await save(user);
    expect(screen.getByRole('alert').textContent).toMatch(/up to 8 alternate area names/);
    expect(document.activeElement).toBe(aliasesInput());
    expect(view.onSave).not.toHaveBeenCalled();
    await user.clear(aliasesInput());
    await user.type(aliasesInput(), 'x'.repeat(101));
    await save(user);
    expect(screen.getByRole('alert').textContent).toMatch(/100 characters or fewer/);
    expect(document.activeElement).toBe(aliasesInput());
    expect(aliasesInput().value).toBe('x'.repeat(101));
    expect(view.current()).toEqual(project);
  });

  it('focuses the alternate names field for a domain validation error', async () => {
    const { project, areas: [area] } = fixture();
    mount(project, current => ({ outcome: 'invalid', project: current, error: 'An alternate area name contains unsupported characters.' }));
    const user = userEvent.setup();
    await edit(user, area);
    await user.type(aliasesInput(), 'West wall');
    await save(user);
    expect(screen.getByRole('alert').textContent).toContain('unsupported characters');
    expect(document.activeElement).toBe(aliasesInput());
    expect(aliasesInput().value).toBe('West wall');
  });
});
