import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuditLogEventClass } from "./audit-log-event-classes";
import { auditLogSettingsServiceFactory, isAuditLogEventEnabled } from "./audit-log-settings-service";
import { TEffectiveAuditLogSettings } from "./audit-log-settings-types";
import { EventType } from "./audit-log-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const settings = (overrides: Partial<TEffectiveAuditLogSettings> = {}): TEffectiveAuditLogSettings => ({
  org: {},
  projects: {},
  shouldUseNewPrivilegeSystem: true,
  ...overrides
});

describe("isAuditLogEventEnabled", () => {
  const eventClass = AuditLogEventClass.DataAccess;
  const eventType = EventType.GET_SECRETS;

  test("a project uses its own row or the default, never the org's row", () => {
    expect(isAuditLogEventEnabled(settings({ org: { [eventClass]: false } }), eventType, "p1")).toBe(true);
    expect(isAuditLogEventEnabled(settings({ projects: { p1: { [eventClass]: false } } }), eventType, "p1")).toBe(
      false
    );
  });

  test("an org-scoped event uses the org's row or the default", () => {
    expect(isAuditLogEventEnabled(settings(), eventType)).toBe(true);
    expect(isAuditLogEventEnabled(settings({ org: { [eventClass]: false } }), eventType)).toBe(false);
    expect(isAuditLogEventEnabled(settings(), EventType.PERMISSION_DENIED)).toBe(false);
  });

  test("a settings change is recorded even when management is off", () => {
    const off = settings({ org: { [AuditLogEventClass.Management]: false } });
    expect(isAuditLogEventEnabled(off, EventType.UPDATE_AUDIT_LOG_SETTINGS)).toBe(true);
    expect(isAuditLogEventEnabled(off, EventType.UPDATE_SECRET)).toBe(false);
  });

  test("records everything when the lookup failed", () => {
    expect(isAuditLogEventEnabled(null, EventType.PERMISSION_DENIED)).toBe(true);
  });
});

type TRow = { orgId: string; projectId: string | null; eventClass: string; isEnabled: boolean };

const createHarness = ({ rows = [] as TRow[] } = {}) => {
  const orgDAL = {
    findById: vi.fn(async (id: string) => ({ id, shouldUseNewPrivilegeSystem: true }))
  };
  const auditLogSettingsDAL = {
    findByOrgIds: vi.fn(async (orgIds: string[]) => rows.filter((row) => orgIds.includes(row.orgId)))
  };
  const keyStore = {
    getItem: vi.fn(async () => null),
    setItemWithExpiry: vi.fn(async () => "OK"),
    deleteItem: vi.fn(async () => 1)
  };

  const service = auditLogSettingsServiceFactory({
    auditLogSettingsDAL: auditLogSettingsDAL as never,
    orgDAL: orgDAL as never,
    projectDAL: {} as never,
    permissionService: {} as never,
    keyStore: keyStore as never
  });

  return { service, orgDAL, auditLogSettingsDAL, keyStore };
};

describe("getEffectiveSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("loads only the org's own rows, split by scope", async () => {
    const { service, auditLogSettingsDAL } = createHarness({
      rows: [
        { orgId: "org-1", projectId: null, eventClass: "data-access", isEnabled: false },
        { orgId: "org-1", projectId: "p1", eventClass: "authentication", isEnabled: false },
        { orgId: "org-2", projectId: null, eventClass: "management", isEnabled: false }
      ]
    });

    const result = await service.getEffectiveSettings("org-1");

    expect(auditLogSettingsDAL.findByOrgIds).toHaveBeenCalledWith(["org-1"]);
    expect(result).toEqual({
      org: { "data-access": false },
      projects: { p1: { authentication: false } },
      shouldUseNewPrivilegeSystem: true
    });
  });

  test("caches the loaded settings", async () => {
    const { service, keyStore } = createHarness();

    await service.getEffectiveSettings("org-1");

    expect(keyStore.setItemWithExpiry).toHaveBeenCalledTimes(1);
  });
});
