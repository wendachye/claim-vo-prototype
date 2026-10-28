import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimStatusTracker } from '../src/components/ClaimStatusTracker';
import { getClaimTracking, recordClaimStage } from '../src/data/claim-tracking.ts';
import { clearProjectFormBuffers, readFormBuffer } from '../src/data/form-buffer.ts';

const projectIds = new Set();
const date = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
afterEach(() => { for (const id of projectIds) clearProjectFormBuffers(id); projectIds.clear(); });

function fixture(value = 100, id = 'TRACK-UI') {
  projectIds.add(id);
  const draft = { id: `CLAIM-${id}-2026-10-R1`, projectId: id, period: '2026-10', revision: 1, status: 'prepared', preparedAt: '2026-10-01T12:00:00+08:00', createdAt: '2026-10-01T10:00:00+08:00', assessment: {}, snapshot: { projectId: id, period: '2026-10', currency: 'SGD', totals: { currentValue: value } } };
  return { id, name: 'Tracker UI demo', claimDrafts: [draft], claimTracking: [], history: [], items: [], reports: [] };
}
function submitted(project) {
  return recordClaimStage(project, project.claimDrafts[0].id, 'submitted', { date: date(), reference: 'DEMO-SUB-1', note: '' }).project;
}
function Harness({ initial, onRecorded = () => {} }) {
  const [project, setProject] = useState(initial);
  return <ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} onBack={() => {}} onPreview={() => {}} onRecord={(draftId, action, fields) => {
    const result = recordClaimStage(project, draftId, action, fields);
    onRecorded(result);
    if (result.outcome === 'updated') setProject(result.project);
    return result;
  }} />;
}

describe('mock claim status tracker', () => {
  it('keeps the prepared summary compact, preserves revision details and validates before recording', async () => {
    const user = userEvent.setup();
    const project = fixture(0);
    const onRecord = vi.fn();
    const onPreview = vi.fn();
    render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} onBack={() => {}} onRecord={onRecord} onPreview={onPreview} />);
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Back to monthly claims', exact: true })).toHaveLength(1);
    const details = screen.getByText('Saved claim details').closest('details');
    expect(details.open).toBe(false);
    await user.click(screen.getByText('Saved claim details'));
    expect(within(details).getByText('Version').nextElementSibling.textContent).toBe('1');
    expect(screen.getByText(project.claimDrafts[0].id)).toBeTruthy();
    expect(screen.getByText('SGD 0.00')).toBeTruthy();
    expect(screen.queryByText('Not recorded')).toBeNull();
    const summary = screen.getByRole('region', { name: 'Claim status summary' });
    expect(within(summary).queryByText('Certified amount')).toBeNull();
    expect(within(summary).queryByText('Total paid to date')).toBeNull();
    expect(within(summary).queryByText('Balance to receive (certified)')).toBeNull();
    expect(within(summary).queryByText('Difference from claim')).toBeNull();
    expect(screen.getByLabelText(/Submission reference/).value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Record submission', exact: true }));
    expect(screen.getByText('Check the highlighted fields before saving.')).toBeTruthy();
    expect(onRecord).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Preview saved claim' }));
    expect(onPreview).toHaveBeenCalledWith(project.claimDrafts[0].id);
  });

  it('fills a demo example without saving and records only on explicit action', async () => {
    const user = userEvent.setup();
    const project = fixture();
    const original = structuredClone(project);
    const record = vi.fn((draftId, action, fields) => recordClaimStage(project, draftId, action, fields));
    render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} onRecord={record} />);
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    expect(record).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Submission reference/).value).toBe('DEMO-SUB-R1');
    await user.click(screen.getByRole('button', { name: 'Record submission', exact: true }));
    expect(record).toHaveBeenCalledWith(project.claimDrafts[0].id, 'submitted', expect.objectContaining({ reference: 'DEMO-SUB-R1', date: date() }));
    expect(project).toEqual(original);
    expect(readFormBuffer(project.id, `claim-tracking:${JSON.stringify([project.claimDrafts[0].id, 'submitted'])}`)).toBeUndefined();
  });

  it('requires an explicit certification amount and a note for a difference while preserving zero', async () => {
    const user = userEvent.setup();
    const project = submitted(fixture());
    const onRecord = vi.fn((draftId, action, fields) => recordClaimStage(project, draftId, action, fields));
    render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} onRecord={onRecord} />);
    expect(screen.getByLabelText(/Certified amount/).value).toBe('');
    await user.type(screen.getByLabelText(/Certificate reference/), 'DEMO-ZERO');
    await user.click(screen.getByRole('button', { name: 'Record certification', exact: true }));
    expect(onRecord).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Certified amount/), '0');
    await user.click(screen.getByRole('button', { name: 'Record certification', exact: true }));
    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.getByText('Explain why the certified amount differs from the claim.')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: /Remarks/ }), 'Demo: no work certified this month.');
    await user.click(screen.getByRole('button', { name: 'Record certification', exact: true }));
    expect(onRecord).toHaveBeenCalledWith(project.claimDrafts[0].id, 'certified', expect.objectContaining({ value: '0' }));
  });

  it('continues through submission, certification, partial payment and Paid without changing the snapshot', async () => {
    const user = userEvent.setup();
    const initial = fixture();
    const records = [];
    render(<Harness initial={initial} onRecorded={(result) => records.push(result)} />);
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    await user.click(screen.getByRole('button', { name: 'Record submission', exact: true }));
    expect(screen.getByRole('heading', { name: 'Record certification' })).toBeTruthy();
    expect(screen.getByLabelText(/Certified amount/).value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    await user.click(screen.getByRole('button', { name: 'Record certification', exact: true }));
    expect(screen.getByRole('heading', { name: 'Record payment' })).toBeTruthy();
    const summary = screen.getByRole('region', { name: 'Claim status summary' });
    expect(within(summary).getByText('Certified amount').nextElementSibling.textContent).toBe('SGD 100.00');
    expect(within(summary).getByText('Total paid to date').nextElementSibling.textContent).toBe('Not recorded');
    await user.type(screen.getByLabelText(/Payment reference/), 'DEMO-PART');
    await user.type(screen.getByLabelText(/Total paid to date/), '40');
    await user.click(screen.getByRole('button', { name: 'Record payment', exact: true }));
    expect(screen.getByRole('status').textContent).toContain('Partial payment recorded');
    expect(screen.getByRole('heading', { name: 'Record payment' })).toBeTruthy();
    expect(screen.getByLabelText(/Total paid to date/).value).toBe('');
    expect(getClaimTracking(records.at(-1).project, initial.claimDrafts[0].id).status).toBe('certified');
    expect(within(summary).getByText('Total paid to date').nextElementSibling.textContent).toBe('SGD 40.00');
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    await user.click(screen.getByRole('button', { name: 'Record payment', exact: true }));
    expect(screen.getByRole('heading', { name: 'Certified amount fully paid' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record payment', exact: true })).toBeNull();
    expect(records.at(-1).tracking.status).toBe('paid');
    expect(records.at(-1).project.claimDrafts[0]).toEqual(initial.claimDrafts[0]);
    expect(within(screen.getByRole('list', { name: 'Claim stages' })).getByText('Paid').closest('li').getAttribute('aria-current')).toBe('step');
  });

  it('shows recorded zero certification separately from an unrecorded payment', () => {
    let project = submitted(fixture(100, 'TRACK-ZERO-SUMMARY'));
    project = recordClaimStage(project, project.claimDrafts[0].id, 'certified', { date: date(), reference: 'DEMO-CERT-ZERO', value: '0', note: 'No amount certified in this demo.' }).project;
    const original = structuredClone(project);
    render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} onBack={() => {}} />);
    const summary = screen.getByRole('region', { name: 'Claim status summary' });
    expect(within(summary).getByText('Certified amount').nextElementSibling.textContent).toBe('SGD 0.00');
    expect(within(summary).getByText('Total paid to date').nextElementSibling.textContent).toBe('Not recorded');
    expect(screen.getByRole('heading', { name: 'Record payment' })).toBeTruthy();
    expect(project).toEqual(original);
  });

  it('keeps unfinished forms separate by project and claim stage', async () => {
    const user = userEvent.setup();
    const project = fixture();
    const first = render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} />);
    await user.type(screen.getByLabelText(/Submission reference/), 'UNFINISHED');
    first.unmount();
    const other = fixture(100, 'OTHER-UI');
    const second = render(<ClaimStatusTracker project={other} draftId={other.claimDrafts[0].id} />);
    expect(screen.getByLabelText(/Submission reference/).value).toBe('');
    second.unmount();
    const third = render(<ClaimStatusTracker project={project} draftId={project.claimDrafts[0].id} />);
    expect(screen.getByLabelText(/Submission reference/).value).toBe('UNFINISHED');
    expect(screen.getByText(/Save before refreshing/)).toBeTruthy();
    third.rerender(<ClaimStatusTracker project={submitted(project)} draftId={project.claimDrafts[0].id} />);
    expect(screen.getByLabelText(/Certificate reference/).value).toBe('');
  });

  it('does not expose forms for a foreign claim or an older unsubmitted revision', () => {
    const project = fixture();
    const view = render(<ClaimStatusTracker project={project} draftId="FOREIGN-CLAIM" />);
    expect(screen.getByRole('heading', { name: 'Claim tracking unavailable' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record submission', exact: true })).toBeNull();
    const newer = { ...project.claimDrafts[0], id: 'NEW-DRAFT', revision: 2, status: 'draft' };
    view.rerender(<ClaimStatusTracker project={{ ...project, claimDrafts: [...project.claimDrafts, newer] }} draftId={project.claimDrafts[0].id} />);
    expect(screen.getByRole('heading', { name: 'A newer version is available' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record submission', exact: true })).toBeNull();
  });

  it('uses Singapore dates and the latest partial-payment date in demo details', async () => {
    const user = userEvent.setup();
    let project = fixture();
    project.claimDrafts[0].preparedAt = '2030-01-01T18:00:00Z';
    const draftId = project.claimDrafts[0].id;
    const preparedView = render(<ClaimStatusTracker project={project} draftId={draftId} />);
    expect(screen.getByText('2 Jan 2030')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    expect(screen.getByLabelText(/Submission date/).value).toBe('2030-01-02');
    preparedView.unmount();
    project = recordClaimStage(project, draftId, 'submitted', { date: '2030-01-02', reference: 'DEMO-SUB' }).project;
    project = recordClaimStage(project, draftId, 'certified', { date: '2030-01-03', reference: 'DEMO-CERT', value: '100' }).project;
    project = recordClaimStage(project, draftId, 'payment', { date: '2030-01-05', reference: 'DEMO-PART', value: '30' }).project;
    render(<ClaimStatusTracker project={project} draftId={draftId} />);
    await user.click(screen.getByRole('button', { name: 'Use demo details' }));
    expect(screen.getByLabelText(/Payment date/).value).toBe('2030-01-05');
    expect(screen.getByLabelText(/Total paid to date/).value).toBe('100');
  });
});
