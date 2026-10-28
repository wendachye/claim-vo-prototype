/** Read-only fields recognised in a daily KPI message. Reported strings are not measured quantities. */
export interface DailyKPIMessage {
  reportedDate: string | null;
  locations: string[];
  teams: string[];
  manpower: string[];
  activities: string[];
  dimensions: string[];
  workingHours: string[];
  remarks: string[];
  issues: string[];
}

/** Immutable original daily report retained separately from its cumulative clarification reply. */
export interface DailyKPIEvidence {
  version: 1;
  projectId: string;
  projectCode: string;
  messageId: string;
  text: string;
  sender: string;
  senderRole: string | null;
  date: string;
  photo: string | null;
  photoAlt: string | null;
}
