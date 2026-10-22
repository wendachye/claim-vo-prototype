import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CircleAlert, FileText, Flag, ImageOff, Info, MapPin, MessageSquare, Minus, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { DEMO_DRAWING_FILENAME, getDrawingAsset, getDrawingMapping, getProvidedDrawingSource, validateDrawingFile } from '../data/drawing-mapping.js';
import { getAreaProgress, getDrawingProgress } from '../data/drawing-progress.js';
import { getAreaVOFlags, getDrawingVOFlags } from '../data/drawing-vo.js';
import { getSITAreaUpdate } from '../data/sit-area-update.js';
import { getSITAreaDefinitions, getSITAreaExclusions } from '../data/sit-area-definitions.js';
import { getSITAreaMessageUpdate } from '../data/sit-area-messages.js';
import { getAreaEvidence } from '../data/drawing-evidence.js';
import { clearFormBuffer } from '../data/form-buffer.js';
import { useBufferedState } from './useFormBuffer.js';
import { AreaEvidencePanel } from './AreaEvidencePanel.jsx';
import { AreaVOPanel } from './AreaVOPanel.jsx';
import { BackButton, Badge, Button, FormActions, FormField, Modal, PageHeader, formatTime, Checkbox, Input, NativeSelect } from './ui.jsx';
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
const voDescription = (flags) => flags?.markerLabel ? `Extra work: ${flags.markerLabel}` : 'No active extra-work flags';

export function DrawingMappingView({ project, previewUrl, initialAreaId, onBack, onInstall, onSaveArea, onAddContractAreas, onAddAreaMessages, onOpenSiteUpdates, onRemoveArea, onOpenProgress, onOpenContractItem, onOpenEvidence, onOpenVO, onStartCompletionDemo, onPreviewFile }) {
  const mapping = getDrawingMapping(project);
  const drawing = mapping.drawing;
  const areas = mapping.areas || [];
  const [selectedId, setSelectedId] = useBufferedState(project.id, `drawing:selected:${drawing?.id || 'none'}`, () => initialAreaId || areas[0]?.id || 'new');
  const [editing, setEditing] = useBufferedState(project.id, `drawing:editing:${drawing?.id || 'none'}`, false);
  const [basis, setBasis] = useBufferedState(project.id, 'drawing:progress-basis', 'verified');
  const [modal, setModal] = useState(null);
  const [browseAreas, setBrowseAreas] = useState(false);
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
  const areaNavigationRef = useRef(null);
  const areaPickerRef = useRef(null);
  const progressRef = useRef(null);
  const viewerRef = useRef(null);
  const [scrollTarget, setScrollTarget] = useState(null);
  const selected = selectedId === 'new' ? null : areas.find((area) => area.id === selectedId) || (!selectedId ? areas[0] : null) || null;
  const unavailableArea = Boolean(selectedId && selectedId !== 'new' && !selected);
  const providedSource = drawing?.inputKind === 'provided' ? getProvidedDrawingSource(project) : null;
  const suppliedReference = Boolean(providedSource && project.contract?.sourceKind === 'provided');
  const contractAreaUpdate = getSITAreaUpdate(project);
  const areaMessageUpdate = getSITAreaMessageUpdate(project);
  const linkedItemCount = new Set(areas.flatMap((area) => area.workItemIds)).size;
  const permanentAsset = getDrawingAsset(project, drawing);
  const asset = permanentAsset || previewUrl || localPreviewUrl;
  const hasImage = drawing && drawing.kind !== 'pdf';
  const mappedCount = areas.filter((area) => area.workItemIds.length > 0).length;
  const areaProgress = new Map(getDrawingProgress(project, basis).map((progress) => [progress.areaId, progress]));
  const selectedProgress = selected ? getAreaProgress(project, selected.id, basis) : null;
  const areaVOFlags = new Map(getDrawingVOFlags(project).map((flags) => [flags.areaId, flags]));
  const selectedVOFlags = selected ? getAreaVOFlags(project, selected.id) : null;
  const selectedEvidence = selected ? getAreaEvidence(project, selected.id) : null;
  const showEditor = selectedId === 'new' || !selected || editing;
  const basisLabel = basis === 'reported' ? 'Reported' : 'Verified';

  useEffect(() => () => { if (ownPreview.current) URL.revokeObjectURL(ownPreview.current); }, []);
  useEffect(() => { setImageFailed(false); setImageReady(false); setZoom(1); setPlacing(false); }, [drawing?.id, asset]);
  useEffect(() => {
    if (initialAreaId) setSelectedId(initialAreaId);
  }, [initialAreaId, drawing?.id]);
  useEffect(() => { setPlacing(false); pinSetter.current = null; }, [selected?.id, drawing?.id, showEditor]);
  useEffect(() => {
    if (!scrollTarget) return;
    (scrollTarget === 'editor' ? editorRef : scrollTarget === 'status' ? progressRef : scrollTarget === 'areas' ? areaNavigationRef : areaPanelRef).current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (scrollTarget === 'areas') areaPickerRef.current?.focus({ preventScroll: true });
    setScrollTarget(null);
  }, [scrollTarget, selectedId, showEditor]);

  function rememberAreaRoute(areaId) {
    if (window.location.hash.split('?')[0] === '#drawing') window.history.replaceState(null, '', `#drawing${areaId && areaId !== 'new' ? `?area=${encodeURIComponent(areaId)}` : ''}`);
  }
  function chooseArea(areaId, fromPin = false) {
    rememberAreaRoute(areaId);
    setSelectedId(areaId); setEditing(areaId === 'new'); setFeedback(null); setPlacing(false); setDraftPosition(null); setBrowseAreas(false);
    if (areaId === 'new' || (fromPin && window.matchMedia('(max-width: 1100px)').matches)) setScrollTarget(areaId === 'new' ? 'editor' : 'status');
  }
  function addContractAreas() {
    const result = onAddContractAreas?.();
    if (!result) return;
    setFeedback({ error: result.outcome === 'unavailable', message: result.outcome === 'updated'
      ? `${result.itemCount} contract items linked in ${result.areaCount} added areas. Detailed positions need confirmation.`
      : result.outcome === 'unchanged' ? 'The available contract area links are already saved.'
        : result.error || 'These source area links are unavailable for this drawing.' });
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
    <PageHeader title="Drawing & areas" description="Choose a site area, then open the contract work linked to it." onBack={onBack} backLabel="Back to contract" actions={drawing && onOpenSiteUpdates && <Button icon={ArrowRight} onClick={onOpenSiteUpdates}>Site updates</Button>} />
    {feedback && <div className={`notice ${feedback.error ? 'warning' : 'success'}`} role={feedback.error ? 'alert' : 'status'}><Info size={16} /><span>{feedback.message}</span></div>}
    {!drawing ? <section className="drawing-empty-state"><div className="drawing-empty-icon"><MapPin size={30} /></div><h2>Add a site drawing</h2><p>Use your drawing or the fictional demo plan, then choose which work belongs to each area.</p><div className="drawing-empty-actions"><Button className="primary" icon={Upload} onClick={() => setModal('upload')}>Upload drawing</Button><Button icon={FileText} onClick={() => install(sampleInput())} disabled={!onInstall}>Use demo drawing</Button></div><small>PDF, PNG, JPEG or WebP up to 15 MB. No drawing recognition or measurement is performed.</small></section> : <>
      {areas.length > 0 && <section className="drawing-area-navigation" ref={areaNavigationRef} aria-label="Choose a site area"><div className="drawing-area-navigation-top"><div className="drawing-area-picker"><FormField label="Site area"><NativeSelect ref={areaPickerRef} aria-label="Choose site area" value={selectedId === 'new' || unavailableArea ? '' : selected?.id || ''} onChange={(event) => chooseArea(event.target.value)}><option value="" disabled>Choose a site area</option>{areas.map((area) => {
            return <option key={area.id} value={area.id}>{area.code} · {area.name}</option>;
          })}</NativeSelect></FormField></div><Button icon={Plus} onClick={() => chooseArea('new')}>Add area</Button></div><details className="drawing-area-browser" open={browseAreas} onToggle={(event) => setBrowseAreas(event.currentTarget.open)}><summary>Browse all {areas.length} {areas.length === 1 ? 'area' : 'areas'}<span>{basisLabel} completion</span></summary>
          <div className="drawing-area-list" aria-label="Mapped site areas">{areas.map((area) => {
            const progress = areaProgress.get(area.id);
            const flags = areaVOFlags.get(area.id);
            const references = area.workItemIds.map((id) => project.items?.find((item) => item.id === id)).filter(Boolean).map((item) => item.ref || item.id).join(' · ');
            return <button type="button" key={area.id} className={`drawing-area-row${selected?.id === area.id && selectedId !== 'new' ? ' selected' : ''}`} aria-label={`Area ${area.code}: ${area.name}.${references ? ` Contract: ${references}.` : ''} ${basisLabel}: ${progress?.label || 'Not linked'}, ${pinDetail(progress)}. ${voDescription(flags)}`} aria-pressed={selected?.id === area.id && selectedId !== 'new'} onClick={() => chooseArea(area.id)}><span className="drawing-area-code">{area.code}<AreaVOMarker flags={flags} /></span><span className="drawing-area-copy"><strong>{area.name}</strong>{references && <small>Contract: {references}</small>}<small>{area.workItemIds.length ? `${area.workItemIds.length} linked work item${area.workItemIds.length === 1 ? '' : 's'} · ${pinDetail(progress)}` : 'Choose contract work items'}{drawing.kind === 'pdf' ? ` · Page ${area.page}` : !area.position ? ' · Pin not placed' : ''}</small></span><Badge tone={progress?.tone}>{progress?.label || 'Not linked'}</Badge></button>;
          })}</div></details></section>}
      <div className="drawing-workspace">
        <section className="drawing-plan-panel" ref={viewerRef} aria-labelledby="drawing-plan-heading">
          <header className="drawing-panel-heading"><div><h2 id="drawing-plan-heading">Drawing</h2><p>{providedSource ? 'Illustrative pins · exact positions unconfirmed.' : hasImage ? 'Select a pin to see its linked work.' : 'Link areas by name and PDF page.'}</p></div>{asset && <a className="button" href={asset} target="_blank" rel="noreferrer" aria-label="Open drawing in a new tab"><ArrowUpRight size={15} />Open drawing</a>}</header>
          <div className="drawing-progress-controls"><span>Completion</span><div role="group" aria-label="Drawing completion basis"><Button className={basis === 'verified' ? 'primary' : ''} aria-pressed={basis === 'verified'} onClick={() => setBasis('verified')}>Verified</Button><Button className={basis === 'reported' ? 'primary' : ''} aria-pressed={basis === 'reported'} onClick={() => setBasis('reported')}>Reported</Button></div><p>{basis === 'verified' ? 'Checked by a supervisor.' : 'Reported from site; may still need supervisor review.'}</p></div>
          <div className="drawing-progress-legend" aria-label="Completion and extra-work legend"><span><i className="not-started" />Not started</span><span><i className="in-progress" />In progress</span><span><i className="completed" />Completed</span><span><i className="unlinked" />Not linked</span><span><i className="unknown" />Needs update</span><span className="drawing-vo-legend"><Flag size={11} />Extra work to review</span><span className="drawing-vo-legend approved"><Check size={11} />Approved VO</span></div>
          {hasImage && asset && !imageFailed && <div className="drawing-plan-tools"><div><Button className="icon" aria-label="Zoom drawing out" disabled={zoom <= .75} onClick={() => setZoom((value) => Math.max(.75, value - .25))}><Minus size={15} /></Button><span>{Math.round(zoom * 100)}%</span><Button className="icon" aria-label="Zoom drawing in" disabled={zoom >= 2.5} onClick={() => setZoom((value) => Math.min(2.5, value + .25))}><Plus size={15} /></Button><Button className="icon" aria-label="Reset drawing zoom" disabled={zoom === 1} onClick={() => setZoom(1)}><RotateCcw size={14} /></Button></div>{placing && <Button className="ghost" onClick={() => setPlacing(false)}>Cancel placement</Button>}</div>}
          {placing && <p className="drawing-placement-instruction" role="status"><MapPin size={15} />Click the drawing to place the pin, or enter its position in the form.</p>}
          {!asset || imageFailed ? <div className="drawing-preview-missing"><ImageOff size={30} /><h3>{imageFailed ? 'Drawing preview could not load' : 'Reselect the file to view this drawing'}</h3><p>{permanentAsset ? 'Area names and work links are saved. Try opening the bundled drawing again.' : 'Area names and work links are saved. Your selected file preview ends when the page is refreshed.'}</p>{imageFailed ? permanentAsset ? <Button onClick={() => { setImageFailed(false); setImageReady(false); }}>Try preview again</Button> : <Button onClick={() => setModal('upload')}>Choose another drawing</Button> : <Button onClick={() => setModal('reattach')}>Reselect drawing</Button>}</div> : drawing.kind === 'pdf' ? <><iframe className="drawing-pdf-preview" src={asset} title={`Drawing PDF preview: ${drawing.fileName}`} /><p className="drawing-viewer-note">For PDFs, link areas by name and page. Image plans support pins.</p></> : <div className="drawing-plan-scroll"><div className={`drawing-image-stage${placing ? ' is-placing' : ''}`} style={{ width: `${zoom * 100}%` }} onClick={placeFromClick} role={placing ? 'button' : undefined} tabIndex={placing ? 0 : undefined} aria-label={placing ? 'Drawing pin placement. Click a position, press Enter for the centre, or enter a position in the form.' : undefined} onKeyDown={(event) => { if (placing && event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); placeAt({ x: .5, y: .5 }); } }}>
            <img src={asset} alt={drawing.kind === 'sample' ? 'Fictional warehouse site plan, with Blocks A and B and areas A1, A2, B1 and B2. Not to scale.' : providedSource ? `${suppliedReference ? 'Provided' : 'Fictional demo'} site drawing: ${drawing.fileName}. Area pins are illustrative manual links.` : `Selected site drawing: ${drawing.fileName}`} onLoad={() => setImageReady(true)} onError={() => { setImageFailed(true); setPlacing(false); }} draggable={false} />
            {imageReady && areas.filter((area) => area.position).map((area) => {
              const progress = areaProgress.get(area.id);
              const flags = areaVOFlags.get(area.id);
              return <button key={area.id} type="button" className={`drawing-pin status-${progress?.status || 'unlinked'}${area.id === selected?.id ? ' selected' : ''}`} style={{ left: `${area.position.x * 100}%`, top: `${area.position.y * 100}%` }} aria-label={`Select area ${area.code}: ${area.name}. ${basisLabel}: ${progress?.label || 'Not linked'}, ${pinDetail(progress)}. ${voDescription(flags)}`} aria-pressed={area.id === selected?.id} onClick={(event) => { event.stopPropagation(); chooseArea(area.id, true); }}><MapPin size={16} /><span><strong>{area.code}</strong><small>{pinDetail(progress)}</small></span><AreaVOMarker flags={flags} /></button>;
            })}
            {imageReady && draftPosition && <span className="drawing-pin draft" style={{ left: `${draftPosition.x * 100}%`, top: `${draftPosition.y * 100}%` }}><MapPin size={16} /><span>{selected?.code || 'New area'}</span></span>}
          </div></div>}
          <details className="drawing-legend-details"><summary>About completion &amp; area links</summary><p>Colours show {basisLabel.toLowerCase()} totals for whole work items. Shared items show the same progress in each area. Mapping does not measure area quantities or change claims.</p></details>
        </section>
        <section className="drawing-area-panel" ref={areaPanelRef} aria-labelledby="drawing-areas-heading">
          <header className="drawing-panel-heading"><div><h2 id="drawing-areas-heading">{showEditor && !unavailableArea ? 'Area mapping' : 'Linked contract items'}</h2><p>{selected ? `${selected.code} · ${selected.name}` : 'Choose which contract work belongs to a site area.'}</p></div>{!areas.length && <Button icon={Plus} onClick={() => chooseArea('new')}>Add area</Button>}</header>
          {!areas.length && <p className="drawing-no-areas">No areas yet. Add the first area and choose its contract work.</p>}
          {unavailableArea ? <div className="drawing-area-unavailable" role="status"><CircleAlert size={22} /><p>This site area is not available in the selected project.</p><Button onClick={() => { setBrowseAreas(true); setScrollTarget('areas'); }}>Choose another area</Button></div> : showEditor ? <AreaMappingEditor key={`${drawing.id}:${selected?.id || 'new'}:${selected?.updatedAt || ''}`} project={project} drawing={drawing} area={selectedId === 'new' ? null : selected} onSave={onSaveArea} onSaved={savedArea} onRemove={() => setModal('remove')} onRequestPin={requestPin} canPlacePin={Boolean(hasImage && asset && imageReady && !imageFailed)} onDraftPosition={setDraftPosition} editorRef={editorRef} onCancel={() => { if (selectedId === 'new') { setSelectedId(areas[0]?.id || 'new'); rememberAreaRoute(areas[0]?.id); } setEditing(false); setPlacing(false); setDraftPosition(null); setScrollTarget(selected ? 'status' : 'areas'); }} /> : <><AreaProgressSummary project={project} area={selected} progress={selectedProgress} basisLabel={basisLabel} summaryRef={progressRef} onEdit={() => { setEditing(true); setScrollTarget('editor'); }} onOpenProgress={onOpenProgress} onOpenContractItem={onOpenContractItem} /><details className="drawing-related-section" key={`vo:${project.id}:${selected.id}`}><summary><Flag size={15} /><span>Extra work</span><small>{selectedVOFlags?.markerLabel || (selectedVOFlags?.totalCount ? `${selectedVOFlags.totalCount} in history` : 'None flagged')}</small></summary><AreaVOPanel area={selected} flags={selectedVOFlags} onOpenVO={onOpenVO} onOpenEvidence={onOpenEvidence} />{!selectedVOFlags?.totalCount && !selectedVOFlags?.newMessageCount && <p className="drawing-related-empty">No extra work flagged for this area.</p>}</details><details className="drawing-related-section" key={`evidence:${project.id}:${selected.id}`}><summary><MessageSquare size={15} /><span>Site updates &amp; photos</span><small>{selectedEvidence?.messageCount || 0} {selectedEvidence?.messageCount === 1 ? 'update' : 'updates'} · {selectedEvidence?.photoCount || 0} {selectedEvidence?.photoCount === 1 ? 'photo' : 'photos'}</small></summary><AreaEvidencePanel project={project} area={selected} onOpenEvidence={onOpenEvidence} /></details></>}
        </section>
      </div>
      <details className="drawing-setup">
        <summary><FileText size={16} /><span>Drawing setup &amp; source</span><small>{drawing.fileName}</small></summary>
        <div className="drawing-setup-body">
      <div className="drawing-file-bar"><FileText size={18} /><div><strong>{drawing.fileName}</strong><span>{drawing.kind === 'sample' ? 'Fictional demo plan · not to scale' : providedSource ? `${providedSource.label} · manually mapped` : 'Local drawing · manually mapped'} · {mappedCount} of {areas.length} areas linked</span></div><Badge tone={drawing.kind === 'sample' || providedSource ? 'blue' : 'slate'}>{drawing.kind === 'sample' ? 'Demo drawing' : providedSource ? suppliedReference ? 'Provided source' : 'Demo drawing' : 'Local file'}</Badge><Button icon={Upload} onClick={() => setModal('upload')}>Replace drawing</Button></div>
      {providedSource && <p className="drawing-viewer-note">{providedSource.note}</p>}
      {contractAreaUpdate.available && <section className="drawing-contract-coverage" aria-label="S.I.T. contract area coverage">
        <div><div><h2>Contract area links</h2><p><strong>{linkedItemCount} of {project.items.length} contract items</strong> linked across {areas.length} site areas.</p></div>{contractAreaUpdate.areaCount > 0 && onAddContractAreas && <Button icon={Plus} onClick={addContractAreas} disabled={showEditor}>Link remaining contract areas</Button>}</div>
        <p>Names follow the source schedule. New areas are linked by name; their detailed positions need confirmation on a more detailed drawing.</p>
        {contractAreaUpdate.areaCount > 0 && showEditor && <p>Save or leave the area form before adding the remaining source links.</p>}
        <details><summary>Items without a default site area</summary><ul>{getSITAreaExclusions().map(({ itemId, reason }) => {
          const item = project.items.find((entry) => entry.id === itemId);
          return item ? <li key={itemId}><strong>{item.ref} · {item.description}</strong><span>{reason}</span></li> : null;
        })}</ul></details>
        {contractAreaUpdate.skipped.length > 0 && <details><summary>Links that need manual review</summary><ul>{contractAreaUpdate.skipped.map((entry, index) => <li key={`${entry.code}-${index}`}><strong>{entry.code} · {entry.itemIds.map((id) => project.items.find((item) => item.id === id)?.ref || id).join(' · ')}</strong><span>{entry.reason}</span></li>)}</ul></details>}
        {onOpenSiteUpdates && <div className="drawing-area-message-action">{areaMessageUpdate.available && areaMessageUpdate.messageCount > 0 && onAddAreaMessages ? <Button icon={MessageSquare} onClick={onAddAreaMessages} disabled={showEditor}>Add demo area messages</Button> : <Button icon={ArrowRight} onClick={onOpenSiteUpdates}>Open site updates</Button>}<span>Review worker messages and photos before changing completion or flagging extra work.</span></div>}
      </section>}
        </div>
      </details>
      {mapping.history?.length > 0 && <details className="drawing-history"><summary>Mapping history · {mapping.history.length} {mapping.history.length === 1 ? 'action' : 'actions'}</summary><ol>{mapping.history.map((entry, index) => <li key={entry.id || index}><strong>{actionLabel(entry.action)}{entry.area?.code || entry.previousArea?.code ? ` · ${entry.area?.code || entry.previousArea.code}` : ''}</strong>{entry.detail && <p>{entry.detail}</p>}{entry.date && <time dateTime={entry.date}>{formatTime(entry.date)}</time>}</li>)}</ol></details>}
    </>}
    {onStartCompletionDemo && <details className="drawing-demo-tools"><summary>Try another demo</summary><div className="drawing-completion-demo"><div><strong>See completion on a plan</strong><p>Opens a separate demo project with all three statuses and extra-work examples.</p></div><Button className="ghost" icon={ArrowRight} onClick={onStartCompletionDemo}>Try completion demo</Button></div></details>}
    <p className="drawing-local-note">Demo · Mappings stay with this project in this browser. No AI, measurement or backend service is connected.</p>
    {(modal === 'upload' || modal === 'reattach') && <DrawingFileModal currentDrawing={drawing} reattach={modal === 'reattach'} onClose={() => setModal(null)} onInstall={install} onReattach={reattach} />}
    {modal === 'remove' && selected && <Modal title={`Remove area ${selected.code}?`} onClose={() => setModal(null)} footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button className="danger" icon={Trash2} onClick={removeSelected}>Remove area</Button></>}><p>Remove this area and its work-item links from the current drawing. Existing messages, progress, contract values and claim records are kept.</p></Modal>}
  </div>;
}

function AreaVOMarker({ flags }) {
  const pendingCount = (flags?.openCount || 0) + (flags?.newMessageCount || 0);
  const count = flags?.openCount || flags?.newMessageCount || flags?.approvedCount || 0;
  if (!count) return null;
  return <span className={`drawing-vo-marker ${pendingCount ? 'amber' : 'green'}`} title={flags.markerLabel} aria-hidden="true">{pendingCount ? <Flag size={10} /> : <Check size={10} />}{pendingCount ? count : `VO ${count}`}</span>;
}

function AreaProgressSummary({ project, area, progress, basisLabel, summaryRef, onEdit, onOpenProgress, onOpenContractItem }) {
  if (!area || !progress) return null;
  const sourceArea = project.contract?.sourceProfile === 'sit-loa-2021' && project.contract?.sourceKind === 'provided'
    && getSITAreaDefinitions().some((definition) => definition.code === area.code);
  const areas = getDrawingMapping(project).areas;
  return <section className="drawing-area-progress" ref={summaryRef} aria-label={`Area ${area.code} completion`}>
    <div className="drawing-progress-heading"><div><h3>{progress.totalCount} linked {progress.totalCount === 1 ? 'item' : 'items'}</h3><p>{basisLabel} completion</p></div><Badge tone={progress.tone}>{progress.label}</Badge></div>
    {sourceArea && !area.position && <p className="drawing-progress-help">Named contract area · exact position is not confirmed on the general site plan.</p>}
    {progress.totalCount ? <>
      <ul className="drawing-progress-items">{progress.items.map((item) => {
        const contractItem = project.items?.find((entry) => entry.id === item.id);
        const sharedAreas = areas.filter((entry) => entry.id !== area.id && entry.workItemIds.includes(item.id));
        return <li key={item.id}><div>{onOpenContractItem && contractItem ? <Button className="ghost drawing-contract-item-link" aria-label={`View contract item ${contractItem.ref || item.id}`} onClick={() => onOpenContractItem(item.id, area.id)}><span><small>Ref. {contractItem.ref || item.id}</small><strong>{contractItem.description}</strong></span><ArrowUpRight size={15} /></Button> : <><small>Ref. {contractItem?.ref || item.id}</small><strong>{contractItem?.description || item.description}</strong></>}
          {contractItem?.sourcePage && <small>Source page {contractItem.sourcePage}{contractItem.pricingType === 'included' ? ' · Included' : contractItem.pricingType === 'rateOnly' ? ' · Rate only' : ''}</small>}
          {sharedAreas.length > 0 && <small>Shared with {sharedAreas.map((entry) => entry.code).join(', ')} · one whole contract item.</small>}
          {sourceArea && item.id === 'WI-012' && contractItem?.pricingType === 'included' && <small>Included with B.1 platform work. Shared W3/W5 scope; its quantity is not split and no separate claim value is added.</small>}
          {item.reported !== item.verified && <small>{basisLabel === 'Verified' ? `Reported ${item.reported === null ? 'Not recorded' : completionText(item.reported)}` : `Verified ${item.verified === null ? 'Not recorded' : completionText(item.verified)}`}</small>}
        </div><span className={`drawing-item-completion status-${item.status}`}><strong>{item.completion === null ? '—' : completionText(item.completion)}</strong><small>{item.label}</small></span></li>;
      })}</ul>
    </> : <p className="drawing-progress-help">Link contract work items to show their completion here.</p>}
    <p className="drawing-progress-help">Whole-item progress · no area quantities are measured.</p>
    <div className="drawing-progress-actions"><Button className="ghost" onClick={onEdit}>Edit area mapping</Button>{onOpenProgress && progress.totalCount > 0 && <Button icon={ArrowRight} onClick={() => onOpenProgress(area.id)}>Open site progress</Button>}</div>
  </section>;
}

function AreaMappingEditor({ project, drawing, area, onSave, onSaved, onRemove, onRequestPin, canPlacePin, onDraftPosition, editorRef, onCancel }) {
  const scope = scopeFor(drawing, area);
  const initial = formFor(area);
  const [form, setForm] = useBufferedState(project.id, scope, () => clone(initial));
  const [error, setError] = useState('');
  const [workSearch, setWorkSearch] = useState('');
  const [errorField, setErrorField] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const position = drawing.kind === 'pdf' ? null : positionFor(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const matchingItems = (project.items || []).filter((item) => !workSearch.trim() || [item.id, item.ref, item.description, item.location].some((value) => String(value || '').toLowerCase().includes(workSearch.trim().toLowerCase()))).sort((a, b) => Number(form.workItemIds.includes(b.id)) - Number(form.workItemIds.includes(a.id)));
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
    <div className="drawing-editor-back"><BackButton onClick={onCancel}>{area ? 'Back to area status' : 'Back to areas'}</BackButton></div>
    <div className="drawing-editor-heading"><h3>{area ? `Area ${area.code}` : 'New area'}</h3>{area && <Button className="ghost" icon={Trash2} onClick={onRemove}>Remove</Button>}</div>
    {dirty && <p className="drawing-unsaved-note" role="status">Unfinished edits stay while you browse. Save before refreshing.</p>}
    <div className="drawing-form-grid">
      <FormField label="Area code" required error={errorField === 'code' ? error : undefined} hint="Use the same code in site updates, e.g. A1."><Input name="code" className="form-input" value={form.code} maxLength={20} onChange={(event) => change('code', event.target.value.toUpperCase())} placeholder="e.g. A1" /></FormField>
      {drawing.kind === 'pdf' && <FormField label="Drawing page" required error={errorField === 'page' ? error : undefined}><Input name="page" className="form-input" type="number" min="1" max="999" step="1" value={form.page} onChange={(event) => change('page', event.target.value)} /></FormField>}
      <FormField label="Area name" required className="drawing-field-full" error={errorField === 'name' ? error : undefined}><Input name="name" className="form-input" value={form.name} maxLength={100} onChange={(event) => change('name', event.target.value)} placeholder="e.g. Block A - west wall" /></FormField>
    </div>
    {drawing.kind !== 'pdf' && <div className="drawing-pin-editor"><div><MapPin size={16} /><span>{position ? `Pin at ${percentage(position.x)}% across, ${percentage(position.y)}% down` : 'Pin not placed'}</span><Button onClick={() => onRequestPin((next) => setForm((current) => ({ ...current, pinX: percentage(next.x), pinY: percentage(next.y) })))} disabled={!canPlacePin}>{position ? 'Move pin' : 'Place pin'}</Button></div><details open={errorField === 'pinX' ? true : undefined}><summary>Enter a position instead</summary><div className="drawing-form-grid"><FormField label="Across drawing" suffix="%" error={errorField === 'pinX' ? error : undefined}><Input name="pinX" className="form-input" type="number" min="0" max="100" step="any" value={form.pinX} onChange={(event) => change('pinX', event.target.value)} /></FormField><FormField label="Down drawing" suffix="%"><Input name="pinY" className="form-input" type="number" min="0" max="100" step="any" value={form.pinY} onChange={(event) => change('pinY', event.target.value)} /></FormField></div>{position && <Button className="ghost" onClick={() => setForm((current) => ({ ...current, pinX: '', pinY: '' }))}>Clear pin position</Button>}</details></div>}
    <fieldset className="drawing-work-choices"><legend>Link contract items</legend><p>Tick the work that belongs here. An item can be shared with other areas.</p>{project.items?.length ? <><FormField className="drawing-work-search" label="Find contract work"><Input className="form-input" type="search" value={workSearch} onChange={(event) => setWorkSearch(event.target.value)} placeholder="Search reference, work or location…" /></FormField><p className="drawing-work-count" aria-live="polite">{form.workItemIds.length} selected · {matchingItems.length} shown</p><div className="drawing-work-options">{matchingItems.map((item) => <label className="drawing-work-choice" key={item.id}><Checkbox checked={form.workItemIds.includes(item.id)} onChange={(event) => change('workItemIds', event.target.checked ? [...form.workItemIds, item.id] : form.workItemIds.filter((id) => id !== item.id))} /><span><strong>{item.description}</strong><small>Ref. {item.ref} · {item.location}</small></span></label>)}</div>{!matchingItems.length && <p className="drawing-search-empty">No matching work items. Clear the search to see all items; your selections are kept.</p>}</> : <div className="notice warning"><CircleAlert size={16} /><span>No contract work is available. Add the contract first; you can still save this area without work links.</span></div>}</fieldset>
    {error && !['code', 'name', 'page', 'pinX'].includes(errorField) && <p className="form-error" role="alert">{error}</p>}
    <FormActions secondary={<BackButton onClick={onCancel}>{area ? 'Back to area status' : 'Back to areas'}</BackButton>}><Button className="primary" type="submit" icon={Save} disabled={busy || !onSave}>{busy ? 'Saving…' : 'Save area links'}</Button></FormActions>
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
