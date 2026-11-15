import { formatDistanceToNow, parseISO } from "date-fns";

import { AuditReportStatus, AuditReportType } from "@app/hooks/api/auditReports/types";

import { v4Path } from "../../links";

const OVERVIEW = v4Path("/organizations/$orgId/projects/secret-management/$projectId/overview");

export const overviewLink = (
  orgId: string,
  projectId: string,
  search: { secretPath?: string; environments?: string[]; search?: string; filterBy?: string }
) => ({ to: OVERVIEW, params: { orgId, projectId }, search });

export const fromNow = (date: string) => formatDistanceToNow(parseISO(date), { addSuffix: true });

export const plural = (count: number, noun: string, many = `${noun}s`) =>
  `${count.toLocaleString()} ${count === 1 ? noun : many}`;

export const AUDIT_REPORT_OPTIONS = [
  {
    type: AuditReportType.StaleSecrets,
    label: "Stale Secrets",
    description: "Secrets not updated within the last 90 days."
  },
  {
    type: AuditReportType.DuplicateSecrets,
    label: "Duplicate Secrets",
    description: "Secrets sharing the same value across environments and paths."
  },
  {
    type: AuditReportType.SecretValidationCompliance,
    label: "Secret Validation Compliance Violations",
    description: "Stored secrets that violate a secret validation rule covering them."
  },
  {
    type: AuditReportType.UpcomingRotations,
    label: "Upcoming Rotations",
    description: "Rotations scheduled within the next 7 days."
  },
  {
    type: AuditReportType.FailedRotations,
    label: "Failed Rotations",
    description: "Rotations currently in a failed state."
  },
  {
    type: AuditReportType.UpcomingReminders,
    label: "Upcoming Reminders",
    description: "Secret reminders due within the next 7 days."
  },
  {
    type: AuditReportType.SecretAccessLog,
    label: "Secret Access Log",
    description: "Who accessed secrets over the last 30 days."
  }
];

export const auditReportLabel = (type: AuditReportType) =>
  AUDIT_REPORT_OPTIONS.find((option) => option.type === type)?.label ?? type;

export const AUDIT_REPORT_STATUS: Record<
  AuditReportStatus,
  { label: string; tone: "soft" | "info" | "ok" | "warn" | "bad" }
> = {
  [AuditReportStatus.Completed]: { label: "Completed", tone: "ok" },
  [AuditReportStatus.Partial]: { label: "Partial", tone: "warn" },
  [AuditReportStatus.Failed]: { label: "Failed", tone: "bad" },
  [AuditReportStatus.Processing]: { label: "Generating", tone: "info" },
  [AuditReportStatus.Pending]: { label: "Pending", tone: "soft" }
};
