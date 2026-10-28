import { chooseSelect, selectOptions } from './select-helpers.mjs';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimStatusTracker } from '../src/components/ClaimStatusTracker';
import { getClaimTracking, recordClaimStage } from '../src/data/claim-tracking.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const ids = new Set();
afterEach(() => { for (const id of ids) clearProjectFormBuffers(id); ids.clear(); });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function fixture(id = 'QUERY-UI') {
  ids.add(id);
  const draft = { id: `CLAIM-${id}-2026-10-R1`, projectId: id, period: '2026-10', revision: 1,
    status: 'prepared', preparedAt: '2026-10-01T12:00:00+08:00', createdAt: '2026-10-01T10:00:00+08:00', assessment: {},
    snapshot: { projectId: id, period: '2026-10', currency: 'SGD', totals: { currentValue: 100 },
      workRows: [{ id: 'A', ref: 'A/01', description: 'Scaffold access', included: true }, { id: 'B', ref: 'B/01', description: 'Unselected work', included: false }],
      voRows: [{ id: 'VO1', reference: 'VO-01', title: 'Extra landing', included: true }] } };
  const project = { id, name: 'Query UI demo', contract: { currency: 'SGD' }, claimDrafts: [draft], claimTracking: [], history: [], items: [{ id: 'LIVE-ONLY', description: 'Later live work' }], reports: [] };
  return recordClaimStage(project, draft.id, 'submitted', { date: '2026-10-02', reference: 'DEMO-SUB' }).project;
}
function queried(project = fixture()) {
  return recordClaimStage(project, project.claimDrafts[0].id, 'query', {
    date: '2026-10-03', reference: 'DEMO-QUERY-001', note: 'Please check the measured scaffold quantity.', targetType: 'work', targetId: 'A',
  }).project;
}
function child(project, status = 'draft') {
  const source = project.claimDrafts[0];
  const draft = { ...structuredClone(source), id: `CLAIM-${project.id}-2026-10-R2`, revision: 2, status,
    revisionOf: source.id, queryId: getClaimTracking(project, source.id).query.id, revisionResponse: 'Reviewed the measurement and clarified the assessment.' };
  return { ...project, claimDrafts: [...project.claimDrafts, draft] };
}
function Harness({ initial, onRecorded = () => {}, onRevise = () => {} }) {
  const [project, setProject] = useState(initial);
  return <ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} onRevise={onRevise} onRecord={(draftId, action, fields) => {
    const result = recordClaimStage(project, draftId, action, fields);
    onRecorded(result);
    if (result.outcome === 'updated') setProject(result.project);
    return result;
  }} />;
}

describe('claim query and revision tracker', () => {
  it('offers only saved selected work, requires remarks and records a query only after explicit save', async () => {
    const user = userEvent.setup();
    const project = fixture();
    const original = structuredClone(project);
    const onRecord = vi.fn((draftId, action, fields) => recordClaimStage(project, draftId, action, fields));
    render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} onRecord={onRecord} />);
    expect(screen.getByRole('heading', { name: 'Record certification' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Record a query' }));
    expect(screen.queryByLabelText(/Certified amount/)).toBeNull();
    const choices = await selectOptions(user, screen.getByRole('combobox', { name: /Related work/ }));
    expect(choices.map((entry) => entry.textContent)).toEqual(['Whole claim', 'A/01 · Scaffold access', 'VO-01 · Extra landing']);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Record query', exact: true }));
    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.getByText('Describe the query so the QS knows what to review.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    expect(onRecord).not.toHaveBeenCalled();
    await chooseSelect(user, screen.getByRole('combobox', { name: /Related work/ }), 'vo:VO1');
    await user.clear(screen.getByRole('textbox', { name: /Query remarks/ }));
    await user.type(screen.getByRole('textbox', { name: /Query remarks/ }), 'Please clarify the separately assessed landing.');
    await user.click(screen.getByRole('button', { name: 'Record query', exact: true }));
    expect(onRecord).toHaveBeenCalledWith(project.claimDrafts[0].id, 'query', {
      date: today(), reference: 'DEMO-QUERY-R1', note: 'Please clarify the separately assessed landing.', targetType: 'vo', targetId: 'VO1',
    });
    expect(project).toEqual(original);
  });

  it('keeps query and certification edits separate across toggling, browsing and projects', async () => {
    const user = userEvent.setup();
    const project = fixture();
    const view = render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} />);
    await user.type(screen.getByLabelText(/Certificate reference/), 'CERT-DRAFT');
    await user.type(screen.getByLabelText(/Certified amount/), '90');
    await user.click(screen.getByRole('button', { name: 'Record a query' }));
    await user.type(screen.getByLabelText(/Query reference/), 'QUERY-DRAFT');
    await user.type(screen.getByRole('textbox', { name: /Query remarks/ }), 'Need measurement detail.');
    await user.click(screen.getByRole('button', { name: 'Back to certification' }));
    expect(screen.getByLabelText(/Certificate reference/).value).toBe('CERT-DRAFT');
    expect(screen.getByLabelText(/Certified amount/).value).toBe('90');
    await user.click(screen.getByRole('button', { name: 'Record a query' }));
    view.unmount();
    const other = fixture('QUERY-OTHER');
    const otherView = render(<ClaimStatusTracker project={other} draftId={other.claimDrafts[0].id} />);
    expect(screen.queryByLabelText(/Query reference/)).toBeNull();
    expect(screen.getByLabelText(/Certificate reference/).value).toBe('');
    otherView.unmount();
    render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} />);
    expect(screen.getByLabelText(/Query reference/).value).toBe('QUERY-DRAFT');
    expect(screen.getByRole('textbox', { name: /Query remarks/ }).value).toBe('Need measurement detail.');
  });

  it('opens a separate revision after recording a query and leaves the original assessment intact', async () => {
    const user = userEvent.setup();
    const initial = fixture();
    const source = structuredClone(initial.claimDrafts[0]);
    const revise = vi.fn();
    const records = [];
    render(<Harness initial={initial} onRevise={revise} onRecorded={(result) => records.push(result)} />);
    await user.click(screen.getByRole('button', { name: 'Record a query' }));
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    await user.click(screen.getByRole('button', { name: 'Record query', exact: true }));
    const panel = screen.getByRole('region', { name: 'Recorded claim query' });
    expect(within(panel).getByRole('heading', { name: 'Query needs a revision' })).toBeTruthy();
    expect(panel.textContent).toContain('A/01 · Scaffold access');
    expect(panel.textContent).toContain('DEMO-QUERY-R1');
    expect(screen.queryByRole('button', { name: 'Record certification', exact: true })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Certified amount fully paid' })).toBeNull();
    const timeline = screen.getByRole('list', { name: 'Claim stages' });
    expect(within(timeline).getByText('Submitted').closest('li').getAttribute('aria-current')).toBe('step');
    expect(within(timeline).getByText('Certified').closest('li').textContent).toContain('Not yet');
    await user.click(within(panel).getByRole('button', { name: 'Revise claim' }));
    expect(revise).toHaveBeenCalledWith(source.id);
    expect(records.at(-1).project.claimDrafts[0]).toEqual(source);
    expect(records.at(-1).tracking.status).toBe('queried');
  });

  it('links a draft response and then the prepared or resubmitted replacement without changing the original query', async () => {
    const user = userEvent.setup();
    const project = queried();
    const originalTracking = structuredClone(project.claimTracking);
    const draftProject = child(project);
    const revise = vi.fn();
    const open = vi.fn();
    const view = render(<ClaimStatusTracker project={draftProject} draftId={project.claimDrafts[0].id} onRevise={revise} onOpenRevision={open} />);
    await user.click(screen.getByRole('button', { name: 'Continue revision' }));
    expect(revise).toHaveBeenCalledWith(project.claimDrafts[0].id);
    const preparedProject = child(project, 'prepared');
    view.rerender(<ClaimStatusTracker project={preparedProject} draftId={project.claimDrafts[0].id} onRevise={revise} onOpenRevision={open} />);
    await user.click(screen.getByRole('button', { name: 'Open revised claim' }));
    expect(open).toHaveBeenCalledWith(preparedProject.claimDrafts[1].id);
    const resubmitted = recordClaimStage(preparedProject, preparedProject.claimDrafts[1].id, 'submitted', { date: '2026-10-04', reference: 'DEMO-RESUB' });
    expect(resubmitted.outcome).toBe('updated');
    view.rerender(<ClaimStatusTracker project={resubmitted.project} draftId={project.claimDrafts[0].id} onOpenRevision={open} />);
    expect(screen.getByRole('heading', { name: 'Query addressed in version 2' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Recorded claim query' }).textContent).toContain('Version 2 · Submitted');
    expect(screen.getByText('Revised', { exact: true })).toBeTruthy();
    expect(resubmitted.project.claimTracking.find((entry) => entry.draftId === project.claimDrafts[0].id)).toEqual(originalTracking[0]);
  });

  it('shows the response and an explicit resubmission action on the prepared replacement', async () => {
    const user = userEvent.setup();
    const project = child(queried(), 'prepared');
    const source = project.claimDrafts[0];
    const replacement = project.claimDrafts[1];
    const onRecord = vi.fn((draftId, action, fields) => recordClaimStage(project, draftId, action, fields));
    const onOpenRevision = vi.fn();
    render(<ClaimStatusTracker project={project} draftId={replacement.id} onRecord={onRecord} onOpenRevision={onOpenRevision} />);
    expect(screen.getByRole('region', { name: 'Response to original query' }).textContent).toContain('Revises version 1 · DEMO-QUERY-001');
    expect(screen.getByText(replacement.revisionResponse)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Record resubmission' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'View original query' }));
    expect(onOpenRevision).toHaveBeenCalledWith(source.id);
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Resubmission reference/).value).toBe('DEMO-RESUB-R2');
    await user.click(screen.getByRole('button', { name: 'Record resubmission', exact: true }));
    expect(onRecord).toHaveBeenCalledWith(replacement.id, 'submitted', expect.objectContaining({ reference: 'DEMO-RESUB-R2' }));
    expect(project.claimDrafts[0]).toEqual(source);
  });
});
