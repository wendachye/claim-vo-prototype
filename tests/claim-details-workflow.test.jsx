import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { ClaimPackPreview } from '../src/components/ClaimPackPreview';
import { ClaimDetailsForm } from '../src/components/ClaimDetailsForm';
import { WORKSPACE_STORE } from '../src/data/projects.ts';
import { loadShowcaseWorkspace } from '../src/data/showcase-workspace.ts';
import { markClaimPrepared } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { getClaimDocumentEditContext } from '../src/data/claim-document-revisions.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';

const now = new Date('2026-10-28T10:00:00+08:00');
const ids = new Set();
const oldScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
const workspace = () => JSON.parse(localStorage.getItem(WORKSPACE_STORE));
const active = () => { const value = workspace(); return value.projects.find(p => p.id === value.activeProjectId); };
function fixture() {
  const value = loadShowcaseWorkspace(localStorage, now);
  const project = value.projects.find(p => p.id === value.activeProjectId);
  ids.add(project.id);
  const source = project.claimDrafts.at(-1);
  const prepared = markClaimPrepared(project, source.id);
  expect(prepared.outcome).toBe('updated');
  value.projects = value.projects.map(p => p.id === project.id ? prepared.project : p);
  localStorage.setItem(WORKSPACE_STORE, JSON.stringify(value));
  return { value, project: prepared.project, draft: prepared.draft };
}
const edit = () => screen.getByRole('button', { name: 'Edit claim details', exact: true });
const form = () => screen.getByRole('dialog', { name: 'Edit claim details', exact: true });
async function fill(user, label, value) {
  const field = within(form()).getByLabelText(label, { exact: true });
  await user.clear(field); if (value) await user.type(field, value);
}

beforeEach(() => {
  localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup(); ids.forEach(clearProjectFormBuffers); ids.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (oldScroll) Object.defineProperty(Element.prototype, 'scrollTo', oldScroll); else delete Element.prototype.scrollTo;
  window.history.replaceState(null, '', '#dashboard');
});

describe('saved claim document detail editing', () => {
  it('saves all printed fields as a new draft through the app without changing the original, amounts, evidence or routing', async () => {
    const saved = fixture(), original = structuredClone(saved.project), oldPack = buildClaimPack(original, saved.draft.id).pack;
    const oldCSV = toClaimCSV(oldPack), other = saved.value.projects.filter(p => p.id !== original.id);
    const user = userEvent.setup();
    window.history.replaceState(null, '', `#claim-preview?draft=${saved.draft.id}`);
    const mounted = render(<App />);
    await user.click(edit());
    expect(within(form()).getByLabelText('Recipient company').value).toBe(oldPack.projectDetails.contract.mainContractor);
    expect(within(form()).getByLabelText('Claim reference').value).toBe('');
    await fill(user, 'Recipient company', 'Demo Main Contractor');
    await user.click(within(form()).getByText('Attention and address', { exact: true }));
    await fill(user, 'Attention', 'Demo QS Team');
    await fill(user, 'Recipient address', 'Demo project office\nSingapore');
    await fill(user, 'Project name', 'S.I.T. claim document (Demo)');
    await fill(user, 'Printed project code', 'PRINTED-ONLY');
    await fill(user, 'Contract reference', 'DEMO/CONTRACT');
    await fill(user, 'Claim reference', 'DEMO/PC/OCT');
    await fill(user, 'Claim date', '2026-10-28');
    await fill(user, 'Company name', 'Demo Scaffold Company');
    await user.click(within(form()).getByText('Address and contact details', { exact: true }));
    await fill(user, 'Company address', 'Demo office\nSingapore');
    await fill(user, 'Company registration no.', 'DEMO-REG');
    await fill(user, 'Phone', '+65 6000 0000');
    await fill(user, 'Email', 'claims@example.test');
    await user.click(within(form()).getByRole('button', { name: 'Save new version', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const current = active(), child = current.claimDrafts.at(-1);
    expect(child.id).not.toBe(saved.draft.id); expect(child.revision).toBe(saved.draft.revision + 1); expect(child.status).toBe('draft');
    expect(child.snapshot).toEqual(saved.draft.snapshot); expect(child.assessment).toEqual(saved.draft.assessment);
    expect(child.projectDetails).toEqual(saved.draft.projectDetails);
    expect(current.claimDrafts.find(d => d.id === saved.draft.id)).toEqual(saved.draft);
    const { claimDrafts: _claims, history: _history, ...sources } = current;
    const { claimDrafts: _oldClaims, history: _oldHistory, ...oldSources } = original;
    expect(sources).toEqual(oldSources);
    expect(workspace().projects.filter(p => p.id !== original.id)).toEqual(other);
    expect(buildClaimPack(current, saved.draft.id).pack).toEqual(oldPack);
    expect(toClaimCSV(buildClaimPack(current, saved.draft.id).pack)).toBe(oldCSV);
    const childPack = buildClaimPack(current, child.id).pack;
    expect(childPack.evidenceRefs).toEqual(oldPack.evidenceRefs); expect(childPack.totals).toEqual(oldPack.totals);
    const document = screen.getByRole('article');
    for (const text of ['Demo Main Contractor', 'Demo QS Team', 'PRINTED-ONLY', 'DEMO/CONTRACT', 'DEMO/PC/OCT', 'Demo Scaffold Company', 'DEMO-REG', 'claims@example.test']) expect(document.textContent).toContain(text);
    expect(document.textContent).toContain('Claim date:'); expect(document.textContent).toContain('28 Oct 2026');
    expect(document.textContent).toContain(child.id); expect(document.textContent).toContain('System version ID:');
    expect(location.hash).toContain(child.id);
    mounted.unmount(); render(<App />);
    expect(screen.getByRole('article').textContent).toContain('PRINTED-ONLY');
    expect(active().claimDrafts.at(-1)).toEqual(child);
  });

  it('preserves cancelled edits for the same source and keeps earlier versions read only', async () => {
    const saved = fixture(), original = structuredClone(saved.project), user = userEvent.setup();
    const props = { project: saved.project, draftId: saved.draft.id, onBack: vi.fn(), onSaveDetails: vi.fn() };
    const mounted = render(<ClaimPackPreview {...props} />);
    await user.click(edit()); await fill(user, 'Printed project code', 'UNSAVED-DOCUMENT-CODE');
    await user.click(within(form()).getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(saved.project).toEqual(original);
    await user.click(edit()); expect(within(form()).getByLabelText('Printed project code').value).toBe('UNSAVED-DOCUMENT-CODE');
    await user.click(within(form()).getByRole('button', { name: 'Cancel', exact: true }));
    const later = structuredClone(saved.draft); later.id += '-NEW'; later.revision += 1;
    mounted.rerender(<ClaimPackPreview {...props} project={{ ...saved.project, claimDrafts: [...saved.project.claimDrafts, later] }} />);
    expect(screen.queryByRole('button', { name: 'Edit claim details', exact: true })).toBeNull();
    expect(screen.getByRole('article').textContent).not.toContain('UNSAVED-DOCUMENT-CODE');
  });

  it('focuses invalid contact details and keeps the form on rejected saves', async () => {
    const saved = fixture(), context = getClaimDocumentEditContext(saved.project, saved.draft.id), user = userEvent.setup();
    const onSave = vi.fn().mockReturnValue({ outcome: 'invalid', error: 'This saved claim changed. Reopen Edit claim details before saving.' });
    render(<ClaimDetailsForm projectId={saved.project.id} draftId={saved.draft.id} details={context.details} sourceKey={context.sourceKey} onSave={onSave} onClose={vi.fn()} />);
    await user.click(within(form()).getByText('Address and contact details', { exact: true }));
    await fill(user, 'Email', 'invalid-email');
    await user.click(within(form()).getByRole('button', { name: 'Save new version', exact: true }));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(form()).getByText('Enter a valid email address, or leave it blank.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(within(form()).getByLabelText('Email')));
    await fill(user, 'Email', 'claims@example.test');
    await user.click(within(form()).getByRole('button', { name: 'Save new version', exact: true }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(within(form()).getByRole('alert').textContent).toContain('This saved claim changed');
    expect(within(form()).getByLabelText('Email').value).toBe('claims@example.test');
  });
});
