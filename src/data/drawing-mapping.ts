import type { AreaMappingSnapshot, DrawingPosition, DrawingMetadata, DrawingMapping, SourceDescriptor } from '../types/domain';
import type { Project, WorkItem, SiteReport, WhatsAppMessage, VOCase, VOReview, DrawingArea, DateInput } from '../types/domain';
import { areaQuantityUnits } from './area-allocations.ts';
// Drawing references and area links are manual, browser-local demo metadata.
// Saving a map never changes a contract baseline, physical progress or a claim.
export const DEMO_DRAWING_ASSET = '/samples/warehouse-area-plan.svg';
export const DEMO_DRAWING_FILENAME = 'warehouse-area-plan.svg';
export const MAX_DRAWING_FILE_SIZE = 15_000_000;
export const DEMO_AREAS = Object.freeze([
  { code: 'A1', name: 'Block A - external wall', x: 0.23, y: 0.41 },
  { code: 'A2', name: 'Block A - roof', x: 0.38, y: 0.29 },
  { code: 'B1', name: 'Block B - floor', x: 0.67, y: 0.48 },
  { code: 'B2', name: 'Block B - loading bay', x: 0.82, y: 0.64 },
].map(({ x, y, ...area }) => Object.freeze({ ...area, page: 1, position: Object.freeze({ x, y }), workItemIds: Object.freeze([]) })));

const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const cleanCode = (value: unknown) => text(value).toUpperCase();
const validCode = (value: string) => value.length <= 20 && /^[A-Z0-9][A-Z0-9_-]*$/.test(value);
const validName = (value: string) => Boolean(value) && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const validPage = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 999;
const validPosition = (value: unknown): value is DrawingPosition | null => value === null || (record(value) && ['x', 'y'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1));
const fileTypes: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const fileType = (name: unknown) => fileTypes[text(name).split('.').at(-1)?.toLowerCase() || ''] || null;
const emptyMapping = (project: Project): DrawingMapping => ({ projectId: project?.id || '', drawing: null, areas: [], history: [] });

function atDate(now: DateInput) {
  try {
    const date = new Date(now);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch { return null; }
}

function newId(prefix: string, date: string, used: (string | undefined)[] = []) {
  const base = `${prefix}-${Date.parse(date)}`;
  const existing = new Set(used);
  let index = 1;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

// Only a validated contract-source descriptor can restore an
// image after reload. Saved drawing metadata never accepts an arbitrary URL.
export function getProvidedDrawingSource(project: Project): SourceDescriptor | null {
  const source = project?.contract?.drawingSource;
  if (!record(source) || !validCode(text(source.id).toUpperCase())) return null;
  const fictional = project?.contract?.sourceKind === 'illustrative';
  const expectedType = fictional ? 'image/svg+xml' : fileType(source.fileName);
  const allowedAsset = fictional
    ? source.asset === '/samples/campus-scaffold-area-plan.svg' && source.id === 'campus-demo-plan'
    : project?.contract?.sourceKind === 'provided' && /^\/assets\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(text(source.asset))
      && ['image/png', 'image/jpeg', 'image/webp'].includes(expectedType || '');
  if (!allowedAsset || text(source.fileName) !== text(source.asset).split('/').at(-1)
    || source.mimeType !== expectedType) return null;
  return {
    id: text(source.id), asset: text(source.asset), fileName: text(source.fileName), mimeType: source.mimeType,
    label: validName(text(source.label)) ? text(source.label) : fictional ? 'Fictional demo drawing' : 'Provided site drawing',
    note: text(source.note) || 'Area pins are illustrative manual links, not surveyed positions.',
  };
}

function normalizedDrawing(project: Project, value: DrawingMetadata | null | undefined): DrawingMetadata | null {
  if (!record(value) || !validId(value.id) || value.projectId !== project.id
    || !['sample', 'image', 'pdf'].includes(value.kind) || !['sample', 'upload', 'provided'].includes(value.inputKind)
    || !text(value.fileName) || !atDate(value.uploadedAt)) return null;
  const source = value.inputKind === 'provided' ? getProvidedDrawingSource(project) : null;
  if (value.inputKind === 'provided' && (!source || value.sourceId !== source.id
    || value.kind !== 'image' || value.fileName !== source.fileName
    || value.mimeType !== source.mimeType || value.fileSize != null)) return null;
  return {
    id: value.id, projectId: project.id, inputKind: value.inputKind, kind: value.kind,
    fileName: value.fileName, fileSize: value.fileSize ?? null, mimeType: value.mimeType,
    uploadedAt: value.uploadedAt,
    ...(source ? { sourceId: source.id } : {}),
  };
}

// The upload branch deliberately has no permanent asset: its preview stays in session memory.
export function getDrawingAsset(project: Project, drawing = getDrawingMapping(project).drawing) {
  if (!record(project) || !validId(project.id)) return null;
  const saved = normalizedDrawing(project, drawing);
  if (!saved) return null;
  if (saved.inputKind === 'sample' && saved.kind === 'sample') return DEMO_DRAWING_ASSET;
  if (saved.inputKind === 'provided') return getProvidedDrawingSource(project)?.asset || null;
  return null;
}

export function getDrawingMapping(project: Project): DrawingMapping {
  if (!record(project) || !validId(project.id)) return emptyMapping(project);
  const saved = project.drawingMapping;
  if (!record(saved) || saved.projectId !== project.id) return emptyMapping(project);
  const drawing = normalizedDrawing(project, saved.drawing);
  if (!drawing) return emptyMapping(project);
  const itemIds = new Set((Array.isArray(project.items) ? project.items : []).map((item) => item.id));
  const seenIds = new Set();
  const seenCodes = new Set();
  const areas = (Array.isArray(saved.areas) ? saved.areas : []).flatMap((area) => {
    if (!record(area) || !validId(area.id) || area.projectId !== project.id || area.drawingId !== drawing.id
      || !validCode(cleanCode(area.code)) || !validName(text(area.name)) || !validPage(area.page)
      || !validPosition(area.position) || (drawing.kind === 'pdf' && area.position !== null)
      || !Array.isArray(area.workItemIds) || seenIds.has(area.id) || seenCodes.has(cleanCode(area.code))) return [];
    seenIds.add(area.id); seenCodes.add(cleanCode(area.code));
    return [{ id: area.id, projectId: project.id, drawingId: drawing.id, code: cleanCode(area.code),
      name: text(area.name), page: area.page, position: clone(area.position),
      workItemIds: [...new Set(area.workItemIds.filter((id) => itemIds.has(id)))].sort(), updatedAt: area.updatedAt || drawing.uploadedAt,
      ...(record(area.workItemQuantities) ? { workItemQuantities: Object.fromEntries(Object.entries(area.workItemQuantities).filter(([id, value]) => itemIds.has(id) && typeof value === 'number' && areaQuantityUnits(value) !== null)) } : {}) }];
  });
  return { projectId: project.id, drawing, areas, history: clone(Array.isArray(saved.history) ? saved.history : []) };
}

function drawingMetadata(project: Project, input: unknown, now: DateInput, mapping: DrawingMapping): DrawingMetadata | null {
  if (!record(input) || !['sample', 'upload', 'provided'].includes(String(input.inputKind))) return null;
  const uploadedAt = atDate(now);
  if (!uploadedAt) return null;
  const source = input.inputKind === 'provided' ? getProvidedDrawingSource(project) : null;
  if (input.inputKind === 'provided' && (!source || (input.sourceId && input.sourceId !== source.id))) return null;
  const fileName = source ? source.fileName : record(input) && input.inputKind === 'sample' ? DEMO_DRAWING_FILENAME : text(input.fileName).replaceAll('\\', '/').split('/').at(-1);
  const fileSize = source || input.fileSize == null ? null : Number(input.fileSize);
  if (!fileName || fileName.length > 255 || /[\u0000-\u001f\u007f]/.test(fileName)
    || (fileSize !== null && (!Number.isSafeInteger(fileSize) || fileSize < 0 || fileSize > MAX_DRAWING_FILE_SIZE))) return null;
  const expectedType = fileType(fileName);
  const mimeType = source ? source.mimeType : record(input) && input.inputKind === 'sample' ? 'image/svg+xml' : text(input.mimeType) || expectedType;
  if (input.inputKind === 'upload' && (!(fileSize !== null && fileSize > 0) || !expectedType || mimeType !== expectedType)) return null;
  const priorIds = [mapping.drawing?.id, ...mapping.history.flatMap((event) => [event.drawingId, event.previousDrawing?.id])];
  return {
    id: newId(`DRAW-${project.id}`, uploadedAt, priorIds), projectId: project.id, inputKind: input.inputKind as DrawingMetadata['inputKind'],
    kind: record(input) && input.inputKind === 'sample' ? 'sample' : mimeType === 'application/pdf' ? 'pdf' : 'image',
    fileName, fileSize, mimeType: mimeType!, uploadedAt,
    ...(source ? { sourceId: source.id } : {}),
  };
}

function updatedProject(project: Project, mapping: DrawingMapping): Project {
  return { ...clone(project), drawingMapping: mapping };
}

export function installDrawing(project: Project, input: unknown, now: DateInput = new Date()) {
  const invalid = (error: string) => ({ project, outcome: 'invalid' as const, error });
  if (!record(project) || !validId(project.id) || !Array.isArray(project.items)) return invalid('Choose a project before adding a drawing.');
  const current = getDrawingMapping(project);
  const drawing = drawingMetadata(project, input, now, current);
  if (!drawing) return invalid('Choose a PDF, PNG, JPEG or WebP drawing up to 15 MB.');
  const areas = current.drawing ? current.areas.map((area) => ({ ...area, drawingId: drawing.id, page: 1, position: null, updatedAt: drawing.uploadedAt }))
    : record(input) && input.inputKind === 'sample' ? DEMO_AREAS.map((area, index) => ({ ...clone(area), workItemIds: [...area.workItemIds], id: `AREA-${project.id}-${Date.parse(drawing.uploadedAt)}-${index + 1}`, projectId: project.id, drawingId: drawing.id, updatedAt: drawing.uploadedAt })) : [];
  const mapping = { projectId: project.id, drawing, areas,
    history: [...current.history, { id: newId(`MAP-${project.id}`, drawing.uploadedAt, current.history.map((event) => event.id)), action: current.drawing ? 'replaceDrawing' : 'addDrawing', date: drawing.uploadedAt, drawingId: drawing.id, previousDrawing: clone(current.drawing), previousAreas: clone(current.areas) }] };
  return { project: updatedProject(project, mapping), outcome: 'updated' as const, drawing };
}

export function saveAreaMapping(project: Project, values: unknown, now: DateInput = new Date()) {
  const invalid = (error: string) => ({ project, outcome: 'invalid' as const, error });
  const current = getDrawingMapping(project);
  const date = atDate(now);
  if (!current.drawing) return invalid('Add a drawing before mapping an area.');
  if (!record(values) || values.drawingId !== current.drawing.id || !date) return invalid('The drawing changed. Reopen the area before saving.');
  const areaId = text(values.areaId);
  const previous = areaId ? current.areas.find((area) => area.id === areaId) : null;
  if (areaId && !previous) return invalid('Choose an area from the selected project.');
  const code = cleanCode(values.code);
  const name = text(values.name);
  const page = typeof values.page === 'string' && values.page.trim() ? Number(values.page) : values.page;
  const position = values.position == null ? null : values.position;
  const itemIds = new Set((project.items || []).map((item) => item.id));
  if (!validCode(code)) return invalid('Enter an area code up to 20 letters, numbers, hyphens or underscores. Start with a letter or number.');
  if (current.areas.some((area) => area.id !== areaId && area.code === code)) return invalid('This area code is already used on the drawing.');
  if (!validName(name)) return invalid('Enter an area name up to 100 characters.');
  if (!validPage(page)) return invalid('Enter a whole drawing page number from 1 to 999.');
  if (!validPosition(position) || (current.drawing.kind === 'pdf' && position !== null)) return invalid('Choose a valid pin position on an image drawing. PDF areas are linked by name and page.');
  if (!Array.isArray(values.workItemIds) || values.workItemIds.some((id) => typeof id !== 'string' || !itemIds.has(id))) return invalid('Choose contract work items from this project.');
  const workItemIds = [...new Set(values.workItemIds)].sort();
  // Invalid stored quantities must be reviewed explicitly, never disappear as
  // a side effect of moving a pin or saving a different area's name.
  for (const savedArea of current.areas) {
    if (savedArea.id === areaId && values.workItemQuantities !== undefined) continue;
    const rawArea = project.drawingMapping?.areas?.find(entry => entry?.id === savedArea.id);
    if (!rawArea || !Object.hasOwn(rawArea, 'workItemQuantities')) continue;
    if (!record(rawArea.workItemQuantities) || Object.entries(rawArea.workItemQuantities).some(([itemId, value]) => {
      const item = project.items.find(entry => entry.id === itemId);
      return !savedArea.workItemIds.includes(itemId) || typeof value !== 'number' || areaQuantityUnits(value) === null
        || item?.pricingType !== 'measured' || areaQuantityUnits(item.quantity) === null;
    })) return invalid(`Review the saved quantities for Area ${savedArea.code} before saving area links.`);
  }
  const rawQuantities = values.workItemQuantities === undefined ? previous?.workItemQuantities : values.workItemQuantities;
  if (rawQuantities !== undefined && !record(rawQuantities)) return invalid('Enter valid quantities for the selected contract items.');
  const workItemQuantities: Record<string, number> = {};
  for (const [itemId, value] of Object.entries(rawQuantities || {})) {
    if (!workItemIds.includes(itemId)) {
      // An omitted quantity field preserves a legacy pin/name save while an
      // explicitly edited quantity map must match its selected work links.
      if (values.workItemQuantities === undefined) continue;
      return invalid('Assign quantities only to contract items linked to this area.');
    }
    const item = project.items.find(entry => entry.id === itemId);
    const units = areaQuantityUnits(value);
    if (item?.pricingType !== 'measured' || areaQuantityUnits(item.quantity) === null) return invalid('Only measured items with a known positive contract quantity can be split across areas.');
    if (units === null) return invalid('Enter a positive area quantity with up to 4 decimal places.');
    workItemQuantities[itemId] = Number(units) / 10000;
  }
  const scopedReports = (project.reports || []).filter(report => (!report.projectId || report.projectId === project.id)
    && (!report.projectCode || report.projectCode === project.code) && report.areaProgress?.areaId === areaId);
  for (const report of scopedReports) {
    const saved = report.areaProgress!;
    if (!workItemIds.includes(saved.itemId) || workItemQuantities[saved.itemId] !== saved.allocatedQuantity) {
      return invalid('This area has recorded progress. Keep its quantity and work link; pin positions and area names can still change.');
    }
  }
  const allocationAreas = [...current.areas.filter(entry => entry.id !== areaId), { workItemIds, workItemQuantities }];
  const allocatedItems = new Set(allocationAreas.flatMap(entry => Object.keys(entry.workItemQuantities || {})));
  for (const itemId of allocatedItems) {
    const item = project.items.find(entry => entry.id === itemId);
    const contractUnits = item?.pricingType === 'measured' ? areaQuantityUnits(item.quantity) : null;
    if (contractUnits === null) return invalid('Check the contract quantity before saving this item’s area quantities.');
    let total = 0n;
    for (const entry of allocationAreas) {
      if (!Object.hasOwn(entry.workItemQuantities || {}, itemId)) continue;
      const units = areaQuantityUnits(entry.workItemQuantities?.[itemId]);
      if (units === null || !entry.workItemIds.includes(itemId)) return invalid('Check the saved area quantities before saving these links.');
      total += units;
    }
    if (total > contractUnits) return invalid(`${item?.ref || itemId}: area quantities exceed the contract quantity. Reduce this area’s quantity before saving.`);
  }
  const quantityFields = Object.keys(workItemQuantities).length || previous?.workItemQuantities ? { workItemQuantities } : {};
  const comparable = { code, name, page, position: position === null ? null : { x: position.x, y: position.y }, workItemIds, ...quantityFields };
  if (previous && JSON.stringify(comparable) === JSON.stringify({ code: previous.code, name: previous.name, page: previous.page, position: previous.position, workItemIds: previous.workItemIds, ...(previous.workItemQuantities ? { workItemQuantities: previous.workItemQuantities } : {}) })) return { project, area: clone(previous), outcome: 'unchanged' as const };
  const area = { id: previous?.id || newId(`AREA-${project.id}`, date, [...current.areas.map((entry) => entry.id), ...current.history.map((event) => event.areaId)]), projectId: project.id, drawingId: current.drawing.id, ...comparable, updatedAt: date };
  const mapping = { ...current, areas: previous ? current.areas.map((entry) => entry.id === area.id ? area : entry) : [...current.areas, area],
    history: [...current.history, { id: newId(`MAP-${project.id}`, date, current.history.map((event) => event.id)), action: previous ? 'updateArea' : 'addArea', date, drawingId: current.drawing.id, areaId: area.id, previousArea: clone(previous), area: clone(area) }] };
  return { project: updatedProject(project, mapping), area: clone(area), outcome: 'updated' as const };
}

export function removeMappedArea(project: Project, areaId: string, now: DateInput = new Date()) {
  const current = getDrawingMapping(project);
  const previous = current.areas.find((area) => area.id === areaId);
  const date = atDate(now);
  if (!previous || !date) return { project, outcome: 'invalid' as const, error: 'Choose an area from the selected project.' };
  if ((project.reports || []).some(report => (!report.projectId || report.projectId === project.id)
    && (!report.projectCode || report.projectCode === project.code) && report.areaProgress?.areaId === areaId)) {
    return { project, outcome: 'invalid' as const, error: 'This area has recorded progress. Keep the area and its quantities; its name and pin can still change.' };
  }
  const mapping = { ...current, areas: current.areas.filter((area) => area.id !== areaId),
    history: [...current.history, { id: newId(`MAP-${project.id}`, date, current.history.map((event) => event.id)), action: 'removeArea', date, drawingId: current.drawing!.id, areaId, previousArea: clone(previous) }] };
  return { project: updatedProject(project, mapping), outcome: 'updated' as const };
}

export function getAreasForItem(project: Project, itemId: string) {
  if (!Array.isArray(project?.items) || !project.items.some((item) => item.id === itemId)) return [];
  return getDrawingMapping(project).areas.filter((area) => area.workItemIds.includes(itemId));
}

export function getAreaForMessage(project: Project, message: unknown) {
  if (!record(message) || (message.projectId && message.projectId !== project?.id)) return null;
  const code = cleanCode(text(message.area).replace(/^area\s+/i, ''));
  if (!code) return null;
  return getDrawingMapping(project).areas.find((area) => area.code === code) || null;
}

export function getAreaLinkStatus(project: Project, message: { projectId?: string; area?: string | null; itemId?: string | null; kind?: string; vo?: boolean } | null | undefined) {
  const area = getAreaForMessage(project, message);
  const linkedItems = area ? (project.items || []).filter((item) => area.workItemIds.includes(item.id)).map(clone) : [];
  return { area, linkedItems, conflict: Boolean(area && linkedItems.length && message?.itemId && message.kind !== 'vo' && !message.vo && !area.workItemIds.includes(message.itemId)) };
}

export function snapshotMappedArea(area: Partial<DrawingArea> | null | undefined): AreaMappingSnapshot | null {
  if (!record(area) || !validId(area.id)) return null;
  return {
    areaId: area.id, code: area.code, name: area.name, drawingId: area.drawingId,
    page: area.page, position: clone(area.position ?? null),
    workItemIds: clone(Array.isArray(area.workItemIds) ? area.workItemIds : []),
    ...(record(area.workItemQuantities) ? { workItemQuantities: clone(area.workItemQuantities) } : {}),
  };
}

export async function validateDrawingFile(file: File | null | undefined) {
  const expectedType = fileType(file?.name);
  if (!file || !expectedType || (file.type && file.type !== expectedType)) return 'Choose a PDF, PNG, JPEG or WebP drawing.';
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return 'This file is empty. Choose another drawing.';
  if (file.size > MAX_DRAWING_FILE_SIZE) return 'Choose a drawing up to 15 MB.';
  try {
    const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    const valid = expectedType === 'application/pdf' ? /%PDF-\d\.\d/.test(ascii(0, 1024))
      : expectedType === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
        : expectedType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    if (!valid) return 'This file does not match its drawing format. Choose another file.';
  } catch { return 'This drawing could not be read. Choose the file again.'; }
  return null;
}
