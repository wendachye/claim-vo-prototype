import { chooseDrawingArea } from './drawing-select-helpers.mjs';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrawingMappingView } from '../src/components/DrawingMappingView';
import { createDemoProject } from '../src/data/demo-project.ts';
import { getDrawingMapping, installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { getAreaProgress } from '../src/data/drawing-progress.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-24T10:00:00+08:00');
const projectIds = new Set();
const summary = area => screen.getByRole('region', { name: `Area ${area.code} completion`, exact: true });
const picker = () => screen.getByRole('button', { name: 'Choose site area', exact: true });
const quantityInput = item => screen.getByRole('spinbutton', { name: `Quantity in this area for ${item.ref}`, exact: true });

function fixture() {
  let project = createDemoProject({ name: 'Area split UI example', code: 'AREA-UI' }, now);
  projectIds.add(project.id);
  project.items[0] = { ...project.items[0], reported: 62, verified: 41, needsReview: false };
  project = installDrawing(project, { inputKind: 'sample', fileName: 'warehouse-area-plan.svg', fileSize: 0, mimeType: 'image/svg+xml' }, now).project;
  const item = project.items[0];
  for (const area of getDrawingMapping(project).areas.slice(0, 2)) {
    project = saveAreaMapping(project, { ...area, areaId: area.id, workItemIds: [item.id] }, now).project;
  }
  // Frozen saved evidence is retained as an independent record by area saves.
  project.claimDrafts = [{ id: 'FROZEN-AREA-CLAIM', projectId: project.id, period: '2026-09', revision: 1, status: 'prepared',
    assessment: { note: 'Original saved assessment' }, snapshot: { workRows: [{ itemId: item.id, currentValue: 1234, evidence: [{ text: 'Original saved evidence' }] }] } }];
  return { project, item, areas: getDrawingMapping(project).areas.slice(0, 2) };
}
function mount(initial) {
  let current = initial;
  const onSave = vi.fn();
  function Harness() {
    const [project, setProject] = useState(initial);
    return <DrawingMappingView project={project} initialAreaId={getDrawingMapping(initial).areas[0].id} onBack={() => {}} onSaveArea={values => {
      onSave(values);
      const result = saveAreaMapping(project, values, now);
      if (result.outcome !== 'invalid') { current = result.project; setProject(result.project); }
      return result;
    }} />;
  }
  const view = render(<Harness />);
  return { ...view, current: () => current, onSave };
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
  vi.unstubAllGlobals();
});

describe('simple area quantity mapping', () => {
  it('saves a split explicitly, prevents over-allocation and leaves existing totals and saved evidence unchanged', async () => {
    const { project, item, areas: [west, east] } = fixture();
    const original = structuredClone(project);
    const view = mount(project);
    const user = userEvent.setup();
    await user.click(within(summary(west)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    await user.type(quantityInput(item), '720');
    expect(screen.getByText('Contract 1,200 m² · Elsewhere 0 · Remaining 480 m²')).toBeTruthy();
    expect(screen.getByText(/Separate area tracking uses new area reports/)).toBeTruthy();
    expect(view.current()).toEqual(original);
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    expect(getDrawingMapping(view.current()).areas.find(area => area.id === west.id).workItemQuantities).toEqual({ [item.id]: 720 });
    expect(within(summary(west)).getByText('Quantity in this area', { exact: true }).nextElementSibling.textContent).toBe('720 m²');
    expect(getAreaProgress(view.current(), west.id).items[0].completion).toBeNull();
    await chooseDrawingArea(user, picker(), east.id);
    expect(within(summary(east)).getByText('Quantity in this area', { exact: true }).nextElementSibling.textContent).toBe('Not allocated');
    await user.click(within(summary(east)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    await user.type(quantityInput(item), '481');
    expect(screen.getByText('Contract 1,200 m² · Elsewhere 720 · Remaining -1 m²')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));
    expect(screen.getByRole('alert').textContent).toMatch(/cannot exceed the contract quantity/);
    expect(document.activeElement).toBe(quantityInput(item));
    expect(view.onSave).toHaveBeenCalledTimes(1);
    await user.clear(quantityInput(item));
    await user.type(quantityInput(item), '480');
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    expect(getDrawingMapping(view.current()).areas.find(area => area.id === east.id).workItemQuantities).toEqual({ [item.id]: 480 });
    expect(view.current().items).toEqual(original.items);
    expect(view.current().reports).toEqual(original.reports);
    expect(view.current().claimDrafts).toEqual(original.claimDrafts);
  });

  it('keeps unfinished quantities and area details while browsing, and blank remains a link only', async () => {
    const { project, item, areas: [west, east] } = fixture();
    const view = mount(project);
    const user = userEvent.setup();
    await user.click(within(summary(west)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    await user.clear(screen.getByRole('textbox', { name: /^Area name/ }));
    await user.type(screen.getByRole('textbox', { name: /^Area name/ }), 'West work area');
    await user.type(quantityInput(item), '720');
    await chooseDrawingArea(user, picker(), east.id);
    await chooseDrawingArea(user, picker(), west.id);
    await user.click(within(summary(west)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    expect(screen.getByRole('textbox', { name: /^Area name/ }).value).toBe('West work area');
    expect(quantityInput(item).value).toBe('720');
    expect(view.current()).toEqual(project);
    await user.clear(quantityInput(item));
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    const saved = getDrawingMapping(view.current()).areas.find(area => area.id === west.id);
    expect(saved.name).toBe('West work area');
    expect(saved.workItemIds).toEqual([item.id]);
    expect(Object.keys(saved.workItemQuantities || {})).toHaveLength(0);
    expect(getAreaProgress(view.current(), west.id).items[0].completion).toBe(41);
  });

  it('validates four decimal places before saving and keeps the entered quantity to correct', async () => {
    const { project, item, areas: [west] } = fixture();
    const view = mount(project);
    const user = userEvent.setup();
    await user.click(within(summary(west)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    await user.type(quantityInput(item), '0.00001');
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));
    expect(screen.getByRole('alert').textContent).toMatch(/up to 4 decimal places/);
    expect(quantityInput(item).value).toBe('0.00001');
    expect(view.onSave).not.toHaveBeenCalled();
    expect(view.current()).toEqual(project);
  });
});
