import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CircleAlert, FileText, ImageOff, Info, MapPin, Minus, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { DEMO_DRAWING_ASSET, DEMO_DRAWING_FILENAME, getDrawingMapping, validateDrawingFile } from '../data/drawing-mapping.js';
import { getAreaProgress, getDrawingProgress } from '../data/drawing-progress.js';
import { clearFormBuffer } from '../data/form-buffer.js';
import { useBufferedState } from './useFormBuffer.js';
import { BackButton, Badge, Button, FormActions, FormField, Modal, PageHeader, formatTime } from './ui.jsx';
import './drawing-mapping.css';

const mimeFor = (file) => file.type || ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[file.name.split('.').at(-1)?.toLowerCase()] || '');
const clone = (value) => structuredClone(value);
const percentage = (value) => value == null ? '' : String(Math.round(value * 1000) / 10);
const formFor = (area) => ({ code: area?.code || '', name: area?.name || '', page: String(area?.page || 1), workItemIds: [...(area?.workItemIds || [])], pinX: percentage(area?.position?.x), pinY: percentage(area?.position?.y) });
const scopeFor = (drawing, area) => `drawing:area:${JSON.stringify([drawing.id, area?.id || 'new', area?.updatedAt || '', area ? formFor(area) : null])}`;
const positionFor = (form) => {
  if (form.pinX === '' || form.pinY === '') return null;
  const x = Number(form.pinX) / 100, y = Number(form.pinY) / 100;
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
};
const actionLabel = (action) => ({ addDrawing: 'Drawing added', replaceDrawing: 'Drawing replaced', addArea: 'Area added', updateArea: 'Area links updated', removeArea: 'Area removed' }[action] || 'Area mapping updated');
const sampleInput = () => ({ inputKind: 'sample', fileName: DEMO_DRAWING_FILENAME, fileSize: 0, mimeType: 'image/svg+xml' });
const completionText = (value) => `${Math.round(value * 10) / 10}%`;
const pinDetail = (progress) => !progress || !progress.totalCount ? 'Not linked' : progress.totalCount === 1 ? progress.items[0].completion === null ? 'Needs update' : completionText(progress.items[0].completion) : `${progress.completedCount}/${progress.totalCount} done`;

export function DrawingMappingView({ project, previewUrl, initialAreaId, onBack, onInstall, onSaveArea, onRemoveArea, onOpenProgress, onStartCompletionDemo, onPreviewFile }) {
  const mapping = getDrawingMapping(project);
  const drawing = mapping.drawing;
  const areas = mapping.areas || [];
  const [selectedId, setSelectedId] = useBufferedState(project.id, `drawing:selected:${drawing?.id || 'none'}`, () => initialAreaId || areas[0]?.id || 'new');
  const [editing, setEditing] = useBufferedState(project.id, `drawing:editing:${drawing?.id || 'none'}`, false);
  const [basis, setBasis] = useBufferedState(project.id, 'drawing:progress-basis', 'verified');
  const [modal, setModal] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [draftPosition, setDraftPosition] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const ownPreview = useRef('');
  const pinSetter = useRef(null);
  const editorRef = useRef(null);
  const areaPanelRef = useRef(null);
  const progressRef = useRef(null);
  const viewerRef = useRef(null);
  const [scrollTarget, setScrollTarget] = useState(null);
  const selected = selectedId === 'new' ? null : areas.find((area) => area.id === selectedId) || areas[0] || null;
  const asset = drawing?.kind === 'sample' ? DEMO_DRAWING_ASSET : previewUrl || localPreviewUrl;
  const hasImage = drawing && drawing.kind !== 'pdf';
  const mappedCount = areas.filter((area) => area.workItemIds.length > 0).length;
  const areaProgress = new Map(getDrawingProgress(project, basis).map((progress) => [progress.areaId, progress]));
  const selectedProgress = selected ? getAreaProgress(project, selected.id, basis) : null;
  const showEditor = selectedId === 'new' || !selected || editing;
  const basisLabel = basis === 'reported' ? 'Reported' : 'Verified';

  useEffect(() => () => { if (ownPreview.current) URL.revokeObjectURL(ownPreview.current); }, []);
  useEffect(() => { setImageFailed(false); setImageReady(false); setZoom(1); setPlacing(false); }, [drawing?.id, asset]);
  useEffect(() => {
    if (initialAreaId && areas.some((area) => area.id === initialAreaId)) setSelectedId(initialAreaId);
  }, [initialAreaId, drawing?.id]);
  useEffect(() => { setPlacing(false); pinSetter.current = null; }, [selected?.id, drawing?.id, showEditor]);
  useEffect(() => {
    if (!scrollTarget) return;
    (scrollTarget === 'editor' ? editorRef : scrollTarget === 'status' ? progressRef : areaPanelRef).current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setScrollTarget(null);
  }, [scrollTarget, selectedId, showEditor]);

  function rememberAreaRoute(areaId) {
    if (window.location.hash.split('?')[0] === '#drawing') window.history.replaceState(null, '', `#drawing${areaId && areaId !== 'new' ? `?area=${encodeURIComponent(areaId)}` : ''}`);
  }
  function chooseArea(areaId) {
    rememberAreaRoute(areaId);
    setSelectedId(areaId); setEditing(areaId === 'new'); setFeedback(null); setPlacing(false); setDraftPosition(null);
    if (window.matchMedia('(max-width: 1100px)').matches) setScrollTarget(areaId === 'new' ? 'editor' : 'status');
  }
  function placeAt(position) {
    pinSetter.current?.(position);
    setDraftPosition(position); setPlacing(false);
    editorRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function placeFromClick(event) {
    if (!placing || !imageReady || imageFailed) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    placeAt({ x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) });
  }
  function requestPin(setter) {
    pinSetter.current = setter; setPlacing(true); setFeedback(null);
    viewerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function savedArea(result, values) {
    const saved = getDrawingMapping(result.project || project).areas.find((area) => area.code.toUpperCase() === values.code.trim().toUpperCase());
    if (saved) { setSelectedId(saved.id); rememberAreaRoute(saved.id); }
    setFeedback({ message: result.outcome === 'unchanged' ? 'This area is already saved.' : `Area ${values.code.trim().toUpperCase()} saved. Its work links are ready to use.` });
    setPlacing(false); setEditing(false); setDraftPosition(null); setScrollTarget('status');
  }
  async function install(input) {
    const result = await onInstall?.(input);
    if (result?.outcome === 'invalid') return result;
    setModal(null); setFeedback({ message: drawing ? 'Drawing replaced. Check each area and place its pin again.' : 'Drawing added. Select an area to link its contract work.' });
    setSelectedId(''); rememberAreaRoute(null); setEditing(false); setPlacing(false); setDraftPosition(null);
    return result;
  }
  async function reattach(file) {
    const result = await onPreviewFile?.(file);
    if (result?.outcome === 'invalid') return result;
    if (!onPreviewFile) {
      if (ownPreview.current) URL.revokeObjectURL(ownPreview.current);
      ownPreview.current = URL.createObjectURL(file);
      setLocalPreviewUrl(ownPreview.current);
    }
    setModal(null); setFeedback({ message: 'Drawing preview restored. Area mappings are unchanged.' });
    return result;
  }
  async function removeSelected() {
    const result = await onRemoveArea?.(selected.id);
    if (result?.outcome === 'invalid') { setFeedback({ error: true, message: result.error }); setModal(null); return; }
    clearFormBuffer(project.id, scopeFor(drawing, selected));
    const remaining = getDrawingMapping(result?.project || project).areas;
    setSelectedId(remaining[0]?.id || 'new'); rememberAreaRoute(remaining[0]?.id); setEditing(false); setPlacing(false); setModal(null); setScrollTarget('areas');
    setFeedback({ message: `Area ${selected.code} removed. Existing messages and progress records are retained.` });
  }

  return <div className="drawing-mapping-view">
    <PageHeader title="Drawing & areas" description="See linked work progress on the plan, or edit the area mapping." onBack={onBack} backLabel="Back to contract" actions={drawing && <><Button icon={Upload} onClick={() => setModal('upload')}>Replace drawing</Button>{onOpenProgress && <Button icon={ArrowRight} onClick={() => onOpenProgress()}>View Progress</Button>}</>} />
    {feedback && <div className={`notice ${feedback.error ? 'warning' : 'success'}`} role={feedback.error ? 'alert' : 'status'}><Info size={16} /><span>{feedback.message}</span></div>}
    {!drawing ? <section className="drawing-empty-state"><div className="drawing-empty-icon"><MapPin size={30} /></div><h2>Add a site drawing</h2><p>Use your drawing or the fictional demo plan, then choose which work belongs to each area.</p><div className="drawing-empty-actions"><Button className="primary" icon={Upload} onClick={() => setModal('upload')}>Upload drawing</Button><Button icon={FileText} onClick={() => install(sampleInput())} disabled={!onInstall}>Use demo drawing</Button></div><small>PDF, PNG, JPEG or WebP up to 15 MB. No drawing recognition or measurement is performed.</small></section> : <>
      <div className="drawing-file-bar"><FileText size={18} /><div><strong>{drawing.fileName}</strong><span>{drawing.kind === 'sample' ? 'Fictional demo plan · not to scale' : 'Local drawing · manually mapped'} · {mappedCount} of {areas.length} areas linked</span></div><Badge tone={drawing.kind === 'sample' ? 'blue' : 'slate'}>{drawing.kind === 'sample' ? 'Demo drawing' : 'Local file'}</Badge></div>
      <div className="drawing-workspace">
        <section className="drawing-plan-panel" ref={viewerRef} aria-labelledby="drawing-plan-heading">
          <header className="drawing-panel-heading"><div><h2 id="drawing-plan-heading">Drawing</h2><p>{hasImage ? 'Select a pin or choose an area from the list.' : 'Link areas by name and PDF page.'}</p></div>{asset && <a className="button" href={asset} target="_blank" rel="noreferrer" aria-label="Open drawing in a new tab"><ArrowUpRight size={15} />Open drawing</a>}</header>
          <div className="drawing-progress-controls"><span>Show completion</span><div role="group" aria-label="Drawing completion basis"><Button className={basis === 'verified' ? 'primary' : ''} aria-pressed={basis === 'verified'} onClick={() => setBasis('verified')}>Verified</Button><Button className={basis === 'reported' ? 'primary' : ''} aria-pressed={basis === 'reported'} onClick={() => setBasis('reported')}>Reported</Button></div><p>{basis === 'verified' ? 'Checked by a supervisor.' : 'Reported from site; may still need supervisor review.'}</p></div>
          <div className="drawing-progress-legend" aria-label="Completion legend"><span><i className="not-started" />Not started</span><span><i className="in-progress" />In progress</span><span><i className="completed" />Completed</span><span><i className="unlinked" />Not linked</span><span><i className="unknown" />Needs update</span></div>
          {hasImage && asset && !imageFailed && <div className="drawing-plan-tools"><div><Button className="icon" aria-label="Zoom drawing out" disabled={zoom <= .75} onClick={() => setZoom((value) => Math.max(.75, value - .25))}><Minus size={15} /></Button><span>{Math.round(zoom * 100)}%</span><Button className="icon" aria-label="Zoom drawing in" disabled={zoom >= 2.5} onClick={() => setZoom((value) => Math.min(2.5, value + .25))}><Plus size={15} /></Button><Button className="icon" aria-label="Reset drawing zoom" onClick={() => setZoom(1)}><RotateCcw size={14} /></Button></div>{placing && <Button className="ghost" onClick={() => setPlacing(false)}>Cancel placement</Button>}</div>}
          {placing && <p className="drawing-placement-instruction" role="status"><MapPin size={15} />Click the drawing to place the pin, or enter its position in the form.</p>}
          {!asset || imageFailed ? <div className="drawing-preview-missing"><ImageOff size={30} /><h3>{imageFailed ? 'Drawing preview could not load' : 'Reselect the file to view this drawing'}</h3><p>Area names and work links are saved. Your selected file preview ends when the page is refreshed.</p>{imageFailed ? drawing.kind === 'sample' ? <Button onClick={() => { setImageFailed(false); setImageReady(false); }}>Try preview again</Button> : <Button onClick={() => setModal('upload')}>Choose another drawing</Button> : <Button onClick={() => setModal('reattach')}>Reselect drawing</Button>}</div> : drawing.kind === 'pdf' ? <><iframe className="drawing-pdf-preview" src={asset} title={`Drawing PDF preview: ${drawing.fileName}`} /><p className="drawing-viewer-note">For PDFs, link areas by name and page. Image plans support pins.</p></> : <div className="drawing-plan-scroll"><div className={`drawing-image-stage${placing ? ' is-placing' : ''}`} style={{ width: `${zoom * 100}%` }} onClick={placeFromClick} role={placing ? 'button' : undefined} tabIndex={placing ? 0 : undefined} aria-label={placing ? 'Drawing pin placement. Click a position, press Enter for the centre, or enter a position in the form.' : undefined} onKeyDown={(event) => { if (placing && event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); placeAt({ x: .5, y: .5 }); } }}>
            <img src={asset} alt={drawing.kind === 'sample' ? 'Fictional warehouse site plan, with Blocks A and B and areas A1, A2, B1 and B2. Not to scale.' : `Selected site drawing: ${drawing.fileName}`} onLoad={() => setImageReady(true)} onError={() => { setImageFailed(true); setPlacing(false); }} draggable={false} />
            {imageReady && areas.filter((area) => area.position).map((area) => {
              const progress = areaProgress.get(area.id);
              return <button key={area.id} type="button" className={`drawing-pin status-${progress?.status || 'unlinked'}${area.id === selected?.id ? ' selected' : ''}`} style={{ left: `${area.position.x * 100}%`, top: `${area.position.y * 100}%` }} aria-label={`Select area ${area.code}: ${area.name}. ${basisLabel}: ${progress?.label || 'Not linked'}, ${pinDetail(progress)}`} aria-pressed={area.id === selected?.id} onClick={(event) => { event.stopPropagation(); chooseArea(area.id); }}><MapPin size={16} /><span><strong>{area.code}</strong><small>{pinDetail(progress)}</small></span></button>;
            })}
            {imageReady && draftPosition && <span className="drawing-pin draft" style={{ left: `${draftPosition.x * 100}%`, top: `${draftPosition.y * 100}%` }}><MapPin size={16} /><span>{selected?.code || 'New area'}</span></span>}
          </div></div>}
          <p className="drawing-viewer-note">Colours show {basisLabel.toLowerCase()} completion of whole linked work items. The same item can appear in several areas. Area quantities are not measured; mapping does not change progress or claims.</p>
        </section>
        <section className="drawing-area-panel" ref={areaPanelRef} aria-labelledby="drawing-areas-heading">
          <header className="drawing-panel-heading"><div><h2 id="drawing-areas-heading">Site areas</h2><p>{basisLabel} completion · Select an area for details.</p></div><Button icon={Plus} onClick={() => chooseArea('new')}>Add area</Button></header>
          <div className="drawing-area-list" aria-label="Mapped site areas">{areas.length ? areas.map((area) => {
            const progress = areaProgress.get(area.id);
            return <button type="button" key={area.id} className={`drawing-area-row${selected?.id === area.id && selectedId !== 'new' ? ' selected' : ''}`} aria-pressed={selected?.id === area.id && selectedId !== 'new'} onClick={() => chooseArea(area.id)}><span className="drawing-area-code">{area.code}</span><span className="drawing-area-copy"><strong>{area.name}</strong><small>{area.workItemIds.length ? `${area.workItemIds.length} linked work item${area.workItemIds.length === 1 ? '' : 's'} · ${pinDetail(progress)}` : 'Choose contract work items'}{drawing.kind === 'pdf' ? ` · Page ${area.page}` : !area.position ? ' · Pin not placed' : ''}</small></span><Badge tone={progress?.tone}>{progress?.label || 'Not linked'}</Badge></button>;
          }) : <p className="drawing-no-areas">No areas yet. Add the first area and choose its contract work.</p>}</div>
          {showEditor ? <AreaMappingEditor key={`${drawing.id}:${selected?.id || 'new'}:${selected?.updatedAt || ''}`} project={project} drawing={drawing} area={selectedId === 'new' ? null : selected} onSave={onSaveArea} onSaved={savedArea} onRemove={() => setModal('remove')} onRequestPin={requestPin} canPlacePin={Boolean(hasImage && asset && imageReady && !imageFailed)} onDraftPosition={setDraftPosition} editorRef={editorRef} onCancel={() => { if (selectedId === 'new') setSelectedId(areas[0]?.id || 'new'); setEditing(false); setPlacing(false); setDraftPosition(null); setScrollTarget(selected ? 'status' : 'areas'); }} /> : <AreaProgressSummary area={selected} progress={selectedProgress} basisLabel={basisLabel} summaryRef={progressRef} onEdit={() => { setEditing(true); setScrollTarget('editor'); }} onOpenProgress={onOpenProgress} />}
        </section>
      </div>
      {mapping.history?.length > 0 && <details className="drawing-history"><summary>Mapping history · {mapping.history.length} {mapping.history.length === 1 ? 'action' : 'actions'}</summary><ol>{mapping.history.map((entry, index) => <li key={entry.id || index}><strong>{actionLabel(entry.action)}{entry.area?.code || entry.previousArea?.code ? ` · ${entry.area?.code || entry.previousArea.code}` : ''}</strong>{entry.detail && <p>{entry.detail}</p>}{entry.date && <time dateTime={entry.date}>{formatTime(entry.date)}</time>}</li>)}</ol></details>}
    </>}
    {onStartCompletionDemo && <div className="drawing-completion-demo"><div><strong>See completion on a plan</strong><p>Opens a separate demo project with all three statuses.</p></div><Button className="ghost" icon={ArrowRight} onClick={onStartCompletionDemo}>Try completion demo</Button></div>}
    <p className="drawing-local-note">Demo · Mappings stay with this project in this browser. No AI, measurement or backend service is connected.</p>
    {(modal === 'upload' || modal === 'reattach') && <DrawingFileModal currentDrawing={drawing} reattach={modal === 'reattach'} onClose={() => setModal(null)} onInstall={install} onReattach={reattach} />}
    {modal === 'remove' && selected && <Modal title={`Remove area ${selected.code}?`} onClose={() => setModal(null)} footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button className="danger" icon={Trash2} onClick={removeSelected}>Remove area</Button></>}><p>Remove this area and its work-item links from the current drawing. Existing messages, progress, contract values and claim records are kept.</p></Modal>}
  </div>;
}

function AreaProgressSummary({ area, progress, basisLabel, summaryRef, onEdit, onOpenProgress }) {
  if (!area || !progress) return null;
  return <section className="drawing-area-progress" ref={summaryRef} aria-label={`Area ${area.code} completion`}>
    <div className="drawing-progress-heading"><div><h3>{area.code} · {area.name}</h3><p>{basisLabel} completion</p></div><Badge tone={progress.tone}>{progress.label}</Badge></div>
    {progress.totalCount ? <>
      <p className="drawing-progress-summary">{progress.summary}</p>
      <ul className="drawing-progress-items">{progress.items.map((item) => <li key={item.id}><div><strong>{item.description}</strong><small>{item.id}</small>{item.reported !== item.verified && <small>Reported {item.reported === null ? 'Not recorded' : completionText(item.reported)} · Verified {item.verified === null ? 'Not recorded' : completionText(item.verified)}</small>}</div><span className={`drawing-item-completion status-${item.status}`}><strong>{item.completion === null ? '—' : completionText(item.completion)}</strong><small>{item.label}</small></span></li>)}</ul>
      {progress.unknownCount > 0 && <p className="drawing-progress-help">{progress.unknownCount} work item{progress.unknownCount === 1 ? ' needs' : 's need'} a {basisLabel.toLowerCase()} completion update.</p>}
    </> : <p className="drawing-progress-help">Link contract work items to show their completion here.</p>}
    <p className="drawing-progress-help">This shows whole linked work items, not a measured percentage of this area.</p>
    <div className="drawing-progress-actions"><Button onClick={onEdit}>Edit area mapping</Button>{onOpenProgress && progress.totalCount > 0 && <Button icon={ArrowRight} onClick={() => onOpenProgress(area.id)}>View in Progress</Button>}</div>
  </section>;
}

function AreaMappingEditor({ project, drawing, area, onSave, onSaved, onRemove, onRequestPin, canPlacePin, onDraftPosition, editorRef, onCancel }) {
  const scope = scopeFor(drawing, area);
  const initial = formFor(area);
  const [form, setForm] = useBufferedState(project.id, scope, () => clone(initial));
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const position = drawing.kind === 'pdf' ? null : positionFor(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const moved = form.pinX !== initial.pinX || form.pinY !== initial.pinY; onDraftPosition(moved ? position : null); }, [form.pinX, form.pinY, initial.pinX, initial.pinY, drawing.id]);
  useEffect(() => { if (errorField) formRef.current?.querySelector(`[name="${errorField}"]`)?.focus(); }, [error, errorField]);
  const change = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setError(''); setErrorField(''); };
  function problem(message, field = 'code') { setError(message); setErrorField(field); formRef.current?.querySelector(`[name="${field}"]`)?.focus(); }
  async function save(event) {
    event.preventDefault();
    if (busyRef.current || !onSave) return;
    if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/i.test(form.code.trim())) return problem('Enter an area code using up to 20 letters, numbers, hyphens or underscores.');
    if (!form.name.trim()) return problem('Enter a name for this area.', 'name');
    if (drawing.kind === 'pdf' && (!Number.isInteger(Number(form.page)) || Number(form.page) < 1 || Number(form.page) > 999)) return problem('Enter a PDF page from 1 to 999.', 'page');
    if (drawing.kind !== 'pdf' && ((form.pinX === '') !== (form.pinY === '') || ((form.pinX !== '' || form.pinY !== '') && !position))) return problem('Enter both pin positions from 0 to 100%, or leave both blank.', 'pinX');
    const values = { areaId: area?.id || '', drawingId: drawing.id, code: form.code.trim().toUpperCase(), name: form.name.trim(), page: drawing.kind === 'pdf' ? Number(form.page) : 1, position, workItemIds: [...form.workItemIds] };
    busyRef.current = true; setBusy(true); setError(''); setErrorField('');
    try {
      const result = await onSave(values);
      if (result?.outcome === 'invalid') { if (mounted.current) problem(result.error || 'Check the area details before saving.'); return; }
      clearFormBuffer(project.id, scope);
      if (mounted.current && result?.outcome === 'unchanged') setForm(clone(initial));
      onSaved(result || {}, values);
    } catch { if (mounted.current) problem('This area could not be saved. Please try again.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  return <form className="drawing-area-editor" onSubmit={save} ref={(node) => { formRef.current = node; editorRef.current = node; }} noValidate>
    <div className="drawing-editor-heading"><h3>{area ? `Area ${area.code}` : 'New area'}</h3>{area && <Button className="ghost" icon={Trash2} onClick={onRemove}>Remove</Button>}</div>
    {dirty && <p className="drawing-unsaved-note" role="status">Unfinished edits stay while you browse. Save before refreshing.</p>}
    <div className="drawing-form-grid">
      <FormField label="Area code" required error={errorField === 'code' ? error : undefined} hint="Use the same code in site updates, e.g. A1."><input name="code" className="form-input" value={form.code} maxLength={20} onChange={(event) => change('code', event.target.value.toUpperCase())} placeholder="e.g. A1" /></FormField>
      {drawing.kind === 'pdf' && <FormField label="Drawing page" required error={errorField === 'page' ? error : undefined}><input name="page" className="form-input" type="number" min="1" max="999" step="1" value={form.page} onChange={(event) => change('page', event.target.value)} /></FormField>}
      <FormField label="Area name" required className="drawing-field-full" error={errorField === 'name' ? error : undefined}><input name="name" className="form-input" value={form.name} maxLength={100} onChange={(event) => change('name', event.target.value)} placeholder="e.g. Block A - west wall" /></FormField>
    </div>
    {drawing.kind !== 'pdf' && <div className="drawing-pin-editor"><div><MapPin size={16} /><span>{position ? `Pin at ${percentage(position.x)}% across, ${percentage(position.y)}% down` : 'Pin not placed'}</span><Button onClick={() => onRequestPin((next) => setForm((current) => ({ ...current, pinX: percentage(next.x), pinY: percentage(next.y) })))} disabled={!canPlacePin}>{position ? 'Move pin' : 'Place pin'}</Button></div><details open={errorField === 'pinX' ? true : undefined}><summary>Enter a position instead</summary><div className="drawing-form-grid"><FormField label="Across drawing" suffix="%" error={errorField === 'pinX' ? error : undefined}><input name="pinX" className="form-input" type="number" min="0" max="100" step="any" value={form.pinX} onChange={(event) => change('pinX', event.target.value)} /></FormField><FormField label="Down drawing" suffix="%"><input name="pinY" className="form-input" type="number" min="0" max="100" step="any" value={form.pinY} onChange={(event) => change('pinY', event.target.value)} /></FormField></div>{position && <Button className="ghost" onClick={() => setForm((current) => ({ ...current, pinX: '', pinY: '' }))}>Clear pin position</Button>}</details></div>}
    <fieldset className="drawing-work-choices"><legend>Linked contract work</legend><p>Select the work done in this area. One area can link to more than one item.</p>{project.items?.length ? project.items.map((item) => <label className="drawing-work-choice" key={item.id}><input type="checkbox" checked={form.workItemIds.includes(item.id)} onChange={(event) => change('workItemIds', event.target.checked ? [...form.workItemIds, item.id] : form.workItemIds.filter((id) => id !== item.id))} /><span><strong>{item.description}</strong><small>{item.id} · {item.ref} · {item.location}</small></span></label>) : <div className="notice warning"><CircleAlert size={16} /><span>No contract work is available. Add the contract first; you can still save this area without work links.</span></div>}</fieldset>
    {error && !['code', 'name', 'page', 'pinX'].includes(errorField) && <p className="form-error" role="alert">{error}</p>}
    <FormActions secondary={<BackButton onClick={onCancel}>{area ? 'Back to area status' : 'Back to areas'}</BackButton>}><Button className="primary" type="submit" icon={Save} disabled={busy || !onSave}>{busy ? 'Saving…' : 'Save area'}</Button></FormActions>
  </form>;
}

function DrawingFileModal({ currentDrawing, reattach, onClose, onInstall, onReattach }) {
  const [file, setFile] = useState(null);
  const [sample, setSample] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current += 1; }; }, []);
  async function choose(next) {
    if (!next) return;
    const token = ++sequence.current; setChecking(true); setFile(null); setSample(false); setError('');
    const issue = await validateDrawingFile(next);
    if (!mounted.current || token !== sequence.current) return;
    if (issue) { setError(issue); setChecking(false); return; }
    if (reattach && (next.name !== currentDrawing.fileName || (currentDrawing.fileSize > 0 && next.size !== currentDrawing.fileSize) || mimeFor(next) !== currentDrawing.mimeType)) { setError('Select the same drawing file to restore its preview. Use Replace drawing to choose a different file.'); setChecking(false); return; }
    setFile(next); setChecking(false);
  }
  async function apply() {
    if ((!file && !sample) || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = reattach ? await onReattach(file) : await onInstall(sample ? sampleInput() : { inputKind: 'upload', fileName: file.name, fileSize: file.size, mimeType: mimeFor(file), file });
      if (mounted.current && result?.outcome === 'invalid') setError(result.error || 'The drawing could not be added.');
    } catch { if (mounted.current) setError('The drawing could not be opened. Choose another file and try again.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  return <Modal title={reattach ? 'Restore drawing preview' : currentDrawing ? 'Replace drawing' : 'Upload a drawing'} description={reattach ? 'Area mappings stay saved. Select the same file to view it again.' : 'The file stays in this browser. Area links are entered manually.'} onClose={onClose} footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button className="primary" icon={Upload} onClick={apply} disabled={busy || checking || (!file && !sample)}>{busy ? 'Opening…' : reattach ? 'Restore preview' : currentDrawing ? 'Replace drawing' : 'Use drawing'}</Button></>}>
    <div className="drawing-upload-content"><FormField label="Drawing file" hint="PDF, PNG, JPEG or WebP up to 15 MB." error={error}><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => choose(event.target.files?.[0])} disabled={checking || busy} /></FormField>{checking && <p role="status">Checking drawing…</p>}{!reattach && <div className="drawing-demo-option"><div><strong>Try the fictional site plan</strong><p>Four named areas, ready to link to your work items.</p></div><Button icon={MapPin} onClick={() => { sequence.current += 1; setSample(true); setFile(null); setChecking(false); setError(''); }}>Use demo drawing</Button></div>}{(file || sample) && <div className="drawing-chosen-file"><FileText size={18} /><strong>{sample ? DEMO_DRAWING_FILENAME : file.name}</strong><Badge tone="blue">Selected</Badge></div>}{currentDrawing && !reattach && <div className="notice warning"><Info size={16} /><span>Existing area names and work links will stay. Their pin positions will be cleared so you can place them on this drawing again.</span></div>}<p className="drawing-upload-help">Image plans support pins. For PDFs, link areas by name and page. No AI or drawing measurement is connected.</p></div>
  </Modal>;
}
