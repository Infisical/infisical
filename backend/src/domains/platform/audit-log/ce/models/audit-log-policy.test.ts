import { describe, expect, test } from "vitest";

import { AuditLogPolicy } from "./audit-log-policy";
import { AuditLogEventClass, getAuditLogEventClass } from "./event-class";
import { EventType } from "./event-type";

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const daysAfter = (days: number) => new Date(createdAt.getTime() + days * MS_IN_DAY);

describe("AuditLogPolicy.expiresAt", () => {
  test("should use the plan's retention when the project has none", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 90, projectRetentionDays: null });

    // Action
    const expiresAt = policy.expiresAt(createdAt);

    // Assert
    expect(expiresAt).toEqual(daysAfter(90));
  });

  test("should use the project's retention when it is within the plan's", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 90, projectRetentionDays: 30 });

    // Action
    const expiresAt = policy.expiresAt(createdAt);

    // Assert
    expect(expiresAt).toEqual(daysAfter(30));
  });

  test("should fall back to the plan's retention when the project's exceeds it", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 90, projectRetentionDays: 365 });

    // Action
    const expiresAt = policy.expiresAt(createdAt);

    // Assert
    expect(expiresAt).toEqual(daysAfter(90));
  });

  test("should use the project's retention under an unlimited plan", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: null, projectRetentionDays: 365 });

    // Action
    const expiresAt = policy.expiresAt(createdAt);

    // Assert
    expect(expiresAt).toEqual(daysAfter(365));
  });

  test("should cap an unlimited plan at the maximum expiry", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: null });

    // Action
    const expiresAt = policy.expiresAt(createdAt);

    // Assert
    expect(expiresAt).toEqual(new Date("2100-01-01T00:00:00.000Z"));
    expect(expiresAt).toEqual(AuditLogPolicy.MAX_EXPIRES_AT);
  });

  test("should cap a long finite retention at the maximum expiry", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 365 * 500 });

    // Action
    const expiresAt = policy.expiresAt(createdAt);

    // Assert
    expect(expiresAt).toEqual(AuditLogPolicy.MAX_EXPIRES_AT);
  });
});

describe("AuditLogPolicy.keeps", () => {
  const switchesOff = { authentication: false, authorization: false };
  const switchesOn = { authentication: true, authorization: true };

  test("should always keep management and data-access events whatever the switches", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 30, eventClasses: switchesOff });

    // Action
    const management = policy.keeps(EventType.CREATE_SECRET);
    const dataAccess = policy.keeps(EventType.GET_SECRETS);

    // Assert
    expect(getAuditLogEventClass(EventType.CREATE_SECRET)).toBe(AuditLogEventClass.Management);
    expect(getAuditLogEventClass(EventType.GET_SECRETS)).toBe(AuditLogEventClass.DataAccess);
    expect(management).toBe(true);
    expect(dataAccess).toBe(true);
  });

  test("should drop an authentication event when its switch is off", () => {
    // Setup
    const policy = AuditLogPolicy.create({
      retentionDays: 30,
      eventClasses: { authentication: false, authorization: true }
    });

    // Action
    const kept = policy.keeps(EventType.USER_LOGIN);

    // Assert
    expect(getAuditLogEventClass(EventType.USER_LOGIN)).toBe(AuditLogEventClass.Authentication);
    expect(kept).toBe(false);
  });

  test("should keep an authentication event when its switch is on", () => {
    // Setup
    const policy = AuditLogPolicy.create({
      retentionDays: 30,
      eventClasses: { authentication: true, authorization: false }
    });

    // Action
    const kept = policy.keeps(EventType.USER_LOGIN);

    // Assert
    expect(kept).toBe(true);
  });

  test("should drop an authorization event when its switch is off", () => {
    // Setup
    const policy = AuditLogPolicy.create({
      retentionDays: 30,
      eventClasses: { authentication: true, authorization: false }
    });

    // Action
    const kept = policy.keeps(EventType.PERMISSION_DENIED);

    // Assert
    expect(getAuditLogEventClass(EventType.PERMISSION_DENIED)).toBe(AuditLogEventClass.Authorization);
    expect(kept).toBe(false);
  });

  test("should keep an authorization event when its switch is on", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 30, eventClasses: switchesOn });

    // Action
    const kept = policy.keeps(EventType.PERMISSION_DENIED);

    // Assert
    expect(kept).toBe(true);
  });

  test("should keep a switchable event when no switches are given", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 30 });

    // Action
    const kept = policy.keeps(EventType.PERMISSION_DENIED);

    // Assert
    expect(kept).toBe(true);
  });

  test("should drop every event when retention is 0", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 0, eventClasses: switchesOn });

    // Action
    const results = [EventType.CREATE_SECRET, EventType.GET_SECRETS, EventType.USER_LOGIN].map((type) =>
      policy.keeps(type)
    );

    // Assert
    expect(policy.keepsLogs).toBe(false);
    expect(results).toEqual([false, false, false]);
  });
});

describe("AuditLogPolicy.needsEventClasses", () => {
  test("should be true only for switchable classes", () => {
    // Setup
    const types = {
      management: EventType.CREATE_SECRET,
      dataAccess: EventType.GET_SECRETS,
      authentication: EventType.USER_LOGIN,
      authorization: EventType.PERMISSION_DENIED
    };

    // Action
    const needs = Object.fromEntries(
      Object.entries(types).map(([name, type]) => [name, AuditLogPolicy.needsEventClasses(type)])
    );

    // Assert
    expect(needs).toEqual({ management: false, dataAccess: false, authentication: true, authorization: true });
  });
});

describe("AuditLogPolicy.isWithinPlan", () => {
  test("should allow any retention under an unlimited plan and only up to the plan's otherwise", () => {
    // Setup / Action / Assert
    expect(AuditLogPolicy.isWithinPlan(10_000, null)).toBe(true);
    expect(AuditLogPolicy.isWithinPlan(90, 90)).toBe(true);
    expect(AuditLogPolicy.isWithinPlan(91, 90)).toBe(false);
  });
});
