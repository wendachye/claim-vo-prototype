import { chooseSelect } from './select-helpers.mjs';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Checkbox, FormField, Input, Modal, SelectField, Textarea } from '../src/components/ui';
import { ProjectDropdown } from '../src/components/ProjectDropdown';
import { ReportDrawer } from '../src/components/ReportDrawer';

const projects = [
  { id: 'campus', name: 'Campus project', code: 'CAMPUS', country: 'Singapore' },
  { id: 'warehouse', name: 'Warehouse project', code: 'WH02', country: 'Malaysia' },
  { id: 'office', name: 'Office project', code: 'OF03', country: 'Singapore' },
];

function Picker({ onSelect = () => {}, onCreate }) {
  return <div className="app-shell"><ProjectDropdown projects={projects} activeProjectId="campus" onSelect={onSelect} onCreate={onCreate} /><button type="button">Outside picker</button></div>;
}

describe('shadcn controls preserve the existing form contract', () => {
  it('ordinary actions do not submit a form; explicit submit and external form association still work', async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(<><form id="assessment" onSubmit={(event) => { event.preventDefault(); submitted(); }}><Button>Review values</Button><Button type="submit">Save assessment</Button></form><Button type="submit" form="assessment">Save from footer</Button></>);
    await user.click(screen.getByRole('button', { name: 'Review values' }));
    expect(submitted).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save assessment' }));
    await user.click(screen.getByRole('button', { name: 'Save from footer' }));
    expect(submitted).toHaveBeenCalledTimes(2);
  });

  it('legacy inputs retain their ref, label, name, empty/zero values and validation descriptions', async () => {
    const user = userEvent.setup();
    const quantityRef = createRef();
    const values = [];
    function Assessment() {
      const [value, setValue] = useState('');
      return <><p id="source-basis">Measured quantity</p><FormField label="Quantity" hint="Enter the total to date." error="Check the source quantity." required><input ref={quantityRef} id="quantity" name="quantity" type="number" aria-describedby="source-basis" value={value} onChange={(event) => { values.push(event.target.value); setValue(event.target.value); }} /></FormField></>;
    }
    render(<Assessment />);
    const input = screen.getByRole('spinbutton', { name: 'Quantity' });
    expect(quantityRef.current).toBe(input);
    expect(input.name).toBe('quantity');
    expect(input.value).toBe('');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-required')).toBe('true');
    const descriptions = input.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent);
    expect(descriptions).toEqual(['Measured quantity', 'Enter the total to date.', 'Check the source quantity.']);
    await user.type(input, '0');
    expect(input.value).toBe('0');
    await user.clear(input);
    expect(input.value).toBe('');
    expect(values).toEqual(['0', '']);
    quantityRef.current.focus();
    expect(document.activeElement).toBe(input);
  });

  it('native and facade selects/notes preserve inner refs, IDs, string values and labels', async () => {
    const user = userEvent.setup();
    const selectRef = createRef();
    const noteRef = createRef();
    const changed = vi.fn();
    function Fields() {
      const [value, setValue] = useState('');
      return <><FormField label="Work item"><select id="work-item" name="workItemId" ref={selectRef} value={value} onChange={(event) => { changed(event.target.name, event.target.value); setValue(event.target.value); }}><option value="">Choose work</option><option value="0">Zero-value work</option></select></FormField><FormField label="Location"><SelectField name="location" defaultValue="B"><option value="A">Block A</option><option value="B">Block B</option></SelectField></FormField><FormField label="QS note"><Textarea ref={noteRef} name="note" defaultValue="" /></FormField><FormField label="Reference"><Input name="reference" defaultValue="REF-1" /></FormField></>;
    }
    render(<Fields />);
    const work = screen.getByRole('combobox', { name: 'Work item' });
    expect(work).toBe(selectRef.current);
    expect(work.id).toBe('work-item');
    await chooseSelect(user, work, '0');
    expect(changed).toHaveBeenLastCalledWith('workItemId', '0');
    expect(work.getAttribute('data-value')).toBe('0');
    expect(screen.getByRole('combobox', { name: 'Location' }).getAttribute('data-value')).toBe('B');
    const note = screen.getByRole('textbox', { name: 'QS note' });
    await user.type(note, 'Measured on site');
    expect(noteRef.current).toBe(note);
    expect(note.value).toBe('Measured on site');
    expect(screen.getByRole('textbox', { name: 'Reference' }).value).toBe('REF-1');
  });

  it('a labelled checkbox toggles once per action and keeps the old checked-event callback', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    function Choices() {
      const [checked, setChecked] = useState(false);
      return <form><label><Checkbox name="includedWork" value="WI-001" checked={checked} onChange={(event) => { changed(event.target.checked, event.target.name, event.target.value); setChecked(event.target.checked); }} />Include contract work</label><label><Checkbox checked disabled onChange={() => changed('disabled')} />Already locked</label></form>;
    }
    render(<Choices />);
    await user.click(screen.getByText('Include contract work'));
    expect(screen.getByRole('checkbox', { name: 'Include contract work' }).getAttribute('aria-checked')).toBe('true');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(true, 'includedWork', 'WI-001');
    await user.click(screen.getByRole('checkbox', { name: 'Include contract work' }));
    expect(changed).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenLastCalledWith(false, 'includedWork', 'WI-001');
    await user.click(screen.getByText('Already locked'));
    expect(changed).toHaveBeenCalledTimes(2);
  });
});

describe('overlay navigation and focus', () => {
  it('dialogs retain app/photo styling context, accessible text, keyboard trapping and opener focus', async () => {
    const user = userEvent.setup();
    function PhotoReview() {
      const [open, setOpen] = useState(false);
      return <div className="app-shell"><Button onClick={() => setOpen(true)}>Open photo review</Button>{open && <div className="wa-photo-modal"><Modal title="Photo review" description="Review the original site evidence." onClose={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>Done</Button>}><FormField label="Evidence note"><Input /></FormField></Modal></div>}</div>;
    }
    render(<PhotoReview />);
    const opener = screen.getByRole('button', { name: 'Open photo review' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Photo review' });
    expect(dialog.closest('.app-shell')).not.toBeNull();
    expect(dialog.closest('.wa-photo-modal')).not.toBeNull();
    expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe('Review the original site evidence.');
    const close = within(dialog).getByRole('button', { name: 'Close dialog' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Done' }));
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('project picker search and keyboard selection target the exact project', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    render(<Picker onSelect={selected} />);
    const trigger = screen.getByRole('button', { name: 'Project: Campus project' });
    await user.click(trigger);
    const search = await screen.findByRole('combobox', { name: 'Search projects by name or code' });
    await waitFor(() => expect(document.activeElement).toBe(search));
    await user.type(search, 'WH02');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option').textContent).toContain('Warehouse project');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(selected).toHaveBeenCalledExactlyOnceWith('warehouse');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose project' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await user.keyboard('{End}');
    await screen.findByRole('combobox', { name: 'Search projects by name or code' });
    await user.keyboard('{Home}{ArrowDown}{End}{Enter}');
    expect(selected).toHaveBeenLastCalledWith('office');
    expect(selected).toHaveBeenCalledTimes(2);
  });

  it('picker Escape/outside dismissal does not select; New project gives focus to its dialog', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    function NewProjectFlow() {
      const [creating, setCreating] = useState(false);
      return <div className="app-shell"><ProjectDropdown projects={projects} activeProjectId="campus" onSelect={selected} onCreate={() => setCreating(true)} /><button type="button">Outside picker</button>{creating && <Modal title="New project" onClose={() => setCreating(false)}><FormField label="Project name"><Input /></FormField></Modal>}</div>;
    }
    render(<NewProjectFlow />);
    const trigger = screen.getByRole('button', { name: 'Project: Campus project' });
    await user.click(trigger);
    await screen.findByRole('combobox', { name: 'Search projects by name or code' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(selected).not.toHaveBeenCalled();
    await user.click(trigger);
    await screen.findByRole('combobox', { name: 'Search projects by name or code' });
    await user.click(screen.getByRole('button', { name: 'Outside picker' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose project' })).toBeNull());
    expect(selected).not.toHaveBeenCalled();
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(screen.queryByRole('dialog', { name: 'Choose project' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('adding an update from the sheet hands focus to the modal and restores its persistent opener', async () => {
    const user = userEvent.setup();
    const added = vi.fn();
    const item = { id: 'WI-002', ref: 'A.2', description: 'Block B scaffold', verified: 0, reported: 0 };
    function AddUpdateFlow() {
      const [drawerOpen, setDrawerOpen] = useState(false);
      const [adding, setAdding] = useState(false);
      return <div className="app-shell"><Button onClick={() => setDrawerOpen(true)}>View work progress</Button>{drawerOpen && <ReportDrawer item={item} locked onClose={() => setDrawerOpen(false)} onAdd={(itemId) => { added(itemId); setDrawerOpen(false); setAdding(true); }} />}{adding && <Modal title="Add a site update" onClose={() => setAdding(false)}><FormField label="Original message"><Textarea /></FormField></Modal>}</div>;
    }
    render(<AddUpdateFlow />);
    const opener = screen.getByRole('button', { name: 'View work progress' });
    await user.click(opener);
    const drawer = await screen.findByRole('dialog', { name: 'Ref. A.2 · Work item progress' });
    await user.click(within(drawer).getByRole('button', { name: 'Add site update' }));
    expect(added).toHaveBeenCalledExactlyOnceWith('WI-002');
    const modal = await screen.findByRole('dialog', { name: 'Add a site update' });
    await waitFor(() => expect(modal.contains(document.activeElement)).toBe(true));
    await user.click(within(modal).getByRole('button', { name: 'Close dialog' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('the progress sheet requires a correction reason and preserves explicit verification arguments', async () => {
    const user = userEvent.setup();
    const approved = vi.fn();
    const changed = vi.fn();
    const item = { id: 'WI-001', ref: 'A.1', description: 'Block A scaffold', verified: 40, reported: 65 };
    const report = { id: 'REPORT-1', itemId: 'WI-001', status: 'pending', completion: 65, completionBasis: 'cumulative', area: 'A1', message: 'Area A1 done 65% total', date: '2026-10-21T00:00:00.000Z', demo: true };
    function Review() {
      const [open, setOpen] = useState(false);
      return <div className="app-shell"><Button onClick={() => setOpen(true)}>Review site report</Button>{open && <ReportDrawer projectCode="QA01" item={item} report={report} locked onClose={() => setOpen(false)} onApprove={approved} onChange={changed} />}</div>;
    }
    render(<Review />);
    const opener = screen.getByRole('button', { name: 'Review site report' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Ref. A.1 · A1' });
    expect(dialog.closest('.app-shell')).not.toBeNull();
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    expect(within(dialog).queryByRole('textbox', { name: 'Review note or correction reason' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Correct', exact: true }));
    const completion = within(dialog).getByRole('spinbutton', { name: 'Verified cumulative completion (%)' });
    expect(document.activeElement).toBe(completion);
    await user.clear(completion);
    await user.type(completion, '50');
    await user.click(within(dialog).getByRole('button', { name: 'Verify progress' }));
    const note = within(dialog).getByRole('textbox', { name: 'Review note or correction reason' });
    expect(document.activeElement).toBe(note);
    expect(approved).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Explain the corrected percentage');
    await user.type(note, 'Measured scope correction');
    await user.click(within(dialog).getByRole('button', { name: 'Verify progress' }));
    expect(approved).toHaveBeenCalledExactlyOnceWith(report, '50', 'Measured scope correction');
    expect(changed).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
