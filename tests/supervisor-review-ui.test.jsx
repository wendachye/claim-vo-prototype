import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupervisorReview } from '../src/components/SupervisorReview';
import { getSupervisorReview } from '../src/data/supervisor-review';
import { clearProjectFormBuffers } from '../src/data/form-buffer';

vi.mock('../src/data/supervisor-review', () => ({ getSupervisorReview: vi.fn() }));
const ids = new Set();
function fixture(id = 'SUPERVISOR-UI') {
  const item = { id: 'ITEM-1', ref: 'A.1', description: 'External safety scaffold', location: 'Block W3', unit: 'm²', quantity: 1000, rate: 13.5, amount: 13500, reported: 65, verified: 50, pricingType: 'measured' };
  const report = { id: 'REPORT-1', projectId: id, projectCode: id, itemId: item.id, status: 'pending', completion: 65,
    completionBasis: 'cumulative', sender: 'Demo foreman', date: '2026-10-24T10:00:00+08:00', message: 'Block W3 access scaffold is 65% done in total.', photo: '/assets/demo-site.jpg', photoAlt: 'Demo scaffold work',
    areaMapping: { areaId: 'WEST', code: 'W3', name: 'West scaffold' }, areaProgress: { areaId: 'WEST', itemId: item.id, allocatedQuantity: 600, contractQuantity: 1000 } };
  const project = { id, code: id, name: 'Mobile supervisor mock', items: [item], reports: [report], claimDrafts: [{ id: 'SAVED', amount: 9000 }] };
  ids.add(id);
  return { project, item, report };
}
function mount(project, values = {}) {
  const props = { project, reportId: project.reports[0].id, routeProjectId: project.id, onBack: vi.fn(), onDecision: vi.fn(() => ({ outcome: 'updated' })), ...values };
  return { ...render(<SupervisorReview {...props} />), props };
}

beforeEach(() => {
  getSupervisorReview.mockImplementation((project, routeProjectId, reportId) => {
    if (routeProjectId !== project.id || project.reports.filter(report => report.id === reportId).length !== 1) return { canReview: false, state: 'unavailable', report: null, item: null, error: 'This report is not available in the selected project.' };
    const report = project.reports.find(report => report.id === reportId), item = project.items.find(item => item.id === report.itemId);
    return { report, item, canReview: report.status === 'pending', state: report.status === 'needsClarification' ? 'clarification' : report.status === 'pending' ? 'pending' : 'reviewed',
      reportedCompletion: report.completion, verifiedCompletion: item.verified, error: report.status === 'needsClarification' ? 'A clearer update is needed before verification.' : undefined };
  });
});
afterEach(() => { cleanup(); ids.forEach(clearProjectFormBuffers); ids.clear(); vi.clearAllMocks(); });

describe('mobile supervisor observation review', () => {
  it('shows exactly one source and physical scope, then explicitly confirms without financial controls', async () => {
    const { project, report } = fixture(), before = structuredClone(project), user = userEvent.setup();
    const { props } = mount(project);
    expect(screen.getByRole('heading', { name: 'Supervisor review' })).toBeTruthy();
    expect(screen.getByText('Browser-local demo')).toBeTruthy();
    expect(screen.getByText('Area W3 · West scaffold')).toBeTruthy();
    expect(screen.getByText('600 m² allocated to this area')).toBeTruthy();
    expect(screen.getByText(report.message)).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('src')).toBe(report.photo);
    expect(screen.getByText('Demonstration photo · review alongside the message')).toBeTruthy();
    expect(screen.getByText('Reported in this update').nextElementSibling.textContent).toBe('65%');
    expect(screen.getByText('Current verified').nextElementSibling.textContent).toBe('50%');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/13,500|13\.5|9,000|SGD/)).toBeNull();
    expect(props.onDecision).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm', exact: true }));
    expect(props.onDecision).toHaveBeenCalledExactlyOnceWith('confirm', {});
    expect(screen.getByRole('status').textContent).toContain('Confirmed · 65% verified');
    expect(screen.queryByRole('button', { name: 'Confirm', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Return to Site progress', exact: true }));
    expect(props.onBack).toHaveBeenCalledOnce();
    expect(project).toEqual(before);
  });

  it('requires a valid corrected total and reason, including an explicit zero, before saving', async () => {
    const { project } = fixture(), user = userEvent.setup(), { props } = mount(project);
    await user.click(screen.getByRole('button', { name: 'Correct', exact: true }));
    const percentage = screen.getByRole('spinbutton', { name: /^Correct cumulative completion/ });
    const reason = screen.getByRole('textbox', { name: /^Correction reason/ });
    await user.clear(percentage);
    await user.type(percentage, '101');
    await user.click(screen.getByRole('button', { name: 'Save correction', exact: true }));
    expect(document.activeElement).toBe(percentage);
    expect(screen.getByText('Enter a cumulative percentage from 0 to 100.')).toBeTruthy();
    expect(props.onDecision).not.toHaveBeenCalled();
    await user.clear(percentage);
    await user.type(percentage, '0');
    await user.click(screen.getByRole('button', { name: 'Save correction', exact: true }));
    expect(document.activeElement).toBe(reason);
    expect(screen.getByText('Add a reason for this correction.')).toBeTruthy();
    await user.type(reason, ' Checked on site: this area has not started. ');
    await user.click(screen.getByRole('button', { name: 'Save correction', exact: true }));
    expect(props.onDecision).toHaveBeenCalledExactlyOnceWith('correct', { completion: '0', reason: 'Checked on site: this area has not started.' });
    expect(screen.getByRole('status').textContent).toContain('Corrected · 0% verified');
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('requires what needs checking and states clarification keeps verified progress unchanged without sending', async () => {
    const { project } = fixture(), user = userEvent.setup(), { props } = mount(project);
    await user.click(screen.getByRole('button', { name: 'Can’t verify', exact: true }));
    expect(screen.getByText('Verified progress stays unchanged. This adds a clarification task; no message is sent.')).toBeTruthy();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Request clearer update', exact: true }));
    const reason = screen.getByRole('textbox', { name: /^What needs checking/ });
    expect(document.activeElement).toBe(reason);
    expect(props.onDecision).not.toHaveBeenCalled();
    await user.type(reason, 'Please show the full west scaffold and confirm its cumulative total.');
    await user.click(screen.getByRole('button', { name: 'Request clearer update', exact: true }));
    expect(props.onDecision).toHaveBeenCalledExactlyOnceWith('cant-verify', { reason: reason.value });
    expect(screen.getByRole('status').textContent).toContain('Can’t verify · clarification needed');
    expect(screen.getByRole('status').textContent).toContain('Verified progress is unchanged.');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('directs a reported reduction through Correct so its reason cannot be skipped', async () => {
    const { project } = fixture();
    project.items[0].verified = 80;
    const user = userEvent.setup(), { props } = mount(project);
    expect(screen.getByText('Reported total is below verified. Choose Correct and explain the change.')).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Confirm', exact: true });
    expect(confirm.disabled).toBe(true);
    await user.click(confirm);
    expect(props.onDecision).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Correct', exact: true }));
    expect(screen.getByRole('spinbutton', { name: /^Correct cumulative completion/ }).value).toBe('65');
    await user.type(screen.getByRole('textbox', { name: /^Correction reason/ }), 'Earlier verification included another bay.');
    await user.click(screen.getByRole('button', { name: 'Save correction', exact: true }));
    expect(props.onDecision).toHaveBeenCalledExactlyOnceWith('correct', { completion: '65', reason: 'Earlier verification included another bay.' });
  });

  it('retains unfinished corrections across choices and navigation, isolated from another project', async () => {
    const first = fixture('FIRST'), second = fixture('SECOND'), user = userEvent.setup(), { props, unmount } = mount(first.project);
    await user.click(screen.getByRole('button', { name: 'Correct', exact: true }));
    const percentage = screen.getByRole('spinbutton', { name: /^Correct cumulative completion/ });
    await user.clear(percentage); await user.type(percentage, '40');
    await user.type(screen.getByRole('textbox', { name: /^Correction reason/ }), 'Unfinished field check');
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Can’t verify', exact: true }));
    await user.type(screen.getByRole('textbox', { name: /^What needs checking/ }), 'Need another photo');
    unmount();
    const another = mount(second.project);
    expect(screen.queryByRole('textbox')).toBeNull();
    another.unmount();
    mount(first.project);
    expect(screen.getByRole('textbox', { name: /^What needs checking/ }).value).toBe('Need another photo');
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Correct', exact: true }));
    expect(screen.getByRole('spinbutton', { name: /^Correct cumulative completion/ }).value).toBe('40');
    expect(screen.getByRole('textbox', { name: /^Correction reason/ }).value).toBe('Unfinished field check');
    expect(props.onDecision).not.toHaveBeenCalled();
  });

  it('keeps reviewed or clarification evidence read-only and hides foreign or missing reports', () => {
    const { project, report } = fixture();
    for (const status of ['verified', 'needsClarification', 'superseded']) {
      const changed = { ...project, reports: [{ ...report, status, reviewReason: 'Recorded review note' }] };
      const view = mount(changed);
      expect(screen.getByText(report.message)).toBeTruthy();
      expect(screen.getByText('Recorded review note')).toBeTruthy();
      for (const name of ['Confirm', 'Correct', 'Can’t verify']) expect(screen.queryByRole('button', { name, exact: true })).toBeNull();
      view.unmount();
    }
    for (const values of [{ routeProjectId: 'OTHER' }, { reportId: 'MISSING' }, { routeProjectId: null }]) {
      const view = mount(project, values);
      expect(screen.getByRole('region', { name: 'Review unavailable' })).toBeTruthy();
      expect(screen.queryByText(report.message)).toBeNull();
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.queryByText(project.items[0].description)).toBeNull();
      view.unmount();
    }
  });

  it('handles absent or broken photo honestly without losing the message', () => {
    const { project, report } = fixture();
    const view = mount({ ...project, reports: [{ ...report, photo: null }] });
    expect(screen.getByText('No site photo attached')).toBeTruthy();
    expect(screen.getByText(report.message)).toBeTruthy();
    view.unmount();
    mount(project);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Site photo could not be displayed')).toBeTruthy();
    expect(screen.getByText(report.message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Can’t verify', exact: true })).toBeTruthy();
  });

  it('retains form values and focuses a stale save error, then clears the buffer only after success', async () => {
    const { project } = fixture(), user = userEvent.setup();
    const onDecision = vi.fn().mockReturnValueOnce({ outcome: 'invalid', error: 'This report has changed. Review it again.' }).mockReturnValue({ outcome: 'updated' });
    const { unmount } = mount(project, { onDecision });
    await user.click(screen.getByRole('button', { name: 'Correct', exact: true }));
    await user.type(screen.getByRole('textbox', { name: /^Correction reason/ }), 'Checked on site');
    await user.click(screen.getByRole('button', { name: 'Save correction', exact: true }));
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(screen.getByRole('textbox', { name: /^Correction reason/ }).value).toBe('Checked on site');
    await user.click(screen.getByRole('button', { name: 'Save correction', exact: true }));
    expect(screen.getByRole('status').textContent).toContain('Corrected · 65% verified');
    unmount();
    mount(project);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm', exact: true })).toBeTruthy();
  });
});
