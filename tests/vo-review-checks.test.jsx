import { chooseSelect } from './select-helpers.mjs';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VOCaseReview } from '../src/components/VOCaseReview.jsx';
import { createProject } from '../src/data/projects.js';
import { getVOCases, getVOClaimEligibility, updateVOReview } from '../src/data/vo.js';
import { clearProjectFormBuffers } from '../src/data/form-buffer.js';

const projectIds = new Set();
afterEach(() => { for (const id of projectIds) clearProjectFormBuffers(id); projectIds.clear(); });
const caseId = 'VO-UI-REPORT';
const scope = 'Separate access to a newly instructed work face outside the listed façade scope.';
const originalMessage = 'Area B: the supervisor requested a separate extra access platform. Please check the instruction.';

function fixture(status = 'flagged') {
  let project = createProject({ name: 'VO review checks', code: 'VO-CHECKS', country: 'Singapore' });
  projectIds.add(project.id);
  project.version = 2;
  project.items = [
    { id: 'A', ref: 'A.1 / 1a', description: 'Original façade scaffold', subsection: 'Façade access', sourcePage: 27,
      sourceNote: 'Original scope includes listed guardrails and working decks.', unit: 'm²', quantity: 100, rate: 10,
      amount: 1000, pricingType: 'measured', reported: 50, verified: 50 },
    { id: 'B', ref: 'B.1 / 1b', description: 'Internal working platform', subsection: 'Internal access', sourcePage: 28,
      sourceNote: 'Compare the specified internal platform scope.', unit: 'm³', quantity: 40, rate: 20,
      amount: 800, pricingType: 'measured', reported: 0, verified: 0 },
  ];
  project.reports = [{ id: caseId, projectId: project.id, projectCode: project.code, vo: true, itemId: 'A',
    status: 'needsReview', sender: 'Mock site supervisor', date: '2026-10-21T09:00:00+08:00', area: 'Area B',
    message: originalMessage, photo: '/assets/demo-platform.jpg', photoAlt: 'Mock access platform evidence',
    channel: 'whatsapp-mock' }];
  project.claimDrafts = [{ id: 'UNCHANGED-SAVED-CLAIM', revision: 1, status: 'prepared', snapshot: {
    projectId: project.id, totals: { currentValue: 800 }, evidence: [{ message: 'Frozen original evidence', photo: '/assets/previous.jpg' }],
  } }];
  if (status !== 'flagged') project = updateVOReview(project, caseId, 'submit', {
    title: 'Separate access platform', relatedItemId: 'A', scopeAssessment: scope, instructionReference: 'REPORTED-SI-01', proposedValue: '',
  }).project;
  if (status === 'approved') project = updateVOReview(project, caseId, 'approve', {
    approvedValue: 800, approvalReference: 'PRICE-APPROVAL-01', approver: 'Mock approving QS',
  }).project;
  return project;
}

function Harness({ initial, onState, onAction, ...props }) {
  const [project, setProject] = useState(initial);
  const entry = getVOCases(project)[0];
  const act = (id, action, values) => {
    onAction?.(id, action, values);
    const result = updateVOReview(project, id, action, values);
    if (result.outcome === 'updated') { setProject(result.project); onState?.(result.project); }
    return result;
  };
  return <VOCaseReview key={`${entry.id}-${entry.status}-${entry.history.length}`} entry={entry} project={project}
    currency="SGD" onAction={act} {...props}/>;
}

const combo = name => screen.getByRole('combobox', { name: new RegExp(`^${name}`) });
const textbox = name => screen.getByRole('textbox', { name: new RegExp(`^${name}`) });

async function replace(user, element, value) { await user.clear(element); if (value) await user.type(element, value); }

describe('four separate VO review checks', () => {
  it('puts the contract comparison beside the decision while preserving the disclosed original message and photo', async () => {
    const project = fixture();
    const before = structuredClone(project);
    const onPhoto = vi.fn();
    const onOpenContract = vi.fn();
    const action = vi.fn();
    const user = userEvent.setup();
    const view = render(<Harness initial={project} onPhoto={onPhoto} onOpenContract={onOpenContract} onAction={action}/>);
    for (const name of ['Contract scope', 'Instruction', 'Price approval', 'Claim eligibility']) {
      expect(screen.getByRole('region', { name, exact: true })).toBeTruthy();
    }
    const contract = screen.getByRole('region', { name: 'Contract scope' });
    expect(contract.textContent).toContain('A.1 / 1a · Original façade scaffold');
    expect(contract.textContent).toContain('Original scope includes listed guardrails and working decks.');
    expect(contract.textContent).toContain('Source page 27');
    await user.click(view.container.querySelector('.vo-work-details > summary'));
    await user.click(view.container.querySelector('.vo-work-details > summary'));
    await chooseSelect(user, combo('Contract item for comparison'), 'B');
    expect(contract.textContent).toContain('B.1 / 1b · Internal working platform');
    await user.click(within(contract).getByRole('button', { name: 'Check contract' }));
    expect(onOpenContract).toHaveBeenCalledWith('B', caseId);
    const evidence = view.container.querySelector('.vo-evidence-details');
    expect(evidence.open).toBe(false);
    await user.click(evidence.querySelector('summary'));
    expect(evidence.open).toBe(true);
    expect(within(evidence).getByText(originalMessage)).toBeTruthy();
    expect(within(evidence).getByRole('img', { name: 'Mock access platform evidence' })).toBeTruthy();
    await user.click(within(evidence).getByRole('button', { name: 'Enlarge VO evidence photo' }));
    expect(onPhoto).toHaveBeenCalledWith({ src: '/assets/demo-platform.jpg', alt: 'Mock access platform evidence' });
    expect(action).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  });

  it('requires a scope decision and instruction source before requesting price approval while unknown proposed value stays blank', async () => {
    const project = fixture();
    let latest = project;
    const action = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={project} onAction={action} onState={value => { latest = value; }}/>);
    const proposed = screen.getByRole('spinbutton', { name: /^Proposed value/ });
    expect(proposed.value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Ready for approval' }));
    expect(screen.getByText(/Confirm a possible variation before requesting price approval/)).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    await chooseSelect(user, combo('Scope decision'), 'variation');
    await replace(user, textbox('QS scope assessment'), scope);
    await replace(user, textbox('Instruction or drawing reference'), 'REPORTED-SI-01');
    await user.click(screen.getByRole('button', { name: 'Ready for approval' }));
    expect(screen.getByText('Record whether the instruction is reported, documented or disputed.')).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    await chooseSelect(user, combo('Instruction evidence'), 'reported');
    await user.click(screen.getByRole('button', { name: 'Ready for approval' }));
    expect(getVOCases(latest)[0].status).toBe('pendingApproval');
    expect(getVOCases(latest)[0].proposedValue).toBeNull();
    expect(screen.getByRole('region', { name: 'Price approval' }).textContent).toContain('Proposed value: Unknown');
    expect(screen.queryByRole('button', { name: 'Review in monthly claim' })).toBeNull();
    expect(latest.claimDrafts).toEqual(project.claimDrafts);
  });

  it('records a zero price approval separately and leaves claim eligibility blocked', async () => {
    const project = fixture('pendingApproval');
    let latest = project;
    const user = userEvent.setup();
    render(<Harness initial={project} onState={value => { latest = value; }}/>);
    const approvedValue = screen.getByRole('spinbutton', { name: /^Approved value/ });
    expect(approvedValue.value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Record approval' }));
    expect(screen.getByText('Enter a non-negative approved value. Zero is valid.')).toBeTruthy();
    await user.type(approvedValue, '0');
    await user.type(textbox('Approval reference'), 'ZERO-PRICE-APPROVAL');
    await user.type(textbox('Approved by'), 'Mock approving QS');
    await user.click(screen.getByRole('button', { name: 'Record approval' }));
    const entry = getVOCases(latest)[0];
    expect(entry.status).toBe('approved');
    expect(entry.approvedValue).toBe(0);
    expect(screen.getByRole('region', { name: 'Price approval' }).textContent).toContain('SGD 0.00');
    expect(screen.getByRole('region', { name: 'Claim eligibility' }).textContent).toContain('Checks needed');
    expect(getVOClaimEligibility(entry).eligible).toBe(false);
    expect(screen.queryByRole('button', { name: 'Review in monthly claim' })).toBeNull();
    expect(latest.claimDrafts).toEqual(project.claimDrafts);
    expect(latest.items).toEqual(project.items);
  });

  it('lets a legacy approved case complete the separate checks without altering its price, source or saved claims', async () => {
    const project = fixture('approved');
    let latest = project;
    const openClaims = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={project} onOpenClaims={openClaims} onState={value => { latest = value; }}/>);
    expect(combo('Instruction evidence').getAttribute('data-value')).toBe('notRecorded');
    expect(combo('Extra-work verification').getAttribute('data-value')).toBe('notVerified');
    expect(combo('Claim decision').getAttribute('data-value')).toBe('needsReview');
    await chooseSelect(user, combo('Scope decision'), 'variation');
    await chooseSelect(user, combo('Instruction evidence'), 'documented');
    await replace(user, textbox('Instruction or drawing reference'), 'DOCUMENTED-SI-01');
    await chooseSelect(user, combo('Claim decision'), 'eligible');
    await user.click(screen.getByRole('button', { name: 'Save claim checks' }));
    expect(screen.getByText('Explain the scope or instruction update without changing the recorded price approval.')).toBeTruthy();
    await user.type(textbox('Review note'), 'Recorded the original instruction and changed scope evidence separately from price.');
    await user.click(screen.getByRole('button', { name: 'Save claim checks' }));
    expect(screen.getByText('Record verification of the extra work first.')).toBeTruthy();
    expect(document.activeElement).toBe(combo('Extra-work verification'));
    await chooseSelect(user, combo('Extra-work verification'), 'verified');
    await user.click(screen.getByRole('button', { name: 'Save claim checks' }));
    expect(screen.getByText('Add the verification or measurement reference for this extra work.')).toBeTruthy();
    await user.type(textbox('Verification reference'), 'MEASURED-VO-WORK-01');
    await user.click(screen.getByRole('button', { name: 'Save claim checks' }));
    expect(screen.getByText('Explain the claim eligibility decision.')).toBeTruthy();
    await user.type(textbox('Eligibility note'), 'QS verified this changed scope and its measured work for assessment.');
    await user.click(screen.getByRole('button', { name: 'Save claim checks' }));
    const entry = getVOCases(latest)[0];
    expect(entry.status).toBe('approved');
    expect(getVOClaimEligibility(entry).eligible).toBe(true);
    expect(entry.approvedValue).toBe(800);
    expect(entry.approvalReference).toBe('PRICE-APPROVAL-01');
    expect(entry.approver).toBe('Mock approving QS');
    for (const field of ['items', 'reports', 'claimDrafts']) expect(latest[field]).toEqual(project[field]);
    await user.click(screen.getByRole('button', { name: 'Review in monthly claim' }));
    expect(openClaims).toHaveBeenCalledWith(caseId);
    expect(latest.claimDrafts).toEqual(project.claimDrafts);
  });

  it('keeps the reopen reason available while typing on an eligible case and preserves the earlier assessment', async () => {
    const approved = fixture('approved');
    const result = updateVOReview(approved, caseId, 'assessEligibility', {
      scopeDisposition: 'variation', scopeAssessment: scope,
      instructionStatus: 'documented', instructionReference: 'DOCUMENTED-SI-01',
      executionStatus: 'verified', executionReference: 'MEASURED-VO-WORK-01',
      claimEligibility: 'eligible', eligibilityNote: 'QS confirmed the documented change and measured extra work.',
      reviewNote: 'Added the scope and instruction evidence after price approval.',
    });
    expect(result.outcome).toBe('updated');
    const project = result.project;
    const original = structuredClone(project);
    const prior = getVOCases(project)[0];
    let latest = project;
    const user = userEvent.setup();
    render(<Harness initial={project} onState={value => { latest = value; }}/>);
    expect(screen.getByRole('button', { name: 'Edit claim checks' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save claim checks' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit claim checks' }));
    await user.click(screen.getByRole('button', { name: 'Save claim checks' }));
    expect(latest).toEqual(original);
    expect(screen.getByRole('button', { name: 'Edit claim checks' })).toBeTruthy();
    await user.click(screen.getByText('Reopen this decision', { exact: true }));
    const reason = textbox('Reason to reopen');
    const note = 'Recheck the changed scope after receiving a revised instruction.';
    await user.type(reason, note);
    expect(reason.isConnected).toBe(true);
    expect(reason.value).toBe(note);
    expect(document.activeElement).toBe(reason);
    expect(textbox('Reason to reopen')).toBe(reason);
    expect(screen.queryByRole('textbox', { name: 'Review note', exact: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit claim checks' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reopen review' }));
    const reopened = getVOCases(latest)[0];
    expect(reopened.status).toBe('flagged');
    expect(reopened.approvedValue).toBeNull();
    expect(reopened.approvalReference).toBe('');
    expect(reopened.approver).toBe('');
    expect(reopened.claimEligibility).toBe('needsReview');
    expect(getVOClaimEligibility(reopened).eligible).toBe(false);
    expect(reopened.history.slice(0, -1)).toEqual(prior.history);
    expect(reopened.history.at(-1).action).toBe('reopen');
    expect(reopened.history.at(-1).values.reviewNote).toBe(note);
    expect(reopened.history.at(-1).previousValues.approvedValue).toBe(800);
    expect(reopened.history.at(-1).previousValues.claimEligibility).toBe('eligible');
    expect(latest.claimDrafts).toEqual(original.claimDrafts);
    expect(latest.items).toEqual(original.items);
    expect(latest.reports[0].message).toBe(original.reports[0].message);
    expect(latest.reports[0].photo).toBe(original.reports[0].photo);
    expect(project).toEqual(original);
    expect(screen.queryByRole('button', { name: 'Review in monthly claim' })).toBeNull();
  });

  it('does not turn an unknown legacy approval into zero or allow reported-only instructions to become eligible', async () => {
    const project = fixture('approved');
    project.voReviews[0] = { ...project.voReviews[0], scopeDisposition: 'variation', instructionStatus: 'reported', approvedValue: null };
    let latest = project;
    const action = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={project} onAction={action} onState={value => { latest = value; }}/>);
    expect(screen.getByRole('region', { name: 'Price approval' }).textContent).toContain('Unknown');
    await chooseSelect(user, combo('Claim decision'), 'eligible');
    await user.click(screen.getByRole('button', { name: 'Save claim checks' }));
    expect(screen.getByText('Document the instruction before making this work eligible.')).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    await chooseSelect(user, combo('Claim decision'), 'excluded');
    await user.type(textbox('Eligibility note'), 'Approval evidence needs clarification before claiming.');
    await user.click(screen.getByRole('button', { name: 'Save claim checks' }));
    expect(getVOClaimEligibility(getVOCases(latest)[0]).status).toBe('excluded');
    expect(getVOCases(latest)[0].approvedValue).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review in monthly claim' })).toBeNull();
    expect(latest.claimDrafts).toEqual(project.claimDrafts);
  });
});
