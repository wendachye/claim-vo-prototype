import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectDropdown } from '../src/components/ProjectDropdown';
import { ProjectsView } from '../src/components/ProjectsView';
import { createProject } from '../src/data/projects';
import { createSITContractDemo } from '../src/data/provided-contract-demo';

const makeProject = (code, name, extra = {}) => ({ ...createProject({ code, name, country: 'Singapore' }), ...extra });
const showcase = createSITContractDemo({ code: 'SIT-MAIN', name: 'Original S.I.T. contract' }, new Date('2026-10-24T02:00:00Z'));
const regular = makeProject('CLIENT', 'Client project');
const voice = makeProject('VOICE', 'Voice-note review (Demo)', { demoKind: 'voice-note' });
const mapping = makeProject('MAP', 'Area mapping (Demo)', { demoKind: 'area-split' });
const projects = [voice, regular, mapping, showcase];
const pickerProps = { projects, activeProjectId: showcase.id, showcaseProjectId: showcase.id };

describe('project catalog navigation', () => {
  it('keeps the main showcase first and collapses examples without changing projects', async () => {
    const user = userEvent.setup();
    const original = structuredClone(projects);
    const selected = vi.fn();
    render(<div className="app-shell"><ProjectDropdown {...pickerProps} onSelect={selected}/></div>);
    await user.click(screen.getByRole('button', { name: 'Project: Original S.I.T. contract' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining(showcase.name), expect.stringContaining(regular.name),
    ]);
    const examples = screen.getByRole('button', { name: 'Demo examples 2' });
    expect(examples.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('option', { name: /Voice-note review/ })).toBeNull();
    await user.click(examples);
    expect(screen.getAllByRole('option')).toHaveLength(4);
    await user.click(screen.getByRole('option', { name: /Area mapping/ }));
    expect(selected).toHaveBeenCalledExactlyOnceWith(mapping.id);
    expect(projects).toEqual(original);
  });

  it('search finds hidden examples and keyboard selection follows the visible ordered results', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    render(<div className="app-shell"><ProjectDropdown {...pickerProps} onSelect={selected}/></div>);
    await user.click(screen.getByRole('button', { name: 'Project: Original S.I.T. contract' }));
    const search = screen.getByRole('combobox', { name: 'Search projects by name or code' });
    await user.keyboard('{End}{Enter}');
    expect(selected).toHaveBeenLastCalledWith(regular.id);
    await user.click(screen.getByRole('button', { name: 'Project: Original S.I.T. contract' }));
    await user.type(screen.getByRole('combobox', { name: search.getAttribute('aria-label') }), 'voice');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Demo examples' })).toBeTruthy();
    await user.keyboard('{ArrowDown}{Home}{End}{Enter}');
    expect(selected).toHaveBeenLastCalledWith(voice.id);
  });

  it('keeps the current demo visible while its other examples remain collapsed', async () => {
    const user = userEvent.setup();
    render(<div className="app-shell"><ProjectDropdown {...pickerProps} activeProjectId={voice.id} onSelect={vi.fn()}/></div>);
    await user.click(screen.getByRole('button', { name: 'Project: Voice-note review (Demo)' }));
    const selected = screen.getByRole('option', { name: /Voice-note review/ });
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('group', { name: 'Current demo' })).getByRole('option')).toBe(selected);
    expect(screen.queryByRole('option', { name: /Area mapping/ })).toBeNull();
    const search = screen.getByRole('combobox', { name: 'Search projects by name or code' });
    expect(search.getAttribute('aria-activedescendant')).toBe(selected.id);
  });

  it('expanding examples adds them after the main showcase and regular projects for keyboard navigation', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    render(<div className="app-shell"><ProjectDropdown {...pickerProps} onSelect={selected}/></div>);
    await user.click(screen.getByRole('button', { name: 'Project: Original S.I.T. contract' }));
    await user.click(screen.getByRole('button', { name: 'Demo examples 2' }));
    await user.click(screen.getByRole('combobox', { name: 'Search projects by name or code' }));
    await user.keyboard('{Home}{ArrowUp}{Enter}');
    expect(selected).toHaveBeenCalledExactlyOnceWith(mapping.id);
  });
});

describe('project manager catalog', () => {
  it('shows the main showcase and user projects, with examples collapsed and all actions intact', async () => {
    const user = userEvent.setup();
    const opened = vi.fn();
    const create = vi.fn();
    const original = structuredClone(projects);
    render(<div className="app-shell"><ProjectsView {...pickerProps} onOpen={opened} onCreate={create}/></div>);
    expect(within(screen.getByRole('region', { name: 'Main showcase' })).getByText('Original S.I.T. contract')).toBeTruthy();
    expect(screen.queryByText('Voice-note review (Demo)')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open showcase' }));
    expect(opened).toHaveBeenLastCalledWith(showcase.id, 'dashboard');
    await user.click(screen.getByRole('button', { name: 'Demo examples 2' }));
    expect(screen.getByText('Voice-note review (Demo)')).toBeTruthy();
    const voiceCard = screen.getByText('Voice-note review (Demo)').closest('article');
    await user.click(within(voiceCard).getByRole('button', { name: 'Open project' }));
    expect(opened).toHaveBeenLastCalledWith(voice.id, 'dashboard');
    await user.click(screen.getByRole('button', { name: 'New project' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(projects).toEqual(original);
  });

  it('finds a hidden example by search and returns to the collapsed group after clearing', async () => {
    const user = userEvent.setup();
    render(<div className="app-shell"><ProjectsView {...pickerProps}/></div>);
    await user.type(screen.getByRole('textbox', { name: 'Search projects' }), 'VOICE');
    expect(screen.getByText('Voice-note review (Demo)')).toBeTruthy();
    expect(screen.queryByText('Client project')).toBeNull();
    const examples = screen.getByRole('button', { name: 'Demo examples 1' });
    expect(examples.getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Clear project search' }));
    expect(screen.queryByText('Voice-note review (Demo)')).toBeNull();
    expect(screen.getByText('Client project')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Demo examples 2' }).getAttribute('aria-expanded')).toBe('false');
  });
});
