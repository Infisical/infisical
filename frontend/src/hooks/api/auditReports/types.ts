export enum AuditReportType {
  StaleSecrets = "STALE_SECRETS",
  DuplicateSecrets = "DUPLICATE_SECRETS",
  SecretValidationCompliance = "SECRET_VALIDATION_COMPLIANCE",
  UpcomingRotations = "UPCOMING_ROTATIONS",
  FailedRotations = "FAILED_ROTATIONS",
  UpcomingReminders = "UPCOMING_REMINDERS",
  SecretAccessLog = "SECRET_ACCESS_LOG"
}

export enum OrgAuditReportType {
  OrgUsageSummary = "ORG_USAGE_SUMMARY",
  OrgNeedsAttention = "ORG_NEEDS_ATTENTION",
  OrgAuthMethods = "ORG_AUTH_METHODS",
  OrgStaticSecretUsage = "ORG_STATIC_SECRET_USAGE",
  OrgSecretAccessVolume = "ORG_SECRET_ACCESS_VOLUME"
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

export type TOrgAuditReportConfig = {
  type: OrgAuditReportType;
  inputs: Record<string, unknown>;
};

export type TOrgAuditReportResultEntry = {
  type: OrgAuditReportType;
  rowCount: number;
  truncated: boolean;
};

export type TOrgAuditReport = {
  id: string;
  orgId: string;
  requestedByUserId: string | null;
  status: AuditReportStatus;
  reportConfigs: TOrgAuditReportConfig[];
  emailRecipients: string[];
  resultSummary: TOrgAuditReportResultEntry[] | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TGetOrgAuditReportsDTO = {
  offset?: number;
  limit?: number;
};

export type TRequestOrgAuditReportDTO = {
  reports: { type: OrgAuditReportType; inputs?: Record<string, unknown> }[];
  emailRecipients?: string[];
};
