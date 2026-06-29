import { AuditReportStatus, AuditReportType } from "@app/hooks/api/auditReports";

export const AUDIT_REPORT_TYPE_LABELS: Record<AuditReportType, string> = {
  [AuditReportType.StaleSecrets]: "Stale Secrets",
  [AuditReportType.DuplicateSecrets]: "Duplicate Secrets",
  [AuditReportType.SecretValidationCompliance]: "Secret Validation Compliance Violations",
  [AuditReportType.UpcomingRotations]: "Upcoming Rotations",
  [AuditReportType.FailedRotations]: "Failed Rotations",
  [AuditReportType.UpcomingReminders]: "Upcoming Reminders",
  [AuditReportType.OverdueReminders]: "Overdue Reminders",
  [AuditReportType.SecretAccessLog]: "Secret Access Log"
};

export const AUDIT_REPORT_TYPE_DESCRIPTIONS: Record<AuditReportType, string> = {
  [AuditReportType.StaleSecrets]: "Secrets not updated within the last 90 days.",
  [AuditReportType.DuplicateSecrets]:
    "Secrets sharing the same value across environments and paths.",
  [AuditReportType.SecretValidationCompliance]:
    "Stored secrets that violate a secret validation rule covering them.",
  [AuditReportType.UpcomingRotations]: "Rotations scheduled within the next 7 days.",
  [AuditReportType.FailedRotations]: "Rotations currently in a failed state.",
  [AuditReportType.UpcomingReminders]: "Secret reminders due within the next 7 days.",
  [AuditReportType.OverdueReminders]: "Secret reminders that are past due.",
  [AuditReportType.SecretAccessLog]: "Who accessed secrets over the last 30 days."
};

export const AUDIT_REPORT_TYPES_ORDERED: AuditReportType[] = [
  AuditReportType.StaleSecrets,
  AuditReportType.DuplicateSecrets,
  AuditReportType.SecretValidationCompliance,
  AuditReportType.UpcomingRotations,
  AuditReportType.FailedRotations,
  AuditReportType.UpcomingReminders,
  AuditReportType.OverdueReminders,
  AuditReportType.SecretAccessLog
];

type AuditReportStatusBadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";

export const getAuditReportStatusBadge = (
  status: AuditReportStatus
): { label: string; variant: AuditReportStatusBadgeVariant } => {
  switch (status) {
    case AuditReportStatus.Completed:
      return { label: "Completed", variant: "success" };
    case AuditReportStatus.Partial:
      return { label: "Partial", variant: "warning" };
    case AuditReportStatus.Failed:
      return { label: "Failed", variant: "danger" };
    case AuditReportStatus.Processing:
      return { label: "Generating", variant: "info" };
    case AuditReportStatus.Pending:
    default:
      return { label: "Pending", variant: "neutral" };
  }
};
