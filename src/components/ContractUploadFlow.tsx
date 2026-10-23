import type { FormEvent } from 'react';
import type { Project } from '../types/domain';
import type { ContractRecovery } from '../data/contract-recovery';
interface UploadSelection { inputKind: 'sample' | 'upload'; fileName: string; fileSize: number; file?: File }
interface ManualInput { id: string; description: string; unit: string; quantity: string; rate: string; location: string }
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CircleAlert, FileText, Info, LoaderCircle, RotateCcw, Upload } from 'lucide-react';
import { DEMO_CONTRACT_PDF, DEMO_CONTRACT_FILENAME, canImportIntoProject, validateContractFile } from '../data/contract-import.ts';
import { contractRecoveryMissingRows, createContractRecovery, inspectContractRecovery, retryContractPage, saveManualContractPage } from '../data/contract-recovery.ts';
import { BackButton, Badge, Button, Checkbox, FormActions, FormField, Input, Modal, formatMoney, formatNumber } from './ui';
import './contract-upload.css';

const EXTRACTION_STEPS = ['Check the document', 'Find work items and rates', 'Flag values to review'];
const SAMPLE_ROWS = [
  { id: 'WI-001', description: 'External wall cladding', quantity: '1,320', unit: 'm²', rate: 28, review: true },
  { id: 'WI-002', description: 'Roof sheeting', quantity: '900', unit: 'm²', rate: 42 },
  { id: 'WI-003', description: 'Floor finish', quantity: '800', unit: 'm²', rate: 65 },
];
const fileSizeLabel = (size: number) => size ? size < 1000000 ? `${Math.max(1, Math.round(size / 1000))} KB` : `${(size / 1000000).toFixed(1)} MB` : 'Demo PDF';

export function ContractUploadFlow({ project, onClose, onApply }: { project: Project; onClose: () => void; onApply?: (selection: UploadSelection & { recovery?: ContractRecovery }) => { outcome: string; error?: string } | Promise<{ outcome: string; error?: string }> }) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const selectionToken = useRef(0);
  const mounted = useRef(true);
  const submittingRef = useRef(false);
  const appliedRef = useRef(false);
  const operationToken = useRef(0);
  const controls = useRef<Record<string, HTMLInputElement | null>>({});
  const [stage, setStage] = useState('choose');
  const [selection, setSelection] = useState<UploadSelection | null>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [failedPageDemo, setFailedPageDemo] = useState(false);
  const [recovery, setRecovery] = useState<ContractRecovery | null>(null);
  const [manualEntries, setManualEntries] = useState<Record<string, ManualInput>>({});
  const [manualError, setManualError] = useState<{id?: string; field?: string; message: string} | null>(null);
  const inPlace = canImportIntoProject(project);
  const currency = 'SGD';
  const previewUrl = selection?.inputKind === 'sample' ? DEMO_CONTRACT_PDF : objectUrl;
  const stageIndex = stage === 'choose' ? 0 : stage === 'extracting' ? 1 : 2;
  const recoveryCheck = recovery ? inspectContractRecovery(recovery, project.id, selection) : null;
  const unresolved = !!recovery && recoveryCheck?.outcome !== 'ready';
  const recoverySummary = recoveryCheck && 'summary' in recoveryCheck ? recoveryCheck.summary : null;
  const missingRows = recovery ? contractRecoveryMissingRows(recovery) : [];
  const manualFormId = `${inputId}-manual`;
  const busy = submitting || stage === 'retrying';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; selectionToken.current += 1; operationToken.current += 1; };
  }, []);

  useEffect(() => {
    if (!selection?.file) { setObjectUrl(''); return; }
    const url = URL.createObjectURL(selection.file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selection]);

  useEffect(() => {
    if (stage !== 'extracting') return;
    setProgress(0);
    const timers = [
      setTimeout(() => setProgress(1), 650),
      setTimeout(() => setProgress(2), 1300),
      setTimeout(() => { setProgress(3); setRecovery(failedPageDemo ? createContractRecovery(project.id, selection) : null); setStage('results'); }, 2100),
    ];
    return () => timers.forEach(clearTimeout);
  }, [stage, failedPageDemo, project.id, selection]);

  useEffect(() => {
    if (stage !== 'retrying') return;
    const token = ++operationToken.current;
    const timer = setTimeout(() => {
      if (!mounted.current || token !== operationToken.current) return;
      const result = retryContractPage(recovery, 1);
      if (result.outcome === 'recovered') setRecovery(result.recovery);
      else setError(result.error || 'This page could not be retried. Your successful results are kept.');
      setStage('results');
    }, 900);
    return () => { clearTimeout(timer); operationToken.current += 1; };
  }, [stage, recovery]);

  useEffect(() => {
    if (stage !== 'choose' || selection) heading.current?.focus();
    else if (!checking) fileInput.current?.focus();
  }, [stage, selection, checking]);

  async function chooseFile(file: File | null | undefined) {
    if (!file) return;
    const token = ++selectionToken.current;
    setChecking(true);
    setSelection(null);
    setError('');
    setDragging(false);
    setRecovery(null);
    setManualEntries({});
    setManualError(null);
    appliedRef.current = false;
    try {
      const problem = await validateContractFile(file);
      if (!mounted.current || token !== selectionToken.current) return;
      if (problem) { setError(problem); return; }
      setSelection({ inputKind: 'upload', fileName: file.name, fileSize: file.size, file });
    } catch {
      if (mounted.current && token === selectionToken.current) setError('This PDF could not be opened. Choose another file or use the demo PDF.');
    } finally {
      if (mounted.current && token === selectionToken.current) setChecking(false);
    }
  }

  function useDemo() {
    selectionToken.current += 1;
    setChecking(false);
    setError('');
    setRecovery(null);
    setManualEntries({});
    setManualError(null);
    appliedRef.current = false;
    setSelection({ inputKind: 'sample', fileName: DEMO_CONTRACT_FILENAME, fileSize: 0 });
    if (fileInput.current) fileInput.current.value = '';
  }

  function changeFile() {
    selectionToken.current += 1;
    setSelection(null);
    setError('');
    setChecking(false);
    setRecovery(null);
    setManualEntries({});
    setManualError(null);
    appliedRef.current = false;
    if (fileInput.current) fileInput.current.value = '';
    fileInput.current?.focus();
  }

  async function applyResult() {
    if (!selection || submittingRef.current || appliedRef.current || !onApply || unresolved) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await onApply(recovery ? { ...selection, recovery } : selection);
      if (result?.outcome === 'applied') appliedRef.current = true;
      if (mounted.current && result?.outcome === 'invalid') setError(result.error || 'The work list could not be added. Please try again.');
    } catch {
      if (mounted.current) setError('The work list could not be added. Please try again.');
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  function enterManually() {
    setManualEntries(prior => Object.fromEntries(missingRows.map(row => [row.id, prior[row.id] || {
      id: row.id, description: '', unit: '', quantity: '', rate: '', location: '',
    }])));
    setManualError(null);
    setError('');
    setStage('manual');
  }

  function saveManual(event: FormEvent) {
    event.preventDefault();
    const entries = missingRows.map(row => manualEntries[row.id]);
    for (const entry of entries) {
      for (const name of ['description', 'location', 'unit'] as const) {
        if (!entry[name].trim()) {
          setManualError({ id: entry.id, field: name, message: `Enter the ${name} shown in the demo source.` });
          controls.current[`${entry.id}-${name}`]?.focus();
          return;
        }
      }
      for (const name of ['quantity', 'rate'] as const) {
        const value = entry[name].trim();
        if (value && (!/^\d+(?:\.\d{1,4})?$/.test(value) || Number(value) > 1_000_000_000)) {
          setManualError({ id: entry.id, field: name, message: 'Enter zero or a positive number with up to four decimal places, or leave it unknown.' });
          controls.current[`${entry.id}-${name}`]?.focus();
          return;
        }
      }
    }
    const result = saveManualContractPage(recovery, 1, entries);
    if (result.outcome !== 'recovered') {
      setManualError({ message: result.error || 'Check the missing items before continuing.' });
      return;
    }
    setRecovery(result.recovery);
    setManualError(null);
    setStage('results');
  }

  const returnToFile = () => { operationToken.current += 1; setStage('choose'); setError(''); };
  const sourceLinks = <div className="contract-recovery-source"><div><FileText size={17} aria-hidden="true" /><span>Review source · <strong>Demo schedule, page 1</strong></span></div><a className="button" href={DEMO_CONTRACT_PDF} target="_blank" rel="noreferrer">Demo source PDF<ArrowUpRight size={14} aria-hidden="true" /></a>{selection?.inputKind === 'upload' && previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer">Preview selected PDF<ArrowUpRight size={12} aria-hidden="true" /></a>}</div>;

  const footer = <FormActions className="contract-upload-actions" secondary={stage === 'manual'
    ? <BackButton onClick={() => { setStage('results'); setManualError(null); }}>Back to results</BackButton>
    : stage === 'retrying' ? <Button onClick={() => { operationToken.current += 1; setStage('results'); }}>Cancel retry</Button>
    : stage === 'results'
    ? <BackButton onClick={returnToFile} disabled={submitting}>Back to file</BackButton>
    : <Button onClick={stage === 'extracting' ? () => setStage('choose') : onClose}>{stage === 'extracting' ? 'Cancel extraction' : 'Cancel'}</Button>}>
    {stage === 'choose' && <Button className="primary" icon={ArrowRight} disabled={!selection || checking} onClick={() => { setError(''); setStage('extracting'); }}>Start demo extraction</Button>}
    {stage === 'extracting' && <Button disabled icon={LoaderCircle}>Simulating extraction…</Button>}
    {stage === 'retrying' && <Button disabled icon={LoaderCircle}>Retrying page…</Button>}
    {stage === 'manual' && <Button type="submit" form={manualFormId} className="primary">Save manual entries</Button>}
    {stage === 'results' && <Button className="primary" icon={ArrowRight} disabled={submitting || appliedRef.current || !onApply || unresolved} onClick={applyResult}>{submitting ? 'Opening…' : 'Review work list'}</Button>}
  </FormActions>;

  return <Modal title="Upload a contract" description="Choose a PDF, then review a simulated work list." onClose={onClose} footer={footer}>
    <div className="contract-upload-flow">
      <div className="contract-upload-context"><Badge tone="blue">Demo extraction</Badge><span>{project?.name}</span></div>
      <ol className="contract-upload-steps" aria-label="Contract upload steps">{['Choose PDF', 'Extract', 'Review results'].map((label, index) => <li key={label} className={index === stageIndex ? 'current' : index < stageIndex ? 'complete' : ''} aria-current={index === stageIndex ? 'step' : undefined}><span>{index < stageIndex ? <Check size={12} aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol>

      {stage === 'choose' && <>
        {!selection && <>
        <div className={`contract-upload-dropzone${dragging ? ' dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}>
          <Upload size={28} aria-hidden="true" />
          <h3>Choose your contract PDF</h3>
          <p>Drop a file here or use the file picker.</p>
          <FormField label="Contract PDF" id={`${inputId}-file`} hint="PDF up to 30 MB. The file stays in this browser." error={error}><input ref={fileInput} id={`${inputId}-file`} type="file" accept=".pdf,application/pdf" disabled={checking} onChange={(event) => { const file = event.target.files?.[0]; if (file) chooseFile(file); }} /></FormField>
        </div>
        <div className="contract-upload-sample"><div><strong>Try the full showcase</strong><p>The demo PDF matches the fictional work list.</p></div><Button icon={FileText} onClick={useDemo}>Use demo PDF</Button></div>
        </>}
        {checking && <p className="contract-upload-checking" role="status"><LoaderCircle size={15} aria-hidden="true" />Checking the selected file…</p>}
        {selection && <div className="contract-upload-file"><FileText size={22} aria-hidden="true" /><div><strong ref={heading} tabIndex={-1}>{selection.fileName}</strong><span>{fileSizeLabel(selection.fileSize)} · Ready for demo extraction</span></div><div className="contract-upload-file-actions">{previewUrl && <a className="button" href={previewUrl} target="_blank" rel="noreferrer">Preview PDF<ArrowUpRight size={14} aria-hidden="true" /></a>}<Button className="ghost" onClick={changeFile}>Change file</Button></div></div>}
        {selection && <label className="contract-recovery-choice"><Checkbox checked={failedPageDemo} onChange={event => { setFailedPageDemo(event.target.checked); setRecovery(null); setManualEntries({}); }} /><span><strong>Try failed-page demo</strong><small>Simulate two unread items on page 1, then retry or enter them manually.</small></span></label>}
        <div className="notice info"><Info size={16} aria-hidden="true" /><span>This showcase uses a fictional six-item work list. Your selected PDF is available for preview; its contents are not read.</span></div>
      </>}

      {stage === 'extracting' && <section className="contract-upload-processing" aria-busy="true">
        <div className="contract-upload-processing-icon"><FileText size={28} aria-hidden="true" /></div>
        <h3 ref={heading} tabIndex={-1}>Simulating extraction</h3>
        <p className="contract-upload-processing-file">{selection?.fileName}</p>
        <div className="contract-upload-progress" role="progressbar" aria-label="Demo extraction progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={progress} aria-valuetext={`${progress} of 3 demo steps complete`}><span style={{ width: `${Math.max(8, progress / 3 * 100)}%` }} /></div>
        <ol className="contract-upload-processing-steps">{EXTRACTION_STEPS.map((label, index) => <li key={label} className={index < progress ? 'complete' : index === progress ? 'current' : ''}>{index < progress ? <Check size={16} aria-hidden="true" /> : index === progress ? <LoaderCircle size={16} aria-hidden="true" /> : <span className="contract-upload-step-dot" aria-hidden="true" />}<span>{label}</span></li>)}</ol>
        <p className="contract-upload-simulation" role="status">Demo only · Preparing a preset work list. No AI or upload service is connected.</p>
      </section>}

      {['results', 'retrying'].includes(stage) && recovery && <>
        {sourceLinks}
        {unresolved ? <section className="contract-recovery-panel" aria-label="Failed page recovery" aria-busy={busy}>
          <div className="contract-upload-result-heading"><span className="contract-upload-result-icon warning"><CircleAlert size={20} aria-hidden="true" /></span><div><h3 ref={heading} tabIndex={-1}>Page 1 needs attention</h3><p>4 items kept. 2 items could not be read in this simulated extraction.</p></div></div>
          <div className="contract-recovery-buttons"><Button icon={RotateCcw} onClick={() => { setError(''); setStage('retrying'); }} disabled={busy}>Retry page</Button><Button onClick={enterManually} disabled={busy}>Enter manually</Button></div>
          <p className="contract-recovery-note" role="status">{stage === 'retrying' ? 'Retrying only the unread items. Successful results and the source PDF are kept.' : 'Recover the missing items before opening the work list. No project records have changed.'}</p>
        </section> : <div className="contract-upload-result-heading"><span className="contract-upload-result-icon"><Check size={20} aria-hidden="true" /></span><div><h3 ref={heading} tabIndex={-1}>{recovery.pages[0].resolution === 'manual' ? 'Manual entries recorded' : 'All 6 items ready for review'}</h3><p>{recovery.pages[0].resolution === 'manual' ? 'Manual entries and unknown values still need source review. ' : 'Page 1 recovered by retry. '}{recoverySummary?.needsReview} {recoverySummary?.needsReview === 1 ? 'item needs' : 'items need'} checking before work-list confirmation.</p></div></div>}
        <div className="contract-upload-result-table"><table><caption>{unresolved ? 'Successful results kept · 4 of 6 items' : 'Recovered fictional work list · 6 items'}</caption><thead><tr><th>Work item</th><th>Quantity</th><th>Rate ({currency})</th></tr></thead><tbody>{recovery.items.map(row => <tr key={row.id}><td><strong>{row.description}</strong><small>{row.ref || row.id} · Page {row.sourcePage}</small></td><td>{row.rawExtractedQuantity != null && !row.extractionRecovery ? <><span className="contract-upload-flag"><CircleAlert size={13} aria-hidden="true" />{formatNumber(row.rawExtractedQuantity)} {row.unit}</span><small>Source: {formatNumber(row.quantity)} {row.unit}</small></> : <>{row.quantity == null ? 'Unknown' : `${formatNumber(row.quantity)} ${row.unit}`}{row.extractionRecovery && <small>Manual entry · needs source review</small>}</>}</td><td>{row.pricingType === 'included' ? 'Included' : row.rate == null ? 'Unknown' : `${formatMoney(row.rate)}${row.pricingType === 'rateOnly' ? ' · Rate only' : ''}`}</td></tr>)}</tbody></table></div>
        {!unresolved && <div className="contract-upload-destination"><FileText size={17} aria-hidden="true" /><span>{inPlace ? <>The work list will be added to <strong>{project?.name}</strong>.</> : <>The work list will open in a <strong>new demo project</strong>. Existing project records are kept.</>}</span></div>}
        <p className="contract-recovery-note">Demo only. Values belong to the fictional source schedule; your selected PDF is kept for preview and is not parsed.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </>}

      {stage === 'manual' && <>
        <div><h3 ref={heading} tabIndex={-1}>Enter missing items</h3><p className="contract-recovery-note">Only the two unread items on page 1 will be added. The four successful results stay unchanged.</p></div>
        {sourceLinks}
        <form id={manualFormId} className="contract-recovery-form" onSubmit={saveManual} noValidate>
          {missingRows.map(row => {
            const entry = manualEntries[row.id];
            const props = (name: keyof ManualInput) => ({ name: `${row.id}-${name}`, value: entry?.[name] ?? '', 'aria-label': `${name.charAt(0).toUpperCase() + name.slice(1)} · ${row.id}`, ref: (node: HTMLInputElement | null) => { controls.current[`${row.id}-${name}`] = node; }, onChange: (event: React.ChangeEvent<HTMLInputElement>) => { const value = event.target.value; setManualEntries(prior => ({ ...prior, [row.id]: { ...prior[row.id], [name]: value } })); setManualError(null); } });
            const fieldError = (name: keyof ManualInput) => manualError?.id === row.id && manualError?.field === name ? manualError.message : undefined;
            return <fieldset className="contract-recovery-entry" key={row.id}><legend>{row.description}</legend><p className="contract-recovery-entry-source">{row.ref} · Source page 1</p>
              <FormField label="Description" required error={fieldError('description')}><Input {...props('description')} maxLength={240} /></FormField>
              <FormField label="Location" required error={fieldError('location')}><Input {...props('location')} maxLength={120} placeholder="e.g. Block A" /></FormField>
              <div className="contract-recovery-values"><FormField label="Quantity" optional error={fieldError('quantity')}><Input {...props('quantity')} type="number" step="any" min="0" placeholder="Unknown" /></FormField><FormField label="Unit" required error={fieldError('unit')}><Input {...props('unit')} maxLength={20} placeholder="e.g. m²" /></FormField><FormField label="Rate (SGD)" optional error={fieldError('rate')}><Input {...props('rate')} type="number" step="any" min="0" placeholder="Unknown" /></FormField></div>
            </fieldset>;
          })}
          {manualError && !manualError.field && <p className="form-error" role="alert">{manualError.message}</p>}
          <p className="contract-recovery-note">Blank quantity or rate stays unknown; zero stays zero. Manual entries still require source review and explicit work-list confirmation.</p>
        </form>
      </>}

      {stage === 'results' && !recovery && <>
        <div className="contract-upload-result-heading"><span className="contract-upload-result-icon"><Check size={20} aria-hidden="true" /></span><div><h3 ref={heading} tabIndex={-1}>Demo work list ready</h3><p>Review the flagged quantity against the demo source.</p></div></div>
        <div className="contract-upload-results-summary"><div><strong>6</strong><span>Work items</span></div><div className="needs-check"><strong>1</strong><span>Quantity to check</span></div><div><strong>{currency} {formatMoney(136200)}</strong><span>Demo contract value</span></div></div>
        <div className="contract-upload-result-table"><table><caption>Preview of the fictional work list</caption><thead><tr><th>Work item</th><th>Quantity</th><th>Rate ({currency})</th></tr></thead><tbody>{SAMPLE_ROWS.map((row) => <tr key={row.id}><td><strong>{row.description}</strong><small>{row.id}</small></td><td>{row.review ? <><span className="contract-upload-flag"><CircleAlert size={13} aria-hidden="true" />{row.quantity} {row.unit}</span><small>Source: 1,200 m²</small></> : `${row.quantity} ${row.unit}`}</td><td>{formatMoney(row.rate)}</td></tr>)}</tbody></table><p>Also includes door installation, included protection and an hourly rate item.</p></div>
        <div className="contract-upload-destination"><FileText size={17} aria-hidden="true" /><span>{inPlace ? <>The work list will be added to <strong>{project?.name}</strong>.</> : <>The work list will open in a <strong>new demo project</strong>. Existing project records are kept.</>}</span></div>
        <div className="notice info"><Info size={16} aria-hidden="true" /><span>These are preset sample results, not values read from {selection?.inputKind === 'sample' ? 'the PDF' : 'your PDF'}. The next screen uses the matching demo schedule for review.</span></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </>}
    </div>
  </Modal>;
}
