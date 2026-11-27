import { OrgAuditReportType } from "@app/hooks/api/auditReports/types";

import type { ReportOption } from "../../../secret-manager/InsightsPage/shared/generate-report-dialog";

export const MAX_REPORT_RECIPIENTS = 20;

const REPORT_OPTIONS: ReportOption<OrgAuditReportType>[] = [
  {
    type: OrgAuditReportType.OrgUsageSummary,
    label: "Usage Summary",
    description: "Organization-wide counts of active leases, users, and machine identities."
  },
  {
    type: OrgAuditReportType.OrgNeedsAttention,
    label: "Needs Attention",
    description:
      "Projects ranked by severity: duplicated secrets, stale secrets, failed rotations and syncs, orphaned leases."
  },
  {
    type: OrgAuditReportType.OrgAuthMethods,
    label: "Auth Methods (Past 7 Days)",
    description:
      "How often each machine identity authentication method accessed a secret value over the past week."
  },
  {
    type: OrgAuditReportType.OrgStaticSecretUsage,
    label: "Static Secret Usage (Past 12 Weeks)",
    description: "Static secrets created per week over the last twelve weeks."
  },
  {
    type: OrgAuditReportType.OrgSecretAccessVolume,
    label: "Secret Access Volume (Past 7 Days)",
    description: "Secret access events per day over the past week."
  }
];

// These read from the audit log analytics store, which the backend rejects up front when the
// instance doesn't have it.
const REQUIRES_AUDIT_LOG_ANALYTICS = new Set([
  OrgAuditReportType.OrgAuthMethods,
  OrgAuditReportType.OrgSecretAccessVolume
]);

export const reportOptions = (isAuditLogAnalyticsEnabled: boolean) =>
  REPORT_OPTIONS.filter(
    (option) => isAuditLogAnalyticsEnabled || !REQUIRES_AUDIT_LOG_ANALYTICS.has(option.type)
  );
