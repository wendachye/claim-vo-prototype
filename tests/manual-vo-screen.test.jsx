import { chooseSelect } from './select-helpers.mjs';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VOReviewView } from '../src/components/VOReviewView';
import { createProject } from '../src/data/projects.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { createManualVO, MANUAL_VO_PHOTOS } from '../src/data/manual-vo.ts';
import { getVOCases, updateVOReview } from '../src/data/vo.ts';

const ids = new Set();
beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false }))));
afterEach(() => { for (const id of ids) clearProjectFormBuffers(id); ids.clear(); vi.unstubAllGlobals(); });
function fixture(code, existing = false) {
  const project = createProject({ name: 'Manual VO screen example', code, country: 'Singapore' });
  project.items = [{ id: 'WI-A', ref: 'A.1', description: 'Original façade scaffold', location: 'Block A' }];
  if (existing) project.reports = [{ id: `${code}-OLD-REPORT`, projectId: project.id, projectCode: project.code,
    itemId: 'WI-A', vo: true, status: 'needsReview', message: 'Original WhatsApp scope query', area: 'Area A',
    sender: 'Mock site worker', date: '2026-10-22T08:00:00Z', channel: 'whatsapp-mock' }];
  project.claimDrafts = [{ id: 'FROZEN-CLAIM', status: 'prepared', snapshot: { totals: { currentValue: 1250 } } }];
  ids.add(project.id);
  return project;
}
function Harness({ initial, onState = () => {}, onSelect = () => {} }) {
  const [project, setProject] = useState(initial);
  const [selection, setSelection] = useState(initial.reports[0]?.id);
  const accept = result => { if (result.outcome === 'updated') { setProject(result.project); onState(result.project); } return result; };
  return <VOReviewView project={project} cases={getVOCases(project)} initialCaseId={selection}
    onSelect={id => { setSelection(id); onSelect(id); }}
    onCreate={values => accept(createManualVO(project, values, '2026-10-23T08:00:00Z'))}
    onAction={(id, action, values) => accept(updateVOReview(project, id, action, values, '2026-10-23T08:05:00Z'))} />;
}
async function openForm(user) {
  await user.click(screen.getByRole('button', { name: 'Add extra work', exact: true }));
  return screen.getByRole('dialog', { name: 'Add extra work', exact: true });
}
async function fill(user, dialog, title = 'Separate additional access platform') {
  await user.type(within(dialog).getByRole('textbox', { name: /^Work description/ }), title);
  await user.type(within(dialog).getByRole('textbox', { name: /^Details/ }), 'QS manually recorded the reported site instruction. Scope and approval still need review.');
}

describe('manual entry in the existing VO screen', () => {
  it('makes Add extra work available in the empty register and opens the existing four-check review after saving', async () => {
    const initial = fixture('MANUAL-SCREEN-EMPTY');
    const onState = vi.fn();
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={initial} onState={onState} onSelect={onSelect} />);
    expect(screen.getByText('No flagged extra work for this project')).toBeTruthy();
    const dialog = await openForm(user);
    await fill(user, dialog);
    await user.type(within(dialog).getByRole('textbox', { name: /^Location/ }), 'Separate unlisted work face');
    await user.type(within(dialog).getByRole('textbox', { name: /^Instruction or reference/ }), 'REPORTED-SI-01');
    await user.click(within(dialog).getByRole('button', { name: 'Add for review', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = onState.mock.calls.at(-1)[0];
    const entry = getVOCases(saved)[0];
    expect(onSelect).toHaveBeenLastCalledWith(entry.id);
    const heading = screen.getByRole('heading', { name: 'Separate additional access platform', exact: true });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    for (const name of ['Contract scope', 'Instruction', 'Price approval', 'Claim eligibility']) expect(screen.getByRole('region', { name, exact: true })).toBeTruthy();
    expect(screen.getByText('Price unknown')).toBeTruthy();
    expect(entry).toMatchObject({ status: 'flagged', proposedValue: null, approvedValue: null, instructionStatus: 'reported', claimEligibility: 'needsReview' });
    await user.click(screen.getByText('Manual entry & photo', { exact: true }));
    expect(screen.getByText('QS manually recorded the reported site instruction. Scope and approval still need review.')).toBeTruthy();
    expect(screen.getByText('No photo attached')).toBeTruthy();
    expect(saved.items).toEqual(initial.items);
    expect(saved.claimDrafts).toEqual(initial.claimDrafts);
  });

  it('clears list filters and opens the exact manually added case without changing earlier evidence or claims', async () => {
    const initial = fixture('MANUAL-SCREEN-EXISTING', true);
    const before = structuredClone(initial);
    const onState = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={initial} onState={onState} />);
    await user.type(screen.getByRole('textbox', { name: 'Search VO records', exact: true }), 'a filter with no matches');
    expect(screen.getByText('No matching extra work')).toBeTruthy();
    const dialog = await openForm(user);
    await fill(user, dialog, 'Extra escalator access');
    await user.click(within(dialog).getByText('Contract link & demo photo'));
    await chooseSelect(user, within(dialog).getByRole('combobox', { name: /^Contract item for comparison/ }), 'WI-A');
    await chooseSelect(user, within(dialog).getByRole('combobox', { name: /^Demo photo/ }), MANUAL_VO_PHOTOS[1].value);
    await user.click(within(dialog).getByRole('button', { name: 'Add for review', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('textbox', { name: 'Search VO records', exact: true }).value).toBe('');
    expect(screen.getByRole('heading', { name: 'Extra escalator access', exact: true })).toBeTruthy();
    const saved = onState.mock.calls.at(-1)[0];
    const manual = getVOCases(saved).find(entry => entry.report.channel === 'manual-vo-mock');
    expect(manual.relatedItemId).toBe('WI-A');
    expect(manual.report.itemId).toBeNull();
    expect(manual.report.photo).toBe(MANUAL_VO_PHOTOS[1].value);
    expect(saved.reports.find(report => report.id === initial.reports[0].id)).toEqual(before.reports[0]);
    expect(saved.claimDrafts).toEqual(before.claimDrafts);
    expect(initial).toEqual(before);
  });

  it('keeps unfinished QS review and manual entry edits when cancelling, browsing another project and returning', async () => {
    const first = fixture('MANUAL-SCREEN-FIRST', true);
    const second = fixture('MANUAL-SCREEN-SECOND');
    const user = userEvent.setup();
    let view = render(<Harness initial={first} />);
    await user.type(screen.getByRole('textbox', { name: /^QS scope assessment/ }), 'Unfinished existing QS review');
    let dialog = await openForm(user);
    await fill(user, dialog, 'Unfinished separate extra work');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel', exact: true }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add extra work', exact: true })));
    expect(screen.getByRole('textbox', { name: /^QS scope assessment/ }).value).toBe('Unfinished existing QS review');
    view.unmount();
    view = render(<Harness initial={second} />);
    dialog = await openForm(user);
    expect(within(dialog).getByRole('textbox', { name: /^Work description/ }).value).toBe('');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel', exact: true }));
    view.unmount();
    render(<Harness initial={first} />);
    expect(screen.getByRole('textbox', { name: /^QS scope assessment/ }).value).toBe('Unfinished existing QS review');
    dialog = await openForm(user);
    expect(within(dialog).getByRole('textbox', { name: /^Work description/ }).value).toBe('Unfinished separate extra work');
    expect(first.reports).toHaveLength(1);
    expect(second.reports).toHaveLength(0);
  });
});
