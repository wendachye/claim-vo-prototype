import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimPackPreview } from '../src/components/ClaimPackPreview';
import { MonthlyClaimView } from '../src/components/MonthlyClaimView';
import { createAreaSplitDemo } from '../src/data/area-split-demo.ts';
import { seedWorkspace } from '../src/data/projects.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

const now = new Date('2026-10-24T10:00:00+08:00');
const ids = new Set();
function fixture() {
  let project = createAreaSplitDemo(seedWorkspace(), now).project;
  ids.add(project.id);
  for (const message of project.whatsappMessages) {
    const processed = processWhatsAppMessage(project, message.id);
    expect(processed.outcome).toBe('processed');
    const report = processed.project.reports.find(report => report.sourceMessageId === message.id);
    const verified = verifyProgressReport(processed.project, report.id, message.completion, 'Mock supervisor checked this area.', new Date(now.getTime() + 60_000));
    expect(verified.outcome).toBe('updated');
    project = verified.project;
  }
  expect(project.items[0].verified).toBe(40);
  return project;
}
const openEvidence = async user => user.click(screen.getByRole('button', { name: 'View evidence for A / 01', exact: true }));
const panel = () => within(screen.getByRole('dialog'));
afterEach(() => { cleanup(); for (const id of ids) clearProjectFormBuffers(id); ids.clear(); vi.restoreAllMocks(); });

describe('claim evidence retains each area separately', () => {
  it('switches frozen original area reports in a saved claim and keeps one financial row', async () => {
    const original = fixture();
    const saved = saveClaimDraft(original, '2026-10', { work: { 'WI-001': { include: true, assessedQuantity: 480, previousValue: 0 } }, priorConfirmed: true });
    expect(saved.outcome).toBe('updated');
    const frozen = structuredClone(saved.draft);
    const project = saved.project;
    project.reports = [];
    project.items[0].verified = 99;
    const pack = buildClaimPack(project, saved.draft.id).pack;
    expect(pack.workRows).toHaveLength(1);
    expect(pack.evidenceRefs).toHaveLength(2);
    const [west, east] = frozen.snapshot.workRows.find(row => row.id === 'WI-001').areaEvidence;
    const user = userEvent.setup();
    render(<ClaimPackPreview project={project} draftId={saved.draft.id} onBack={() => {}} />);
    expect(screen.getByText('Quantity-weighted across areas')).toBeTruthy();
    expect(screen.getByText('720 of 1,200 m² in the contract')).toBeTruthy();
    expect(screen.getByText('480 of 1,200 m² in the contract')).toBeTruthy();
    await openEvidence(user);
    expect(panel().getByText(west.message, { exact: true, normalizer: value => value })).toBeTruthy();
    expect(panel().getByRole('img').getAttribute('src')).toBe(west.photo);
    expect(panel().getByText('Verified area completion').nextElementSibling.textContent).toBe('50%');
    expect(panel().getByText('Weighted contract item total').nextElementSibling.textContent).toBe('40%');
    await chooseSelect(user, panel().getByRole('combobox', { name: 'Area evidence', exact: true }), east.id);
    expect(panel().getByText(east.message, { exact: true, normalizer: value => value })).toBeTruthy();
    expect(panel().queryByText(west.message, { exact: true, normalizer: value => value })).toBeNull();
    expect(panel().getByRole('img').getAttribute('src')).toBe(east.photo);
    expect(panel().getByText('Verified area completion').nextElementSibling.textContent).toBe('25%');
    expect(panel().getByText('Reviewer').nextElementSibling.textContent).toBe(east.verifiedBy);
    expect(panel().getByText('Weighted contract item total').nextElementSibling.textContent).toBe('40%');
    await user.click(panel().getByRole('button', { name: 'Done', exact: true }));
    expect(project.claimDrafts[0]).toEqual(frozen);
  });

  it('preserves unfinished claim quantities and prior values when switching areas and dismissing evidence', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const project = fixture();
    const before = structuredClone(project);
    writeFormBuffer(project.id, 'claims:period', '2026-10');
    writeFormBuffer(project.id, 'claims:forms', { '2026-10': { work: { 'WI-001': { include: true, assessedQuantity: '125.5', previousValue: '200' } }, vos: {}, priorConfirmed: false, adjustmentReason: '', note: 'Unfinished measurement note.' } });
    writeFormBuffer(project.id, 'claims:dirty', { '2026-10': true });
    writeFormBuffer(project.id, 'claims:step', 2);
    const buffer = readFormBuffer(project.id, 'claims:forms');
    const user = userEvent.setup();
    const save = vi.fn();
    render(<MonthlyClaimView project={project} onSave={save} />);
    expect(screen.getByText('QS assessed quantity to date')).toBeTruthy();
    expect(screen.getByText(/Whole-item verified total: 40%/)).toBeTruthy();
    await openEvidence(user);
    const east = project.reports.find(report => report.area === 'EAST');
    await chooseSelect(user, panel().getByRole('combobox', { name: 'Area evidence', exact: true }), east.id);
    expect(panel().getByText(east.message, { exact: true, normalizer: value => value })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('spinbutton', { name: 'WI-001 QS cumulative quantity', exact: true }).value).toBe('125.5');
    expect(screen.getByRole('spinbutton', { name: 'WI-001 previously claimed value', exact: true }).value).toBe('200');
    expect(readFormBuffer(project.id, 'claims:forms')).toEqual(buffer);
    expect(save).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  });
});
