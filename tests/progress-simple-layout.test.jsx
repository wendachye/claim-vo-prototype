import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgressFilters, ProgressRegister } from '../src/components/ProgressRegister';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getItemProgressReview } from '../src/data/progress-review.ts';
import { chooseSelect } from './select-helpers.mjs';

const now = new Date('2026-10-22T10:00:00+08:00');
afterEach(cleanup);

describe('simple Progress layout', () => {
  it('uses visible filters, shows Clear all only for active filters and returns focus to search', async () => {
    const project = createSITContractDemo({ name: 'Progress layout test', code: 'PROGRESS-LAYOUT' }, now);
    const before = structuredClone(project);
    const user = userEvent.setup();
    function Filters() {
      const [search, setSearch] = useState('');
      const [block, setBlock] = useState('all');
      const [filter, setFilter] = useState('all');
      return <ProgressFilters project={project} items={project.items} search={search} block={block} filter={filter}
        blocks={['W3', 'W5']} onSearch={setSearch} onBlock={setBlock} onFilter={setFilter}
        onClear={() => { setSearch(''); setBlock('all'); setFilter('all'); }}
        onActivity={vi.fn()} onExtraWork={vi.fn()} extraWorkCount={0}/>;
    }
    render(<Filters/>);
    const filters = within(screen.getByRole('region', { name: 'Progress filters' }));
    const search = filters.getByRole('textbox', { name: 'Search completion list' });
    expect(filters.getByText('Search', { exact: true })).toBeTruthy();
    expect(filters.getByText('Location', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    await chooseSelect(user, filters.getByRole('combobox', { name: 'Block / location', exact: true }), 'W5');
    expect(screen.getByRole('button', { name: 'Clear all', exact: true })).toBeTruthy();
    await user.type(search, 'Scaffold');
    await user.click(screen.getByRole('button', { name: 'Clear all', exact: true }));
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear all', exact: true })).toBeNull();
    expect(filters.getByRole('combobox', { name: 'Block / location', exact: true }).textContent).toContain('All blocks');
    expect(project).toEqual(before);
  });

  it('keeps one compact status and the exact report action next to independent totals', async () => {
    const project = createSITContractDemo({ name: 'Progress layout test', code: 'PROGRESS-LAYOUT' }, now);
    const before = structuredClone(project);
    const item = project.items.find(entry => entry.id === 'WI-001');
    const review = getItemProgressReview(project, item);
    const onReview = vi.fn();
    render(<ProgressRegister project={project} items={[item]} onReview={onReview}/>);
    const action = screen.getByRole('button', { name: `${review.actionLabel} for ${item.id}`, exact: true });
    const cells = within(action.closest('tr')).getAllByRole('cell');
    expect(cells).toHaveLength(4);
    expect(cells[1].textContent).toContain('65%');
    expect(cells[2].textContent).toContain('50%');
    expect(within(cells[3]).getByText('Needs verification', { exact: true })).toBeTruthy();
    await userEvent.setup().click(action);
    expect(onReview).toHaveBeenCalledOnce();
    expect(onReview).toHaveBeenCalledWith(item, review.report);
    expect(project).toEqual(before);
  });
});
