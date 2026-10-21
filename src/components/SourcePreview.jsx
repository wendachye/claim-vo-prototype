import { useEffect, useRef, useState } from 'react';
import {
  ExternalLink, FileText, FileWarning, LoaderCircle, Map, Minus, Plus, RotateCcw,
} from 'lucide-react';
import { contract as sampleContract } from '../data/contract.js';
import { DEMO_CONTRACT_FILENAME, DEMO_CONTRACT_PDF } from '../data/contract-import.js';
import { getSourceDocuments } from '../data/source-documents.js';
import './source-preview.css';

const DOCUMENTS = {
  schedule: { label: 'Schedule', icon: FileText, ratio: 1697 / 2400 },
  drawing: { label: 'Site drawing', icon: Map, ratio: 1.414 },
};
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function number(value, maximumFractionDigits = 4) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-SG', { maximumFractionDigits });
}

function scheduleAmount(row, field) {
  if (row.pricingType === 'included') return 'Included';
  if (field === 'amount' && row.pricingType === 'rateOnly') return 'Rate only';
  const value = row[field];
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Project-scoped source preview. Each document belongs to its source project. */
export function SourcePreview({ item, compact = false, uploadedDocument = null, contract = sampleContract, sourceItems = [] }) {
  const [documentType, setDocumentType] = useState('schedule');
  const [zoom, setZoom] = useState(1);
  const [imageStatus, setImageStatus] = useState('loading');
  const [imageRatio, setImageRatio] = useState(DOCUMENTS.schedule.ratio);
  const [scheduleRatio, setScheduleRatio] = useState(0.7);
  const [retryVersion, setRetryVersion] = useState(0);
  const viewportRef = useRef(null);
  const scheduleRef = useRef(null);
  const sourceKind = contract?.sourceKind ?? (contract === sampleContract ? 'provided' : 'none');
  const sourceFilename = contract?.sourceFilename ?? contract?.sourceFile;
  const sourceDocuments = getSourceDocuments(contract);
  const hasProvidedAssets = Boolean(sourceDocuments?.schedule);
  const hasDemoAssets = Boolean(contract?.demoImport) && sourceFilename === DEMO_CONTRACT_FILENAME && contract.sourceFile === DEMO_CONTRACT_PDF;
  const hasDrawing = Boolean(sourceDocuments?.drawing);
  const activeType = hasDrawing ? documentType : 'schedule';
  const document = hasDemoAssets ? { ...DOCUMENTS.schedule, asset: '/samples/warehouse-contract-demo.png', ratio: 210 / 297 } : sourceDocuments?.[activeType] || DOCUMENTS[activeType];
  const isSchedule = activeType === 'schedule';
  const showUploaded = isSchedule && Boolean(uploadedDocument?.url);
  const showIllustrative = !showUploaded && !hasDemoAssets && sourceKind === 'illustrative';
  const showImage = !showUploaded && !showIllustrative && (hasProvidedAssets || hasDemoAssets);
  const rows = Array.isArray(sourceItems) ? sourceItems : [];
  const hasPreview = showUploaded || showImage || (showIllustrative && rows.length > 0);
  const asset = showUploaded ? uploadedDocument.url : showImage ? document.asset : null;
  const activeLabel = showUploaded ? 'Uploaded PDF' : document.label;
  const filename = showUploaded
    ? (uploadedDocument.name || 'Uploaded contract.pdf')
    : hasDemoAssets ? 'Fictional demo contract PDF'
      : showIllustrative ? 'Illustrative demo schedule · not a supplied contract'
      : (sourceFilename || 'No source document supplied');
  const page = item?.sourcePage ?? contract?.sourcePage;
  const pageCount = contract?.sourcePageCount;
  const reference = item?.ref ?? 'Contract schedule';
  const projectKey = JSON.stringify([contract?.id ?? '', contract?.reference ?? '', sourceKind,
    contract?.sourceProfile ?? '', contract?.sourceFile ?? '', sourceFilename ?? '', hasDrawing]);

  useEffect(() => {
    setDocumentType('schedule');
    setZoom(1);
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }, [projectKey]);

  useEffect(() => {
    setImageStatus('loading');
    setImageRatio(document.ratio);
  }, [activeType, asset, projectKey]);

  useEffect(() => {
    if (!showIllustrative || !scheduleRef.current) return undefined;
    const sheet = scheduleRef.current;
    const measure = () => {
      if (sheet.offsetWidth && sheet.offsetHeight) setScheduleRatio(sheet.offsetWidth / sheet.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [showIllustrative, rows, projectKey]);

  function resetZoom() {
    setZoom(1);
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }

  function selectDocument(nextType) {
    if (nextType === activeType) return;
    setDocumentType(nextType);
    resetZoom();
  }

  function retryImage() {
    setImageStatus('loading');
    setRetryVersion((version) => version + 1);
  }

  const pageLabel = showUploaded ? 'Preview only'
    : hasDemoAssets ? 'Demo PDF · page 1'
      : showIllustrative ? 'Demo reference'
      : !showImage ? 'No source'
        : !isSchedule ? 'Reference plan'
          : page ? `Page ${page}${pageCount ? ` / ${pageCount}` : ''}` : 'Schedule image';
  const provenanceNote = showUploaded
    ? 'This upload does not replace the seeded schedule or update work-item values. Use the external-link control if your browser cannot display the PDF.'
    : hasDemoAssets ? 'Review the mock values against this fictional source. No live extraction or contract approval is performed.'
      : showIllustrative ? (contract?.sampleNote || 'This locally rendered schedule contains invented demo data, not a supplied contract. No AI extraction is running.')
        : showImage ? isSchedule ? (contract?.sampleNote || 'Seeded review preview. Compare the selected reference with the source; no live AI extraction is running.')
          : 'Area aliases are demo mappings. No drawing quantities or completion percentages are inferred from this image.'
          : 'Review values are not evidence of a supplied contract. Attach and review this project’s own source before relying on them.';

  return (
    <section className={`source-preview${compact ? ' source-preview--compact' : ''}`} aria-label='Contract source document'>
      <div className='source-preview__heading'>
        <div className='source-preview__heading-text'><h2>Source document</h2><p title={filename}>{filename}</p></div>
        <span className='source-preview__page-label'>{pageLabel}</span>
      </div>

      {hasPreview && <div className='source-preview__toolbar'>
        <div className='source-preview__tabs' role='group' aria-label='Source to display'>
          {Object.entries(DOCUMENTS).filter(([type]) => type === 'schedule' || hasDrawing).map(([type, entry]) => {
            const Icon = entry.icon;
            return <button key={type} type='button' className={`source-preview__tab${activeType === type ? ' source-preview__tab--active' : ''}`} aria-pressed={activeType === type} onClick={() => selectDocument(type)}><Icon size={15} aria-hidden='true' />{type === 'schedule' && showUploaded ? 'Uploaded PDF' : entry.label}</button>;
          })}
        </div>
        <div className='source-preview__zoom' role='group' aria-label='Document zoom'>
          {!showUploaded && <>
            <button className='source-preview__icon-button' type='button' aria-label='Zoom out' title='Zoom out' disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))}><Minus size={15} aria-hidden='true' /></button>
            <span className='source-preview__zoom-value' aria-live='polite'>{Math.round(zoom * 100)}%</span>
            <button className='source-preview__icon-button' type='button' aria-label='Zoom in' title='Zoom in' disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}><Plus size={15} aria-hidden='true' /></button>
            <button className='source-preview__icon-button' type='button' aria-label='Reset zoom to fit width' title='Reset to fit width' onClick={resetZoom}><RotateCcw size={14} aria-hidden='true' /></button>
          </>}
          {asset && <>
            {!showUploaded && <span className='source-preview__toolbar-divider' aria-hidden='true' />}
            <a className='source-preview__icon-button' href={hasDemoAssets ? DEMO_CONTRACT_PDF : asset} target='_blank' rel='noopener noreferrer' aria-label={`Open ${activeLabel.toLowerCase()} in a new tab`} title='Open source in a new tab'><ExternalLink size={15} aria-hidden='true' /></a>
          </>}
        </div>
      </div>}

      {showUploaded && <p className='source-preview__upload-note'>Uploaded PDF preview only. Work-item values still come from the active project’s seeded schedule; this file has not been extracted.</p>}

      <div className='source-preview__reference' aria-live='polite'>
        <span className='source-preview__reference-tag'>{reference}</span>
        <span className='source-preview__reference-description'>{item?.description ?? 'Select a work item to compare with the project schedule.'}</span>
      </div>

      <div ref={viewportRef} className={`source-preview__viewport${showUploaded ? ' source-preview__viewport--pdf' : ''}`} tabIndex={0} role='region'
        aria-label={showUploaded ? 'Uploaded PDF preview' : showIllustrative ? 'Illustrative project schedule. Use zoom controls and scroll to inspect the rows.' : showImage ? `${document.label} image. Use zoom controls and scroll to inspect the source.` : 'Source document unavailable'}
        aria-busy={showImage && imageStatus === 'loading'}>
        {showUploaded ? <iframe className='source-preview__pdf' src={asset} title={`Uploaded PDF preview: ${filename}. Seeded work items have not changed.`} />
          : showIllustrative && rows.length > 0 ? (
            <div className='source-preview__page-space' style={{ width: `${zoom * 100}%`, aspectRatio: scheduleRatio }}>
              <div className='source-preview__page' style={{ width: `${100 / zoom}%`, transform: `scale(${zoom})` }}>
                <article ref={scheduleRef} className='source-preview__schedule'>
                  <p className='source-preview__schedule-label'>Illustrative demo schedule · not a supplied contract</p>
                  <h3>{contract?.name || contract?.projectName || 'Demo project'}</h3>
                  <dl className='source-preview__schedule-meta'>
                    <div><dt>Reference</dt><dd>{contract?.reference || contract?.id || 'Not specified'}</dd></div>
                    <div><dt>Date</dt><dd>{contract?.dateLabel || contract?.date || 'Not specified'}</dd></div>
                    {contract?.scope && <div className='source-preview__schedule-scope'><dt>Scope</dt><dd>{contract.scope}</dd></div>}
                  </dl>
                  <p className='source-preview__schedule-currency'>Rates and amounts in {contract?.currency || 'project currency'}.</p>
                  <table className='source-preview__schedule-table'>
                    <colgroup><col className='source-preview__col-id' /><col className='source-preview__col-ref' /><col className='source-preview__col-description' /><col className='source-preview__col-location' /><col className='source-preview__col-unit' /><col className='source-preview__col-number' /><col className='source-preview__col-number' /><col className='source-preview__col-amount' /></colgroup>
                    <thead><tr><th scope='col'>Item</th><th scope='col'>Ref.</th><th scope='col'>Description</th><th scope='col'>Location</th><th scope='col'>Unit</th><th scope='col'>Quantity</th><th scope='col'>Rate</th><th scope='col'>Amount</th></tr></thead>
                    <tbody>{rows.map((row) => <tr key={row.id} className={row.id === item?.id ? 'source-preview__schedule-row--selected' : undefined}>
                      <td>{row.id}</td><td>{row.ref || '—'}</td><td>{row.description || '—'}</td><td>{row.location || '—'}</td><td>{row.unit || '—'}</td><td className='source-preview__numeric'>{number(row.quantity)}</td><td className='source-preview__numeric'>{scheduleAmount(row, 'rate')}</td><td className='source-preview__numeric'>{scheduleAmount(row, 'amount')}</td>
                    </tr>)}</tbody>
                  </table>
                  <p className='source-preview__schedule-footnote'>{contract?.sampleNote || 'Invented rows for this project’s showcase. No supplied contract or AI extraction is represented.'}</p>
                </article>
              </div>
            </div>
          ) : !showImage ? (
            <div className='source-preview__status'><FileText size={28} aria-hidden='true' /><strong>{showIllustrative ? 'No illustrative schedule rows' : 'No source document available'}</strong><span>{showIllustrative ? 'The active project has no source rows to preview.' : 'A source document has not been supplied for this project. No other project’s document is shown.'}</span></div>
          ) : imageStatus === 'error' ? (
            <div className='source-preview__status' role='alert'><FileWarning size={28} aria-hidden='true' /><strong>Source image unavailable</strong><span>Try again, or open the source image in a new tab.</span><button type='button' className='source-preview__retry-button' onClick={retryImage}>Try again</button></div>
          ) : <>
            {imageStatus === 'loading' && <div className='source-preview__loading' role='status'><LoaderCircle size={17} aria-hidden='true' />Loading source image…</div>}
            <div className='source-preview__page-space' style={{ width: `${zoom * 100}%`, aspectRatio: imageRatio }}>
              <div className='source-preview__page' style={{ width: `${100 / zoom}%`, transform: `scale(${zoom})` }}>
                <img key={`${projectKey}-${activeType}-${retryVersion}`} className='source-preview__image' src={document.asset}
                  alt={hasDemoAssets ? `Fictional demo contract schedule, page 1. Locate source reference ${reference}.` : isSchedule ? `Original contract schedule${page ? `, PDF page ${page}${pageCount ? ` of ${pageCount}` : ''}` : ''}. Locate source reference ${reference}.` : 'Site plan reference. Area-to-item mapping is entered by a manager in this prototype.'}
                  draggable={false} onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    if (naturalWidth && naturalHeight) setImageRatio(naturalWidth / naturalHeight);
                    setImageStatus('ready');
                  }} onError={() => setImageStatus('error')} />
              </div>
            </div>
          </>}
      </div>

      <div className='source-preview__provenance'>
        <div className='source-preview__provenance-line'><FileText size={13} aria-hidden='true' /><span>{showUploaded ? 'Uploaded document · browser PDF preview' : hasDemoAssets ? 'Fictional demo PDF · page 1 of 1' : showIllustrative ? 'Illustrative demo schedule · active project only' : showImage ? isSchedule ? 'Original schedule image · printed page 1 of 1' : 'Drawing reference · manual area mapping' : 'No source preview · active project only'}</span></div>
        {compact ? <details className='source-preview__details'><summary>About this source</summary><p>{provenanceNote}</p></details> : <p>{provenanceNote}</p>}
      </div>
    </section>
  );
}

export default SourcePreview;
