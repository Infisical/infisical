import { TFeatureSet } from "../license/license-types";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

// Unlimited retention still needs a concrete expiry: ClickHouse stores expiresAt as a non-nullable
// DateTime64 and its TTL casts it with toDateTime, which overflows after 2106-02-07. Every expiry is
// capped here so no retention value can reach that overflow.
export const MAX_AUDIT_LOG_EXPIRES_AT = new Date("2100-01-01T00:00:00.000Z");

// Bounds what a project can request: past the expiry cap, so it never limits an unlimited plan, and
// inside the integer column, so an oversized value is a 400 rather than a failed write.
export const MAX_PROJECT_AUDIT_LOG_RETENTION_DAYS = 36_500;

type TAuditLogRetentionPlan = Pick<TFeatureSet, "auditLogsRetentionDays">;

// A null retention is the License Server's "No limit"; 0 means the plan keeps no audit logs.
export const hasAuditLogRetention = (plan: TAuditLogRetentionPlan) =>
  plan.auditLogsRetentionDays === null || plan.auditLogsRetentionDays > 0;

export const isWithinPlanAuditLogRetention = (days: number, plan: TAuditLogRetentionPlan) =>
  plan.auditLogsRetentionDays === null || days <= plan.auditLogsRetentionDays;

export const getAuditLogExpiresAt = (
  createdAt: Date,
  plan: TAuditLogRetentionPlan,
  projectRetentionDays?: number | null
) => {
  const retentionDays =
    projectRetentionDays && isWithinPlanAuditLogRetention(projectRetentionDays, plan)
      ? projectRetentionDays
      : plan.auditLogsRetentionDays;

  if (retentionDays === null) return MAX_AUDIT_LOG_EXPIRES_AT;

  return new Date(Math.min(createdAt.getTime() + retentionDays * MS_IN_DAY, MAX_AUDIT_LOG_EXPIRES_AT.getTime()));
};
