import { screen, within } from '@testing-library/react';

// Select through the visible searchable area picker, retaining stable IDs for
// deep links while keeping the app's project dropdown independent.
export async function chooseDrawingArea(user, trigger, areaId) {
  await user.click(trigger);
  const list = await screen.findByRole('listbox', { name: 'Site areas', exact: true });
  const option = within(list).getAllByRole('option').find(entry => entry.getAttribute('data-value') === String(areaId));
  if (!option) throw new Error(`No visible site area has ID ${JSON.stringify(areaId)}.`);
  await user.click(option);
}
