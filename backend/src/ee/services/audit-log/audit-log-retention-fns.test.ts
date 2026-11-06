import { describe, expect, test } from "vitest";

import {
  getAuditLogExpiresAt,
  hasAuditLogRetention,
  isWithinPlanAuditLogRetention,
  MAX_AUDIT_LOG_EXPIRES_AT
} from "./audit-log-retention-fns";

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const createdAt = new Date("2026-10-13T00:00:00.000Z");

describe("hasAuditLogRetention", () => {
  test("treats null as unlimited and 0 as no retention", () => {
    expect(hasAuditLogRetention({ auditLogsRetentionDays: null })).toBe(true);
    expect(hasAuditLogRetention({ auditLogsRetentionDays: 30 })).toBe(true);
    expect(hasAuditLogRetention({ auditLogsRetentionDays: 0 })).toBe(false);
  });
});

describe("isWithinPlanAuditLogRetention", () => {
  test("accepts any value under an unlimited plan and caps a finite one", () => {
    expect(isWithinPlanAuditLogRetention(10_000, { auditLogsRetentionDays: null })).toBe(true);
    expect(isWithinPlanAuditLogRetention(90, { auditLogsRetentionDays: 90 })).toBe(true);
    expect(isWithinPlanAuditLogRetention(91, { auditLogsRetentionDays: 90 })).toBe(false);
  });
});

describe("getAuditLogExpiresAt", () => {
  test("uses the plan retention when the project sets none", () => {
    expect(getAuditLogExpiresAt(createdAt, { auditLogsRetentionDays: 30 }, null).getTime()).toBe(
      createdAt.getTime() + 30 * MS_IN_DAY
    );
  });

  test("uses a project retention lower than the plan, and ignores a higher one", () => {
    expect(getAuditLogExpiresAt(createdAt, { auditLogsRetentionDays: 30 }, 5).getTime()).toBe(
      createdAt.getTime() + 5 * MS_IN_DAY
    );
    expect(getAuditLogExpiresAt(createdAt, { auditLogsRetentionDays: 30 }, 60).getTime()).toBe(
      createdAt.getTime() + 30 * MS_IN_DAY
    );
  });

  test("expires at the cap under an unlimited plan", () => {
    expect(getAuditLogExpiresAt(createdAt, { auditLogsRetentionDays: null })).toEqual(MAX_AUDIT_LOG_EXPIRES_AT);
  });

  test("clamps a retention that would run past the cap", () => {
    expect(getAuditLogExpiresAt(createdAt, { auditLogsRetentionDays: null }, 1_000_000)).toEqual(
      MAX_AUDIT_LOG_EXPIRES_AT
    );
    expect(getAuditLogExpiresAt(createdAt, { auditLogsRetentionDays: 1_000_000 })).toEqual(MAX_AUDIT_LOG_EXPIRES_AT);
  });
});
