import { screen } from '@testing-library/react';

// Project examples are collapsed until expanded or searched. Exercise the same
// search available to a user so switching still targets the exact saved project.
export async function chooseProjectOption(user, project) {
  const search = screen.getByRole('combobox', { name: 'Search projects by name or code' });
  await user.clear(search);
  await user.type(search, project.code);
  const name = project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await user.click(screen.getByRole('option', { name: new RegExp(name) }));
}
