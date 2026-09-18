import { OrgAuditReportType } from "@app/hooks/api/auditReports";

export const ORG_AUDIT_REPORT_TYPE_LABELS: Record<OrgAuditReportType, string> = {
  [OrgAuditReportType.OrgUsageSummary]: "Usage Summary",
  [OrgAuditReportType.OrgNeedsAttention]: "Needs Attention",
  [OrgAuditReportType.OrgAuthMethods]: "Auth Methods (Past 7 Days)",
  [OrgAuditReportType.OrgStaticSecretUsage]: "Static Secret Usage (Past 12 Weeks)",
  [OrgAuditReportType.OrgSecretAccessVolume]: "Secret Access Volume (Past 7 Days)"
};

export const ORG_AUDIT_REPORT_TYPE_DESCRIPTIONS: Record<OrgAuditReportType, string> = {
  [OrgAuditReportType.OrgUsageSummary]:
    "Organization-wide counts of active leases, users, and machine identities.",
  [OrgAuditReportType.OrgNeedsAttention]:
    "Projects ranked by severity: duplicated secrets, stale secrets, failed rotations and syncs, orphaned leases.",
  [OrgAuditReportType.OrgAuthMethods]:
    "How often each machine identity authentication method accessed a secret value over the past week.",
  [OrgAuditReportType.OrgStaticSecretUsage]:
    "Static secrets created per week over the last twelve weeks.",
  [OrgAuditReportType.OrgSecretAccessVolume]: "Secret access events per day over the past week."
};

export const ORG_AUDIT_REPORT_TYPES_ORDERED: OrgAuditReportType[] = [
  OrgAuditReportType.OrgUsageSummary,
  OrgAuditReportType.OrgNeedsAttention,
  OrgAuditReportType.OrgAuthMethods,
  OrgAuditReportType.OrgStaticSecretUsage,
  OrgAuditReportType.OrgSecretAccessVolume
];

// These reports read from the audit log analytics store (ClickHouse); hide them when the
// instance doesn't support it, since the backend rejects requests for them up front.
export const ORG_AUDIT_REPORT_TYPES_REQUIRING_AUDIT_LOG: OrgAuditReportType[] = [
  OrgAuditReportType.OrgAuthMethods,
  OrgAuditReportType.OrgSecretAccessVolume
];
