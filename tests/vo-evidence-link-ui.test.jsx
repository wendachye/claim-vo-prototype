import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VOCaseReview } from '../src/components/VOCaseReview';
import { VOReviewView } from '../src/components/VOReviewView';
import { createProject } from '../src/data/projects.ts';
import { getVOCases, linkVOEvidence } from '../src/data/vo.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

const projectIds = new Set();
afterEach(() => { cleanup(); projectIds.forEach(clearProjectFormBuffers); projectIds.clear(); vi.unstubAllGlobals(); });
function fixture(code = 'VO-LINK-UI') {
  const project = createProject({ name: 'Related VO evidence', code, country: 'Singapore' });
  projectIds.add(project.id);
  project.claimDrafts = [];
  project.voReviews = [];
  project.reports = [
    { id: 'FOLLOW-UP', projectId: project.id, projectCode: project.code, vo: true, status: 'needsReview', channel: 'whatsapp-mock', sender: 'Demo worker', date: '2026-10-27T09:30:00+08:00', message: 'A second photo of the same additional access platform.', area: 'Area B', photo: '/assets/demo-platform.jpg', photoAlt: 'Original second platform photo' },
    { id: 'FIRST-REPORT', projectId: project.id, projectCode: project.code, vo: true, status: 'needsReview', channel: 'whatsapp-mock', sender: 'Demo supervisor', date: '2026-10-27T08:00:00+08:00', message: 'Additional access platform requested at Area B.', area: 'Area B', photo: '/assets/demo-facade.jpg', photoAlt: 'Original first platform photo' },
  ];
  return project;
}
function review(project, extra = {}, index = 0) {
  const entry = getVOCases(project)[index];
  return <VOCaseReview project={project} entry={entry} currency="SGD" {...extra}/>;
}
async function openLink(user) {
  await user.click(screen.getByRole('button', { name: 'Review actions', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Link to existing VO', exact: true }));
}

describe('compact VO evidence linking', () => {
  it('requires an explicit target and reason before saving without changing originals or review fields', async () => {
    const project = fixture(), before = structuredClone(project), user = userEvent.setup();
    const onLink = vi.fn(() => ({ outcome: 'updated' })), onAction = vi.fn();
    render(review(project, { onLink, onAction }));
    await openLink(user);
    const form = screen.getByRole('form', { name: 'Link to existing VO' });
    expect(screen.queryByRole('button', { name: 'Save draft', exact: true })).toBeNull();
    const target = within(form).getByRole('combobox', { name: 'Existing VO' });
    expect(document.activeElement).toBe(target);
    await user.click(within(form).getByRole('button', { name: 'Save link', exact: true }));
    expect(screen.getByText('Choose an available VO from this project.')).toBeTruthy();
    await chooseSelect(user, target, 'FIRST-REPORT');
    await user.click(within(form).getByRole('button', { name: 'Save link', exact: true }));
    const reason = within(form).getByRole('textbox', { name: 'Reason for linking' });
    expect(screen.getByText('Explain why these records describe the same extra work.')).toBeTruthy();
    expect(document.activeElement).toBe(reason);
    await user.type(reason, 'Same access platform; this photo shows the other side.');
    expect(onLink).not.toHaveBeenCalled();
    await user.click(within(form).getByRole('button', { name: 'Save link', exact: true }));
    expect(onLink).toHaveBeenCalledExactlyOnceWith('FOLLOW-UP', 'FIRST-REPORT', 'Same access platform; this photo shows the other side.');
    expect(onAction).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  });

  it('keeps the unfinished link per project and case and returns focus on Cancel', async () => {
    const project = fixture(), other = fixture('VO-LINK-OTHER'), user = userEvent.setup(), onLink = vi.fn();
    const view = render(review(project, { onLink }));
    await openLink(user);
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Existing VO' }), 'FIRST-REPORT');
    await user.type(screen.getByRole('textbox', { name: 'Reason for linking' }), 'Keep this unsaved reason.');
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Review actions', exact: true }));
    await openLink(user);
    expect(screen.getByRole('textbox', { name: 'Reason for linking' }).value).toBe('Keep this unsaved reason.');
    view.unmount();
    const otherView = render(review(other, { onLink }));
    await openLink(user);
    expect(screen.getByRole('textbox', { name: 'Reason for linking' }).value).toBe('');
    otherView.unmount();
    render(review(project, { onLink }));
    expect(screen.getByRole('textbox', { name: 'Reason for linking' }).value).toBe('Keep this unsaved reason.');
    expect(screen.getByRole('combobox', { name: 'Existing VO' }).getAttribute('data-value')).toBe('FIRST-REPORT');
    expect(onLink).not.toHaveBeenCalled();
  });

  it('blocks linking while a QS review has unsaved edits instead of dropping those edits', async () => {
    const project = fixture(), user = userEvent.setup(), onLink = vi.fn();
    render(review(project, { onLink }));
    const note = screen.getByRole('textbox', { name: /^QS scope assessment/ });
    await user.type(note, 'An unfinished scope assessment');
    await openLink(user);
    expect(screen.getByText('Save or finish your review changes before linking this VO.')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Link to existing VO' })).toBeNull();
    expect(note.value).toBe('An unfinished scope assessment');
    expect(onLink).not.toHaveBeenCalled();
  });

  it('explains when there are no eligible destinations without creating a case', async () => {
    const project = fixture(), user = userEvent.setup(), onLink = vi.fn();
    project.reports = project.reports.slice(0, 1);
    render(review(project, { onLink }));
    await openLink(user);
    expect(screen.getByText(/No available VO to link/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save link', exact: true }).disabled).toBe(true);
    expect(screen.queryByRole('combobox', { name: 'Existing VO' })).toBeNull();
    expect(onLink).not.toHaveBeenCalled();
  });

  it('keeps a linked source read-only and opens the exact destination while retaining both original messages and photos', async () => {
    const original = fixture();
    const result = linkVOEvidence(original, 'FOLLOW-UP', 'FIRST-REPORT', 'Same extra platform, shown from another side.');
    expect(result.outcome).toBe('updated');
    const project = result.project, cases = getVOCases(project), source = cases.find(entry => entry.id === 'FOLLOW-UP'), target = cases.find(entry => entry.id === 'FIRST-REPORT');
    const onOpenRelatedCase = vi.fn(), user = userEvent.setup();
    const view = render(<VOCaseReview project={project} entry={source} currency="SGD" onOpenRelatedCase={onOpenRelatedCase} onLink={vi.fn()}/>);
    const summary = screen.getByRole('region', { name: 'Linked VO' });
    expect(summary.textContent).toContain('Same extra platform, shown from another side.');
    expect(screen.getByText(original.reports[0].message)).toBeTruthy();
    expect(screen.getByRole('img', { name: original.reports[0].photoAlt })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review actions', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ready for approval', exact: true })).toBeNull();
    await user.click(within(summary).getByRole('button', { name: `Open ${target.reference}`, exact: true }));
    expect(onOpenRelatedCase).toHaveBeenCalledWith(target.id);
    view.unmount();
    render(<VOCaseReview project={project} entry={target} currency="SGD" onOpenRelatedCase={onOpenRelatedCase}/>);
    const related = document.querySelector('.vo-related-evidence');
    expect(related.open).toBe(false);
    await user.click(within(related).getByText('Related evidence', { exact: true }));
    expect(within(related).getByText(original.reports[0].message)).toBeTruthy();
    expect(within(related).getByRole('img', { name: original.reports[0].photoAlt })).toBeTruthy();
    expect(screen.getByText(original.reports[1].message)).toBeTruthy();
    expect(screen.getByRole('img', { name: original.reports[1].photoAlt })).toBeTruthy();
    await user.click(within(related).getByRole('button', { name: 'Open record', exact: true }));
    expect(onOpenRelatedCase).toHaveBeenLastCalledWith(source.id);
  });

  it('shows a malformed saved link as read-only without guessing a destination', () => {
    const project = fixture(), entry = { ...getVOCases(project)[0], status: 'linked', evidenceLinkIssue: true };
    render(<VOCaseReview project={project} entry={entry} currency="SGD" onLink={vi.fn()}/>);
    expect(screen.getByRole('region', { name: 'Saved evidence link needs review' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review actions', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Open .*VO-/ })).toBeNull();
  });

  it('labels linked cases as evidence only and excludes them from the open count', () => {
    vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const project = linkVOEvidence(fixture(), 'FOLLOW-UP', 'FIRST-REPORT', 'Same additional platform.').project;
    render(<VOReviewView project={project} cases={getVOCases(project)}/>);
    expect(screen.getByText('2 of 2 cases · 1 open')).toBeTruthy();
    expect(screen.getByLabelText('Evidence only; no separate claim value').textContent).toBe('Evidence only');
  });
});
