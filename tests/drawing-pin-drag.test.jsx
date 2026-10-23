import { chooseProjectOption } from './project-select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects';
import { createSITContractDemo } from '../src/data/provided-contract-demo';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace';
import { getDrawingMapping } from '../src/data/drawing-mapping';
import { clearProjectFormBuffers } from '../src/data/form-buffer';
import { chooseSelect } from './select-helpers.mjs';

const now = new Date('2026-10-24T10:00:00+08:00');
const projectIds = new Set();
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const storedProject = (id) => workspace().projects.find((project) => project.id === id);
const summary = (area) => screen.getByRole('region', { name: `Area ${area.code} completion`, exact: true });
const pin = (area) => screen.getByRole('button', { name: (name) => name.startsWith(`Select area ${area.code}:`) });
const picker = () => screen.getByRole('combobox', { name: 'Choose site area', exact: true });
const dimensions = { width: 1000, height: 600, left: 80, top: 120 };
const documentDescriptors = new Map(['getAnimations', 'elementFromPoint', 'elementsFromPoint']
  .map((key) => [key, Object.getOwnPropertyDescriptor(document, key)]));
const elementAnimationsDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations');

function rect(left, top, width, height) {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON() { return {}; } };
}

function fixture() {
  const project = createSITContractDemo({ name: 'S.I.T. draggable pins demo', code: 'DRAG-PINS' }, now);
  const other = createSITContractDemo({ name: 'Other pin project', code: 'DRAG-OTHER' }, now);
  projectIds.add(project.id); projectIds.add(other.id);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: project.id,
    projects: [project, other], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: project.id } }));
  const loaded = loadShowcaseWorkspace(localStorage, now);
  return { project: loaded.projects.find((entry) => entry.id === project.id), other: loaded.projects.find((entry) => entry.id === other.id) };
}

function mount(areaId) {
  window.history.replaceState(null, '', `#drawing?area=${encodeURIComponent(areaId)}`);
  const view = render(<App />);
  loadDrawing();
  return view;
}

function loadDrawing() {
  fireEvent.load(document.querySelector('.drawing-image-stage > img'));
}

async function keyboardMove(user, area, keys = '{ArrowRight}{ArrowDown}') {
  pin(area).focus();
  await user.keyboard('[Space]');
  await waitFor(() => expect(document.querySelector('.drawing-image-stage').className).toContain('is-dragging'));
  await user.keyboard(keys);
  await user.keyboard('[Space]');
  await screen.findByRole('button', { name: 'Save area links', exact: true });
  await openCoordinates(user);
}

async function openCoordinates(user) {
  const disclosure = screen.getByText('Enter a position instead', { selector: 'summary' });
  if (!disclosure.parentElement.open) await user.click(disclosure);
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(document, 'getAnimations', { configurable: true, value: () => [] });
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => document.querySelector('.drawing-image-stage') || document.body });
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [document.querySelector('.drawing-image-stage') || document.body] });
  vi.stubGlobal('PointerEvent', class DrawingPointerEvent extends MouseEvent {
    constructor(type, options = {}) {
      super(type, options);
      this.pointerId = options.pointerId ?? 1;
      this.pointerType = options.pointerType ?? 'mouse';
      this.isPrimary = options.isPrimary ?? true;
    }
  });
  vi.stubGlobal('matchMedia', vi.fn((query) => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  // jsdom has no layout. The real DnD sensors still receive keyboard/pointer
  // events; only the rendered drawing's browser geometry is supplied here.
  const originalRect = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getDrawingRect() {
    if (this.matches('.drawing-image-stage')) {
      const zoom = Number.parseFloat(this.style.width) / 100 || 1;
      const scroller = this.closest('.drawing-plan-scroll');
      return rect(dimensions.left - (scroller?.scrollLeft || 0), dimensions.top - (scroller?.scrollTop || 0), dimensions.width * zoom, dimensions.height * zoom);
    }
    if (this.matches('.drawing-pin')) {
      const stage = this.closest('.drawing-image-stage');
      const stageRect = stage?.getBoundingClientRect() || rect(0, 0, 0, 0);
      return rect(stageRect.left + stageRect.width * Number.parseFloat(this.style.left) / 100 - 42,
        stageRect.top + stageRect.height * Number.parseFloat(this.style.top) / 100 - 38, 84, 38);
    }
    return originalRect.call(this);
  });
});

afterEach(() => {
  cleanup();
  for (const id of projectIds) clearProjectFormBuffers(id);
  projectIds.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const [key, descriptor] of documentDescriptors) {
    if (descriptor) Object.defineProperty(document, key, descriptor);
    else delete document[key];
  }
  if (elementAnimationsDescriptor) Object.defineProperty(Element.prototype, 'getAnimations', elementAnimationsDescriptor);
  else delete Element.prototype.getAnimations;
  window.history.replaceState(null, '', '#projects');
});

describe('draggable drawing pins keep Save area links authoritative', () => {
  it('moves with the real pointer sensor without saving or selecting another area on drop', async () => {
    const { project } = fixture();
    const area = getDrawingMapping(project).areas.find((entry) => entry.position);
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(area.id);
    const button = pin(area);
    const box = button.getBoundingClientRect();
    const start = { clientX: box.left + 20, clientY: box.top + 12, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(button, start);
    fireEvent.pointerMove(document, { ...start, clientX: start.clientX + 10, buttons: 1 });
    await waitFor(() => expect(document.querySelector('.drawing-image-stage').className).toContain('is-dragging'));
    fireEvent.pointerMove(document, { ...start, clientX: start.clientX + 100, clientY: start.clientY + 60, buttons: 1 });
    await waitFor(() => expect(Number.parseFloat(pin(area).style.left)).toBeCloseTo(area.position.x * 100 + 10));
    fireEvent.pointerUp(document, { ...start, clientX: start.clientX + 100, clientY: start.clientY + 60 });

    await screen.findByRole('button', { name: 'Save area links', exact: true });
    await openCoordinates(user);
    expect(Number(screen.getByRole('spinbutton', { name: /^Across drawing/ }).value)).toBeCloseTo(area.position.x * 100 + 10);
    expect(Number(screen.getByRole('spinbutton', { name: /^Down drawing/ }).value)).toBeCloseTo(area.position.y * 100 + 10);
    expect(new URLSearchParams(location.hash.split('?')[1]).get('area')).toBe(area.id);
    expect(workspace().projects).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    const saved = getDrawingMapping(storedProject(project.id)).areas.find((entry) => entry.id === area.id);
    expect(saved.position.x).toBeCloseTo(area.position.x + .1);
    expect(saved.position.y).toBeCloseTo(area.position.y + .1);
  });

  it('moves a pin with the keyboard into an unsaved area draft and saves only that mapping', async () => {
    const { project, other } = fixture();
    const [area, otherArea] = getDrawingMapping(project).areas.filter((entry) => entry.position);
    const before = workspace().projects;
    const user = userEvent.setup();
    const view = mount(area.id);

    await keyboardMove(user, area);

    expect(workspace().projects).toEqual(before);
    const draftLeft = pin(area).style.left;
    const draftAcross = screen.getByRole('spinbutton', { name: /^Across drawing/ }).value;
    const draftDown = screen.getByRole('spinbutton', { name: /^Down drawing/ }).value;
    view.unmount();
    render(<App />);
    loadDrawing();
    await screen.findByRole('button', { name: 'Save area links', exact: true });
    await openCoordinates(user);
    expect(screen.getByRole('spinbutton', { name: /^Across drawing/ }).value).toBe(draftAcross);
    expect(screen.getByRole('spinbutton', { name: /^Down drawing/ }).value).toBe(draftDown);
    expect(pin(area).style.left).toBe(draftLeft);
    expect(workspace().projects).toEqual(before);
    const across = screen.getByRole('spinbutton', { name: /^Across drawing/ });
    const down = screen.getByRole('spinbutton', { name: /^Down drawing/ });
    expect(Number(across.value)).toBeCloseTo(area.position.x * 100 + 1);
    expect(Number(down.value)).toBeCloseTo(Math.round((area.position.y * 100 + 10 / 6) * 10) / 10);
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));

    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    const saved = getDrawingMapping(storedProject(project.id)).areas.find((entry) => entry.id === area.id);
    expect(saved.position.x).toBeCloseTo(area.position.x + .01);
    expect(saved.position.y).toBeCloseTo(Math.round((area.position.y + 10 / 600) * 1000) / 1000);
    expect(getDrawingMapping(storedProject(project.id)).areas.find((entry) => entry.id === otherArea.id)).toEqual(otherArea);
    expect(getDrawingMapping(storedProject(project.id)).history).toHaveLength(getDrawingMapping(project).history.length + 1);
    expect(storedProject(other.id)).toEqual(other);
    for (const field of ['items', 'sourceItems', 'reports', 'voReviews', 'claimDrafts', 'baselines', 'whatsappMessages']) {
      expect(storedProject(project.id)[field]).toEqual(project[field]);
    }
  });

  it('keeps a zoomed and scrolled pointer drag relative to the full image', async () => {
    const { project } = fixture();
    const area = getDrawingMapping(project).areas.find((entry) => entry.position);
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(area.id);
    await user.click(screen.getByRole('button', { name: 'Zoom drawing in', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Zoom drawing in', exact: true }));
    const scroller = document.querySelector('.drawing-plan-scroll');
    scroller.scrollLeft = 120;
    scroller.scrollTop = 60;
    fireEvent.scroll(scroller);
    const box = pin(area).getBoundingClientRect();
    const start = { clientX: box.left + 20, clientY: box.top + 12, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(pin(area), start);
    fireEvent.pointerMove(document, { ...start, clientX: start.clientX + 10, buttons: 1 });
    await waitFor(() => expect(document.querySelector('.drawing-image-stage').className).toContain('is-dragging'));
    fireEvent.pointerMove(document, { ...start, clientX: start.clientX + 150, clientY: start.clientY + 90, buttons: 1 });
    await waitFor(() => expect(Number.parseFloat(pin(area).style.left)).toBeCloseTo(area.position.x * 100 + 10));
    scroller.scrollLeft += 150;
    fireEvent.scroll(scroller);
    await waitFor(() => expect(Number.parseFloat(pin(area).style.left)).toBeCloseTo(area.position.x * 100 + 20));
    fireEvent.pointerUp(document, { ...start, clientX: start.clientX + 150, clientY: start.clientY + 90 });

    await screen.findByRole('button', { name: 'Save area links', exact: true });
    await openCoordinates(user);
    expect(Number(screen.getByRole('spinbutton', { name: /^Across drawing/ }).value)).toBeCloseTo(area.position.x * 100 + 20);
    expect(Number(screen.getByRole('spinbutton', { name: /^Down drawing/ }).value)).toBeCloseTo(area.position.y * 100 + 10);
    expect(workspace().projects).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    const saved = getDrawingMapping(storedProject(project.id)).areas.find((entry) => entry.id === area.id);
    expect(saved.position.x).toBeCloseTo(area.position.x + .2);
    expect(saved.position.y).toBeCloseTo(area.position.y + .1);
  });

  it('preserves other unfinished area edits when moving and cancelling another drag', async () => {
    const { project } = fixture();
    const area = getDrawingMapping(project).areas.find((entry) => entry.position);
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(area.id);
    await user.click(within(summary(area)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    const name = screen.getByRole('textbox', { name: /^Area name/ });
    await user.clear(name);
    await user.type(name, 'Unfinished scaffold access label');
    await keyboardMove(user, area, '{ArrowRight}');
    const expectedAcross = screen.getByRole('spinbutton', { name: /^Across drawing/ }).value;

    pin(area).focus();
    await user.keyboard('[Space]');
    await waitFor(() => expect(document.querySelector('.drawing-image-stage').className).toContain('is-dragging'));
    await user.keyboard('{ArrowRight}{ArrowRight}');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.querySelector('.drawing-image-stage').className).not.toContain('is-dragging'));

    expect(screen.getByRole('spinbutton', { name: /^Across drawing/ }).value).toBe(expectedAcross);
    expect(screen.getByRole('textbox', { name: /^Area name/ }).value).toBe('Unfinished scaffold access label');
    expect(workspace().projects).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Save area links', exact: true }));
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    const saved = getDrawingMapping(storedProject(project.id)).areas.find((entry) => entry.id === area.id);
    expect(saved.name).toBe('Unfinished scaffold access label');
    expect(saved.position.x).toBeCloseTo(area.position.x + .01);
  });

  it('cancels a lifted keyboard pin when leaving the editor and keeps the other buffered edits', async () => {
    const { project } = fixture();
    const area = getDrawingMapping(project).areas.find((entry) => entry.position);
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(area.id);
    await user.click(within(summary(area)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    const name = screen.getByRole('textbox', { name: /^Area name/ });
    await user.clear(name);
    await user.type(name, 'Keep this unfinished area description');
    pin(area).focus();
    await user.keyboard('[Space]');
    await waitFor(() => expect(document.querySelector('.drawing-image-stage').className).toContain('is-dragging'));
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(Number.parseFloat(pin(area).style.left)).toBeCloseTo(area.position.x * 100 + 1));

    await user.click(screen.getAllByRole('button', { name: 'Back to area status', exact: true })[0]);
    await waitFor(() => expect(document.querySelector('.drawing-area-editor')).toBeNull());
    expect(summary(area)).toBeTruthy();
    expect(document.querySelector('.drawing-image-stage').className).not.toContain('is-dragging');
    await user.keyboard('[Space]{Enter}');

    expect(document.querySelector('.drawing-area-editor')).toBeNull();
    expect(Number.parseFloat(pin(area).style.left)).toBeCloseTo(area.position.x * 100);
    expect(workspace().projects).toEqual(before);
    await user.click(within(summary(area)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    expect(screen.getByRole('textbox', { name: /^Area name/ }).value).toBe('Keep this unfinished area description');
    await openCoordinates(user);
    expect(Number(screen.getByRole('spinbutton', { name: /^Across drawing/ }).value)).toBeCloseTo(area.position.x * 100);
    expect(Number(screen.getByRole('spinbutton', { name: /^Down drawing/ }).value)).toBeCloseTo(area.position.y * 100);
    expect(workspace().projects).toEqual(before);
  });

  it('keeps a click as area selection and restores each area draft without crossing projects', async () => {
    const { project, other } = fixture();
    const [area, nextArea] = getDrawingMapping(project).areas.filter((entry) => entry.position);
    const before = workspace().projects;
    const user = userEvent.setup();
    mount(area.id);
    await user.click(pin(nextArea));
    expect(summary(nextArea)).toBeTruthy();
    expect(document.querySelector('.drawing-area-editor')).toBeNull();
    expect(workspace().projects).toEqual(before);

    await keyboardMove(user, nextArea, '{ArrowLeft}');
    const draftAcross = screen.getByRole('spinbutton', { name: /^Across drawing/ }).value;
    await chooseSelect(user, picker(), area.id);
    expect(summary(area)).toBeTruthy();
    await user.click(within(summary(area)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    await openCoordinates(user);
    expect(Number(screen.getByRole('spinbutton', { name: /^Across drawing/ }).value)).toBeCloseTo(area.position.x * 100);
    await chooseSelect(user, picker(), nextArea.id);
    await user.click(within(summary(nextArea)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    await openCoordinates(user);
    expect(screen.getByRole('spinbutton', { name: /^Across drawing/ }).value).toBe(draftAcross);
    expect(workspace().projects).toEqual(before);

    await user.click(screen.getByRole('button', { name: `Project: ${project.name}`, exact: true }));
    await chooseProjectOption(user, other);
    loadDrawing();
    const foreignArea = getDrawingMapping(other).areas.find((entry) => entry.code === nextArea.code);
    await chooseSelect(user, picker(), foreignArea.id);
    await user.click(within(summary(foreignArea)).getByRole('button', { name: 'Edit area mapping', exact: true }));
    await openCoordinates(user);
    expect(Number(screen.getByRole('spinbutton', { name: /^Across drawing/ }).value)).toBeCloseTo(foreignArea.position.x * 100);
    expect(workspace().projects).toEqual(before);
  });
});
