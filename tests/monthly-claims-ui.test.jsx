import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthlyClaimView } from '../src/components/MonthlyClaimView.jsx';
import { ClaimPackPreview } from '../src/components/ClaimPackPreview.jsx';
import { ClaimStatusTracker } from '../src/components/ClaimStatusTracker.jsx';
import { createProject } from '../src/data/projects.js';
import { markClaimPrepared, saveClaimDraft } from '../src/data/claims.js';
import { recordClaimStage } from '../src/data/claim-tracking.js';
import { clearProjectFormBuffers, writeFormBuffer } from '../src/data/form-buffer.js';

const projectIds = new Set();
afterEach(() => { for (const id of projectIds) clearProjectFormBuffers(id); projectIds.clear(); vi.restoreAllMocks(); });

function fixture(saved = true) {
  const project = createProject({ name: 'Monthly claims UI example', code: 'CLAIM-CLEANUP', country: 'Singapore' });
  projectIds.add(project.id);
  Object.assign(project, {
    locked: true, lockedAt: '2026-09-01T12:00:00+08:00',
    items: [{ id: 'A', ref: 'A/01', description: 'Measured scaffold', unit: 'm²', quantity: 100,
      rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 50, needsReview: false }],
    reports: [{ id: 'R-A', projectId: project.id, itemId: 'A', status: 'verified', completion: 50,
      date: '2026-10-15T09:00:00+08:00', verifiedAt: '2026-10-16T12:00:00+08:00', message: 'Original mock site evidence.' }],
    voReviews: [], claimDrafts: [], claimTracking: [],
  });
  writeFormBuffer(project.id, 'claims:period', '2026-10');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  if (!saved) return project;
  const result = saveClaimDraft(project, '2026-10', {
    work: { A: { include: true, assessedQuantity: 40, previousValue: 5 } }, priorConfirmed: true,
  });
  expect(result.draft.snapshot.canPrepare).toBe(true);
  return result.project;
}

function SavedClaimJourney({ initial, onChange, onSave }) {
  const [project, setProject] = useState(initial);
  const [view, setView] = useState('list');
  const [draftId, setDraftId] = useState(null);
  const update = (result) => { if (result.outcome === 'updated') { setProject(result.project); onChange(result.project); } return result; };
  const open = (next) => (id) => { setDraftId(id); setView(next); };
  if (view === 'preview') return <ClaimPackPreview project={project} draftId={draftId} onBack={() => setView('list')} />;
  if (view === 'tracking') return <ClaimStatusTracker project={project} draftId={draftId} onBack={() => setView('list')} onPreview={open('preview')} onRecord={(id, action, fields) => update(recordClaimStage(project, id, action, fields))} />;
  return <MonthlyClaimView project={project} initialTab="drafts" onSave={onSave} onPreview={open('preview')} onTrack={open('tracking')} onPrepare={(id) => update(markClaimPrepared(project, id))} />;
}

describe('simplified monthly claims journey', () => {
  it('previews a saved draft, prepares that same version and tracks it without saving again', async () => {
    const user = userEvent.setup();
    const project = fixture();
    const original = structuredClone(project);
    const saved = project.claimDrafts[0];
    const save = vi.fn();
    const changes = [];
    render(<SavedClaimJourney initial={project} onSave={save} onChange={(next) => changes.push(next)} />);
    await user.click(screen.getByRole('button', { name: 'Preview & export' }));
    expect(screen.getByRole('article', { name: 'October 2026 claim assessment revision 1' }).textContent).toContain('395.00');
    expect(changes).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Back to claims' }));
    await user.click(screen.getByRole('button', { name: 'Mark prepared', exact: true }));
    expect(changes).toHaveLength(1);
    expect(changes[0].claimDrafts).toHaveLength(1);
    expect(changes[0].claimDrafts[0]).toEqual({ ...saved, status: 'prepared', preparedAt: expect.any(String) });
    await user.click(screen.getByRole('button', { name: 'Track claim status', exact: true }));
    expect(screen.getByRole('heading', { name: 'Record submission' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    expect(changes).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Record submission', exact: true }));
    expect(screen.getByRole('heading', { name: 'Record certification' })).toBeTruthy();
    expect(changes.at(-1).claimTracking[0].draftId).toBe(saved.id);
    expect(changes.at(-1).claimTracking[0].claimedValue).toBe(395);
    expect(changes.at(-1).claimDrafts[0].snapshot).toEqual(saved.snapshot);
    expect(changes.at(-1).claimDrafts[0].assessment).toEqual(saved.assessment);
    expect(changes.at(-1).reports).toEqual(original.reports);
    expect(save).not.toHaveBeenCalled();
    expect(project).toEqual(original);
  });

  it('keeps zero assessed work distinct from unchecked prior amounts through the preparation steps', async () => {
    const user = userEvent.setup();
    const project = fixture(false);
    const original = structuredClone(project);
    const save = vi.fn((period, assessment) => saveClaimDraft(project, period, assessment));
    render(<MonthlyClaimView project={project} onSave={save} />);
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true }));
    await user.click(screen.getByRole('checkbox', { name: 'Include A in claim' }));
    await user.click(screen.getByRole('button', { name: 'Enter totals', exact: true }));
    await user.type(screen.getByRole('spinbutton', { name: 'A QS cumulative quantity' }), '0');
    expect(screen.getByRole('spinbutton', { name: 'A previously claimed value' }).value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Review claim', exact: true }));
    expect(screen.getByText('Confirm that you checked previous claims. Blank amounts mean zero only after confirmation.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back to enter totals' }));
    await user.click(screen.getByRole('checkbox', { name: /Confirm previous claims/ }));
    await user.click(screen.getByRole('button', { name: 'Review claim', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Save claim draft', exact: true }));
    expect(save).toHaveBeenCalledTimes(1);
    const result = save.mock.results[0].value;
    expect(result.draft.snapshot.totals.currentValue).toBe(0);
    expect(result.draft.snapshot.totals.previousValue).toBe(0);
    expect(result.draft.snapshot.canPrepare).toBe(true);
    expect(result.draft.status).toBe('draft');
    expect(screen.getByRole('button', { name: 'Mark prepared' }).disabled).toBe(false);
    expect(project).toEqual(original);
  });
});
