import type { Project, ProjectWorkflow, Workspace, DateInput } from "../types/domain";
import type { ContractSelection } from "./contract-recovery.ts";
import { createDemoProject } from './demo-project.ts';
import { inspectContractRecovery } from './contract-recovery.ts';

export const DEMO_CONTRACT_PDF = '/samples/warehouse-contract-demo.pdf';
export const DEMO_CONTRACT_FILENAME = 'warehouse-contract-demo.pdf';
export const MAX_CONTRACT_FILE_SIZE = 30_000_000;

const clone = <T,>(value: T): T => structuredClone(value);
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const empty = (value: unknown) => value === undefined || (Array.isArray(value) && value.length === 0);
const workflowFields = ['items', 'sourceItems', 'reports', 'history', 'baselines', 'voReviews', 'claimDrafts', 'whatsappMessages'] as const;

// A filled register is never replaced by the showcase, even when it is unlocked.
export function canImportIntoProject(project: Project | null | undefined) {
  return Boolean(record(project) && text(project.id) && record(project.contract)
    && project.locked !== true && !project.lockedAt && (project.version === undefined || project.version === 1)
    && workflowFields.every((field) => empty(project[field]) && empty(project.seed?.[field]))
    && [undefined, null, 'none', 'empty'].includes(project.contract.sourceKind)
    && !text(project.contract.sourceFile) && !text(project.contract.sourceFilename)
    && !project.contract.demoImport);
}

function importMetadata(input: unknown, now: DateInput) {
  if (!record(input) || !['sample', 'upload'].includes(input.inputKind as string)) return null;
  const inputName = text(input.fileName).replaceAll('\\', '/').split('/').at(-1);
  const fileName = input.inputKind === 'sample' ? DEMO_CONTRACT_FILENAME : inputName;
  const size = input.fileSize == null ? null : Number(input.fileSize);
  const date = new Date(now);
  if (!fileName || fileName.length > 255 || /[\u0000-\u001f\u007f]/.test(fileName) || !/\.pdf$/i.test(fileName)
    || Number.isNaN(date.getTime())
    || (size !== null && (!Number.isSafeInteger(size) || size < 0 || size > MAX_CONTRACT_FILE_SIZE))
    || (input.inputKind === 'upload' && !((size as number) > 0))) return null;
  return { inputKind: input.inputKind as string, fileName, fileSize: size, importedAt: date.toISOString() };
}

function nextProjectCode(project: Project, projects: Project[]) {
  const original = text(project.code).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!original || !/[A-Z0-9]/.test(original)) return null;
  const used = new Set(projects.flatMap((entry) => [text(entry.id).toUpperCase(), text(entry.code).toUpperCase()]));
  for (let index = 1; index <= projects.length + 1; index += 1) {
    const suffix = `-DOC${index}`;
    const code = `${original.slice(0, 20 - suffix.length)}${suffix}`;
    if (!used.has(code)) return code;
  }
  return null;
}

// This creates a preset fictional schedule. No selected PDF bytes are parsed or
// stored here, and a selected filename is not evidence for the invented values.
export function applyMockContract(workspace: Workspace, projectId: string, input: ContractSelection, now: DateInput = new Date()) {
  const invalid = (error: string | undefined) => ({ outcome: 'invalid' as const, error });
  if (!record(workspace) || !Array.isArray(workspace.projects)) return invalid('Choose a project before reviewing the demo extraction.');
  const current = workspace.projects.find((entry) => entry?.id === projectId);
  if (!current || !text(current.name) || !text(current.code) || !record(current.contract)) return invalid('This project is no longer available. Choose a project and try again.');
  const metadata = importMetadata(input, now);
  if (!metadata) return invalid('Choose a PDF up to 30 MB before continuing.');
  const recovery = Object.hasOwn(input, 'recovery') ? inspectContractRecovery(input.recovery, projectId, input) : null;
  if (recovery && recovery.outcome !== 'ready') return invalid(recovery.error);
  const createdNew = !canImportIntoProject(current);
  const suffix = ' - Upload demo';
  const code = createdNew ? nextProjectCode(current, workspace.projects) : current.code;
  if (!code) return invalid('A unique project code could not be created. Try another project.');
  const name = createdNew ? `${current.name.slice(0, 100 - suffix.length).trimEnd()}${suffix}` : current.name;
  let demo;
  try {
    demo = createDemoProject({
      name, code, country: current.country, description: current.description,
      subcontractor: current.contract.subcontractor || '',
    }, new Date(now));
  } catch {
    return invalid('The demo work list could not be added. Check the project details and try again.');
  }
  if (recovery) {
    demo.items = clone(recovery.items);
    demo.seed.items = clone(recovery.items);
  }
  if (!createdNew && demo.id !== current.id) {
    demo.whatsappMessages = demo.whatsappMessages.map((message) => ({
      ...message, id: `${current.id}-WA-${message.id.split('-WA-').at(-1)}`, projectId: current.id,
    }));
    demo.seed.whatsappMessages = clone(demo.whatsappMessages);
  }
  const project = {
    ...(createdNew ? {} : clone(current)),
    ...demo,
    id: createdNew ? demo.id : current.id,
    contract: {
      ...(createdNew ? {} : clone(current.contract)),
      ...demo.contract,
      id: createdNew ? demo.id : current.id,
      reference: 'WAREHOUSE-DEMO-SCHEDULE',
      date: null,
      dateLabel: 'Illustrative schedule - no execution date',
      currency: 'SGD',
      sourceKind: 'illustrative',
      sourceFile: DEMO_CONTRACT_PDF,
      sourceFilename: DEMO_CONTRACT_FILENAME,
      mainContractor: !createdNew && current.contract.mainContractor ? current.contract.mainContractor : demo.contract.mainContractor,
      sourceSummary: 'Fictional warehouse sample PDF and preset demo work list. The selected PDF was not extracted.',
      demoNotice: 'Mock extraction only. Work-item values come from the fictional demo schedule, not from the selected PDF.',
      demoImport: recovery ? { ...metadata, recovery: clone(recovery.provenance) } : metadata,
    },
  };
  const projects = createdNew ? [...workspace.projects, project]
    : workspace.projects.map((entry) => entry.id === current.id ? project : entry);
  return { outcome: 'applied' as const, workspace: { ...workspace, activeProjectId: project.id, projects }, project, createdNew };
}

export async function validateContractFile(file: File | null | undefined) {
  if (!file || !text(file.name) || !/\.pdf$/i.test(file.name)
    || (file.type && file.type !== 'application/pdf')) return 'Choose a PDF file.';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'This file is empty. Choose another PDF.';
  if (file.size > MAX_CONTRACT_FILE_SIZE) return 'Choose a PDF up to 30 MB.';
  try {
    const header = await file.slice(0, 1024).text();
    if (!/%PDF-\d\.\d/.test(header)) return 'This file does not have a PDF header. Choose another PDF.';
  } catch {
    return 'This PDF could not be read. Choose the file again.';
  }
  return null;
}
