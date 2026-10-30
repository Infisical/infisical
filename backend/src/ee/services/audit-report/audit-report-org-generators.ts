import { z } from "zod";

import { TClickHouseAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-clickhouse-dal";
import { TDynamicSecretLeaseDALFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-dal";
import { TInsightsDALFactory } from "@app/ee/services/insights/insights-dal";
import {
  buildAccessVolumeWindow,
  buildStaticSecretUsageWindow,
  STALE_SECRET_THRESHOLD_DAYS,
  toUtcDateString,
  VALUE_EVENT_TYPES
} from "@app/ee/services/insights/insights-fns";
import { TIdentityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { applyRowCap, NoInputsSchema } from "./audit-report-generators";
import { MAX_AUDIT_REPORT_ROWS, OrgAuditReportType, TGeneratedReport } from "./audit-report-types";

export type TOrgAuditReportGeneratorDALs = {
  insightsDAL: Pick<
    TInsightsDALFactory,
    "findProjectWarningsForOrg" | "findSecretCreationsByWeekForOrg" | "countSecretCreationsForOrg"
  >;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "countLeasesForOrg">;
  orgDAL: Pick<TOrgDALFactory, "countSecretManagerProjectMembers">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "countSecretManagerProjectIdentities">;
  // Undefined when the instance has no ClickHouse configured. Reports that need it are rejected at
  // request time; the run-time throw below is a defensive fallback for config changes in between.
  clickhouseAuditLogDAL?: Pick<TClickHouseAuditLogDALFactory, "countByDateForOrg" | "countByIdentityAuthMethodForOrg">;
};

export type TOrgReportGenerationContext = {
  orgId: string;
  dal: TOrgAuditReportGeneratorDALs;
};

// Mirrors TReportDefinition for project reports. `requiresClickhouse` lets the service reject a
// report the instance cannot produce before persisting anything.
export type TOrgReportDefinition = {
  type: OrgAuditReportType;
  label: string;
  inputsSchema: z.ZodTypeAny;
  requiresClickhouse?: boolean;
  run: (ctx: TOrgReportGenerationContext, rawInputs: unknown) => Promise<TGeneratedReport>;
};

const missingClickhouseError = (reportLabel: string) =>
  new Error(
    `The '${reportLabel}' report requires audit logs to be stored in ClickHouse, which is not enabled on this instance`
  );

const usageSummaryReport: TOrgReportDefinition = {
  type: OrgAuditReportType.OrgUsageSummary,
  label: "Usage Summary",
  inputsSchema: NoInputsSchema,
  run: async ({ orgId, dal }) => {
    const [activeLeases, users, machineIdentities] = await Promise.all([
      dal.dynamicSecretLeaseDAL.countLeasesForOrg(orgId),
      dal.orgDAL.countSecretManagerProjectMembers(orgId),
      dal.identityOrgMembershipDAL.countSecretManagerProjectIdentities(orgId)
    ]);

    return {
      columns: ["activeLeases", "users", "machineIdentities"],
      rows: [{ activeLeases, users, machineIdentities }],
      truncated: false
    };
  }
};

const needsAttentionReport: TOrgReportDefinition = {
  type: OrgAuditReportType.OrgNeedsAttention,
  label: "Needs Attention",
  inputsSchema: NoInputsSchema,
  run: async ({ orgId, dal }) => {
    const staleBefore = new Date();
    staleBefore.setDate(staleBefore.getDate() - STALE_SECRET_THRESHOLD_DAYS);

    const { projects } = await dal.insightsDAL.findProjectWarningsForOrg(orgId, {
      offset: 0,
      limit: MAX_AUDIT_REPORT_ROWS + 1,
      staleBefore,
      onlyWithIssues: true
    });

    const { items, truncated } = applyRowCap(projects);

    return {
      columns: [
        "projectName",
        "projectSlug",
        "duplicatedSecrets",
        "staleSecrets",
        "failedRotations",
        "failedSyncs",
        "orphanedLeases",
        "severityScore"
      ],
      truncated,
      rows: items.map((project) => ({
        projectName: project.projectName,
        projectSlug: project.projectSlug,
        // null (not 0) when the project has value blind indexing disabled: unknowable, not zero.
        duplicatedSecrets: project.warnings.duplicatedSecrets,
        staleSecrets: project.warnings.staleSecrets,
        failedRotations: project.warnings.failedRotations,
        failedSyncs: project.warnings.failedSyncs,
        orphanedLeases: project.warnings.orphanedLeases,
        severityScore: project.severityScore
      }))
    };
  }
};

const authMethodsReport: TOrgReportDefinition = {
  type: OrgAuditReportType.OrgAuthMethods,
  label: "Auth Methods (Past 7 Days)",
  inputsSchema: NoInputsSchema,
  requiresClickhouse: true,
  run: async ({ orgId, dal }) => {
    if (!dal.clickhouseAuditLogDAL) throw missingClickhouseError(authMethodsReport.label);

    const { startDate, endDate } = buildAccessVolumeWindow();
    const rows = await dal.clickhouseAuditLogDAL.countByIdentityAuthMethodForOrg({
      orgId,
      eventTypes: VALUE_EVENT_TYPES,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    const methodRows = rows
      .map((row) => ({ authMethod: row.authMethod, count: row.count }))
      .sort((a, b) => b.count - a.count);

    return { columns: ["authMethod", "count"], rows: methodRows, truncated: false };
  }
};

const staticSecretUsageReport: TOrgReportDefinition = {
  type: OrgAuditReportType.OrgStaticSecretUsage,
  label: "Static Secret Usage (Past 12 Weeks)",
  inputsSchema: NoInputsSchema,
  run: async ({ orgId, dal }) => {
    const { windowStart, currentWeekStart, weekStarts } = buildStaticSecretUsageWindow();
    const currentWeekStartStr = toUtcDateString(currentWeekStart);

    const [priorWeeks, createdThisWeek] = await Promise.all([
      dal.insightsDAL.findSecretCreationsByWeekForOrg(orgId, {
        createdAtOrAfter: windowStart,
        createdBefore: currentWeekStart
      }),
      dal.insightsDAL.countSecretCreationsForOrg(orgId, { createdAtOrAfter: currentWeekStart })
    ]);

    const creationsByWeek = new Map(priorWeeks.map((row) => [row.weekStart, row.count]));
    creationsByWeek.set(currentWeekStartStr, createdThisWeek);

    return {
      columns: ["weekStart", "totalSecrets", "isPartial"],
      // Weeks with no creations are zero-filled so the series stays at one row per week.
      rows: weekStarts.map((weekStart) => ({
        weekStart,
        totalSecrets: creationsByWeek.get(weekStart) ?? 0,
        // Report cells are string | number | null, so the in-progress-week flag is stringified.
        isPartial: String(weekStart === currentWeekStartStr)
      })),
      truncated: false
    };
  }
};

const secretAccessVolumeReport: TOrgReportDefinition = {
  type: OrgAuditReportType.OrgSecretAccessVolume,
  label: "Secret Access Volume (Past 7 Days)",
  inputsSchema: NoInputsSchema,
  requiresClickhouse: true,
  run: async ({ orgId, dal }) => {
    if (!dal.clickhouseAuditLogDAL) throw missingClickhouseError(secretAccessVolumeReport.label);

    const { dates, startDate, endDate } = buildAccessVolumeWindow();
    const rows = await dal.clickhouseAuditLogDAL.countByDateForOrg({
      orgId,
      eventTypes: VALUE_EVENT_TYPES,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    const countsByDate = new Map(rows.map((row) => [row.date, row.count]));

    return {
      columns: ["date", "total"],
      rows: dates.map((date) => ({ date, total: countsByDate.get(date) ?? 0 })),
      truncated: false
    };
  }
};

export const ORG_AUDIT_REPORT_DEFINITIONS: Record<OrgAuditReportType, TOrgReportDefinition> = {
  [OrgAuditReportType.OrgUsageSummary]: usageSummaryReport,
  [OrgAuditReportType.OrgNeedsAttention]: needsAttentionReport,
  [OrgAuditReportType.OrgAuthMethods]: authMethodsReport,
  [OrgAuditReportType.OrgStaticSecretUsage]: staticSecretUsageReport,
  [OrgAuditReportType.OrgSecretAccessVolume]: secretAccessVolumeReport
};
