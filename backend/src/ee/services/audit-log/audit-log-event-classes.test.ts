import { describe, expect, test } from "vitest";

import {
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASS_MEMBERS,
  AuditLogEventClass,
  getAuditLogEventClass,
  getEventTypesForClasses,
  resolveEventClassFilter
} from "./audit-log-event-classes";
import { EventType } from "./audit-log-types";

describe("audit log event classes", () => {
  test("every event type belongs to exactly one class", () => {
    const seen = new Map<EventType, AuditLogEventClass[]>();
    Object.entries(AUDIT_LOG_EVENT_CLASS_MEMBERS).forEach(([eventClass, members]) => {
      members.forEach((type) => {
        seen.set(type, [...(seen.get(type) ?? []), eventClass as AuditLogEventClass]);
      });
    });

    const duplicates = [...seen.entries()].filter(([, classes]) => classes.length > 1);
    expect(duplicates).toEqual([]);

    const missing = Object.values(EventType).filter((type) => !seen.has(type));
    expect(missing).toEqual([]);
    expect(seen.size).toBe(Object.values(EventType).length);
  });

  test("every class has a default and only authorization is off", () => {
    expect(Object.keys(AUDIT_LOG_EVENT_CLASS_DEFAULTS).sort()).toEqual(Object.values(AuditLogEventClass).sort());
    expect(AUDIT_LOG_EVENT_CLASS_DEFAULTS[AuditLogEventClass.Authorization]).toBe(false);
    expect(AUDIT_LOG_EVENT_CLASS_DEFAULTS[AuditLogEventClass.Management]).toBe(true);
    expect(AUDIT_LOG_EVENT_CLASS_DEFAULTS[AuditLogEventClass.Authentication]).toBe(true);
    expect(AUDIT_LOG_EVENT_CLASS_DEFAULTS[AuditLogEventClass.DataAccess]).toBe(true);
  });

  test.each([
    [EventType.GET_SECRETS, AuditLogEventClass.DataAccess],
    [EventType.REVEAL_SECRET, AuditLogEventClass.DataAccess],
    [EventType.CMEK_DECRYPT, AuditLogEventClass.DataAccess],
    [EventType.CREATE_DYNAMIC_SECRET_LEASE, AuditLogEventClass.DataAccess],
    [EventType.PKI_SIGNER_SIGN, AuditLogEventClass.DataAccess],
    [EventType.DASHBOARD_LIST_SECRETS, AuditLogEventClass.DataAccess],
    [EventType.VIEW_INSIGHTS_AUTH_METHODS, AuditLogEventClass.DataAccess],
    [EventType.UPDATE_SECRET, AuditLogEventClass.Management],
    [EventType.CREATE_CMEK, AuditLogEventClass.Management],
    [EventType.VIEW_AUDIT_LOGS, AuditLogEventClass.Management],
    [EventType.CREATE_CERTIFICATE_INVENTORY_VIEW, AuditLogEventClass.Management],
    [EventType.EXPORT_CERT_MANAGER_PROJECT, AuditLogEventClass.Management],
    [EventType.PAM_SESSION_START, AuditLogEventClass.Management],
    [EventType.UPDATE_AUDIT_LOG_SETTINGS, AuditLogEventClass.Management],
    [EventType.CREATE_ALERT, AuditLogEventClass.Management],
    [EventType.TEST_ALERT_CHANNEL, AuditLogEventClass.Management],
    [EventType.DELETE_PKI_ALERT, AuditLogEventClass.Management],
    [EventType.UPDATE_ALERT, AuditLogEventClass.Management],
    [EventType.DELETE_ALERT, AuditLogEventClass.Management],
    [EventType.GET_PKI_ALERT, AuditLogEventClass.DataAccess],
    [EventType.USER_LOGIN, AuditLogEventClass.Authentication],
    [EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH_FAILED, AuditLogEventClass.Authentication],
    [EventType.SELECT_ORGANIZATION, AuditLogEventClass.Authentication],
    [EventType.GATEWAY_CONNECT, AuditLogEventClass.Authentication],
    [EventType.PERMISSION_DENIED, AuditLogEventClass.Authorization]
  ])("classifies %s as %s", (eventType, expected) => {
    expect(getAuditLogEventClass(eventType)).toBe(expected);
  });

  test("an unknown event type falls back to management", () => {
    expect(getAuditLogEventClass("not-a-real-event")).toBe(AuditLogEventClass.Management);
  });

  test("expands classes to their member event types", () => {
    const expanded = getEventTypesForClasses([AuditLogEventClass.Authorization, AuditLogEventClass.Authentication]);
    expect(expanded).toContain(EventType.PERMISSION_DENIED);
    expect(expanded).toContain(EventType.USER_LOGIN);
    expect(expanded).not.toContain(EventType.GET_SECRETS);
    expect(expanded.length).toBe(
      AUDIT_LOG_EVENT_CLASS_MEMBERS[AuditLogEventClass.Authorization].length +
        AUDIT_LOG_EVENT_CLASS_MEMBERS[AuditLogEventClass.Authentication].length
    );
  });
});

describe("resolveEventClassFilter", () => {
  test("lists the member types when management isn't selected", () => {
    expect(resolveEventClassFilter([AuditLogEventClass.Authorization])).toEqual({
      eventType: [EventType.PERMISSION_DENIED]
    });
  });

  test("excludes the unselected classes when management is selected", () => {
    const resolved = resolveEventClassFilter([AuditLogEventClass.Management, AuditLogEventClass.DataAccess]);
    expect(resolved?.eventType).toBeUndefined();
    expect(resolved?.excludeEventType).toEqual(
      getEventTypesForClasses([AuditLogEventClass.Authentication, AuditLogEventClass.Authorization])
    );
  });

  test("excludes nothing when every class is selected", () => {
    expect(resolveEventClassFilter(Object.values(AuditLogEventClass))).toEqual({ excludeEventType: [] });
  });

  test("keeps only the requested event types that are in the selected classes", () => {
    expect(
      resolveEventClassFilter(
        [AuditLogEventClass.Management],
        [EventType.UPDATE_SECRET, EventType.GET_SECRETS, EventType.USER_LOGIN]
      )
    ).toEqual({ eventType: [EventType.UPDATE_SECRET] });
  });

  test("returns null when no requested event type is in the selected classes", () => {
    expect(resolveEventClassFilter([AuditLogEventClass.Authorization], [EventType.GET_SECRETS])).toBeNull();
  });
});
