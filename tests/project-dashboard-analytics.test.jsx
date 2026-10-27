import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { ProjectDashboard } from '../src/components/ProjectDashboard';
import { createProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { loadShowcaseWorkspace, SIT_SHOWCASE_VERSION } from '../src/data/showcase-workspace.ts';
import { saveClaimDraft, markClaimPrepared } from '../src/data/claims.ts';
import { recordClaimStage } from '../src/data/claim-tracking.ts';
import { getProjectDashboard } from '../src/data/project-dashboard.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { buildClaimPack } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-25T01:00:00Z');
const projectIds = new Set();
const priorScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const kpi = name => screen.getByRole('article', { name, exact: true });
const params = () => new URLSearchParams(location.hash.split('?')[1]);

function updated(result) {
  if (result.outcome !== 'updated') throw new Error(result.error || `Expected updated, got ${result.outcome}`);
  return result;
}
function base() {
  const project = createProject({ name: 'Claim analytics example', code: 'ANALYTICS', country: 'Singapore' });
  projectIds.add(project.id);
  Object.assign(project, { locked: true, lockedAt: '2026-07-01T12:00:00+08:00', version: 1,
    contract: { ...project.contract, currency: 'SGD', totalAmount: 1000 },
    items: [{ id: 'A', ref: 'A/01', description: 'Scaffold work', unit: 'm²', quantity: 100, rate: 10,
      amount: 1000, pricingType: 'measured', verified: 50, reported: 65 }],
    reports: [{ id: 'RA', projectId: project.id, projectCode: project.code, itemId: 'A', status: 'verified', completion: 50,
      date: '2026-07-15T09:00:00+08:00', verifiedAt: '2026-07-15T10:00:00+08:00' }],
    whatsappMessages: [], voReviews: [], claimDrafts: [], claimTracking: [], messageClarifications: [], history: [] });
  project.sourceItems = structuredClone(project.items);
  return project;
}
function save(project, period, quantity = 50) {
  return updated(saveClaimDraft(project, period, { priorConfirmed: true,
    work: { A: { include: true, assessedQuantity: quantity, previousValue: 0 } } }));
}
function prepare(project, id) { return updated(markClaimPrepared(project, id)).project; }
function stage(project, id, action, fields = {}) {
  return updated(recordClaimStage(project, id, action, { date: '2026-10-25', reference: `ANALYTICS-${action}-${id}`, ...fields })).project;
}
function mixedClaims() {
  let saved = save(base(), '2026-07');
  let project = prepare(saved.project, saved.draft.id);
  saved = save(project, '2026-08');
  project = stage(prepare(saved.project, saved.draft.id), saved.draft.id, 'submitted');
  saved = save(project, '2026-09');
  project = stage(prepare(saved.project, saved.draft.id), saved.draft.id, 'submitted');
  project = stage(project, saved.draft.id, 'query', { note: 'Clarify the measured quantity.' });
  saved = save(project, '2026-10');
  project = stage(prepare(saved.project, saved.draft.id), saved.draft.id, 'submitted');
  project = stage(project, saved.draft.id, 'certified', { value: 400, note: 'Mock certification is lower than the claimed amount.' });
  project = stage(project, saved.draft.id, 'payment', { value: 400 });
  saved = save(project, '2026-11');
  saved = save(saved.project, '2026-11', 40);
  saved.project.claimDrafts.find(entry => entry.id === saved.draft.id).snapshot.totals.currentValue = null;
  return saved.project;
}
function approve(project, id, value, eligible = false) {
  project.reports.push({ id, projectId: project.id, projectCode: project.code, vo: true, status: 'pending', scopeLabel: id, date: '2026-10-20' });
  project.voReviews.push({ id, reportId: id, projectId: project.id, status: 'approved', approvedValue: value,
    approvalReference: `APP-${id}`, approver: 'Demo QS', history: [{ action: 'approve', to: 'approved', date: '2026-10-21T00:00:00Z' }],
    ...(eligible ? { reviewChecksVersion: 1, scopeDisposition: 'variation', scopeAssessment: 'Changed access required',
      instructionStatus: 'documented', instructionReference: 'DEMO-INSTRUCTION', executionStatus: 'verified', executionReference: 'DEMO-EVIDENCE',
      executionVerifiedAt: '2026-10-21T00:00:00Z', claimEligibility: 'eligible', eligibilityNote: 'Demo QS assessed evidence', eligibilityReviewedAt: '2026-10-22T00:00:00Z' } : {}) });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup();
  for (const id of projectIds) clearProjectFormBuffers(id);
  projectIds.clear(); vi.useRealTimers(); vi.unstubAllGlobals();
  if (priorScroll) Object.defineProperty(Element.prototype, 'scrollTo', priorScroll);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('simplified read-only dashboard', () => {
  it('shows three summary cards and three latest monthly versions without inventing unknown amounts or changing saved records', async () => {
    const project = mixedClaims();
    const before = structuredClone(project);
    const opened = vi.fn();
    const user = userEvent.setup();
    render(<ProjectDashboard project={project} onNavigate={vi.fn()} onOpenRecord={opened}/>);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(kpi('Latest claim').textContent).toContain('Not recorded');
    expect(kpi('Latest claim').textContent).not.toContain('0.00');
    const recent = screen.getByRole('region', { name: 'Recent claims', exact: true });
    expect(within(recent).getAllByRole('listitem')).toHaveLength(3);
    expect(within(recent).getByRole('button', { name: 'Open November 2026 claim, version 2, Draft', exact: true })).toBeTruthy();
    expect(within(recent).getByRole('button', { name: 'Open October 2026 claim, version 1, Paid', exact: true })).toBeTruthy();
    expect(within(recent).getByRole('button', { name: 'Open September 2026 claim, version 1, Needs revision', exact: true })).toBeTruthy();
    expect(within(recent).queryByText('August 2026', { exact: true })).toBeNull();
    expect(within(recent).queryByRole('button', { name: 'Open November 2026 claim, version 1, Draft', exact: true })).toBeNull();
    await user.click(within(kpi('Latest claim')).getByRole('button'));
    expect(opened).toHaveBeenCalledExactlyOnceWith(getProjectDashboard(project).latestClaim.target);
    expect(screen.queryByRole('region', { name: 'Needs attention', exact: true })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Review status', exact: true })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Extra work', exact: true })).toBeNull();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
    expect(screen.queryByRole('navigation', { name: 'Project workflow', exact: true })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Project dashboard summary', exact: true })).toBeNull();
    expect(project).toEqual(before);
  });

  it('shows only QS-eligible value rather than approved prices and refreshes cards and empty actions for another project', async () => {
    const project = base(); approve(project, 'UNKNOWN-PRICE', null); approve(project, 'PRICE-ONLY', 3000); approve(project, 'ELIGIBLE', 100, true);
    const empty = base(); empty.id = 'OTHER-ANALYTICS'; empty.code = 'OTHER'; empty.items = []; empty.reports = [];
    const before = structuredClone([project, empty]);
    const props = { onNavigate: vi.fn(), onOpenRecord: vi.fn() };
    const user = userEvent.setup();
    const view = render(<ProjectDashboard project={project} {...props}/>);
    expect(kpi('Claim-eligible extra work').textContent).toContain('100.00');
    expect(kpi('Claim-eligible extra work').textContent).not.toContain('3,100.00');
    expect(within(kpi('Extra work to review')).getByText('2', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Price approved', exact: true })).toBeNull();
    expect(kpi('Claim-eligible extra work').textContent).not.toMatch(/unclaimed|unpaid/i);
    await user.click(within(kpi('Extra work to review')).getByRole('button'));
    await user.click(within(kpi('Claim-eligible extra work')).getByRole('button'));
    expect(props.onNavigate.mock.calls).toEqual([['vo'], ['vo']]);
    view.rerender(<ProjectDashboard project={empty} {...props}/>);
    expect(kpi('Latest claim').textContent).toContain('Not recorded');
    expect(kpi('Latest claim').textContent).not.toContain('0.00');
    expect(kpi('Claim-eligible extra work').textContent).toContain('0.00');
    expect(within(kpi('Extra work to review')).getByText('0', { exact: true })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Recent claims', exact: true }).textContent).toContain('No saved claims yet');
    await user.click(within(kpi('Latest claim')).getByRole('button', { name: 'Open monthly claims', exact: true }));
    expect(props.onNavigate).toHaveBeenLastCalledWith('claims');
    expect([project, empty]).toEqual(before);
  });

  it('keeps the exact unresolved saved claim in notifications and retains its dashboard return after reload', async () => {
    const original = createSITContractDemo({ name: 'S.I.T. analytics attention', code: 'DASH-ATTENTION' }, now);
    projectIds.add(original.id);
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: original.id,
      projects: [original], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: original.id } }));
    const loaded = loadShowcaseWorkspace(localStorage, now);
    const project = loaded.projects.find(entry => entry.id === original.id);
    const claim = getProjectAttention(project).find(entry => entry.category === 'claims');
    expect(claim).toBeTruthy();
    const before = workspace().projects;
    const pack = buildClaimPack(project, claim.target.draftId);
    window.history.replaceState(null, '', '#dashboard');
    const user = userEvent.setup();
    let view = render(<App/>);
    expect(screen.queryByRole('region', { name: 'Needs attention', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Needs attention, \d+ pending tasks$/ }));
    const notifications = await screen.findByRole('dialog', { name: 'Project notifications' });
    const queue = within(notifications).getByRole('region', { name: 'Needs attention', exact: true });
    const expand = within(notifications).queryByRole('button', { name: /^View all/ });
    if (expand) await user.click(expand);
    await user.click(within(queue).getByRole('button', { name: `${claim.actionLabel}: ${claim.reference || claim.title}`, exact: true }));
    await screen.findByRole('heading', { name: 'Prepare a monthly claim', exact: true });
    expect(params().get('draft')).toBe(claim.target.draftId);
    expect(params().get('from')).toBe('dashboard');
    view.unmount(); view = render(<App/>);
    expect(screen.getByRole('button', { name: 'Back to dashboard', exact: true })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    expect(location.hash).toBe('#dashboard');
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), claim.target.draftId)).toEqual(pack);
  });

  it('opens the latest saved claim even when its older month is outside the three recent monthly rows', async () => {
    const original = mixedClaims();
    const older = original.claimDrafts.find(entry => entry.period === '2026-07');
    older.createdAt = '2026-10-25T02:00:00Z';
    const showcase = createSITContractDemo({ name: 'Separate S.I.T. showcase', code: 'ANALYTICS-SHOWCASE' }, now);
    projectIds.add(showcase.id);
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ schemaVersion: 2, activeProjectId: original.id,
      projects: [showcase, original], sitShowcase: { version: SIT_SHOWCASE_VERSION, projectId: showcase.id } }));
    const loaded = loadShowcaseWorkspace(localStorage, now);
    const project = loaded.projects.find(entry => entry.id === original.id);
    expect(getProjectDashboard(project).claims.every(entry => entry.id !== older.id)).toBe(true);
    const before = workspace().projects;
    const pack = buildClaimPack(project, older.id);
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#dashboard');
    render(<App/>);
    expect(within(screen.getByRole('region', { name: 'Recent claims', exact: true })).getAllByRole('listitem')).toHaveLength(3);
    await user.click(within(kpi('Latest claim')).getByRole('button', { name: 'Open latest claim: July 2026, version 1, Prepared', exact: true }));
    await screen.findByRole('heading', { name: 'Claim status', exact: true });
    expect(params().get('draft')).toBe(older.id);
    expect(params().get('from')).toBe('dashboard');
    await user.click(screen.getByRole('button', { name: 'Back to dashboard', exact: true }));
    await screen.findByRole('heading', { name: 'Dashboard', exact: true });
    expect(workspace().projects).toEqual(before);
    expect(buildClaimPack(workspace().projects.find(entry => entry.id === project.id), older.id)).toEqual(pack);
  });
});
