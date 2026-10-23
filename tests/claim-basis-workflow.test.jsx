import { chooseSelect } from './select-helpers.mjs';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthlyClaimView } from '../src/components/MonthlyClaimView.jsx';
import { ClaimStatusTracker } from '../src/components/ClaimStatusTracker.jsx';
import { createProject } from '../src/data/projects.js';
import { defaultClaimBasis } from '../src/data/claim-basis.js';
import { markClaimPrepared, saveClaimDraft } from '../src/data/claims.js';
import { recordClaimStage } from '../src/data/claim-tracking.js';
import { clearProjectFormBuffers, readFormBuffer, writeFormBuffer } from '../src/data/form-buffer.js';

const projectIds = new Set();
const quantity = () => screen.getByRole('spinbutton', { name: 'A QS cumulative quantity' });
const priorGross = () => screen.getByRole('spinbutton', { name: 'A previously claimed value' });
const priorNet = () => screen.getByRole('spinbutton', { name: 'Previously submitted net' });
const reference = () => screen.getByRole('textbox', { name: 'Previous claim reference' });
const priorCheck = () => screen.getByRole('checkbox', { name: /Confirm previous claims/ });
const checked = element => element.getAttribute('aria-checked') === 'true' || element.checked === true;
const basisDetails = () => screen.getByText('Claim basis', { exact: true }).closest('details');
const openBasis = async user => { if (!basisDetails().open) await user.click(within(basisDetails()).getByText('Claim basis', { exact: true })); };
const goReview = user => user.click(screen.getByRole('button', { name: 'Review claim', exact: true }));

function fixture(code = 'BASIS-WORKFLOW') {
  const project = createProject({ name: `S.I.T.-like basis ${code}`, code, country: 'Singapore' });
  projectIds.add(project.id);
  Object.assign(project, {
    locked: true, lockedAt: '2026-09-01T12:00:00+08:00',
    items: [{ id: 'A', ref: 'A/01', description: 'External façade scaffold', unit: 'm²', quantity: 2088,
      rate: 13.5, amount: 28188, pricingType: 'measured', verified: 75, reported: 75, needsReview: false }],
    reports: [{ id: 'R-A', projectId: project.id, itemId: 'A', status: 'verified', completion: 75,
      date: '2026-10-15T09:00:00+08:00', verifiedAt: '2026-10-16T12:00:00+08:00',
      message: 'Original mock façade scaffold evidence.', photo: '/assets/mock-scaffold.jpg', photoAlt: 'Mock façade scaffold evidence' }],
    voReviews: [], claimDrafts: [], claimTracking: [],
  });
  writeFormBuffer(project.id, 'claims:period', '2026-10');
  return project;
}

const assessment = (overrides = {}) => ({
  work: { A: { include: true, assessedQuantity: '1044', previousValue: '0' } }, vos: {},
  priorConfirmed: true, adjustmentReason: '', note: '',
  claimBasis: { ...defaultClaimBasis(), retentionMode: 'rateCap', retentionRate: '5', retentionCap: '1000', previousNetValue: '0' },
  ...overrides,
});

function seedEditing(project, forms, period = '2026-10', step = 2) {
  writeFormBuffer(project.id, 'claims:period', period);
  writeFormBuffer(project.id, 'claims:forms', forms);
  writeFormBuffer(project.id, 'claims:dirty', Object.fromEntries(Object.keys(forms).map(month => [month, true])));
  writeFormBuffer(project.id, 'claims:step', step);
}

function Journey({ initial, initialDraftId, onChange = () => {}, onResult = () => {} }) {
  const [project, setProject] = useState(initial);
  const [trackingId, setTrackingId] = useState(null);
  const update = result => {
    onResult(result);
    if (result.outcome === 'updated') { setProject(result.project); onChange(result.project); }
    return result;
  };
  if (trackingId) return <ClaimStatusTracker project={project} draftId={trackingId} onBack={() => setTrackingId(null)}
    onRecord={(id, action, fields) => update(recordClaimStage(project, id, action, fields))} />;
  return <MonthlyClaimView project={project} initialDraftId={initialDraftId}
    onSave={(period, values) => update(saveClaimDraft(project, period, values))}
    onPrepare={id => update(markClaimPrepared(project, id))} onTrack={setTrackingId} />;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-23T10:00:00+08:00'));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  for (const id of projectIds) clearProjectFormBuffers(id);
  projectIds.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('monthly claim basis workflow', () => {
  it('opts a legacy gross draft into a new net revision and prepares and submits that same revision', async () => {
    const user = userEvent.setup();
    const source = fixture();
    const legacy = saveClaimDraft(source, '2026-10', {
      work: { A: { include: true, assessedQuantity: 1044, previousValue: 0 } }, priorConfirmed: true,
    });
    const project = legacy.project;
    const original = structuredClone(project);
    const changes = []; const results = [];
    expect(legacy.draft.snapshot.totals.currentValue).toBe(14094);
    expect(legacy.draft.assessment).not.toHaveProperty('claimBasis');
    render(<Journey initial={project} initialDraftId={legacy.draft.id} onChange={next => changes.push(next)} onResult={result => results.push(result)} />);

    expect(basisDetails().open).toBe(false);
    await openBasis(user);
    expect(screen.getByText('Legacy gross-only assessment')).toBeTruthy();
    expect(readFormBuffer(project.id, 'claims:forms')['2026-10']).not.toHaveProperty('claimBasis');
    expect(changes).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Set claim basis', exact: true }));
    expect(checked(priorCheck())).toBe(false);
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Retention', exact: true }), 'rateCap');
    await user.type(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }), '5');
    await user.type(screen.getByRole('spinbutton', { name: 'Retention cap', exact: true }), '1000');
    await user.type(priorNet(), '0');
    await user.click(priorCheck());
    await goReview(user);
    expect(screen.getByText('This month · net').parentElement.textContent).toContain('SGD 13,389.30');
    expect(screen.getByText('Less retention held to date').parentElement.textContent).toContain('SGD 704.70');
    expect(changes).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Save claim draft', exact: true }));
    const saved = results.at(-1).draft;
    expect(saved.revision).toBe(2);
    expect(saved.snapshot.canPrepare).toBe(true);
    expect(saved.snapshot.totals.currentValue).toBe(13389.3);
    expect(changes.at(-1).claimDrafts.find(draft => draft.id === legacy.draft.id)).toEqual(legacy.draft);
    await user.click(screen.getByRole('button', { name: 'Mark prepared', exact: true }));
    expect(changes.at(-1).claimDrafts).toHaveLength(2);
    expect(changes.at(-1).claimDrafts.find(draft => draft.id === saved.id)).toEqual({ ...saved, status: 'prepared', preparedAt: expect.any(String) });
    await user.click(screen.getByRole('button', { name: 'Track claim status', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Use demo details', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Record submission', exact: true }));
    expect(screen.getByRole('heading', { name: 'Record certification' })).toBeTruthy();
    expect(changes.at(-1).claimTracking[0]).toMatchObject({ draftId: saved.id, claimedValue: 13389.3 });
    expect(changes.at(-1).claimDrafts.find(draft => draft.id === legacy.draft.id)).toEqual(legacy.draft);
    expect(project).toEqual(original);
  });

  it('requires manual prior gross and submitted net for the next month and applies the cumulative cap', async () => {
    const user = userEvent.setup();
    const october = saveClaimDraft(fixture('BASIS-NEXT'), '2026-10', assessment());
    const prepared = markClaimPrepared(october.project, october.draft.id);
    const project = prepared.project;
    const original = structuredClone(project);
    seedEditing(project, { '2026-11': assessment({
      work: { A: { include: true, assessedQuantity: '1566', previousValue: '' } }, priorConfirmed: false,
      claimBasis: { ...defaultClaimBasis(), retentionMode: 'rateCap', retentionRate: '5', retentionCap: '1000', previousNetValue: '' },
    }) }, '2026-11');
    const results = [];
    render(<Journey initial={project} onResult={result => results.push(result)} />);
    await openBasis(user);
    expect(priorGross().value).toBe('');
    expect(priorNet().value).toBe('');
    expect(reference().value).toBe('');
    expect(basisDetails().querySelector('summary').textContent).toContain('Prior net —');
    expect(checked(priorCheck())).toBe(false);
    await user.type(priorGross(), '14094');
    await user.type(priorNet(), '13389.3');
    await user.type(reference(), 'DEMO-SUB001');
    await user.click(priorCheck());
    await goReview(user);
    expect(screen.getByText('Less retention held to date').parentElement.textContent).toContain('SGD 1,000.00');
    expect(screen.getByText('Less previously submitted (net)').parentElement.textContent).toContain('SGD 13,389.30');
    expect(screen.getByText('This month · net').parentElement.textContent).toContain('SGD 6,751.70');
    await user.click(screen.getByRole('button', { name: 'Save claim draft', exact: true }));
    expect(results.at(-1).draft.snapshot).toMatchObject({
      period: '2026-11', canPrepare: true,
      claimBasis: { priorReference: 'DEMO-SUB001', previousNetValue: 13389.3 },
      totals: { cumulativeValue: 21141, previousValue: 14094, retentionValue: 1000, netCumulativeValue: 20141, currentValue: 6751.7 },
    });
    expect(project).toEqual(original);
  });

  it('clears prior confirmation on edits and preserves typed settings through evidence, collapse and remount', async () => {
    const user = userEvent.setup();
    const project = fixture('BASIS-BUFFER');
    seedEditing(project, { '2026-10': assessment({
      work: { A: { include: true, assessedQuantity: '1566', previousValue: '14094' } },
      claimBasis: { ...defaultClaimBasis(), retentionMode: 'rateCap', retentionRate: '5', retentionCap: '1000', previousNetValue: '13389.3', priorReference: 'DEMO-SUB001' },
    }) });
    const original = structuredClone(project); const save = vi.fn();
    let view = render(<MonthlyClaimView project={project} onSave={save} />);
    expect(checked(priorCheck())).toBe(true);
    await openBasis(user);
    await user.clear(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }));
    await user.type(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }), '5.25');
    expect(checked(priorCheck())).toBe(false);
    await user.click(priorCheck());
    await user.clear(priorGross()); await user.type(priorGross(), '14093.5');
    expect(checked(priorCheck())).toBe(false);
    const buffered = readFormBuffer(project.id, 'claims:forms');
    expect(buffered['2026-10'].claimBasis).toMatchObject({ retentionRate: '5.25', retentionCap: '1000', previousNetValue: '13389.3', priorReference: 'DEMO-SUB001' });
    await user.click(screen.getByText('Claim basis', { exact: true }));
    await user.click(screen.getByRole('button', { name: 'View evidence for A/01', exact: true }));
    expect(within(screen.getByRole('dialog')).getByText('Original mock façade scaffold evidence.')).toBeTruthy();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done', exact: true }));
    expect(readFormBuffer(project.id, 'claims:forms')).toEqual(buffered);
    view.unmount();
    view = render(<MonthlyClaimView project={project} onSave={save} />);
    await openBasis(user);
    expect(quantity().value).toBe('1566'); expect(priorGross().value).toBe('14093.5');
    expect(priorNet().value).toBe('13389.3'); expect(reference().value).toBe('DEMO-SUB001');
    expect(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }).value).toBe('5.25');
    expect(checked(priorCheck())).toBe(false);
    expect(save).not.toHaveBeenCalled(); expect(project).toEqual(original);
  });

  it('keeps unfinished claim basis values independent by project and month', async () => {
    const user = userEvent.setup();
    const project = fixture('BASIS-ONE'); const other = fixture('BASIS-TWO');
    seedEditing(project, {
      '2026-10': assessment({ claimBasis: { ...defaultClaimBasis(), previousNetValue: '12.34', priorReference: 'FIRST-OCT' } }),
      '2026-11': assessment({ work: { A: { include: true, assessedQuantity: '1566', previousValue: '14094' } }, claimBasis: { ...defaultClaimBasis(), previousNetValue: '13389.3', priorReference: 'FIRST-NOV' } }),
    });
    seedEditing(other, { '2026-10': assessment({ claimBasis: { ...defaultClaimBasis(), previousNetValue: '7.25', priorReference: 'OTHER-OCT' } }) });
    const original = structuredClone(project); const originalOther = structuredClone(other);
    const save = vi.fn(); const view = render(<MonthlyClaimView project={project} onSave={save} />);
    await openBasis(user); await user.type(reference(), '-EDIT');
    const firstBuffer = readFormBuffer(project.id, 'claims:forms');
    await user.click(screen.getByRole('button', { name: 'View evidence for A/01', exact: true }));
    view.rerender(<MonthlyClaimView project={other} onSave={save} />);
    expect(screen.queryByRole('dialog')).toBeNull(); await openBasis(user);
    expect(priorNet().value).toBe('7.25'); expect(reference().value).toBe('OTHER-OCT');
    view.rerender(<MonthlyClaimView project={project} onSave={save} />);
    await openBasis(user);
    expect(priorNet().value).toBe('12.34'); expect(reference().value).toBe('FIRST-OCT-EDIT');
    await user.click(screen.getByRole('button', { name: 'Back to choose work', exact: true }));
    fireEvent.change(screen.getByLabelText('Claim period'), { target: { value: '2026-11' } });
    await user.click(screen.getByRole('button', { name: 'Enter totals', exact: true }));
    await openBasis(user);
    expect(priorNet().value).toBe('13389.3'); expect(reference().value).toBe('FIRST-NOV');
    expect(priorGross().value).toBe('14094');
    expect(readFormBuffer(project.id, 'claims:forms')).toEqual(firstBuffer);
    expect(readFormBuffer(other.id, 'claims:forms')['2026-10'].claimBasis.priorReference).toBe('OTHER-OCT');
    expect(save).not.toHaveBeenCalled(); expect(project).toEqual(original); expect(other).toEqual(originalOther);
  });

  it('saves unsupported or incomplete settings unfinished and rejects invalid numeric settings without creating a revision', async () => {
    const user = userEvent.setup(); const project = fixture('BASIS-INCOMPLETE');
    seedEditing(project, { '2026-10': assessment({
      work: { A: { include: true, assessedQuantity: '1566', previousValue: '14094' } },
      claimBasis: { ...defaultClaimBasis(), billingMethod: 'unsupported', retentionMode: 'rateCap', retentionRate: '5', retentionCap: '', previousNetValue: '13389.3', priorReference: '' },
    }) });
    const original = structuredClone(project); const changes = []; const results = [];
    render(<Journey initial={project} onChange={next => changes.push(next)} onResult={result => results.push(result)} />);
    await goReview(user);
    expect(screen.getByText('Use cumulative quantity × rate; other billing methods need review.')).toBeTruthy();
    expect(screen.getByText('Enter the cumulative retention cap.')).toBeTruthy();
    expect(screen.getByText('Add the reference for previous submitted amounts.')).toBeTruthy();
    expect(screen.getByText('This month · net').parentElement.textContent).toContain('—');
    await user.click(screen.getByRole('button', { name: 'Save claim draft', exact: true }));
    expect(results.at(-1).outcome).toBe('updated');
    expect(results.at(-1).draft.snapshot.canPrepare).toBe(false);
    expect(results.at(-1).draft.snapshot.totals.currentValue).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark prepared', exact: true }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Continue editing', exact: true }));
    await openBasis(user);
    expect(screen.getByRole('combobox', { name: 'Billing method', exact: true }).getAttribute('data-value')).toBe('unsupported');
    expect(screen.getByRole('spinbutton', { name: 'Retention cap', exact: true }).value).toBe('');
    expect(reference().value).toBe(''); expect(priorNet().value).toBe('13389.3');
    await user.clear(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }));
    await user.type(screen.getByRole('spinbutton', { name: 'Retention rate', exact: true }), '101');
    await goReview(user);
    await user.click(screen.getByRole('button', { name: 'Save claim draft', exact: true }));
    expect(results.at(-1).outcome).toBe('invalid');
    expect(screen.getByRole('alert').textContent).toContain('Retention rate must be between 0 and 100');
    expect(screen.getByRole('heading', { name: 'Review your claim' })).toBeTruthy();
    expect(changes).toHaveLength(1); expect(changes[0].claimDrafts).toHaveLength(1);
    expect(project).toEqual(original);
  });
});
