import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CircleAlert, FileText, Info, LoaderCircle, Upload } from 'lucide-react';
import { DEMO_CONTRACT_PDF, DEMO_CONTRACT_FILENAME, canImportIntoProject, validateContractFile } from '../data/contract-import.js';
import { BackButton, Badge, Button, FormActions, FormField, Modal, formatMoney } from './ui.jsx';
import './contract-upload.css';

const EXTRACTION_STEPS = ['Check the document', 'Find work items and rates', 'Flag values to review'];
const SAMPLE_ROWS = [
  { id: 'WI-001', description: 'External wall cladding', quantity: '1,320', unit: 'm²', rate: 28, review: true },
  { id: 'WI-002', description: 'Roof sheeting', quantity: '900', unit: 'm²', rate: 42 },
  { id: 'WI-003', description: 'Floor finish', quantity: '800', unit: 'm²', rate: 65 },
];
const fileSizeLabel = (size) => size ? size < 1000000 ? `${Math.max(1, Math.round(size / 1000))} KB` : `${(size / 1000000).toFixed(1)} MB` : 'Demo PDF';

export function ContractUploadFlow({ project, onClose, onApply }) {
  const inputId = useId();
  const fileInput = useRef(null);
  const heading = useRef(null);
  const selectionToken = useRef(0);
  const mounted = useRef(true);
  const submittingRef = useRef(false);
  const [stage, setStage] = useState('choose');
  const [selection, setSelection] = useState(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const inPlace = canImportIntoProject(project);
  const currency = 'SGD';
  const previewUrl = selection?.inputKind === 'sample' ? DEMO_CONTRACT_PDF : objectUrl;
  const stageIndex = stage === 'choose' ? 0 : stage === 'extracting' ? 1 : 2;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; selectionToken.current += 1; };
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
      setTimeout(() => { setProgress(3); setStage('results'); }, 2100),
    ];
    return () => timers.forEach(clearTimeout);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'choose' || selection) heading.current?.focus();
    else if (!checking) fileInput.current?.focus();
  }, [stage, selection, checking]);

  async function chooseFile(file) {
    if (!file) return;
    const token = ++selectionToken.current;
    setChecking(true);
    setSelection(null);
    setError('');
    setDragging(false);
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
    setSelection({ inputKind: 'sample', fileName: DEMO_CONTRACT_FILENAME, fileSize: 0 });
    if (fileInput.current) fileInput.current.value = '';
  }

  function changeFile() {
    selectionToken.current += 1;
    setSelection(null);
    setError('');
    setChecking(false);
    if (fileInput.current) fileInput.current.value = '';
    fileInput.current?.focus();
  }

  async function applyResult() {
    if (!selection || submittingRef.current || !onApply) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await onApply(selection);
      if (mounted.current && result?.outcome === 'invalid') setError(result.error || 'The work list could not be added. Please try again.');
    } catch {
      if (mounted.current) setError('The work list could not be added. Please try again.');
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  const footer = <FormActions className="contract-upload-actions" secondary={stage === 'results'
    ? <BackButton onClick={() => { setStage('choose'); setError(''); }} disabled={submitting}>Back to file</BackButton>
    : <Button onClick={stage === 'extracting' ? () => setStage('choose') : onClose}>{stage === 'extracting' ? 'Cancel extraction' : 'Cancel'}</Button>}>
    {stage === 'choose' && <Button className="primary" icon={ArrowRight} disabled={!selection || checking} onClick={() => { setError(''); setStage('extracting'); }}>Start demo extraction</Button>}
    {stage === 'extracting' && <Button disabled icon={LoaderCircle}>Simulating extraction…</Button>}
    {stage === 'results' && <Button className="primary" icon={ArrowRight} disabled={submitting || !onApply} onClick={applyResult}>{submitting ? 'Opening…' : 'Review work list'}</Button>}
  </FormActions>;

  return <Modal title="Upload a contract" description="Choose a PDF, then review a simulated work list." onClose={onClose} footer={footer}>
    <div className="contract-upload-flow">
      <div className="contract-upload-context"><Badge tone="blue">Demo extraction</Badge><span>{project?.name}</span></div>
      <ol className="contract-upload-steps" aria-label="Contract upload steps">{['Choose PDF', 'Extract', 'Review results'].map((label, index) => <li key={label} className={index === stageIndex ? 'current' : index < stageIndex ? 'complete' : ''} aria-current={index === stageIndex ? 'step' : undefined}><span>{index < stageIndex ? <Check size={12} aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol>

      {stage === 'choose' && <>
        {!selection && <>
        <div className={`contract-upload-dropzone${dragging ? ' dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}>
          <Upload size={28} aria-hidden="true" />
          <h3>Choose your contract PDF</h3>
          <p>Drop a file here or use the file picker.</p>
          <FormField label="Contract PDF" id={`${inputId}-file`} hint="PDF up to 30 MB. The file stays in this browser." error={error}><input ref={fileInput} id={`${inputId}-file`} type="file" accept=".pdf,application/pdf" disabled={checking} onChange={(event) => { const file = event.target.files?.[0]; if (file) chooseFile(file); }} /></FormField>
        </div>
        <div className="contract-upload-sample"><div><strong>Try the full showcase</strong><p>The demo PDF matches the fictional work list.</p></div><Button icon={FileText} onClick={useDemo}>Use demo PDF</Button></div>
        </>}
        {checking && <p className="contract-upload-checking" role="status"><LoaderCircle size={15} aria-hidden="true" />Checking the selected file…</p>}
        {selection && <div className="contract-upload-file"><FileText size={22} aria-hidden="true" /><div><strong ref={heading} tabIndex={-1}>{selection.fileName}</strong><span>{fileSizeLabel(selection.fileSize)} · Ready for demo extraction</span></div><div className="contract-upload-file-actions">{previewUrl && <a className="button" href={previewUrl} target="_blank" rel="noreferrer">Preview PDF<ArrowUpRight size={14} aria-hidden="true" /></a>}<Button className="ghost" onClick={changeFile}>Change file</Button></div></div>}
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

      {stage === 'results' && <>
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
