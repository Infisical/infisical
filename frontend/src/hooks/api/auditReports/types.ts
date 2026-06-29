export enum AuditReportType {
  StaleSecrets = "STALE_SECRETS",
  DuplicateSecrets = "DUPLICATE_SECRETS",
  SecretValidationCompliance = "SECRET_VALIDATION_COMPLIANCE",
  UpcomingRotations = "UPCOMING_ROTATIONS",
  FailedRotations = "FAILED_ROTATIONS",
  UpcomingReminders = "UPCOMING_REMINDERS",
  OverdueReminders = "OVERDUE_REMINDERS",
  SecretAccessLog = "SECRET_ACCESS_LOG"
}

export enum AuditReportStatus {
  Pending = "pending",
  Processing = "processing",
  Completed = "completed",
  Partial = "partial",
  Failed = "failed"
}

export type TAuditReportConfig = {
  type: AuditReportType;
  inputs: Record<string, unknown>;
};

export type TAuditReportResultEntry = {
  type: AuditReportType;
  rowCount: number;
  truncated: boolean;
};

export type TAuditReport = {
  id: string;
  projectId: string;
  requestedByUserId: string | null;
  status: AuditReportStatus;
  reportConfigs: TAuditReportConfig[];
  emailRecipients: string[];
  resultSummary: TAuditReportResultEntry[] | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TGetAuditReportsDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
};

export type TRequestAuditReportDTO = {
  projectId: string;
  reports: { type: AuditReportType; inputs?: Record<string, unknown> }[];
  emailRecipients?: string[];
};

export type TDeleteAuditReportDTO = {
  projectId: string;
  auditReportId: string;
};
