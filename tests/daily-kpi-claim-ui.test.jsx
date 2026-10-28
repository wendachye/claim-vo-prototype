import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimPackPreview } from '../src/components/ClaimPackPreview';
import { createProject } from '../src/data/projects.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { DEMO_MESSAGE_PHOTOS } from '../src/data/demo-message-intake.ts';

function fixture() {
  const project = createProject({ name: 'Fictional daily KPI claim', code: 'KPI-DEMO', country: 'Singapore' });
  const photo = DEMO_MESSAGE_PHOTOS[0];
  project.locked = true; project.lockedAt = '2026-10-01T09:00:00+08:00';
  project.contract = { ...project.contract, subcontractor: 'Example Scaffold Co.', mainContractor: 'Example Construction Co.' };
  project.items = [{ id: 'A', ref: 'A/01', description: 'Scaffold erection', unit: 'm²', quantity: 100,
    rate: 10, amount: 1000, pricingType: 'measured', verified: 50, reported: 50 }];
  const daily = { version: 1, projectId: project.id, projectCode: project.code, messageId: 'KPI-ORIGINAL',
    text: '26/10/26 (Monday)\nLocation: DP01\nTeam:-15\n3man\nErection:-\n14 x 4.5 x 4 T\nHrs:8:00 to 19:00hrs\nAfternoon no materials lower down due to crane breakdown.',
    sender: 'Demo worker', senderRole: 'Fictional site team', date: '2026-10-26T09:00:00+08:00', photo: photo.photo, photoAlt: photo.photoAlt };
  project.reports = [{ id: 'KPI-REPORT', projectId: project.id, projectCode: project.code, itemId: 'A', status: 'verified',
    sourceMessageId: 'KPI-ORIGINAL-CLARIFIED-001', sender: 'Demo worker', area: 'DP01',
    message: 'Clarified reply: scaffold erection at DP01 is 50% complete in total.',
    date: '2026-10-27T09:00:00+08:00', completion: 50, verifiedAt: '2026-10-27T10:00:00+08:00', verifiedBy: 'Demo supervisor',
    photo: photo.photo, photoAlt: photo.photoAlt, dailyKPIEvidence: daily }];
  const result = saveClaimDraft(project, '2026-10', { work: { A: { include: true, assessedQuantity: 7, previousValue: 0 } },
    priorConfirmed: true, note: 'QS assessed 7 m² separately. Daily dimensions and manpower are supporting context only.' });
  expect(result.outcome).toBe('updated');
  return { project: result.project, draft: result.draft, daily };
}

describe('daily KPI in saved claim evidence', () => {
  it('shows the frozen original and separate reply in preview and evidence panel without deriving claim quantities', async () => {
    const { project, draft, daily } = fixture();
    project.reports = []; project.whatsappMessages = []; project.messageClarifications = [];
    const before = structuredClone(project), user = userEvent.setup(), onDownloadCSV = vi.fn();
    const view = render(<ClaimPackPreview project={project} draftId={draft.id} onDownloadCSV={onDownloadCSV} onBack={vi.fn()} />);
    const original = screen.getByRole('region', { name: 'Original daily KPI update', exact: true });
    expect(original.querySelector('blockquote').textContent).toBe(daily.text);
    expect(within(original).getByText('3man', { exact: true })).toBeTruthy();
    expect(within(original).getByText('14 x 4.5 x 4 T', { exact: true })).toBeTruthy();
    expect(screen.getByText('Clarified worker reply', { exact: true })).toBeTruthy();
    expect(screen.getByText('Clarified reply: scaffold erection at DP01 is 50% complete in total.', { exact: true })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Progressive claim schedule' }).textContent).toContain('QS quantity to date: 7');
    expect(screen.getByRole('table', { name: 'Progressive claim schedule' }).textContent).toContain('70.00');
    expect(screen.getAllByRole('img', { name: daily.photoAlt, exact: true })).toHaveLength(1);
    if (process.env.CLAIM_QA_HTML) writeFileSync(process.env.CLAIM_QA_HTML, view.container.innerHTML);
    await user.click(screen.getByRole('button', { name: 'View evidence for A/01', exact: true }));
    const panel = within(screen.getByRole('dialog'));
    expect(panel.getByRole('region', { name: 'Original daily KPI update', exact: true }).querySelector('blockquote').textContent).toBe(daily.text);
    expect(panel.getByRole('heading', { name: 'Clarified worker reply', exact: true })).toBeTruthy();
    expect(panel.getAllByRole('img', { name: daily.photoAlt, exact: true })).toHaveLength(1);
    expect(project).toEqual(before);
    expect(onDownloadCSV).not.toHaveBeenCalled();
  });

  it('does not retrofit a legacy saved version from live daily sources', () => {
    const { project, draft } = fixture();
    delete project.claimDrafts[0].snapshot.workRows[0].evidence.dailyKPIEvidence;
    render(<ClaimPackPreview project={project} draftId={draft.id} onBack={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Original daily KPI update', exact: true })).toBeNull();
    expect(screen.queryByText('Daily KPI details', { exact: true })).toBeNull();
  });
});
