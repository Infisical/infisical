import { z } from "zod";

import { OrgServiceActor } from "@app/lib/types";

export enum AuditReportType {
  StaleSecrets = "STALE_SECRETS",
  DuplicateSecrets = "DUPLICATE_SECRETS",
  SecretValidationCompliance = "SECRET_VALIDATION_COMPLIANCE",
  UpcomingRotations = "UPCOMING_ROTATIONS",
  FailedRotations = "FAILED_ROTATIONS",
  UpcomingReminders = "UPCOMING_REMINDERS",
  SecretAccessLog = "SECRET_ACCESS_LOG"
}

export enum AuditReportStatus {
  Pending = "pending",
  Processing = "processing",
  Completed = "completed",
  // At least one report in the batch hit the row cap (the report is still delivered, just truncated).
  Partial = "partial",
  Failed = "failed"
}

// Hard ceiling on rows per individual report. Beyond this the report is marked truncated.
export const MAX_AUDIT_REPORT_ROWS = 100_000;

export const MAX_CONCURRENT_AUDIT_REPORTS = 1;

export type TAuditReportConfig = {
  type: AuditReportType;
  inputs: Record<string, unknown>;
};

export const AuditReportResultEntrySchema = z.object({
  type: z.nativeEnum(AuditReportType),
  rowCount: z.number(),
  truncated: z.boolean()
});

export type TAuditReportResultEntry = z.infer<typeof AuditReportResultEntrySchema>;

export type TReportRow = Record<string, string | number | null>;

export type TGeneratedReport = {
  columns: string[];
  rows: TReportRow[];
  truncated: boolean;
};

export type TRequestAuditReportDTO = {
  projectId: string;
  reports: { type: AuditReportType; inputs?: Record<string, unknown> }[];
  emailRecipients?: string[];
};

export type TListAuditReportsDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
};

export type TGetAuditReportDTO = {
  projectId: string;
  auditReportId: string;
};

export type TDeleteAuditReportDTO = {
  projectId: string;
  auditReportId: string;
};

export type TAuditReportServiceActor = OrgServiceActor;

// Job payload for the generation queue.
export type TGenerateAuditReportJobPayload = {
  auditReportId: string;
};

export type TSecretToValidate = {
  key: string;
  value?: string;
  previousValues?: string[];
};
