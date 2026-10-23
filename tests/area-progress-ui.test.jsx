import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgressRegister } from '../src/components/ProgressRegister';
import { ReportDrawer } from '../src/components/ReportDrawer';
import { WhatsAppView } from '../src/components/WhatsAppView';
import { getDrawingMapping, installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';

function fixture() {
  let project = { id: 'AREA-UI', code: 'AU01', name: 'Area workflow demo', locked: true, version: 1,
    contract: { currency: 'SGD', sourceKind: 'illustrative' }, sourceItems: [], baselines: [], claimDrafts: [], claimTracking: [], history: [], voReviews: [], seed: {},
    messageClarifications: [], whatsappMessages: [], reports: [],
    items: [{ id: 'WORK', ref: 'A.1', description: 'External scaffold', location: 'Block A', unit: 'm²', quantity: 1000,
      rate: 10, amount: 10000, pricingType: 'measured', reported: 80, verified: 30 }] };
  project = installDrawing(project, { inputKind: 'sample' }, '2026-10-18T10:00:00Z').project;
  for (const [index, quantity] of [600, 400].entries()) {
    const area = getDrawingMapping(project).areas[index];
    project = saveAreaMapping(project, { ...area, areaId: area.id, workItemIds: ['WORK'], workItemQuantities: { WORK: quantity } }, '2026-10-18T11:00:00Z').project;
  }
  return project;
}
const areas = project => getDrawingMapping(project).areas.slice(0, 2);
function source(project, index, completion) {
  const area = areas(project)[index];
  return { id: `MESSAGE-${index}`, projectId: project.id, projectCode: project.code, itemId: 'WORK', area: area.code, areaId: area.id,
    kind: 'progress', status: 'new', sender: 'Demo worker', date: `2026-10-21T${index + 10}:00:00Z`, completion, completionBasis: 'cumulative',
    text: `${area.code}: ${completion}% of its allocated scaffold installed.`, photo: `/area-${index}.png`, photoAlt: 'Generated demonstration photo' };
}
function processed(project, message) {
  const result = processWhatsAppMessage({ ...project, whatsappMessages: [...project.whatsappMessages, message] }, message.id);
  expect(result.outcome).toBe('processed'); return { project: result.project, report: result.project.reports.find(report => report.id === result.reportId) };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('area allocation progress stays understandable in the existing screens', () => {
  it('shows weighted totals with exact area review actions and scopes an area-filtered list', async () => {
    const user = userEvent.setup();
    let project = fixture();
    const linkedOnly = getDrawingMapping(project).areas[2];
    project = saveAreaMapping(project, { ...linkedOnly, areaId: linkedOnly.id, workItemIds: ['WORK'] }, '2026-10-18T12:00:00Z').project;
    const a = processed(project, source(project, 0, 50));
    const b = processed(a.project, source(a.project, 1, 25));
    project = verifyProgressReport(b.project, b.report.id, '25', '', '2026-10-21T14:00:00Z').project;
    const before = structuredClone(project), onReview = vi.fn();
    const view = render(<ProgressRegister project={project} items={project.items} onReview={onReview}/>);
    const main = screen.getByRole('button', { name: 'Review update for WORK', exact: true });
    const cells = within(main.closest('tr')).getAllByRole('cell');
    expect(cells[1].textContent).toContain('40%'); expect(cells[2].textContent).toContain('10%');
    expect(cells[0].textContent).toContain('1,000 of 1,000 m² allocated');
    await user.click(main); expect(onReview).toHaveBeenLastCalledWith(project.items[0], expect.objectContaining({ id: a.report.id }));
    await user.click(screen.getByText('Area breakdown · 2 areas', { exact: true }));
    await user.click(screen.getByRole('button', { name: 'View evidence for area A2 and WORK', exact: true }));
    expect(onReview).toHaveBeenLastCalledWith(project.items[0], expect.objectContaining({ id: b.report.id }));
    view.rerender(<ProgressRegister project={project} items={project.items} areaId={areas(project)[1].id} onReview={onReview}/>);
    const scoped = screen.getByRole('button', { name: 'View evidence for WORK', exact: true });
    const scopedCells = within(scoped.closest('tr')).getAllByRole('cell');
    expect(scopedCells[1].textContent).toContain('25%'); expect(scopedCells[2].textContent).toContain('25%');
    expect(scopedCells[0].textContent).toContain('Area A2 · 400 m² allocated');
    expect(screen.queryByText('Area breakdown · 2 areas', { exact: true })).toBeNull();
    view.rerender(<ProgressRegister project={project} items={project.items} areaId={linkedOnly.id} onReview={onReview}/>);
    expect(screen.getByText('Link only · quantity not set', { exact: true })).toBeTruthy();
    const linkOnlyCells = within(screen.getByRole('button', { name: 'View progress for WORK', exact: true }).closest('tr')).getAllByRole('cell');
    expect(linkOnlyCells[1].textContent).toContain('Not recorded'); expect(linkOnlyCells[2].textContent).toContain('Not recorded');
    expect(project).toEqual(before);
  });

  it('reviews the area percentage rather than treating a low area percentage as a reduction of the whole item', async () => {
    const user = userEvent.setup();
    let project = fixture();
    const a = processed(project, source(project, 0, 50));
    project = verifyProgressReport(a.project, a.report.id, '50', '', '2026-10-21T11:00:00Z').project;
    const b = processed(project, source(project, 1, 25)); project = b.project;
    const before = structuredClone(project), onApprove = vi.fn();
    render(<ReportDrawer project={project} projectCode={project.code} item={project.items[0]} report={b.report} locked onApprove={onApprove} onClose={vi.fn()}/>);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Area quantity: 400 m² of 1,000 m²');
    expect(dialog.textContent).toContain('Whole item: reported 40% · verified 30%');
    expect(within(dialog).getByText('Area reported total', { exact: true }).parentElement.textContent).toContain('25%');
    expect(within(dialog).getByText('Area verified total', { exact: true }).parentElement.textContent).toContain('Not recorded');
    await user.click(within(dialog).getByRole('button', { name: 'Verify progress', exact: true }));
    expect(onApprove).toHaveBeenCalledWith(b.report, '25', '');
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe('/area-1.png');
    expect(dialog.textContent).toContain(b.report.message);
    expect(project).toEqual(before);
  });

  it('keeps an older whole-item report read-only after quantities are split', async () => {
    const project = fixture();
    const report = { id: 'OLD', itemId: 'WORK', status: 'pending', completion: 80, completionBasis: 'cumulative',
      message: 'Original whole-item evidence.', photo: '/original.png', date: '2026-10-19T10:00:00Z' };
    const onApprove = vi.fn();
    render(<ReportDrawer project={project} item={project.items[0]} report={report} locked onApprove={onApprove} onClose={vi.fn()}/>);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Whole-item update retained in history. Add an area update');
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Verify progress', exact: true }).disabled).toBe(true);
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe(report.photo);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('previews and saves area completion without displaying it as whole-item completion', async () => {
    const project = fixture(), original = source(project, 0, 50), onProcess = vi.fn();
    project.whatsappMessages = [original];
    const before = structuredClone(project);
    const view = render(<WhatsAppView project={project} messages={project.whatsappMessages} initialMessageId={original.id} onProcess={onProcess}/>);
    const panel = document.querySelector('.wa-review');
    expect(within(panel).getByText('Area reported total', { exact: true }).parentElement.textContent).toContain('Not recorded50%');
    expect(panel.textContent).toContain('600 m² allocated to this area of 1,000 m²');
    expect(panel.textContent).toContain('Whole-item weighted totals: reported Not recorded · verified Not recorded');
    await userEvent.setup().click(within(panel).getByRole('button', { name: 'Add progress update', exact: true }));
    expect(onProcess).toHaveBeenCalledWith(original); expect(project).toEqual(before);
    const saved = processWhatsAppMessage(project, original.id).project;
    view.rerender(<WhatsAppView project={saved} messages={saved.whatsappMessages} initialMessageId={original.id} onProcess={onProcess}/>);
    expect(within(panel).getByText('Area reported total', { exact: true }).parentElement.textContent).toContain('50%');
    expect(panel.textContent).toContain('Whole-item weighted totals: reported 30% · verified Not recorded');
    expect(panel.textContent).toContain(original.text);
    expect(within(panel).getByRole('img').getAttribute('src')).toBe(original.photo);
    expect(saved.reports[0].message).toBe(original.text);
  });

  it('shows a saved whole-item message as historical evidence instead of remapping its percentage', () => {
    const project = fixture(), original = { ...source(project, 0, 80), status: 'processed' };
    const report = { id: 'OLD', sourceMessageId: original.id, itemId: 'WORK', status: 'pending', completion: 80, completionBasis: 'cumulative',
      message: original.text, photo: original.photo, date: original.date };
    project.whatsappMessages = [original]; project.reports = [report];
    render(<WhatsAppView project={project} messages={project.whatsappMessages} initialMessageId={original.id} onReview={vi.fn()}/>);
    const panel = document.querySelector('.wa-review');
    expect(panel.textContent).toContain('Historical whole-item update retained. Its percentage is not assigned to the new areas.');
    expect(within(panel).queryByText('Area reported total', { exact: true })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Review progress', exact: true })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'View progress', exact: true })).toBeTruthy();
  });
});
