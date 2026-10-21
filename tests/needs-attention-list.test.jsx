import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NeedsAttentionList } from '../src/components/NeedsAttentionList.jsx';
import { ProjectOverview } from '../src/components/ProjectWorkflow.jsx';

vi.mock('../src/data/project-attention.js', () => ({ getProjectAttention: vi.fn((project) => project.attention || []) }));

const project = (id = 'TASK-UI') => ({ id, code: id, name: 'Overview UI demo', items: [{ id: 'A' }],
  reports: [], whatsappMessages: [], voReviews: [], claimDrafts: [], contract: {} });
const task = (index, category = 'site', projectId = 'TASK-UI') => ({
  id: `task-${projectId}-${index}`, projectId, category, kind: category === 'claims' ? 'claim-query' : 'progress',
  title: `Task ${index}`, detail: `Saved record ${index} needs review.`, reference: `REF-${index}`,
  statusLabel: category === 'claims' ? 'Needs revision' : 'To check', actionLabel: 'Review record',
  target: { route: category === 'claims' ? 'claim-status' : 'completion', reportId: `REPORT-${index}`, itemId: `ITEM-${index}` },
});
const region = () => screen.getByRole('region', { name: 'Needs attention' });

describe('project Needs attention list', () => {
  it('opens the exact task without marking it complete or changing project records', async () => {
    const value = { ...project(), items: [{ id: 'ITEM-1', ref: 'A.1 / 1a' }], reports: [{ id: 'REPORT-1', area: 'Area W3-ST31' }] };
    const record = task(1);
    const before = structuredClone(value);
    const onOpen = vi.fn();
    render(<NeedsAttentionList project={value} tasks={[record]} onOpen={onOpen} />);
    const queue = within(region());
    expect(queue.getByText('Task 1')).toBeTruthy();
    expect(queue.getByText('Area W3-ST31 · A.1 / 1a')).toBeTruthy();
    expect(queue.queryByText('REF-1')).toBeNull();
    expect(queue.queryByText('To check')).toBeNull();
    await userEvent.setup().click(queue.getByRole('button', { name: 'Review record: REF-1' }));
    expect(onOpen).toHaveBeenCalledWith(record);
    expect(queue.getByText('Task 1')).toBeTruthy();
    expect(value).toEqual(before);
  });

  it('removes completed records immediately when project-derived tasks update', () => {
    const value = project();
    const records = [task(1), task(2, 'claims')];
    const view = render(<NeedsAttentionList project={value} tasks={records} onOpen={vi.fn()} />);
    view.rerender(<NeedsAttentionList project={value} tasks={[records[0]]} onOpen={vi.fn()} />);
    expect(within(region()).queryByText('Task 2')).toBeNull();
    expect(within(region()).getByText('Task 1')).toBeTruthy();
    view.rerender(<NeedsAttentionList project={value} tasks={[]} onOpen={vi.fn()} />);
    expect(within(region()).getByText('All caught up')).toBeTruthy();
    expect(within(region()).queryByRole('button', { name: 'Claims', exact: true })).toBeNull();
  });

  it('shows only the new project’s own tasks after switching projects', () => {
    const first = project();
    const view = render(<NeedsAttentionList project={first} tasks={[task(1, 'claims')]} onOpen={vi.fn()} />);
    const second = project('OTHER-UI');
    const records = [task(2, 'site', second.id), task(3, 'claims', first.id)];
    view.rerender(<NeedsAttentionList project={second} tasks={records} onOpen={vi.fn()} />);
    expect(within(region()).getByText('Task 2')).toBeTruthy();
    expect(within(region()).queryByText('Task 3')).toBeNull();
  });

  it('offers one exact next task, keeps the guide collapsed and handles an empty project', async () => {
    const value = { ...project(), locked: true, attention: [task(1)], providedContractDemo: true };
    const before = structuredClone(value);
    const onOpenAttention = vi.fn();
    const onOpenTask = vi.fn();
    const onReviewContract = vi.fn();
    const onNext = vi.fn();
    const props = { onNavigate: vi.fn(), onNext, onOpenTask, onReviewContract, onOpenAttention };
    const user = userEvent.setup();
    const view = render(<ProjectOverview project={value} {...props} />);
    expect(screen.queryByRole('region', { name: 'Needs attention' })).toBeNull();
    expect(screen.getByRole('heading', { name: '1 task needs attention' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Task 1' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Review record' }));
    expect(onOpenTask).toHaveBeenCalledWith(value.attention[0]);
    expect(value).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'View tasks' }));
    expect(onOpenAttention).toHaveBeenCalledOnce();
    const guide = view.container.querySelector('.contract-scenario-guide');
    expect(guide.hasAttribute('open')).toBe(false);
    await user.click(guide.querySelector('summary'));
    await user.click(screen.getByRole('button', { name: 'Review contract' }));
    expect(onReviewContract).toHaveBeenCalledOnce();
    view.rerender(<ProjectOverview project={{ ...value, attention: [] }} {...props} />);
    expect(screen.getByRole('heading', { name: 'All caught up' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View tasks' })).toBeNull();
    view.rerender(<ProjectOverview project={{ ...value, attention: [], items: [] }} {...props} />);
    expect(screen.getByRole('heading', { name: 'Ready to get started' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add a contract' }));
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ route: 'contract' }));
    view.rerender(<ProjectOverview project={{ ...value, locked: false }} {...props} />);
    expect(screen.getByRole('button', { name: 'Confirm contract' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review record' })).toBeNull();
  });
});
