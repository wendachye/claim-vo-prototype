import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { getSITShowcaseFeatureTargets } from '../src/data/sit-showcase-features.ts';

const now = new Date('2026-10-24T10:00:00+08:00');
const stored = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selected = () => stored().projects.find(project => project.id === stored().activeProjectId);
const claimExports = project => project.claimDrafts.map(draft => toClaimCSV(buildClaimPack(project, draft.id).pack));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('opens voice and match records inside the main S.I.T. showcase without creating or changing any project', async () => {
  const initial = loadShowcaseWorkspace(localStorage, now);
  const main = initial.projects.find(project => project.id === initial.sitShowcase.projectId);
  const targets = getSITShowcaseFeatureTargets(main), before = JSON.parse(JSON.stringify(initial.projects));
  const exportsBefore = claimExports(main), user = userEvent.setup();
  window.history.replaceState(null, '', '#whatsapp'); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Demo options', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Try voice-note demo', exact: true }));
  await waitFor(() => expect(location.hash).toContain(targets.voiceMessageId));
  expect(selected().id).toBe(main.id);
  expect(screen.getByRole('region', { name: 'Voice note review' }).querySelector('audio').getAttribute('src')).toBe('/assets/demo-sit-voice-clear.wav');
  await user.click(screen.getByRole('button', { name: 'Back to messages', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Demo options', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Try match review demo', exact: true }));
  await waitFor(() => expect(location.hash).toContain(targets.matchMessageId));
  expect(screen.getByRole('region', { name: 'Review match' })).toBeTruthy();
  expect(selected().id).toBe(main.id);
  expect(stored().projects).toEqual(before);
  expect(claimExports(selected())).toEqual(exportsBefore);
});

it('links the overview guide to the main project’s unclear recording and preserves its original claim', async () => {
  const initial = loadShowcaseWorkspace(localStorage, now);
  const main = initial.projects[0], targets = getSITShowcaseFeatureTargets(main), before = claimExports(main);
  const user = userEvent.setup(); window.history.replaceState(null, '', '#projects'); render(<App />);
  await user.click(screen.getByText('About this demo', { exact: true }));
  await user.click(screen.getByRole('button', { name: 'Clarify recording', exact: true }));
  await waitFor(() => expect(location.hash).toContain(targets.unclearVoiceMessageId));
  expect(selected().id).toBe(main.id);
  expect(screen.getByRole('heading', { name: 'Ask for missing details' })).toBeTruthy();
  expect(stored().projects).toHaveLength(initial.projects.length);
  expect(claimExports(selected())).toEqual(before);
});
