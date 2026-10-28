import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WhatsAppView } from '../src/components/WhatsAppView';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getVOCases, getVOClaimEligibility } from '../src/data/vo.ts';
import { getWhatsAppMessages } from '../src/data/whatsapp.ts';

const now = new Date('2026-10-22T10:00:00+08:00');
const footer = () => within(document.querySelector('.wa-review-footer'));

function fixture(status = 'approved', decision = 'eligible') {
  const project = createSITContractDemo({ name: 'Site review action examples', code: 'REVIEW-ACTIONS' }, now);
  const approved = getVOCases(project).find(entry => entry.status === 'approved');
  expect(getVOClaimEligibility(approved).eligible).toBe(true);
  project.voReviews = project.voReviews.map(entry => entry.id === approved.id
    ? { ...entry, status, claimEligibility: decision } : entry);
  const target = getVOCases(project).find(entry => entry.id === approved.id);
  const messages = getWhatsAppMessages(project);
  const message = messages.find(entry => entry.id === target.report.sourceMessageId);
  expect(message).toBeTruthy();
  return { project, target, messages, message };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => vi.unstubAllGlobals());

describe('site review offers actions for the remaining work', () => {
  it('keeps claim eligibility review primary after price approval until QS checks are complete', async () => {
    const { project, target, messages, message } = fixture('approved', 'needsReview');
    const original = structuredClone(project);
    const onOpenVO = vi.fn();
    render(<WhatsAppView project={project} messages={messages} initialMessageId={message.id} onOpenVO={onOpenVO} />);
    const review = footer().getByRole('button', { name: 'Review claim eligibility', exact: true });
    expect(review.classList.contains('primary')).toBe(true);
    expect(footer().getByRole('button', { name: 'Next message', exact: true }).classList.contains('primary')).toBe(false);
    await userEvent.setup().click(review);
    expect(onOpenVO).toHaveBeenCalledWith(target.id, message.id);
    expect(project).toEqual(original);
  });

  it.each([
    ['approved', 'eligible'],
    ['approved', 'excluded'],
    ['rejected', 'needsReview'],
  ])('offers viewing rather than active review for %s / %s', async (status, decision) => {
    const { project, target, messages, message } = fixture(status, decision);
    const original = structuredClone(project);
    const onOpenVO = vi.fn();
    render(<WhatsAppView project={project} messages={messages} initialMessageId={message.id} onOpenVO={onOpenVO} />);
    expect(footer().queryByRole('button', { name: /Review claim eligibility|Review extra work/ })).toBeNull();
    expect(screen.queryByText(/Contract match needs QS review/)).toBeNull();
    const outcome = document.querySelector('.wa-result-vo');
    expect(within(outcome).getByText(status === 'rejected' ? /The QS has rejected this extra work/ : decision === 'excluded' ? /The QS has excluded this extra work/ : /The QS claim eligibility checks are complete/)).toBeTruthy();
    const view = footer().getByRole('button', { name: 'View extra work', exact: true });
    expect(view.classList.contains('primary')).toBe(false);
    expect(footer().getByRole('button', { name: 'Next message', exact: true }).classList.contains('primary')).toBe(true);
    await userEvent.setup().click(view);
    expect(onOpenVO).toHaveBeenCalledWith(target.id, message.id);
    expect(project).toEqual(original);
  });

  it('does not promote a finished extra-work case into a review task when the inbox is caught up', () => {
    const { project, message } = fixture();
    const original = structuredClone(project);
    render(<WhatsAppView project={project} messages={[message]} initialMessageId={message.id} />);
    expect(footer().queryByRole('button', { name: 'Next message', exact: true })).toBeNull();
    expect(footer().getByRole('button', { name: 'View extra work', exact: true }).classList.contains('primary')).toBe(false);
    expect(project).toEqual(original);
  });
});
