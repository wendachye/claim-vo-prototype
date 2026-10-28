import type { ClaimDocumentDetails, ClaimPack } from '../types/claims';

export type { ClaimDocumentDetails } from '../types/claims';
type Field = Exclude<keyof ClaimDocumentDetails, 'version'>;
export const claimDocumentFieldLimits: Record<Field, number> = {
  recipientCompany: 160, recipientAttention: 120, recipientAddress: 500,
  projectName: 160, printedProjectCode: 80, contractReference: 160,
  claimReference: 160, claimDate: 10,
  companyName: 160, companyAddress: 500, companyRegistration: 80,
  companyPhone: 80, companyEmail: 160,
};
const fields = Object.keys(claimDocumentFieldLimits) as Field[];
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const multiline = new Set<Field>(['recipientAddress', 'companyAddress']);
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Document-only metadata: deliberately has no financial, routing or live-source fields.
export function validateClaimDocumentDetails(value: unknown): {
  details: ClaimDocumentDetails | null;
  fieldErrors: Partial<Record<Field, string>>;
  error?: string;
} {
  const fieldErrors: Partial<Record<Field, string>> = {};
  if (!record(value) || value.version !== 1 || Object.keys(value).some(key => key !== 'version' && !fields.includes(key as Field))) {
    return { details: null, fieldErrors, error: 'Use valid claim document details.' };
  }
  const details = { version: 1 } as ClaimDocumentDetails;
  for (const field of fields) {
    const input = value[field];
    if (typeof input !== 'string') { fieldErrors[field] = 'Enter text, or leave this field blank.'; continue; }
    const normalized = multiline.has(field) ? input.replace(/\r\n?/g, '\n').trim() : input.trim();
    if ((multiline.has(field) ? /[\u0000-\u0009\u000b-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(normalized)) {
      fieldErrors[field] = multiline.has(field) ? 'Use plain text and line breaks only.' : 'Use a single line of plain text.';
    } else if (normalized.length > claimDocumentFieldLimits[field]) {
      fieldErrors[field] = `Use ${claimDocumentFieldLimits[field]} characters or fewer.`;
    } else if (field === 'claimDate' && normalized && !validDay(normalized)) {
      fieldErrors[field] = 'Enter a valid date in YYYY-MM-DD format.';
    } else if (field === 'companyEmail' && normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
      fieldErrors[field] = 'Enter a valid email address, or leave it blank.';
    }
    details[field] = normalized;
  }
  return Object.keys(fieldErrors).length
    ? { details: null, fieldErrors, error: 'Check the highlighted claim details.' }
    : { details, fieldErrors };
}

export function isClaimDocumentDetails(value: unknown): value is ClaimDocumentDetails {
  const result = validateClaimDocumentDetails(value);
  return !!result.details && fields.every(field => (value as ClaimDocumentDetails)[field] === result.details![field]);
}

// Legacy defaults use only the pack's already frozen (or explicitly labelled
// fallback) project metadata and saved date. Unknown contact details stay blank.
export function getClaimDocumentDetails(pack: ClaimPack): ClaimDocumentDetails {
  if (Object.hasOwn(pack, 'documentDetails')) {
    if (!isClaimDocumentDetails(pack.documentDetails)) throw new Error('Saved claim document details are invalid.');
    return structuredClone(pack.documentDetails);
  }
  const saved = pack.projectDetails;
  const plain = (value: unknown, field: Field) => typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, claimDocumentFieldLimits[field]) : '';
  const time = typeof pack.createdAt === 'string' ? Date.parse(pack.createdAt) : NaN;
  const savedDate = Number.isFinite(time) ? new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
  return {
    version: 1,
    recipientCompany: plain(saved?.contract?.mainContractor, 'recipientCompany'),
    recipientAttention: '', recipientAddress: '',
    projectName: plain(saved?.name, 'projectName'), printedProjectCode: plain(saved?.code, 'printedProjectCode'),
    contractReference: plain(saved?.contract?.reference, 'contractReference'),
    claimReference: '', claimDate: validDay(savedDate) ? savedDate : '',
    companyName: plain(saved?.contract?.subcontractor, 'companyName'),
    companyAddress: '', companyRegistration: '', companyPhone: '', companyEmail: '',
  };
}
