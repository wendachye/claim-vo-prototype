import { screen } from '@testing-library/react';

// Exercise the visible shadcn Select trigger and popup instead of changing a
// hidden native form field. Values remain explicit so IDs and empty options
// are checked independently from their display labels.
export const selectValue = (trigger) => trigger.getAttribute('data-value');

export async function selectOptions(user, trigger) {
  await user.click(trigger);
  return screen.findAllByRole('option');
}

export async function chooseSelect(user, trigger, value) {
  const options = await selectOptions(user, trigger);
  const option = options.find((entry) => entry.getAttribute('data-value') === String(value));
  if (!option) throw new Error(`No visible Select option has value ${JSON.stringify(value)}.`);
  await user.click(option);
}
