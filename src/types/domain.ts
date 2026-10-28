import type { ClaimDraft, ClaimTracking } from './claims';
export type { ClaimBasis, ClaimAssessmentRow, ClaimAssessment, ClaimRow, ClaimWorkRow, ClaimVORow, ClaimTotals, ClaimSnapshot, ClaimReview, ClaimDraft, ClaimTracking, ClaimStageEvent, ClaimQuery, ClaimPack } from './claims';
/** Browser-local prototype records. Optional fields represent retained legacy data. */
export type Scalar = string | number | boolean | null;
export type InputNumber = number | string | null;
export type DateInput = Date | string | number;
export type RecordValue = Record<string, unknown>;
export interface HistoryEntry {
  id?: string; action: string; detail?: string; date: string; actor?: string;
  [key: string]: unknown;
}
export interface DrawingPosition { x: number; y: number }
export interface DrawingArea {
  id: string; projectId: string; drawingId: string; code: string; name: string;
  page: number; position: DrawingPosition | null; workItemIds: string[]; updatedAt?: string;
  aliases?: string[];
  workItemQuantities?: Record<string, number>;
}
export interface AreaMappingSnapshot {
  areaId: string | null; code?: string; name?: string; drawingId?: string; page?: number;
  position?: DrawingPosition | null; workItemIds?: string[]; workItemQuantities?: Record<string, number>;
  aliases?: string[];
}
export interface DrawingMetadata {
  id: string; projectId: string; inputKind: 'sample' | 'upload' | 'provided'; kind: 'sample' | 'image' | 'pdf';
  fileName: string; fileSize: number | null; mimeType: string; uploadedAt: string; sourceId?: string;
}
export interface DrawingMapping {
  projectId: string; drawing: DrawingMetadata | null; areas: DrawingArea[]; history: DrawingHistory[];
}
export interface DrawingHistory {
  id?: string; action: string; date?: string; drawingId?: string; areaId?: string;
  area?: DrawingArea; previousArea?: DrawingArea | null; detail?: string;
  previousDrawing?: DrawingMetadata | null; previousAreas?: DrawingArea[];
}
export interface SourceDescriptor { id: string; asset: string; fileName: string; mimeType: string; label?: string; note?: string }
export interface ContractImportMetadata { inputKind: string; fileName: string; fileSize: number | null; importedAt: string; recovery?: Record<string, unknown> }
export interface ContractDetails {
  id?: string; name?: string; projectName?: string; reference?: string | null; date?: string | null;
  dateLabel?: string | null; mainContractor?: string | null; subcontractor?: string | null;
  currency?: string | null; totalAmount?: InputNumber; valuationBasis?: string | null;
  sourceKind?: string; sourceProfile?: string; sourceFilename?: string | null; sourceFile?: string | null;
  sourcePage?: number | null; sourcePageCount?: number | null; scope?: string | null; sampleNote?: string;
  sourceSummary?: string; demoImport?: ContractImportMetadata; hasDrawing?: boolean; representativeSubset?: boolean; demo?: boolean;
  demoNotice?: string; gracePeriodMonths?: number | null; durationNote?: string | null; pricingNote?: string | null;
  sourceSectionTotals?: { id: string; name: string; amount: number }[];
  aliases?: Record<string, string[]>;
  demoAreas?: { id: string; name: string; location: string; itemIds: string[]; demo?: boolean }[];
  drawingSource?: SourceDescriptor; quantityBasis?: string | null;
  [key: string]: unknown;
}
export interface WorkItem {
  id: string; ref: string; description: string; location: string; unit: string;
  quantity: number | null; rate: number | null; amount: number | null;
  pricingType: string; section?: string; subsection?: string; startDate?: string | null;
  durationMonths?: number | null; needsReview?: boolean; reported: number | null; projectCode?: string; verified: number | null;
  sourcePage?: number | null; sourceRef?: string | null; sourceReference?: string | null;
  sourceNote?: string; quantityBasis?: string; progressIsDemo?: boolean; demoArea?: string;
  extractionRecovery?: { method: string; [key: string]: unknown }; rawExtractedQuantity?: InputNumber; reviewedQuantity?: InputNumber; extractionNote?: string;
  reviewedAt?: string; reviewedBy?: string; projectId?: string;
  [key: string]: unknown;
}
export interface AreaProgressSnapshot {
  areaId: string; itemId: string; allocatedQuantity: number; contractQuantity: number;
}
export interface MessageMatchFields { itemId: string; areaId: string; completion: number }
export interface MessageMatchSuggestion {
  version: 1; origin: 'mock'; baselineVersion: number; fields: MessageMatchFields; sourceExcerpt: string; reason: string;
}
export interface MessageMatchLabels {
  itemId: string; itemRef: string; itemDescription: string; areaId: string; areaCode: string; areaName: string;
}
export interface MessageMatchReview {
  id: string; projectId: string; messageId: string; baselineVersion: number; sourceKey: string;
  originalSuggestion: MessageMatchSuggestion; fields: MessageMatchFields; reason: string; reviewedBy: string; reviewedAt: string;
  areaMapping: AreaMappingSnapshot; areaProgress?: AreaProgressSnapshot;
  suggested: MessageMatchLabels; confirmed: MessageMatchLabels;
}
export interface VoiceNoteAudio {
  version: 1; asset: '/assets/demo-voice-clear.wav' | '/assets/demo-voice-unclear.wav' | '/assets/demo-sit-voice-clear.wav' | '/assets/demo-sit-voice-unclear.wav';
  mimeType: 'audio/wav'; durationSeconds: number; demo: true; clarity: 'clear' | 'unclear';
}
export interface VoiceTranscriptReview {
  version: 1; id: string; projectId: string; messageId: string; sourceKey: string; sourceFingerprint: string;
  previousReviewId: string | null; audio: VoiceNoteAudio; originalTranscript: string; transcript: string;
  reason: string; reviewedBy: string; reviewedAt: string;
}
export interface VoiceNoteEvidence {
  version: 1; projectId: string; messageId: string; audio: VoiceNoteAudio; originalTranscript: string;
  reviewedTranscript: string | null; reason: string; reviewedBy: string | null; reviewedAt: string | null; reviewId: string | null; sourceKey: string;
}
export interface SiteReport {
  id: string; itemId?: string | null; projectId?: string; projectCode?: string; sourceMessageId?: string;
  kind?: string; vo?: boolean; channel?: string; status: string; sender?: string; senderRole?: string;
  date?: string; message?: string; text?: string; completion?: number | null; completionBasis?: string;
  area?: string | null; location?: string | null; photo?: string | { url: string } | null; photoAlt?: string | null;
  note?: string; demo?: boolean; origin?: string; verifiedBy?: string; verifiedAt?: string;
  reviewReason?: string; clarificationRequestedAt?: string; clarificationRequestedBy?: string;
  reportedInstructionReference?: string; approvedCompletion?: number | null;
  areaMapping?: AreaMappingSnapshot | null; areaProgress?: AreaProgressSnapshot; scopeLabel?: string;
  matchReview?: MessageMatchReview;
  voiceNote?: VoiceNoteEvidence;
  manualEntry?: { version: number; submissionId: string; input: Record<string, string> };
  supersededByReportId?: string; supersededAt?: string; supersededBy?: string; supersededReason?: string;
  [key: string]: unknown;
}
export interface WhatsAppMessage {
  id: string; projectId: string; projectCode: string; kind: string; status: string; text: string;
  sender: string; senderRole?: string; date: string; itemId?: string | null;
  area?: string | null; areaId?: string | null; location?: string | null; completion?: number | null; completionBasis?: string;
  photo?: string | null; photoAlt?: string | null; processingNote?: string; processedAt?: string; reportId?: string;
  areaMapping?: AreaMappingSnapshot | null; areaProgress?: AreaProgressSnapshot; replyToMessageId?: string; clarificationThreadId?: string;
  clarificationReplyMessageId?: string; clarificationRequestedAt?: string; clarificationRequestedBy?: string;
  matchSuggestion?: MessageMatchSuggestion;
  audio?: VoiceNoteAudio; originalTranscript?: string; voiceSourceKey?: string;
  originalVoiceNote?: VoiceNoteEvidence;
  demoIntake?: { version: 1; submissionId: string; input: { projectId: string; text: string; photoId: string };
    previewKey: string; receivedAt: string; status: 'ready' | 'clarification'; issues: string[] };
  demoPhotoHistory?: { photo: string; photoAlt?: string }[]; vo?: boolean; demo?: boolean; origin?: string; channel?: string;
  [key: string]: unknown;
}
export interface VOHistoryEntry {
  id?: string; date: string; action: string; from?: string; to?: string; actor?: string;
  snapshot?: Partial<VOReview>; changes?: Partial<VOReview>; values?: Partial<VOReview>; note?: string;
  [key: string]: unknown;
}
export interface VOReview {
  id: string; reportId: string; projectId: string; reference: string; status: string; title: string;
  scopeAssessment: string; instructionReference: string; proposedValue: number | null; approvedValue: number | null;
  approvalReference: string; approver: string; scopeDisposition: string; instructionStatus: string;
  executionStatus: string; executionReference: string; claimEligibility: string; eligibilityNote: string;
  eligibilityReviewedAt: string | null; executionVerifiedAt: string | null; reviewNote: string;
  relatedItemId: string | null; history: VOHistoryEntry[]; reviewChecksVersion?: number;
  [key: string]: unknown;
}
export interface VOEvidenceLink {
  version: 1; id: string; projectId: string; sourceCaseId: string; targetCaseId: string;
  sourceReference: string; targetReference: string; reason: string; linkedAt: string; linkedBy: string;
  sourceReport: SiteReport;
}
export interface VORelatedEvidence { link: VOEvidenceLink; report: SiteReport }
export interface VOCase extends VOReview { report: SiteReport; linkedTo?: VOEvidenceLink; evidenceLinkIssue?: true }
export type VOConfirmationReplyKind = 'scopeAcknowledged' | 'priceApproved' | 'changesRequested';
export interface VOConfirmationSnapshot {
  projectId: string; projectCode: string; projectName: string; caseId: string; reference: string;
  title: string; scopeAssessment: string; instructionReference: string; proposedValue: number | null;
  currency: string; reviewCycle: string; scopeDisposition: string; instructionStatus: string;
  relatedItemId: string | null; baselineVersion: number;
}
export interface VOConfirmationReply {
  kind: VOConfirmationReplyKind; message: string; repliedAt: string; respondent: string; channel: 'demo';
}
export interface VOConfirmationRequest {
  id: string; projectId: string; caseId: string; reference: string; version: number; sourceKey: string;
  requestedAt: string; requestedBy: string; recipient: string; authority: string; channel: 'demo';
  snapshot: VOConfirmationSnapshot; reply?: VOConfirmationReply;
  historyInvalid?: true;
}
export interface ContractVersionMetadata {
  projectId?: string; version: number; createdAt?: string | null; createdBy?: string | null;
  reason?: string | null; confirmedAt?: string | null; confirmedBy?: string | null;
}
export interface ContractBaseline extends ContractVersionMetadata {
  date?: string | null; items: WorkItem[]; projectSnapshot?: { id: string; code?: string; name?: string | null; country?: string | null; contract?: ContractDetails };
  [key: string]: unknown;
}
export interface ContractTotalReview {
  version: number; projectId: string; baselineVersion: number; reason: string; reviewedBy: string; reviewedAt: string;
  scopeKey: string; currency: string | null; recordedTotal: number | null; calculatedTotal: number | null;
  declaredTotal: number | null; difference: number | null; itemSnapshot: ({ id: string } & Record<string, Scalar>)[]; contractSnapshot: Record<string, Scalar>;
}
export interface MessageClarification {
  id: string; projectId: string; sourceMessageId: string; original: WhatsAppMessage;
  request: { question: string; date: string; actor: string }; replyMessageId?: string;
}

export interface ProjectWorkflow {
  sourceItems: WorkItem[]; items: WorkItem[]; reports: SiteReport[]; history: HistoryEntry[];
  baselines: ContractBaseline[]; locked: boolean; version: number; lockedAt?: string;
  voReviews: VOReview[]; claimDrafts: ClaimDraft[]; claimTracking?: ClaimTracking[]; messageClarifications?: MessageClarification[];
  messageMatchReviews?: MessageMatchReview[];
  voiceTranscriptReviews?: VoiceTranscriptReview[];
  voConfirmationRequests?: VOConfirmationRequest[];
  voEvidenceLinks?: VOEvidenceLink[]; voEvidenceLinkIssues?: string[];
  whatsappMessages?: WhatsAppMessage[]; drawingMapping?: DrawingMapping; contractVersion?: ContractVersionMetadata; contractTotalReviews?: ContractTotalReview[];
}
export type DemoKind = 'drawing-progress' | 'area-split' | 'area-alias' | 'message-match' | 'voice-note' | 'claim-examples';
export type ProjectDemoKind = DemoKind | 'contract-scenario' | 'campus' | 'warehouse' | 'sample-project';
export interface Project extends ProjectWorkflow {
  id: string; code: string; name: string; country: string; description: string; contract: ContractDetails; whatsappMessages: WhatsAppMessage[];
  seed: ProjectWorkflow; drawingMapping?: DrawingMapping; demoKind?: ProjectDemoKind; demoTemplate?: string; claimExamplesDemo?: boolean; providedContractDemo?: boolean; areaSplitDemo?: boolean;
  [key: string]: unknown;
}
export interface Workspace { schemaVersion: number; activeProjectId: string; projects: Project[]; sitShowcase?: { version: number; projectId: string }; [key: string]: unknown }
export interface AttentionTarget {
  route: string; itemId?: string; reportId?: string; messageId?: string; caseId?: string; draftId?: string;
  revisionSourceId?: string; period?: string;
}
export interface AttentionTask {
  id: string; projectId: string; category: string; kind: string; title: string; detail: string; reference: string;
  statusLabel: string; actionLabel: string; date: string | null; priority: number; target: AttentionTarget;
}
export interface ProjectValues { name?: string; code?: string; country?: string; subcontractor?: string; description?: string }
export interface MutationResult<T = Project> { project: T; outcome: string; error?: string; [key: string]: unknown }
