import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
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

  test("management is always recorded, even with a row that says otherwise", () => {
    const off = settings({ org: { [AuditLogEventClass.Management]: false } });
    expect(isAuditLogEventEnabled(off, EventType.UPDATE_SECRET)).toBe(true);
    expect(isAuditLogEventEnabled(off, EventType.UPDATE_AUDIT_LOG_SETTINGS)).toBe(true);
  });

  test("records everything when the lookup failed", () => {
    expect(isAuditLogEventEnabled(null, EventType.PERMISSION_DENIED)).toBe(true);
  });
});

type TRow = { orgId: string; projectId: string | null; eventClass: string; isEnabled: boolean };

const orgActor = {
  type: "user",
  id: "user-1",
  authMethod: null,
  orgId: "org-1",
  rootOrgId: "org-1",
  parentOrgId: "org-1"
} as never;

const createHarness = ({ rows = [] as TRow[] } = {}) => {
  const orgDAL = {
    findById: vi.fn(async (id: string) => ({ id, shouldUseNewPrivilegeSystem: true }))
  };
  const auditLogSettingsDAL = {
    find: vi.fn(async (filter: { orgId: string; projectId?: string | null }) =>
      rows.filter(
        (row) => row.orgId === filter.orgId && (filter.projectId === undefined || row.projectId === filter.projectId)
      )
    ),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    delete: vi.fn(async () => []),
    insertMany: vi.fn(async (data: TRow[]) => data)
  };
  const keyStore = {
    getItem: vi.fn(async () => null),
    setItemWithExpiry: vi.fn(async () => "OK"),
    deleteItem: vi.fn(async () => 1)
  };

  const permissionService = {
    getOrgPermission: vi.fn(async () => ({
      permission: createMongoAbility([{ action: OrgPermissionActions.Edit, subject: OrgPermissionSubjects.Settings }])
    }))
  };

  const service = auditLogSettingsServiceFactory({
    auditLogSettingsDAL: auditLogSettingsDAL as never,
    orgDAL: orgDAL as never,
    projectDAL: {} as never,
    permissionService: permissionService as never,
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

    expect(auditLogSettingsDAL.find).toHaveBeenCalledWith({ orgId: "org-1" });
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

describe("updateOrgSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([false, true])("refuses any management entry (isEnabled=%s)", async (isEnabled) => {
    const { service, auditLogSettingsDAL } = createHarness();

    await expect(
      service.updateOrgSettings({
        actor: orgActor,
        eventClasses: [
          { eventClass: AuditLogEventClass.DataAccess, isEnabled: false },
          { eventClass: AuditLogEventClass.Management, isEnabled }
        ]
      })
    ).rejects.toThrow("Management events are always recorded and cannot be changed");
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("refuses a request that leaves a class out", async () => {
    const { service, auditLogSettingsDAL } = createHarness();

    await expect(
      service.updateOrgSettings({
        actor: orgActor,
        eventClasses: [{ eventClass: AuditLogEventClass.DataAccess, isEnabled: false }]
      })
    ).rejects.toThrow("Every event class except management must be included. Missing: authentication, authorization");
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("refuses a request that names a class twice", async () => {
    const { service, auditLogSettingsDAL } = createHarness();

    await expect(
      service.updateOrgSettings({
        actor: orgActor,
        eventClasses: [
          { eventClass: AuditLogEventClass.DataAccess, isEnabled: false },
          { eventClass: AuditLogEventClass.DataAccess, isEnabled: true },
          { eventClass: AuditLogEventClass.Authentication, isEnabled: true },
          { eventClass: AuditLogEventClass.Authorization, isEnabled: false }
        ]
      })
    ).rejects.toThrow("Event class 'data-access' appears more than once");
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("replaces the scope's rows and answers from the request, without re-reading", async () => {
    const { service, auditLogSettingsDAL, keyStore } = createHarness({
      rows: [
        { orgId: "org-1", projectId: null, eventClass: "authentication", isEnabled: false },
        { orgId: "org-1", projectId: "p1", eventClass: "data-access", isEnabled: false }
      ]
    });

    const result = await service.updateOrgSettings({
      actor: orgActor,
      eventClasses: [
        { eventClass: AuditLogEventClass.Authorization, isEnabled: true },
        { eventClass: AuditLogEventClass.DataAccess, isEnabled: false },
        { eventClass: AuditLogEventClass.Authentication, isEnabled: true }
      ]
    });

    expect(auditLogSettingsDAL.find).not.toHaveBeenCalled();
    expect(auditLogSettingsDAL.delete).toHaveBeenCalledWith({ orgId: "org-1", projectId: null }, expect.anything());
    expect(auditLogSettingsDAL.insertMany).toHaveBeenCalledWith(
      [
        { orgId: "org-1", projectId: null, eventClass: "data-access", isEnabled: false },
        { orgId: "org-1", projectId: null, eventClass: "authentication", isEnabled: true },
        { orgId: "org-1", projectId: null, eventClass: "authorization", isEnabled: true }
      ],
      expect.anything()
    );
    expect(keyStore.deleteItem).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      shouldUseNewPrivilegeSystem: true,
      eventClasses: [
        { eventClass: AuditLogEventClass.Management, isEnabled: true },
        { eventClass: AuditLogEventClass.DataAccess, isEnabled: false },
        { eventClass: AuditLogEventClass.Authentication, isEnabled: true },
        { eventClass: AuditLogEventClass.Authorization, isEnabled: true }
      ]
    });
  });
});
