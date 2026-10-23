import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VOConfirmationPanel } from '../src/components/VOConfirmationPanel';
import { createProject } from '../src/data/projects.ts';
import { updateVOReview, getVOCases } from '../src/data/vo.ts';
import { createVOConfirmationRequest, getVOConfirmationContext, recordVOConfirmationReply } from '../src/data/vo-confirmation.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

const projectIds = new Set();
const caseId = 'CUSTOMER-CONFIRMATION-REPORT';
const scope = 'Separate access platform outside the listed façade scaffold.';
afterEach(() => { for (const id of projectIds) clearProjectFormBuffers(id); projectIds.clear(); });

function fixture(proposedValue = 750) {
  let project = createProject({ name: 'Customer confirmation UI', code: 'VO-CONFIRM', country: 'Singapore' });
  projectIds.add(project.id);
  project.contract = { ...project.contract, currency: 'SGD' };
  project.reports = [{ id: caseId, projectId: project.id, projectCode: project.code, vo: true, itemId: project.items[0]?.id,
    sender: 'Demo supervisor', date: '2026-10-21T09:00:00+08:00', message: 'Please review the extra platform.',
    photo: '/assets/demo-platform.jpg', status: 'needsReview', channel: 'whatsapp-mock' }];
  project.voReviews = [];
  project.claimDrafts = [{ id: 'FROZEN-CLAIM', revision: 1, status: 'prepared', snapshot: { projectId: project.id, totals: { currentValue: 500 }, evidence: [{ message: 'Saved evidence' }] } }];
  const result = updateVOReview(project, caseId, 'submit', { title: 'Separate access platform', scopeDisposition: 'variation', scopeAssessment: scope,
    instructionStatus: 'documented', instructionReference: 'DEMO-SI-01', proposedValue });
  expect(result.outcome).toBe('updated');
  return result.project;
}

function withRequest(project, replyKind) {
  const context = getVOConfirmationContext(project, caseId);
  const saved = createVOConfirmationRequest(project, caseId, { recipient: 'Fictional customer', authority: 'Demo price authority', sourceKey: context.key }, '2026-10-22T00:00:00Z');
  expect(saved.outcome).toBe('updated');
  if (!replyKind) return saved.project;
  const replied = recordVOConfirmationReply(saved.project, caseId, saved.requestId, { kind: replyKind, message: `Saved ${replyKind} demo response.` }, '2026-10-22T01:00:00Z');
  expect(replied.outcome).toBe('updated');
  return replied.project;
}

function Harness({ initial, onState, onCreateSpy, onReplySpy, ...props }) {
  const [project, setProject] = useState(initial);
  function apply(result) { if (result.outcome === 'updated') { setProject(result.project); onState?.(result.project); } return result; }
  return <form onSubmit={event => event.preventDefault()}><VOConfirmationPanel project={project} caseId={caseId} hasUnsavedChanges={false}
    onCreate={(id, values) => { onCreateSpy?.(id, values); return apply(createVOConfirmationRequest(project, id, values)); }}
    onReply={(id, requestId, values) => { onReplySpy?.(id, requestId, values); return apply(recordVOConfirmationReply(project, id, requestId, values)); }} {...props}/></form>;
}

async function openPanel(user) { await user.click(screen.getByText('Customer confirmation', { exact: true })); }
async function previewRequest(user) { await user.click(screen.getByRole('button', { name: 'Use demo contact' })); await user.click(screen.getByRole('button', { name: 'Preview request' })); }

describe('compact mock customer confirmation panel', () => {
  it('keeps the panel collapsed, creates no record on viewing, and previews exact saved scope before explicit save', async () => {
    const project = fixture(0);
    const before = structuredClone(project);
    const create = vi.fn();
    let latest = project;
    const user = userEvent.setup();
    const view = render(<Harness initial={project} onCreateSpy={create} onState={value => { latest = value; }}/>);
    expect(view.container.querySelector('.vo-customer-confirmation').open).toBe(false);
    expect(view.container.querySelectorAll('form').length).toBe(1);
    await openPanel(user);
    expect(screen.getByText(/Browser-local demo/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Preview request' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter the mock recipient.');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /^Recipient/ }));
    await previewRequest(user);
    const preview = screen.getByRole('region', { name: 'Request preview' });
    expect(preview.textContent).toContain(scope);
    expect(preview.textContent).toContain('SGD 0.00');
    expect(preview.textContent).toContain('DEMO-SI-01');
    expect(preview.textContent).toContain('Acknowledge the stated scope and approve the proposed price. No time approval is requested.');
    expect(create).not.toHaveBeenCalled();
    expect(project).toEqual(before);
    await user.click(within(preview).getByRole('button', { name: 'Save mock request' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(getVOConfirmationContext(latest, caseId).currentRequest.snapshot.proposedValue).toBe(0);
    expect(getVOCases(latest)[0].status).toBe('pendingApproval');
    expect(latest.claimDrafts).toEqual(before.claimDrafts);
    expect(latest.reports).toEqual(before.reports);
    expect(screen.getByRole('button', { name: 'Save mock reply' })).toBeTruthy();
  });

  it('records scope acknowledgement separately without offering price approval copying', async () => {
    const project = withRequest(fixture());
    let latest = project;
    const onUseApproval = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={project} onUseApproval={onUseApproval} onState={value => { latest = value; }}/>);
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Use demo reply' }));
    await user.click(screen.getByRole('button', { name: 'Save mock reply' }));
    expect(getVOConfirmationContext(latest, caseId).currentRequest.reply.kind).toBe('scopeAcknowledged');
    expect(screen.queryByRole('button', { name: 'Use reply in approval form' })).toBeNull();
    expect(getVOCases(latest)[0].status).toBe('pendingApproval');
    expect(latest.claimDrafts).toEqual(project.claimDrafts);
    expect(onUseApproval).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'New mock request' }));
    expect(screen.getByRole('button', { name: 'Preview request' })).toBeTruthy();
  });

  it('records changes requested without altering the QS decision and retains saved request history', async () => {
    const project = withRequest(fixture());
    let latest = project;
    const user = userEvent.setup();
    render(<Harness initial={project} onState={value => { latest = value; }}/>);
    await openPanel(user);
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Reply type' }), 'changesRequested');
    await user.click(screen.getByRole('button', { name: 'Use demo reply' }));
    await user.click(screen.getByRole('button', { name: 'Save mock reply' }));
    expect(getVOConfirmationContext(latest, caseId).currentRequest.reply.kind).toBe('changesRequested');
    expect(getVOCases(latest)[0].status).toBe('pendingApproval');
    expect(getVOCases(latest)[0].approvedValue).toBeNull();
    expect(screen.getByText('Request history · 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use reply in approval form' })).toBeNull();
  });

  it('requires explicit copying of an exact zero-price approval and protects entered QS approval details', async () => {
    const project = withRequest(fixture(0), 'priceApproved');
    const onUseApproval = vi.fn();
    const user = userEvent.setup();
    const view = render(<Harness initial={project} hasApprovalEdits onUseApproval={onUseApproval}/>);
    await openPanel(user);
    expect(screen.getByRole('button', { name: 'Use reply in approval form' }).disabled).toBe(true);
    expect(screen.getByText('Keep or clear your entered approval details before using the reply.')).toBeTruthy();
    expect(onUseApproval).not.toHaveBeenCalled();
    view.rerender(<Harness initial={project} hasApprovalEdits={false} onUseApproval={onUseApproval}/>);
    await user.click(screen.getByRole('button', { name: 'Use reply in approval form' }));
    expect(onUseApproval).toHaveBeenCalledWith(getVOConfirmationContext(project, caseId).currentRequest.id);
    expect(getVOCases(project)[0].status).toBe('pendingApproval');
  });

  it('keeps unknown proposed price honest and unavailable for a price-approved reply', async () => {
    const project = withRequest(fixture(''));
    const user = userEvent.setup();
    const view = render(<Harness initial={project}/>);
    await openPanel(user);
    await user.click(screen.getByText('View saved request'));
    expect(within(screen.getByRole('region', { name: 'Saved customer request' })).getByText('Unknown', { exact: true })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Saved customer request' })).getByText('Acknowledge the stated scope only. Price approval is not yet requested.')).toBeTruthy();
    const priceOption = view.container.querySelector('select[name="confirmationReplyKind"] option[value="priceApproved"]');
    expect(priceOption.disabled).toBe(true);
    expect(screen.getByText('Record a proposed price in a new request before simulating price approval.')).toBeTruthy();
  });

  it('blocks actions for unsaved commercial edits while retaining the entered request and reply buffers', async () => {
    const project = fixture();
    const create = vi.fn();
    const user = userEvent.setup();
    const view = render(<Harness initial={project} hasUnsavedChanges onCreateSpy={create}/>);
    await openPanel(user);
    expect(screen.getByRole('button', { name: 'Preview request' }).disabled).toBe(true);
    expect(screen.getByText(/Save or cancel QS edits first/)).toBeTruthy();
    view.rerender(<Harness initial={project} hasUnsavedChanges={false} onCreateSpy={create}/>);
    await user.type(screen.getByRole('textbox', { name: /^Recipient/ }), 'My demo contact');
    await user.type(screen.getByRole('textbox', { name: /^Approval authority/ }), 'Mock role');
    view.rerender(<Harness initial={project} hasUnsavedChanges onCreateSpy={create}/>);
    expect(screen.getByRole('textbox', { name: /^Recipient/ }).value).toBe('My demo contact');
    expect(create).not.toHaveBeenCalled();
  });

  it('retains stale request evidence and offers a new preview after a changed source', async () => {
    const original = withRequest(fixture(), 'priceApproved');
    const changed = structuredClone(original);
    changed.voReviews[0].proposedValue = 900;
    const user = userEvent.setup();
    render(<VOConfirmationPanel project={changed} caseId={caseId} hasUnsavedChanges={false} onCreate={vi.fn()} onReply={vi.fn()} onUseApproval={vi.fn()}/>);
    await openPanel(user);
    expect(screen.getByText(/The scope, price or review has changed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use reply in approval form' })).toBeNull();
    await previewRequest(user);
    expect(screen.getByRole('region', { name: 'Request preview' }).textContent).toContain('SGD 900.00');
    await user.click(screen.getByText('Request history · 1'));
    await user.click(screen.getByText('Request details', { exact: true }));
    expect(screen.getByText('SGD 750.00')).toBeTruthy();
    expect(original.voConfirmationRequests[0].snapshot.proposedValue).toBe(750);
  });

  it('preserves unfinished contact and reply text by project and case while another record is opened', async () => {
    const project = fixture();
    const second = fixture();
    const user = userEvent.setup();
    const props = { caseId, hasUnsavedChanges: false, onCreate: vi.fn(), onReply: vi.fn() };
    const view = render(<VOConfirmationPanel project={project} {...props}/>);
    await openPanel(user);
    await user.type(screen.getByRole('textbox', { name: /^Recipient/ }), 'First contact');
    view.rerender(<VOConfirmationPanel project={second} {...props}/>);
    expect(screen.getByRole('textbox', { name: /^Recipient/ }).value).toBe('');
    await user.type(screen.getByRole('textbox', { name: /^Recipient/ }), 'Other contact');
    view.rerender(<VOConfirmationPanel project={project} {...props}/>);
    expect(screen.getByRole('textbox', { name: /^Recipient/ }).value).toBe('First contact');
    const requested = withRequest(project);
    view.rerender(<VOConfirmationPanel project={requested} {...props}/>);
    await user.type(screen.getByRole('textbox', { name: /^Reply message/ }), 'Unfinished scope response');
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Reply type' }), 'changesRequested');
    await user.type(screen.getByRole('textbox', { name: /^Reply message/ }), 'Unfinished requested change');
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Reply type' }), 'scopeAcknowledged');
    expect(screen.getByRole('textbox', { name: /^Reply message/ }).value).toBe('Unfinished scope response');
    view.rerender(<VOConfirmationPanel project={second} {...props}/>);
    view.rerender(<VOConfirmationPanel project={requested} {...props}/>);
    expect(screen.getByRole('textbox', { name: /^Reply message/ }).value).toBe('Unfinished scope response');
  });
});
