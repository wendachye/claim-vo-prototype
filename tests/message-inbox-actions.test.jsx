import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WhatsAppView } from '../src/components/WhatsAppView';
import { MessageInboxActions } from '../src/components/MessageInboxActions';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getMessageDismissalEligibility, saveMessageInboxDecision } from '../src/data/message-dismissal.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

const now = new Date('2026-10-28T12:00:00+08:00');
const projects = new Set();
let current;
function fixture() {
  const project = createSITContractDemo({ name: 'Inbox decisions', code: 'INBOX-UI' }, now);
  projects.add(project.id);
  return project;
}
function SourceHarness({ seed, messageId, onProcess = vi.fn() }) {
  const [project, setProject] = useState(seed);
  current = project;
  const save = action => (id, fields) => {
    const result = saveMessageInboxDecision(project, id, { ...fields, action }, now);
    setProject(result.project);
    return result;
  };
  return <WhatsAppView project={project} messages={project.whatsappMessages} initialMessageId={messageId} onProcess={onProcess} onDismissMessage={save('dismiss')} onReopenMessage={save('reopen')}/>;
}
const panel = () => within(document.querySelector('.wa-review'));
async function openDecision(user, action) {
  await user.click(panel().getByRole('button', { name: 'Message actions', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: action, exact: true }));
  return screen.getByRole('dialog');
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); for (const id of projects) clearProjectFormBuffers(id); projects.clear(); vi.unstubAllGlobals(); });

describe('compact inbox decisions', () => {
  it('requires reasons, retains evidence, filters dismissed messages and explicitly reopens without processing', async () => {
    const project = fixture();
    const source = project.whatsappMessages.find(message => message.kind === 'progress' && getMessageDismissalEligibility(project, message.id).eligible);
    const before = structuredClone(project);
    const process = vi.fn();
    const user = userEvent.setup();
    render(<SourceHarness seed={project} messageId={source.id} onProcess={process}/>);
    const dialog = await openDecision(user, 'Dismiss message');
    const reason = within(dialog).getByRole('textbox', { name: 'Reason for dismissal' });
    expect(document.activeElement).toBe(reason);
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss message', exact: true }));
    expect(within(dialog).getByRole('alert').textContent).toContain('Enter a reason');
    expect(current).toEqual(before);
    await user.type(reason, 'Sent to the wrong work area.');
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss message', exact: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(panel().getByText('Message dismissed', { exact: true })).toBeTruthy();
    expect(panel().getByText('Sent to the wrong work area.', { exact: true })).toBeTruthy();
    expect(panel().queryByRole('button', { name: 'Add progress update', exact: true })).toBeNull();
    expect(document.querySelector('.wa-original-message blockquote').textContent).toBe(source.text);
    expect(current.whatsappMessages).toEqual(before.whatsappMessages);
    expect(current.reports).toEqual(before.reports);
    expect(current.items).toEqual(before.items);
    expect(current.claimDrafts).toEqual(before.claimDrafts);
    expect(current.voReviews).toEqual(before.voReviews);
    expect(process).not.toHaveBeenCalled();
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Filter site updates' }), 'new');
    expect(screen.getByText('Selected message is outside these filters.', { exact: true })).toBeTruthy();
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Filter site updates' }), 'dismissed');
    expect(document.querySelector('.wa-message.selected .badge').textContent).toBe('Dismissed');
    expect([...document.querySelectorAll('.wa-message .badge')].every(badge => badge.textContent === 'Dismissed')).toBe(true);
    const reopen = await openDecision(user, 'Reopen');
    await user.click(within(reopen).getByRole('button', { name: 'Reopen message', exact: true }));
    expect(within(reopen).getByRole('alert').textContent).toContain('Enter a reason');
    await user.type(within(reopen).getByRole('textbox', { name: 'Reason for reopening' }), 'The supervisor confirmed the source area.');
    await user.click(within(reopen).getByRole('button', { name: 'Reopen message', exact: true }));
    expect(panel().getByText('Message reopened for review', { exact: true })).toBeTruthy();
    expect(panel().getByRole('button', { name: 'Add progress update', exact: true })).toBeTruthy();
    expect(panel().getByText('Decision history', { exact: true })).toBeTruthy();
    expect(current.messageInboxDecisions.map(entry => entry.action)).toEqual(['dismiss', 'reopen']);
    expect(current.whatsappMessages).toEqual(before.whatsappMessages);
    expect(current.reports).toEqual(before.reports);
    expect(current.claimDrafts).toEqual(before.claimDrafts);
    expect(process).not.toHaveBeenCalled();
  });

  it('keeps an unfinished clarification question available after dismissal and reopening', async () => {
    const project = fixture();
    const source = project.whatsappMessages.find(message => message.kind === 'clarification' && getMessageDismissalEligibility(project, message.id).eligible);
    expect(source).toBeTruthy();
    const user = userEvent.setup();
    render(<SourceHarness seed={project} messageId={source.id}/>);
    const question = panel().getByRole('textbox', { name: 'Clarification question' });
    await user.clear(question);
    await user.type(question, 'Please confirm the lift-core area and work item.');
    const dialog = await openDecision(user, 'Dismiss message');
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason for dismissal' }), 'Checking whether this belongs here.');
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss message', exact: true }));
    expect(panel().queryByRole('textbox', { name: 'Clarification question' })).toBeNull();
    const reopen = await openDecision(user, 'Reopen');
    await user.type(within(reopen).getByRole('textbox', { name: 'Reason for reopening' }), 'Confirmed the project.');
    await user.click(within(reopen).getByRole('button', { name: 'Reopen message', exact: true }));
    expect(panel().getByRole('textbox', { name: 'Clarification question' }).value).toBe('Please confirm the lift-core area and work item.');
    expect(current.messageClarifications).toEqual(project.messageClarifications);
    expect(current.reports).toEqual(project.reports);
  });

  it('keeps a cancelled reason isolated by message and disables dismissal during open match or transcript edits', async () => {
    const project = fixture();
    const source = project.whatsappMessages.find(message => getMessageDismissalEligibility(project, message.id).eligible);
    const next = project.whatsappMessages.find(message => message.id !== source.id && getMessageDismissalEligibility(project, message.id).eligible);
    const save = vi.fn();
    const user = userEvent.setup();
    const view = render(<MessageInboxActions project={project} messageId={source.id} editing onDismiss={save}/>);
    await user.click(screen.getByRole('button', { name: 'Message actions', exact: true }));
    expect(screen.getByRole('menuitem', { name: 'Dismiss message' }).getAttribute('data-disabled')).not.toBeNull();
    await user.keyboard('{Escape}');
    view.rerender(<MessageInboxActions project={project} messageId={source.id} onDismiss={save}/>);
    await user.click(screen.getByRole('button', { name: 'Message actions', exact: true }));
    await user.click(screen.getByRole('menuitem', { name: 'Dismiss message' }));
    await user.type(screen.getByRole('textbox', { name: 'Reason for dismissal' }), 'Unfinished reason');
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Message actions', exact: true }));
    view.rerender(<MessageInboxActions project={project} messageId={next.id} onDismiss={save}/>);
    await user.click(screen.getByRole('button', { name: 'Message actions', exact: true }));
    await user.click(screen.getByRole('menuitem', { name: 'Dismiss message' }));
    expect(screen.getByRole('textbox', { name: 'Reason for dismissal' }).value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    view.rerender(<MessageInboxActions project={project} messageId={source.id} onDismiss={save}/>);
    await user.click(screen.getByRole('button', { name: 'Message actions', exact: true }));
    await user.click(screen.getByRole('menuitem', { name: 'Dismiss message' }));
    expect(screen.getByRole('textbox', { name: 'Reason for dismissal' }).value).toBe('Unfinished reason');
    expect(save).not.toHaveBeenCalled();
  });
});
