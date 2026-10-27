import { chooseDrawingArea } from './drawing-select-helpers.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { getSITShowcaseFeatureTargets } from '../src/data/sit-showcase-features.ts';
import { getAreaItemProgress, getItemAreaAllocation, getItemAreaRollup } from '../src/data/area-allocations.ts';
import { getVoiceNoteContext, saveVoiceTranscriptReview } from '../src/data/voice-notes.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';

const now = new Date('2026-10-24T10:00:00+08:00');
const stored = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const selected = () => { const value = stored(); return value.projects.find(project => project.id === value.activeProjectId); };
const exportsFor = project => project.claimDrafts.map(draft => ({ draft, csv: toClaimCSV(buildClaimPack(project, draft.id).pack) }));
const checked = element => element.getAttribute('aria-checked') === 'true' || element.checked === true;
const reportFrom = messageId => selected().reports.find(report => report.sourceMessageId === messageId);
const sourceFields = message => Object.fromEntries(['id', 'projectId', 'projectCode', 'text', 'originalTranscript', 'audio', 'sender', 'date', 'photo', 'photoAlt', 'area', 'itemId', 'completion', 'completionBasis', 'matchSuggestion'].map(key => [key, message[key]]));
const elementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const ids = new Set();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});

afterEach(() => {
  cleanup(); ids.forEach(clearProjectFormBuffers); ids.clear(); localStorage.clear();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (elementScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', elementScrollTo);
  else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#projects');
});

describe('the main S.I.T. showcase links contract, area evidence and the QS claim', () => {
  it('reviews the source and two area updates, verifies each allocation once and saves a separately assessed claim with both original records', async () => {
    const initial = loadShowcaseWorkspace(localStorage, now);
    initial.projects.forEach(project => ids.add(project.id));
    const main = initial.projects.find(project => project.id === initial.sitShowcase.projectId);
    const targets = getSITShowcaseFeatureTargets(main);
    const [areaA, areaB] = targets.areaIds.map(id => main.drawingMapping.areas.find(area => area.id === id));
    const originalVoice = main.whatsappMessages.find(message => message.id === targets.voiceMessageId);
    const originalMatch = main.whatsappMessages.find(message => message.id === targets.matchMessageId);
    const originalClaims = exportsFor(main), otherProjects = structuredClone(initial.projects.filter(project => project.id !== main.id));
    const originalItems = structuredClone(main.items.filter(item => item.id !== 'WI-016'));
    const originalReports = structuredClone(main.reports), originalMapping = structuredClone(main.drawingMapping);
    expect(main.claimDrafts[0].snapshot.totals.currentValue).toBe(15894);
    expect(main.items.find(item => item.id === 'WI-016')).toMatchObject({ ref: 'D.5', quantity: 180, rate: 90, amount: 16200 });
    expect(getItemAreaAllocation(main, 'WI-016')).toMatchObject({ valid: true, contractQuantity: 180, allocatedQuantity: 180, remainingQuantity: 0 });
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#contract');
    let view = render(<App />);
    expect(screen.getByRole('heading', { name: 'Contract', exact: true })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Drawing & areas', exact: true }));
    await chooseDrawingArea(user, screen.getByRole('button', { name: 'Choose site area', exact: true }), areaA.id);
    const areaSummary = screen.getByRole('region', { name: 'Area BRACKET-A completion', exact: true });
    expect(within(areaSummary).getByText('Contract quantity', { exact: true }).nextElementSibling.textContent).toBe('180 pc');
    expect(within(areaSummary).getByText('Quantity in this area', { exact: true }).nextElementSibling.textContent).toBe('90 pc');
    await user.click(within(areaSummary).getByRole('button', { name: 'View contract item D.5', exact: true }));
    expect(screen.getByRole('heading', { name: 'Contract review', exact: true })).toBeTruthy();
    expect(screen.getAllByText('Installation of cantilever wall bracket', { exact: true }).length).toBeGreaterThan(0);
    expect(selected().drawingMapping).toEqual(originalMapping);

    // The demo launcher stays inside this main project and opens its exact recording.
    await user.click(within(document.querySelector('.sidebar')).getByRole('button', { name: 'Site updates', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Demo options', exact: true }));
    await user.click(screen.getByRole('menuitem', { name: 'Try voice-note demo', exact: true }));
    await waitFor(() => expect(location.hash).toContain(targets.voiceMessageId));
    const panel = screen.getByRole('region', { name: 'Voice note review', exact: true });
    expect(panel.querySelector('audio').getAttribute('src')).toBe('/assets/demo-sit-voice-clear.wav');
    expect(getVoiceNoteContext(selected(), originalVoice.id).review).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'Edit transcript', exact: true }));
    const transcript = originalVoice.text.replace('itam', 'item');
    const transcriptField = within(panel).getByRole('textbox', { name: /^Reviewed transcript/ });
    await user.clear(transcriptField); await user.type(transcriptField, transcript);
    const transcriptReason = 'The synthetic recording says work item; corrected the mock transcription typo.';
    await user.type(within(panel).getByRole('textbox', { name: /^Correction reason/ }), transcriptReason);
    await user.click(within(panel).getByRole('button', { name: 'Save transcript correction', exact: true }));
    await waitFor(() => expect(getVoiceNoteContext(selected(), originalVoice.id).review?.transcript).toBe(transcript));
    expect(selected().reports).toEqual(originalReports);
    expect(selected().items).toEqual(main.items);
    expect(selected().claimDrafts).toEqual(main.claimDrafts);
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    expect(getMessageMatchContext(selected(), originalVoice.id).review).toMatchObject({ fields: { itemId: 'WI-016', areaId: areaA.id, completion: 50 } });
    expect(selected().reports).toEqual(originalReports);
    await user.click(screen.getByRole('button', { name: 'Add progress update', exact: true }));
    await waitFor(() => expect(reportFrom(originalVoice.id)?.status).toBe('pending'));
    const voiceReport = reportFrom(originalVoice.id);
    expect(voiceReport).toMatchObject({ message: originalVoice.text, areaMapping: { code: 'BRACKET-A' },
      areaProgress: { allocatedQuantity: 90, contractQuantity: 180 },
      voiceNote: { originalTranscript: originalVoice.text, reviewedTranscript: transcript, reason: transcriptReason, audio: originalVoice.audio } });
    expect(getItemAreaRollup(selected(), 'WI-016', 'reported')).toMatchObject({ completion: 25, completedQuantity: 45 });
    expect(getItemAreaRollup(selected(), 'WI-016', 'verified').completion).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Review progress', exact: true }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Verify progress', exact: true }));
    await waitFor(() => expect(reportFrom(originalVoice.id)?.status).toBe('verified'));
    expect(getAreaItemProgress(selected(), areaA.id, 'WI-016').completion).toBe(50);
    expect(getAreaItemProgress(selected(), areaB.id, 'WI-016').completion).toBeNull();
    expect(getItemAreaRollup(selected(), 'WI-016')).toMatchObject({ completion: 25, completedQuantity: 45 });

    // Correct the deliberately wrong A suggestion to B; the completion remains 25% of B.
    view.unmount(); window.history.replaceState(null, '', `#whatsapp?message=${targets.matchMessageId}`); view = render(<App />);
    expect(screen.getByRole('region', { name: 'Review match', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add progress update', exact: true }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Edit match', exact: true }));
    await chooseSelect(user, screen.getByRole('combobox', { name: 'Site area', exact: true }), areaB.id);
    const matchReason = 'The original worker message says bracket zone B, so the suggested area A is incorrect.';
    await user.type(screen.getByRole('textbox', { name: 'Correction reason', exact: true }), matchReason);
    await user.click(screen.getByRole('button', { name: 'Confirm match', exact: true }));
    expect(getMessageMatchContext(selected(), originalMatch.id).review).toMatchObject({ fields: { itemId: 'WI-016', areaId: areaB.id, completion: 25 }, reason: matchReason });
    expect(getItemAreaRollup(selected(), 'WI-016')).toMatchObject({ completion: 25, completedQuantity: 45 });
    await user.click(screen.getByRole('button', { name: 'Add progress update', exact: true }));
    await waitFor(() => expect(reportFrom(originalMatch.id)?.status).toBe('pending'));
    expect(getItemAreaRollup(selected(), 'WI-016', 'reported')).toMatchObject({ completion: 37.5, completedQuantity: 67.5 });
    expect(getItemAreaRollup(selected(), 'WI-016', 'verified').completion).toBe(25);
    await user.click(screen.getByRole('button', { name: 'Review progress', exact: true }));
    const review = within(await screen.findByRole('dialog'));
    expect(review.getByText('Area reported total', { exact: true }).parentElement.textContent).toContain('25%');
    await user.click(review.getByRole('button', { name: 'Verify progress', exact: true }));
    await waitFor(() => expect(reportFrom(originalMatch.id)?.status).toBe('verified'));
    const matchReport = reportFrom(originalMatch.id);
    expect(matchReport).toMatchObject({ message: originalMatch.text, areaMapping: { code: 'BRACKET-B' },
      areaProgress: { allocatedQuantity: 90, contractQuantity: 180 }, matchReview: { reason: matchReason } });
    expect(getAreaItemProgress(selected(), areaA.id, 'WI-016')).toMatchObject({ completion: 50, completedQuantity: 45 });
    expect(getAreaItemProgress(selected(), areaB.id, 'WI-016')).toMatchObject({ completion: 25, completedQuantity: 22.5 });
    expect(getItemAreaRollup(selected(), 'WI-016')).toMatchObject({ completion: 37.5, completedQuantity: 67.5, knownCount: 2, unknownCount: 0 });

    // A new October revision is an explicit QS measurement, never an auto-valued progress claim.
    view.unmount(); window.history.replaceState(null, '', '#claims'); view = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Start claim', exact: true }));
    for (const itemId of Object.keys(main.claimDrafts[0].assessment.work)) {
      const choice = screen.getByRole('checkbox', { name: `Include ${itemId} in claim`, exact: true });
      if (checked(choice)) await user.click(choice);
    }
    for (const choice of screen.getAllByRole('checkbox', { name: /^Include .* in claim$/ }).filter(choice => !choice.getAttribute('aria-label').includes('WI-'))) if (checked(choice)) await user.click(choice);
    await user.click(screen.getByRole('checkbox', { name: 'Include WI-016 in claim', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Enter totals', exact: true }));
    const quantity = screen.getByRole('spinbutton', { name: 'WI-016 QS cumulative quantity', exact: true });
    expect(quantity.value).toBe('');
    expect(screen.getByRole('button', { name: 'View evidence for D.5', exact: true })).toBeTruthy();
    await user.type(quantity, '67.5');
    const previous = screen.getByRole('spinbutton', { name: 'WI-016 previously claimed value', exact: true });
    await user.type(previous, '0');
    await user.click(screen.getByRole('button', { name: 'View evidence for D.5', exact: true }));
    let evidence = within(await screen.findByRole('dialog'));
    await chooseSelect(user, evidence.getByRole('combobox', { name: 'Area evidence', exact: true }), voiceReport.id);
    expect(evidence.getAllByText(originalVoice.text, { exact: true }).length).toBeGreaterThan(0);
    await chooseSelect(user, evidence.getByRole('combobox', { name: 'Area evidence', exact: true }), matchReport.id);
    expect(evidence.getByText(originalMatch.text, { exact: true })).toBeTruthy();
    expect(evidence.getByText('Weighted contract item total', { exact: true }).nextElementSibling.textContent).toBe('37.5%');
    await user.click(evidence.getByRole('button', { name: 'Done', exact: true }));
    expect(quantity.value).toBe('67.5'); expect(previous.value).toBe('0');
    const prior = screen.getByRole('checkbox', { name: /Confirm previous claims/ });
    if (!checked(prior)) await user.click(prior);
    await user.click(screen.getByRole('button', { name: 'Review claim', exact: true }));
    expect(within(document.querySelector('.claim-review-total')).getByText('This month', { exact: true }).parentElement.textContent).toContain('6,075.00');
    await user.click(screen.getByRole('button', { name: 'Save claim draft', exact: true }));
    await waitFor(() => expect(selected().claimDrafts).toHaveLength(main.claimDrafts.length + 1));
    const next = selected(), saved = next.claimDrafts.find(draft => !main.claimDrafts.some(original => original.id === draft.id));
    expect(saved).toMatchObject({ period: '2026-10', revision: 2, status: 'draft', snapshot: { canPrepare: true, totals: { currentValue: 6075 } } });
    const row = saved.snapshot.workRows.find(row => row.id === 'WI-016');
    expect(row).toMatchObject({ included: true, assessedQuantity: 67.5, previousValue: 0, currentValue: 6075, verified: 37.5 });
    expect(row.areaEvidence.map(report => report.id).sort()).toEqual([voiceReport.id, matchReport.id].sort());
    const pack = buildClaimPack(next, saved.id).pack, csv = toClaimCSV(pack);
    expect(pack.workRows).toHaveLength(1); expect(pack.voRows).toHaveLength(0); expect(pack.evidenceRefs).toHaveLength(2);
    expect(csv).toContain(originalVoice.text); expect(csv).toContain(transcriptReason); expect(csv).toContain(matchReason);
    expect(csv).toContain('/assets/demo-sit-voice-clear.wav');
    expect(next.claimDrafts.find(draft => draft.id === main.claimDrafts[0].id)).toEqual(main.claimDrafts[0]);
    expect(exportsFor({ ...next, claimDrafts: main.claimDrafts })).toEqual(originalClaims);
    expect(next.items.filter(item => item.id !== 'WI-016')).toEqual(originalItems);
    expect(next.reports.filter(report => ![voiceReport.id, matchReport.id].includes(report.id))).toEqual(originalReports);
    expect(next.drawingMapping).toEqual(originalMapping);
    expect(sourceFields(next.whatsappMessages.find(message => message.id === originalVoice.id))).toEqual(sourceFields(originalVoice));
    expect(sourceFields(next.whatsappMessages.find(message => message.id === originalMatch.id))).toEqual(sourceFields(originalMatch));
    expect(stored().projects.filter(project => project.id !== main.id)).toEqual(otherProjects);
    expect(stored().projects).toHaveLength(initial.projects.length);

    // Frozen claim evidence survives later live report edits without borrowing new text or audio.
    const later = structuredClone(next);
    later.reports = later.reports.map(report => [voiceReport.id, matchReport.id].includes(report.id)
      ? { ...report, message: 'Later live report text must not replace the saved source.', voiceNote: undefined, matchReview: undefined } : report);
    expect(toClaimCSV(buildClaimPack(later, saved.id).pack)).toBe(csv);
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ ...stored(), projects: stored().projects.map(project => project.id === main.id ? later : project) }));
    view.unmount(); window.history.replaceState(null, '', `#claim-preview?draft=${saved.id}`); view = render(<App />);
    await user.click(screen.getByRole('button', { name: 'View evidence for D.5', exact: true }));
    evidence = within(await screen.findByRole('dialog'));
    await chooseSelect(user, evidence.getByRole('combobox', { name: 'Area evidence', exact: true }), voiceReport.id);
    expect(evidence.getAllByText(originalVoice.text, { exact: true }).length).toBeGreaterThan(0);
    expect(evidence.queryByText('Later live report text must not replace the saved source.')).toBeNull();
    expect(evidence.getByText('Saved version 2', { exact: true })).toBeTruthy();
    expect(evidence.getByText('Original voice note & transcript', { exact: true })).toBeTruthy();
    expect(evidence.getByText('Weighted contract item total', { exact: true }).nextElementSibling.textContent).toBe('37.5%');
  }, 30000);

  it('counts review status for the selected area instead of a pending update in the other half of the same item', async () => {
    const initial = loadShowcaseWorkspace(localStorage, now);
    initial.projects.forEach(project => ids.add(project.id));
    let main = initial.projects.find(project => project.id === initial.sitShowcase.projectId);
    const targets = getSITShowcaseFeatureTargets(main), [areaA, areaB] = targets.areaIds;
    const originalClaims = exportsFor(main);
    const voice = main.whatsappMessages.find(message => message.id === targets.voiceMessageId);
    const transcript = voice.text.replace('itam', 'item');
    let result = saveVoiceTranscriptReview(main, voice.id, { transcript, reason: 'Corrected the work item typo heard in the demo recording.', sourceKey: getVoiceNoteContext(main, voice.id).sourceKey }, now);
    expect(result.outcome).toBe('updated'); main = result.project;
    result = saveMessageMatchReview(main, voice.id, { itemId: 'WI-016', areaId: areaA, reason: '' }, now);
    expect(result.outcome).toBe('updated');
    const processedA = processWhatsAppMessage(result.project, voice.id);
    expect(processedA.outcome).toBe('processed');
    result = verifyProgressReport(processedA.project, processedA.reportId, 50, '', now);
    expect(result.outcome).toBe('updated'); main = result.project;
    result = saveMessageMatchReview(main, targets.matchMessageId, { itemId: 'WI-016', areaId: areaB, reason: 'The worker explicitly reports bracket zone B.' }, now);
    expect(result.outcome).toBe('updated');
    const processedB = processWhatsAppMessage(result.project, targets.matchMessageId);
    expect(processedB.outcome).toBe('processed'); main = processedB.project;
    expect(main.reports.find(report => report.id === processedA.reportId).status).toBe('verified');
    expect(main.reports.find(report => report.id === processedB.reportId).status).toBe('pending');
    localStorage.setItem(WORKSPACE_STORE, JSON.stringify({ ...initial, projects: initial.projects.map(project => project.id === main.id ? main : project) }));
    const user = userEvent.setup();
    window.history.replaceState(null, '', `#completion?item=WI-016&area=${areaA}`);
    render(<App />);
    expect(screen.getByText('Area totals · claim assessment stays separate.', { exact: true })).toBeTruthy();
    const row = screen.getByRole('button', { name: 'View evidence for WI-016', exact: true }).closest('tr');
    const cells = within(row).getAllByRole('cell');
    expect(cells[1].textContent).toContain('50%'); expect(cells[2].textContent).toContain('50%');
    const filter = screen.getByRole('combobox', { name: 'Review status', exact: true });
    await user.click(filter);
    expect(screen.getByRole('option', { name: 'Verified progress (1)', exact: true })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Needs verification (0)', exact: true })).toBeTruthy();
    await user.click(screen.getByRole('option', { name: 'Verified progress (1)', exact: true }));
    expect(screen.getByRole('button', { name: 'View evidence for WI-016', exact: true })).toBeTruthy();
    expect(reportFrom(targets.matchMessageId).status).toBe('pending');
    expect(exportsFor(selected())).toEqual(originalClaims);
  });
});
