import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimPackPreview } from '../src/components/ClaimPackPreview.jsx';
import { createProject } from '../src/data/projects.js';
import { markClaimPrepared, saveClaimDraft } from '../src/data/claims.js';

function fixture(code = 'SAVED-EVIDENCE', label = 'Original') {
  const project = createProject({ name: `${label} evidence project`, code, country: 'Singapore' });
  project.locked = true;
  project.lockedAt = '2026-09-01T12:00:00+08:00';
  project.items = [{ id: 'A', ref: 'A/01', description: 'Measured work', unit: 'm²', quantity: 100,
    rate: 10, amount: 1000, pricingType: 'measured', verified: 80, reported: 80 }];
  project.reports = [
    { id: 'R-A', projectId: project.id, itemId: 'A', status: 'verified', completion: 80,
      date: '2026-10-15T09:00:00+08:00', verifiedAt: '2026-10-16T12:00:00+08:00',
      verifiedBy: `${label} supervisor`, sender: `${label} worker`, sourceMessageId: 'WA-A',
      message: `${label} work message`, photo: '/assets/demo-saved-work.jpg', photoAlt: `${label} work photo`, area: 'Area A' },
    { id: 'R-VO', projectId: project.id, vo: true, status: 'voApproved',
      date: '2026-10-15T10:00:00+08:00', sender: `${label} extra-work reporter`, sourceMessageId: 'WA-VO',
      message: `${label} extra-work message`, photo: '/assets/demo-saved-vo.jpg', photoAlt: `${label} extra-work photo` },
  ];
  project.voReviews = [{ id: 'R-VO', reportId: 'R-VO', projectId: project.id,
    status: 'approved', title: 'Extra access platform', approvedValue: 200,
    approvalReference: `${label}-APPROVAL`, approver: `${label} approver`,
    reviewChecksVersion: 1, scopeDisposition: 'variation', scopeAssessment: 'Additional access outside the original scope.',
    instructionStatus: 'documented', instructionReference: `${label}-INSTRUCTION`,
    executionStatus: 'verified', executionReference: `${label}-WORK-CHECK`, executionVerifiedAt: '2026-10-18T12:00:00+08:00',
    claimEligibility: 'eligible', eligibilityNote: `${label} QS eligibility decision`, eligibilityReviewedAt: '2026-10-18T12:00:00+08:00',
    history: [{ id: 'APP-EVENT', action: 'approve', to: 'approved', date: '2026-10-17T12:00:00+08:00', actor: `${label} QS` }] }];
  const result = saveClaimDraft(project, '2026-10', {
    work: { A: { include: true, assessedQuantity: 40, previousValue: 10 } },
    vos: { 'R-VO': { include: true, assessedValue: 50, previousValue: 0 } }, priorConfirmed: true,
  });
  expect(result.outcome).toBe('updated');
  return { project: result.project, draft: result.draft };
}

const workButton = () => screen.getByRole('button', { name: 'View evidence for A/01', exact: true });
const voButton = () => screen.getByRole('button', { name: /View evidence for .*VO/, exact: false });

async function closeEvidence(user) {
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close evidence', exact: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
}

describe('saved monthly claim evidence', () => {
  it('reads work and VO evidence from the saved revision after live evidence and decisions change or disappear', async () => {
    const user = userEvent.setup();
    const saved = fixture();
    const prepared = markClaimPrepared(saved.project, saved.draft.id);
    expect(prepared.outcome).toBe('updated');
    const project = prepared.project;
    project.reports = [];
    project.voReviews = [];
    project.items[0].description = 'Changed live scope';
    const before = structuredClone(project);
    const onTrack = vi.fn();
    const onDownloadCSV = vi.fn();
    render(<ClaimPackPreview project={project} draftId={saved.draft.id} onTrack={onTrack} onDownloadCSV={onDownloadCSV} />);
    await user.click(workButton());
    const work = within(screen.getByRole('dialog'));
    expect(work.getByText('Original work message', { exact: true })).toBeTruthy();
    expect(work.getByText('Original supervisor', { exact: true })).toBeTruthy();
    expect(work.getByRole('img', { name: 'Original work photo', exact: true }).getAttribute('src')).toBe('/assets/demo-saved-work.jpg');
    expect(work.queryByText('Changed live scope')).toBeNull();
    await closeEvidence(user);
    expect(document.activeElement).toBe(workButton());
    await user.click(voButton());
    const extra = within(screen.getByRole('dialog'));
    expect(extra.getByText('Original extra-work message', { exact: true })).toBeTruthy();
    expect(extra.getByText('Original-APPROVAL', { exact: true })).toBeTruthy();
    expect(extra.getByText('Original-INSTRUCTION', { exact: true })).toBeTruthy();
    expect(extra.getByText('Original-WORK-CHECK', { exact: true })).toBeTruthy();
    expect(extra.getByText('Original QS eligibility decision', { exact: true })).toBeTruthy();
    await closeEvidence(user);
    expect(project).toEqual(before);
    expect(onTrack).not.toHaveBeenCalled();
    expect(onDownloadCSV).not.toHaveBeenCalled();
  });

  it('closes the previous panel on revision change and opens only the requested version’s evidence', async () => {
    const user = userEvent.setup();
    const first = fixture();
    const live = structuredClone(first.project);
    live.reports[0].message = 'Second revision work message';
    live.reports[0].photoAlt = 'Second revision work photo';
    const second = saveClaimDraft(live, '2026-10', { ...first.draft.assessment,
      work: { A: { ...first.draft.assessment.work.A, assessedQuantity: 41 } } });
    expect(second.draft.revision).toBe(2);
    const before = structuredClone(second.project);
    const view = render(<ClaimPackPreview project={second.project} draftId={first.draft.id} />);
    await user.click(workButton());
    expect(within(screen.getByRole('dialog')).getByText('Original work message', { exact: true })).toBeTruthy();
    view.rerender(<ClaimPackPreview project={second.project} draftId={second.draft.id} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(workButton());
    const evidence = within(screen.getByRole('dialog'));
    expect(evidence.getByText('Second revision work message', { exact: true })).toBeTruthy();
    expect(evidence.queryByText('Original work message', { exact: true })).toBeNull();
    expect(second.project).toEqual(before);
  });

  it('closes on project changes even if project-local row and draft IDs are reused', async () => {
    const user = userEvent.setup();
    const first = fixture('EVIDENCE-FIRST', 'First');
    const other = fixture('EVIDENCE-OTHER', 'Other');
    other.project.claimDrafts[0].id = first.draft.id;
    const before = structuredClone(other.project);
    const view = render(<ClaimPackPreview project={first.project} draftId={first.draft.id} />);
    await user.click(workButton());
    expect(within(screen.getByRole('dialog')).getByText('First work message', { exact: true })).toBeTruthy();
    view.rerender(<ClaimPackPreview project={other.project} draftId={first.draft.id} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(workButton());
    const evidence = within(screen.getByRole('dialog'));
    expect(evidence.getByText('Other work message', { exact: true })).toBeTruthy();
    expect(evidence.queryByText('First work message', { exact: true })).toBeNull();
    expect(other.project).toEqual(before);
  });

  it('does not substitute live reports for missing legacy snapshot evidence', async () => {
    const user = userEvent.setup();
    const { project, draft } = fixture();
    project.claimDrafts[0].snapshot.workRows[0].evidence = null;
    const before = structuredClone(project);
    render(<ClaimPackPreview project={project} draftId={draft.id} />);
    await user.click(workButton());
    const evidence = within(screen.getByRole('dialog'));
    expect(evidence.queryByText('Original work message', { exact: true })).toBeNull();
    expect(evidence.queryByRole('img')).toBeNull();
    expect(screen.getByRole('dialog').textContent).toMatch(/not recorded|not attached|no.*report/i);
    expect(project).toEqual(before);
  });

  it('removes the panel and item actions when the saved draft is missing or foreign', async () => {
    const user = userEvent.setup();
    const { project, draft } = fixture();
    const view = render(<ClaimPackPreview project={project} draftId={draft.id} />);
    await user.click(workButton());
    view.rerender(<ClaimPackPreview project={project} draftId="missing-claim" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /View evidence for/ })).toBeNull();
    const foreign = structuredClone(project);
    foreign.claimDrafts[0].snapshot.projectId = 'FOREIGN';
    view.rerender(<ClaimPackPreview project={foreign} draftId={draft.id} />);
    expect(screen.getByRole('heading', { name: 'Choose a saved claim draft', exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /View evidence for/ })).toBeNull();
  });
});
