import type { ContractDetails, InputNumber, SiteReport, VOHistoryEntry } from './domain';

export interface ClaimBasis {
  version: number; billingMethod: string; retentionMode: string; retentionRate: number | null;
  retentionCap: number | null; previousNetValue: number | null; priorReference: string;
}
export interface ClaimBasisInput {
  version: number; billingMethod: string; retentionMode: string; retentionRate: InputNumber;
  retentionCap: InputNumber; previousNetValue: InputNumber; priorReference: string;
}
export interface ClaimAssessmentRow {
  include?: boolean; previousValue?: number | null; assessedQuantity?: number | null;
  assessedValue?: number | null; evidenceDateConfirmed?: boolean;
}
export interface ClaimAssessmentInputRow {
  include?: boolean; previousValue?: InputNumber; assessedQuantity?: InputNumber;
  assessedValue?: InputNumber; evidenceDateConfirmed?: boolean;
}
export interface ClaimAssessmentInput {
  work?: Record<string, ClaimAssessmentInputRow>; vos?: Record<string, ClaimAssessmentInputRow>;
  priorConfirmed?: boolean; adjustmentReason?: string; note?: string; claimBasis?: ClaimBasisInput | null;
  projectId?: string;
}
export interface ClaimAssessment {
  work: Record<string, ClaimAssessmentRow>; vos: Record<string, ClaimAssessmentRow>;
  priorConfirmed: boolean; adjustmentReason: string; note: string; claimBasis?: ClaimBasis;
}
export interface ClaimTotals {
  previousValue: number | null; cumulativeValue: number | null; currentValue: number | null;
  workCurrentValue: number | null; voCurrentValue: number | null;
  retentionValue?: number | null; netCumulativeValue?: number | null;
  previousNetValue?: number | null; grossCurrentValue?: number | null;
}
export interface EvidenceDateConfirmation { asOf: string | null; confirmed: boolean }
export interface VOEligibilityReview {
  scopeDisposition: string; scopeAssessment: string; relatedItemId: string | null;
  instructionStatus: string; instructionReference: string; executionStatus: string;
  executionReference: string; executionVerifiedAt: string | null; claimEligibility: string;
  eligibilityNote: string; eligibilityReviewedAt: string | null;
}
export interface ClaimRow {
  id: string; itemId?: string; caseId?: string; ref?: string; reference?: string;
  description?: string; title?: string; unit?: string; rate?: InputNumber;
  included: boolean; eligible: boolean; exclusionReason: string; previousValue: number | null;
  cumulativeValue: number | null; currentValue: number | null; issues: string[];
  evidence?: SiteReport | null; areaEvidence?: SiteReport[]; sourcePage?: number | null;
  verifiedAt?: string | null; evidenceDateConfirmation?: EvidenceDateConfirmation | null;
  assessedQuantity?: number | null; assessedValue?: number | null;
  approvedValue?: number | null; approvalReference?: string; approvalDate?: string | null;
  approver?: string; approval?: VOHistoryEntry | null; status?: string;
  verified?: number; currentVerified?: number | null; reported?: number | null;
  requiresDateConfirmation?: boolean; evidenceDateConfirmed?: boolean;
  contractQuantity?: InputNumber; contractAmount?: InputNumber;
  eligibilityReview?: VOEligibilityReview; needsEligibilityReview?: boolean;
}
export interface ClaimWorkRow extends ClaimRow {
  itemId: string; ref: string; description: string; unit: string; rate: InputNumber;
  verified: number; currentVerified: number | null; reported: number | null;
  requiresDateConfirmation: boolean; evidenceDateConfirmed: boolean;
  assessedQuantity: number | null; contractQuantity: InputNumber; contractAmount: InputNumber;
}
export interface ClaimVORow extends ClaimRow {
  caseId: string; reference: string; title: string; status: string;
  approvedValue: number | null; approvalReference: string; approver: string;
  approvalDate: string | null; approval: VOHistoryEntry | null; assessedValue: number | null;
}
export interface ClaimReview {
  projectId: string; period: string; currency: string; cutoff: string | null; baselineVersion: number;
  baselineLockedAt: string | null; assessment: ClaimAssessment; workRows: ClaimWorkRow[]; voRows: ClaimVORow[];
  totals: ClaimTotals; issues: string[]; canPrepare: boolean; selectedCount: number; excludedCount: number;
  validationErrors: string[]; claimBasis?: ClaimBasis;
}
export type ClaimSnapshot = ClaimReview;
export interface ClaimProjectDetails {
  id: string; code: string | null; name: string | null; country: string | null;
  description: string | null; contract: ContractDetails;
}
export interface ClaimDraft {
  id: string; projectId: string; period: string; revision: number; status: string; createdAt: string;
  preparedAt?: string; assessment: ClaimAssessment; snapshot: ClaimReview; projectDetails?: ClaimProjectDetails;
  revisionOf?: string; queryId?: string; revisionResponse?: string;
}
export interface ClaimQuery {
  id: string; date: string; reference: string; note: string; targetType?: string; targetId?: string;
}
export interface ClaimStageEvent {
  id: string; stage: string; date: string; reference: string; note: string; value: number | null;
  targetType?: string; targetId?: string; recordedAt: string;
}
export type ClaimStageFields = Omit<ClaimStageEvent, 'id' | 'recordedAt'>;
export interface ClaimTracking {
  projectId: string; draftId: string; status: string; currency: string | null; claimedValue: number | null;
  preparedAt: string | null; submittedAt: string | null; submissionReference: string; submissionNote: string;
  certifiedAt: string | null; certificationReference: string; certifiedValue: number | null; certificationNote: string;
  paidAt: string | null; paymentReference: string; paidValue: number | null; paymentNote: string;
  history: ClaimStageEvent[]; query?: ClaimQuery;
}
export interface ClaimEvidenceReference {
  id: string; kind: 'work' | 'vo'; rowId: string; rowRef: string | null; title: string | null;
  reportId: string | null; sourceMessageId: string | null; date: string | null; verifiedAt: string | null;
  reviewer: string | null; sender: string | null; message: string | null; photo: Exclude<SiteReport['photo'], undefined> | null;
  photoAlt: string | null; area: string | null; location: string | null; sourcePage: number | null;
  evidenceDateConfirmation: EvidenceDateConfirmation | null; approvalReference: string | null;
  approvalDate: string | null; approver: string | null; approvalStatus: string | null;
  areaProgress?: SiteReport['areaProgress'];
  channel?: string; reportedInstructionReference?: string | null;
}
export interface ClaimPack {
  id: string; draftId: string; projectId: string; period: string; cutoff: string | null; currency: string;
  revision: number; status: string; createdAt: string; preparedAt: string | null;
  baselineVersion: number; baselineLockedAt: string | null; metadataSource: 'snapshot' | 'current-fallback';
  metadataNotice: string; projectDetails: ClaimProjectDetails; workRows: ClaimWorkRow[]; voRows: ClaimVORow[];
  totals: ClaimTotals; assessment: ClaimAssessment; claimBasis?: ClaimBasis; issues: string[];
  canPrepare: boolean; evidenceRefs: ClaimEvidenceReference[]; prototypeNotice: string;
}
