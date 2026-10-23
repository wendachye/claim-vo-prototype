import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthlyClaimView } from '../src/components/MonthlyClaimView.jsx';
import { ClaimStatusTracker } from '../src/components/ClaimStatusTracker.jsx';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.js';
import { getClaimTracking, recordClaimStage } from '../src/data/claim-tracking.js';
import { markClaimPrepared, saveClaimDraft } from '../src/data/claims.js';
import { saveClaimRevision } from '../src/data/claim-revisions.js';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.js';

const now = new Date('2026-10-22T10:00:00+08:00');
const ids = new Set();
afterEach(() => { for (const id of ids) clearProjectFormBuffers(id); ids.clear(); vi.restoreAllMocks(); });

function fixture(status) {
  let project = createClaimExamplesDemo({ name: 'Lifecycle action example', code: `CLAIM-ACTION-${status}` }, now);
  ids.add(project.id);
  const draft = project.claimDrafts.find(entry => entry.period === '2026-08');
  project = { ...project, claimDrafts: [draft], claimTracking: [] };
  const apply = (action, date, values = {}) => {
    const result = recordClaimStage(project, draft.id, action, { date, reference: `DEMO-${action}`, ...values });
    expect(result.outcome).toBe('updated');
    project = result.project;
  };
  apply('submitted', '2026-08-04');
  if (status === 'queried') apply('query', '2026-08-05', { note: 'Clarify the independently measured cladding quantity.', targetType: 'work', targetId: 'WI-001' });
  if (['certified', 'paid'].includes(status)) apply('certified', '2026-08-05', { value: 5000 });
  if (status === 'paid') apply('payment', '2026-08-06', { value: 5000 });
  writeFormBuffer(project.id, 'claims:period', '2026-08');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  return { project, draft };
}

const statusAction = (status) => status === 'paid' ? 'View payment history' : status === 'queried' ? 'Review query' : 'Track claim status';

describe('claim actions follow the recorded lifecycle', () => {
  it.each(['submitted', 'certified', 'paid'])('keeps a %s claim read-only in the saved list', async (status) => {
    const user = userEvent.setup();
    const { project, draft } = fixture(status);
    const original = structuredClone(project);
    const onTrack = vi.fn(); const onSave = vi.fn();
    render(<MonthlyClaimView project={project} initialTab="drafts" onTrack={onTrack} onSave={onSave} />);
    const row = screen.getByRole('heading', { name: 'August 2026', exact: true }).closest('article');
    expect(within(row).queryByRole('menuitem', { name: 'Start new version', exact: true })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Edit claim', exact: true })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Mark prepared', exact: true })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Preview & export' })).toBeTruthy();
    await user.click(within(row).getByRole('button', { name: statusAction(status), exact: true }));
    expect(onTrack).toHaveBeenCalledWith(draft.id);
    expect(onSave).not.toHaveBeenCalled();
    expect(project).toEqual(original);
  });

  it.each(['submitted', 'certified', 'paid'])('does not reopen a %s assessment from a direct draft-edit link', async (status) => {
    const user = userEvent.setup();
    const { project, draft } = fixture(status);
    const original = structuredClone(project);
    const onTrack = vi.fn(); const onSave = vi.fn();
    render(<MonthlyClaimView project={project} initialDraftId={draft.id} onTrack={onTrack} onSave={onSave} />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save claim draft', exact: true })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Start new version', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: statusAction(status), exact: true }));
    expect(onTrack).toHaveBeenCalledWith(draft.id);
    expect(onSave).not.toHaveBeenCalled();
    expect(project).toEqual(original);
  });

  it('keeps a legacy ordinary draft behind an issued version read-only and links each action to the correct saved record', async () => {
    const user = userEvent.setup();
    const { project, draft } = fixture('submitted');
    const result = saveClaimDraft(project, draft.period, { ...draft.assessment, work: { 'WI-001': { include: true, assessedQuantity: 210, previousValue: 0 } } });
    expect(result.outcome).toBe('updated');
    const original = structuredClone(result.project);
    const onTrack = vi.fn(); const onPreview = vi.fn(); const onSave = vi.fn();
    const view = render(<MonthlyClaimView project={result.project} initialTab="drafts" onTrack={onTrack} onPreview={onPreview} onSave={onSave} />);
    const row = screen.getByRole('heading', { name: 'August 2026', exact: true }).closest('article');
    expect(within(row).getByText('Read-only draft', { exact: true })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Edit claim', exact: true })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Mark prepared', exact: true })).toBeNull();
    await user.click(within(row).getByRole('button', { name: 'Preview & export' }));
    expect(onPreview).toHaveBeenCalledWith(result.draft.id);
    await user.click(within(row).getByRole('button', { name: 'Track claim status', exact: true }));
    expect(onTrack).toHaveBeenCalledWith(draft.id);
    view.unmount();
    render(<MonthlyClaimView project={result.project} initialDraftId={result.draft.id} onTrack={onTrack} onSave={onSave} />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: /Save.*later|Save claim draft/ })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(result.project).toEqual(original);
  });

  it('removes new-version actions from an already-open saved result after its tracking advances', async () => {
    const user = userEvent.setup();
    const project = createClaimExamplesDemo({ name: 'Saved-result lifecycle example', code: 'SAVED-RESULT-ACTION' }, now);
    ids.add(project.id);
    const original = structuredClone(project);
    const ready = project.claimDrafts.find(entry => entry.period === '2026-09');
    writeFormBuffer(project.id, 'claims:period', ready.period);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const props = { initialDraftId: ready.id, onSave: vi.fn(() => ({ outcome: 'unchanged', draft: ready, project })), onTrack: vi.fn() };
    const view = render(<MonthlyClaimView project={project} {...props} />);
    await user.click(screen.getByRole('button', { name: 'Review claim', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Save claim draft', exact: true }));
    let current = markClaimPrepared(project, ready.id).project;
    view.rerender(<MonthlyClaimView project={current} {...props} />);
    await user.click(screen.getByText('More options', { exact: true }));
    expect(screen.getByRole('menuitem', { name: 'Start new version', exact: true })).toBeTruthy();
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    for (const [action, value] of [['submitted', undefined], ['certified', ready.snapshot.totals.currentValue], ['payment', ready.snapshot.totals.currentValue]]) {
      const result = recordClaimStage(current, ready.id, action, { date, reference: `DEMO-RESULT-${action}`, value });
      expect(result.outcome).toBe('updated');
      current = result.project;
      view.rerender(<MonthlyClaimView project={current} {...props} />);
      expect(screen.queryByRole('menuitem', { name: 'Start new version', exact: true })).toBeNull();
      expect(screen.getByRole('button', { name: 'Preview & export' })).toBeTruthy();
      expect(current.claimDrafts.find(entry => entry.id === ready.id).snapshot).toEqual(ready.snapshot);
    }
    expect(screen.getByRole('button', { name: 'View payment history', exact: true })).toBeTruthy();
    expect(project).toEqual(original);
  });

  it('shows payment history and saved preview without record controls once Paid', async () => {
    const user = userEvent.setup();
    const { project, draft } = fixture('paid');
    const original = structuredClone(project);
    const onRecord = vi.fn(); const onPreview = vi.fn();
    render(<ClaimStatusTracker project={project} draftId={draft.id} onRecord={onRecord} onPreview={onPreview} />);
    expect(screen.getByRole('heading', { name: 'Payment fully recorded' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use demo details' })).toBeNull();
    await user.click(screen.getByText(/^Tracking history/));
    expect(screen.getByText('DEMO-payment')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Preview saved claim' }));
    expect(onPreview).toHaveBeenCalledWith(draft.id);
    expect(onRecord).not.toHaveBeenCalled();
    expect(project).toEqual(original);
  });

  it('locks an issued month in generic preparation and restores another month’s unfinished values', async () => {
    const user = userEvent.setup();
    const { project, draft } = fixture('paid');
    const original = structuredClone(project);
    const assessment = { work: { 'WI-001': { include: true, assessedQuantity: 333, previousValue: 5000 } }, vos: {}, priorConfirmed: true, note: 'Unfinished current-month measurement.' };
    writeFormBuffer(project.id, 'claims:forms', { '2026-10': assessment });
    writeFormBuffer(project.id, 'claims:dirty', { '2026-10': true });
    const onSave = vi.fn(); const onTrack = vi.fn();
    render(<MonthlyClaimView project={project} initialTab="drafts" onSave={onSave} onTrack={onTrack} />);
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true }));
    expect(screen.getByLabelText('Claim period').value).toBe('2026-08');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: /Save.*later|Save claim draft/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View payment history', exact: true }));
    expect(onTrack).toHaveBeenCalledWith(draft.id);
    fireEvent.change(screen.getByLabelText('Claim period'), { target: { value: '2026-10' } });
    expect(screen.getByRole('checkbox', { name: 'Include WI-001 in claim' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Enter totals', exact: true }));
    expect(screen.getByRole('spinbutton', { name: 'WI-001 QS cumulative quantity' }).value).toBe('333');
    expect(screen.getByRole('spinbutton', { name: 'WI-001 previously claimed value' }).value).toBe('5000');
    expect(readFormBuffer(project.id, 'claims:forms')['2026-10']).toEqual(assessment);
    expect(onSave).not.toHaveBeenCalled();
    expect(project).toEqual(original);
  });

  it('blocks a queried month generically while keeping the dedicated response revision editable', async () => {
    const user = userEvent.setup();
    const { project, draft } = fixture('queried');
    const original = structuredClone(project);
    const onTrack = vi.fn(); const onSave = vi.fn();
    const view = render(<MonthlyClaimView project={project} initialTab="drafts" onTrack={onTrack} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true }));
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save claim draft', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Review query', exact: true }));
    expect(onTrack).toHaveBeenCalledWith(draft.id);
    view.unmount();
    const onSaveRevision = vi.fn((sourceId, assessment, response) => saveClaimRevision(project, sourceId, assessment, response));
    render(<MonthlyClaimView project={project} initialRevisionSourceId={draft.id} onSave={onSave} onSaveRevision={onSaveRevision} />);
    expect(screen.getByRole('heading', { name: 'Revise claim' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'WI-001 QS cumulative quantity' }).value).toBe('200');
    await user.type(screen.getByRole('textbox', { name: /QS response/ }), 'The measured quantity is confirmed; supporting clarification supplied.');
    await user.click(screen.getByRole('button', { name: 'Review claim', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Save revised claim', exact: true }));
    expect(onSaveRevision).toHaveBeenCalledTimes(1);
    const result = onSaveRevision.mock.results[0].value;
    expect(result.outcome).toBe('updated');
    expect(result.draft.revisionOf).toBe(draft.id);
    expect(result.draft.queryId).toBe(getClaimTracking(project, draft.id).query.id);
    expect(result.project.claimDrafts[0]).toEqual(draft);
    expect(onSave).not.toHaveBeenCalled();
    expect(project).toEqual(original);
  });
});
