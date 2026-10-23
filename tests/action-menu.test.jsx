import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionMenu } from '../src/components/ActionMenu.jsx';
import { Modal } from '../src/components/ui.jsx';

describe('shared shadcn action dropdown', () => {
  it('supports keyboard selection, skips disabled actions and closes on selection', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    render(<div className="app-shell"><ActionMenu items={[
      {label:'Review contract',onSelect:()=>selected('review')},
      {label:'Unavailable action',disabled:true,onSelect:()=>selected('disabled')},
      {label:'View activity',onSelect:()=>selected('activity')},
    ]} /></div>);
    const trigger = screen.getByRole('button', {name:'More options'});
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    const menu = await screen.findByRole('menu', {name:'More options'});
    expect(menu.closest('.app-shell')).not.toBeNull();
    expect(within(menu).getByRole('menuitem', {name:'Unavailable action'}).getAttribute('data-disabled')).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitem', {name:'Review contract'})));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(selected).toHaveBeenCalledExactlyOnceWith('activity');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses with Escape and outside clicks without running an action', async () => {
    const user = userEvent.setup();
    const selected = vi.fn();
    render(<><ActionMenu items={[{label:'Review',onSelect:selected}]} /><button>Outside menu</button></>);
    const trigger = screen.getByRole('button', {name:'More options'});
    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.click(screen.getByRole('button', {name:'Outside menu'}));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(selected).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', {name:'Outside menu'}));
  });

  it('hands focus to a destination dialog and restores the persistent menu trigger', async () => {
    const user = userEvent.setup();
    function Review() {
      const [open,setOpen] = useState(false);
      return <div className="app-shell"><ActionMenu items={[{label:'Contract details',onSelect:()=>setOpen(true)}]} />{open && <Modal title="Contract details" onClose={()=>setOpen(false)}><p>Saved contract values</p></Modal>}</div>;
    }
    render(<Review />);
    const trigger = screen.getByRole('button', {name:'More options'});
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', {name:'Contract details'}));
    const dialog = await screen.findByRole('dialog', {name:'Contract details'});
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
