import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { KeyStorePrefixes } from "@app/keystore/keystore";
import { ActorType } from "@app/services/auth/auth-type";

import {
  agentVaultProjectAdminPermissions,
  agentVaultProjectMemberPermissions,
  projectAdminPermissions,
  projectMemberPermissions,
  projectViewerPermission
} from "../permission/default-roles";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  OrgPermissionActions,
  OrgPermissionAuditLogsActions,
  OrgPermissionSubjects
} from "../permission/org-permission";
import {
  ProjectPermissionActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { AuditLogEventClass } from "./audit-log-event-classes";
import { auditLogSettingsServiceFactory, isAuditLogEventEnabled } from "./audit-log-settings-service";
import { TEffectiveAuditLogSettings } from "./audit-log-settings-types";
import { EventType } from "./audit-log-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const settings = (overrides: Partial<TEffectiveAuditLogSettings> = {}): TEffectiveAuditLogSettings => ({
  org: {},
  shouldUseNewPrivilegeSystem: true,
  ...overrides
});

describe("isAuditLogEventEnabled", () => {
  const eventClass = AuditLogEventClass.Authentication;
  const eventType = EventType.USER_LOGIN;

  test("a project uses its own row or the default, never the org's row", () => {
    expect(isAuditLogEventEnabled(settings({ org: { [eventClass]: false } }), eventType, "p1")).toBe(true);
    expect(isAuditLogEventEnabled(settings({ project: { [eventClass]: false } }), eventType, "p1")).toBe(false);
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

  test("data access is always recorded, even with a row that says otherwise", () => {
    const off = settings({
      org: { [AuditLogEventClass.DataAccess]: false },
      project: { [AuditLogEventClass.DataAccess]: false }
    });
    expect(isAuditLogEventEnabled(off, EventType.GET_SECRETS)).toBe(true);
    expect(isAuditLogEventEnabled(off, EventType.GET_SECRETS, "p1")).toBe(true);
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

const createHarness = ({
  rows = [] as TRow[],
  shouldUseNewPrivilegeSystem = true,
  canEditAuditLogs = true,
  planHasAuditLogs = true
} = {}) => {
  const tx = { raw: vi.fn(async () => undefined) };
  const orgDAL = {
    findById: vi.fn(async (id: string) => ({ id, shouldUseNewPrivilegeSystem }))
  };
  const auditLogSettingsDAL = {
    find: vi.fn(async (filter: { orgId: string; projectId?: string | null }) =>
      rows.filter(
        (row) => row.orgId === filter.orgId && (filter.projectId === undefined || row.projectId === filter.projectId)
      )
    ),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
    delete: vi.fn(async () => []),
    insertMany: vi.fn(async (data: TRow[]) => data)
  };
  const keyStore = {
    getItems: vi.fn(async (keys: string[]): Promise<(string | null)[]> => keys.map(() => null)),
    setItemWithExpiry: vi.fn(async () => "OK"),
    deleteItem: vi.fn(async () => 1)
  };

  const permissionService = {
    getOrgPermission: vi.fn(async () => ({
      permission: createMongoAbility([
        { action: [OrgPermissionActions.Read, OrgPermissionActions.Edit], subject: OrgPermissionSubjects.Settings },
        ...(canEditAuditLogs
          ? [{ action: OrgPermissionAuditLogsActions.Edit, subject: OrgPermissionSubjects.AuditLogs }]
          : [])
      ])
    })),
    getProjectPermission: vi.fn(async () => ({
      permission: createMongoAbility([
        {
          action: [ProjectPermissionActions.Read, ProjectPermissionActions.Edit],
          subject: ProjectPermissionSub.Settings
        },
        ...(canEditAuditLogs
          ? [{ action: ProjectPermissionAuditLogsActions.Edit, subject: ProjectPermissionSub.AuditLogs }]
          : [])
      ])
    }))
  };

  const projectDAL = {
    findById: vi.fn(async (id: string) => ({ id, orgId: "org-1" }))
  };
  const licenseService = {
    getPlan: vi.fn(async () => ({ auditLogs: planHasAuditLogs }))
  };

  const service = auditLogSettingsServiceFactory({
    auditLogSettingsDAL: auditLogSettingsDAL as never,
    orgDAL: orgDAL as never,
    projectDAL: projectDAL as never,
    permissionService: permissionService as never,
    licenseService: licenseService as never,
    keyStore: keyStore as never
  });

  return { service, orgDAL, auditLogSettingsDAL, keyStore, licenseService, tx };
};

describe("getEffectiveSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const scopedRows: TRow[] = [
    { orgId: "org-1", projectId: null, eventClass: "data-access", isEnabled: false },
    { orgId: "org-1", projectId: "p1", eventClass: "authentication", isEnabled: false },
    { orgId: "org-1", projectId: "p2", eventClass: "authentication", isEnabled: true },
    { orgId: "org-2", projectId: null, eventClass: "management", isEnabled: false }
  ];

  test("without a project, loads and caches only the org's own rows", async () => {
    const { service, auditLogSettingsDAL, keyStore } = createHarness({ rows: scopedRows });

    const result = await service.getEffectiveSettings("org-1");

    expect(auditLogSettingsDAL.find).toHaveBeenCalledTimes(1);
    expect(auditLogSettingsDAL.find).toHaveBeenCalledWith({ orgId: "org-1", projectId: null });
    expect(result).toEqual({ org: { "data-access": false }, shouldUseNewPrivilegeSystem: true });
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledTimes(1);
  });

  test("with a project, loads only that project's rows besides the org's", async () => {
    const { service, auditLogSettingsDAL, keyStore } = createHarness({ rows: scopedRows });

    const result = await service.getEffectiveSettings("org-1", "p1");

    expect(auditLogSettingsDAL.find).toHaveBeenCalledWith({ orgId: "org-1", projectId: "p1" });
    expect(result).toEqual({
      org: { "data-access": false },
      project: { authentication: false },
      shouldUseNewPrivilegeSystem: true
    });
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledTimes(2);
  });

  test("caches a project with no rows as empty so it isn't reloaded", async () => {
    const { service, keyStore } = createHarness();

    await service.getEffectiveSettings("org-1", "p-none");

    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      KeyStorePrefixes.AuditLogProjectSettings("org-1", "p-none"),
      expect.any(Number),
      "{}"
    );
  });

  test("serves both scopes from one cache read without touching the database", async () => {
    const { service, auditLogSettingsDAL, orgDAL, keyStore } = createHarness();
    keyStore.getItems.mockResolvedValueOnce([
      JSON.stringify({ overrides: { authentication: false }, shouldUseNewPrivilegeSystem: false }),
      JSON.stringify({ authorization: true })
    ]);

    const result = await service.getEffectiveSettings("org-1", "p1");

    expect(keyStore.getItems).toHaveBeenCalledTimes(1);
    expect(orgDAL.findById).not.toHaveBeenCalled();
    expect(auditLogSettingsDAL.find).not.toHaveBeenCalled();
    expect(result).toEqual({
      org: { authentication: false },
      project: { authorization: true },
      shouldUseNewPrivilegeSystem: false
    });
  });

  test("returns null so everything is recorded when the database lookup fails", async () => {
    const { service, auditLogSettingsDAL } = createHarness();
    auditLogSettingsDAL.find.mockRejectedValueOnce(new Error("db down"));

    await expect(service.getEffectiveSettings("org-1", "p1")).resolves.toBeNull();
  });
});

const fullEventClasses = [
  { eventClass: AuditLogEventClass.Authentication, isEnabled: true },
  { eventClass: AuditLogEventClass.Authorization, isEnabled: false }
];

describe("updateOrgSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("refuses an actor without edit on audit logs, even with edit on settings", async () => {
    const { service, auditLogSettingsDAL } = createHarness({ canEditAuditLogs: false });

    await expect(service.updateOrgSettings({ actor: orgActor, eventClasses: fullEventClasses })).rejects.toThrow(
      ForbiddenError
    );
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("still lets an actor without edit on audit logs read them", async () => {
    const { service } = createHarness({ canEditAuditLogs: false });

    const result = await service.getOrgSettings({ actor: orgActor });

    expect(result.eventClasses).toHaveLength(4);
  });

  test("refuses to save on a plan without audit logs", async () => {
    const { service, auditLogSettingsDAL } = createHarness({ planHasAuditLogs: false });

    await expect(service.updateOrgSettings({ actor: orgActor, eventClasses: fullEventClasses })).rejects.toThrow(
      "Audit log settings can only be changed on a plan that includes audit logs"
    );
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("still lets a plan without audit logs read the settings", async () => {
    const { service } = createHarness({ planHasAuditLogs: false });

    const result = await service.getOrgSettings({ actor: orgActor });

    expect(result.eventClasses).toHaveLength(4);
  });

  test.each([
    [AuditLogEventClass.Management, false],
    [AuditLogEventClass.Management, true],
    [AuditLogEventClass.DataAccess, false],
    [AuditLogEventClass.DataAccess, true]
  ])("refuses any %s entry (isEnabled=%s)", async (eventClass, isEnabled) => {
    const { service, auditLogSettingsDAL } = createHarness();

    await expect(
      service.updateOrgSettings({
        actor: orgActor,
        eventClasses: [...fullEventClasses, { eventClass, isEnabled }]
      })
    ).rejects.toThrow(`Event class '${eventClass}' is always recorded and cannot be changed`);
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("refuses a request that leaves a class out", async () => {
    const { service, auditLogSettingsDAL } = createHarness();

    await expect(
      service.updateOrgSettings({
        actor: orgActor,
        eventClasses: [{ eventClass: AuditLogEventClass.Authentication, isEnabled: false }]
      })
    ).rejects.toThrow("Every event class except management and data-access must be included. Missing: authorization");
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("refuses a request that names a class twice", async () => {
    const { service, auditLogSettingsDAL } = createHarness();

    await expect(
      service.updateOrgSettings({
        actor: orgActor,
        eventClasses: [
          { eventClass: AuditLogEventClass.Authentication, isEnabled: false },
          { eventClass: AuditLogEventClass.Authentication, isEnabled: true },
          { eventClass: AuditLogEventClass.Authorization, isEnabled: false }
        ]
      })
    ).rejects.toThrow("Event class 'authentication' appears more than once");
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("refuses to turn on authorization for an org on the legacy privilege system", async () => {
    const { service, auditLogSettingsDAL } = createHarness({ shouldUseNewPrivilegeSystem: false });

    await expect(
      service.updateOrgSettings({
        actor: orgActor,
        eventClasses: [
          { eventClass: AuditLogEventClass.Authentication, isEnabled: true },
          { eventClass: AuditLogEventClass.Authorization, isEnabled: true }
        ]
      })
    ).rejects.toThrow("Permission denials are only recorded for organizations on the new privilege system");
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("still lets an org on the legacy privilege system save with authorization off", async () => {
    const { service, auditLogSettingsDAL } = createHarness({ shouldUseNewPrivilegeSystem: false });

    const result = await service.updateOrgSettings({
      actor: orgActor,
      eventClasses: fullEventClasses
    });

    expect(auditLogSettingsDAL.transaction).toHaveBeenCalledTimes(1);
    expect(result.shouldUseNewPrivilegeSystem).toBe(false);
  });

  test("replaces the scope's rows and answers from the request, without re-reading", async () => {
    const { service, auditLogSettingsDAL, keyStore } = createHarness({
      rows: [
        { orgId: "org-1", projectId: null, eventClass: "authentication", isEnabled: true },
        { orgId: "org-1", projectId: "p1", eventClass: "authentication", isEnabled: false }
      ]
    });

    const result = await service.updateOrgSettings({
      actor: orgActor,
      eventClasses: [
        { eventClass: AuditLogEventClass.Authorization, isEnabled: true },
        { eventClass: AuditLogEventClass.Authentication, isEnabled: false }
      ]
    });

    expect(auditLogSettingsDAL.find).not.toHaveBeenCalled();
    expect(auditLogSettingsDAL.delete).toHaveBeenCalledWith({ orgId: "org-1", projectId: null }, expect.anything());
    expect(auditLogSettingsDAL.insertMany).toHaveBeenCalledWith(
      [
        { orgId: "org-1", projectId: null, eventClass: "authentication", isEnabled: false },
        { orgId: "org-1", projectId: null, eventClass: "authorization", isEnabled: true }
      ],
      expect.anything()
    );
    expect(keyStore.deleteItem).toHaveBeenCalledTimes(1);
    expect(keyStore.deleteItem).toHaveBeenCalledWith(KeyStorePrefixes.AuditLogOrgSettings("org-1"));
    expect(result).toEqual({
      shouldUseNewPrivilegeSystem: true,
      eventClasses: [
        { eventClass: AuditLogEventClass.Management, isEnabled: true },
        { eventClass: AuditLogEventClass.DataAccess, isEnabled: true },
        { eventClass: AuditLogEventClass.Authentication, isEnabled: false },
        { eventClass: AuditLogEventClass.Authorization, isEnabled: true }
      ]
    });
  });
});

describe("writing settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("takes a per-scope lock before replacing the rows", async () => {
    const { service, tx, auditLogSettingsDAL } = createHarness();

    await service.updateOrgSettings({ actor: orgActor, eventClasses: fullEventClasses });

    expect(tx.raw).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(?)", [expect.any(Number)]);
    expect(tx.raw.mock.invocationCallOrder[0]).toBeLessThan(auditLogSettingsDAL.delete.mock.invocationCallOrder[0]);
  });

  test("still succeeds when the cache can't be invalidated after the write", async () => {
    const { service, keyStore } = createHarness();
    keyStore.deleteItem.mockRejectedValueOnce(new Error("redis down"));

    await expect(service.updateOrgSettings({ actor: orgActor, eventClasses: fullEventClasses })).resolves.toBeDefined();
  });
});

describe("updateProjectSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const projectActor = {
    actor: ActorType.USER,
    actorId: "user-1",
    actorAuthMethod: null,
    actorOrgId: "org-1",
    projectId: "p1"
  };

  test("refuses an actor without edit on audit logs, even with edit on settings", async () => {
    const { service, auditLogSettingsDAL } = createHarness({ canEditAuditLogs: false });

    await expect(service.updateProjectSettings({ ...projectActor, eventClasses: fullEventClasses })).rejects.toThrow(
      ForbiddenError
    );
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("lets an actor with edit on audit logs save", async () => {
    const { service, auditLogSettingsDAL } = createHarness();

    await service.updateProjectSettings({ ...projectActor, eventClasses: fullEventClasses });

    expect(auditLogSettingsDAL.delete).toHaveBeenCalledWith({ orgId: "org-1", projectId: "p1" }, expect.anything());
  });

  test("refuses to save on a plan without audit logs, checked against the project's org", async () => {
    const { service, auditLogSettingsDAL, licenseService } = createHarness({ planHasAuditLogs: false });

    await expect(service.updateProjectSettings({ ...projectActor, eventClasses: fullEventClasses })).rejects.toThrow(
      "Audit log settings can only be changed on a plan that includes audit logs"
    );
    expect(licenseService.getPlan).toHaveBeenCalledWith("org-1");
    expect(auditLogSettingsDAL.transaction).not.toHaveBeenCalled();
  });

  test("invalidates only the project's cached settings", async () => {
    const { service, keyStore } = createHarness();

    await service.updateProjectSettings({ ...projectActor, eventClasses: fullEventClasses });

    expect(keyStore.deleteItem).toHaveBeenCalledTimes(1);
    expect(keyStore.deleteItem).toHaveBeenCalledWith(KeyStorePrefixes.AuditLogProjectSettings("org-1", "p1"));
  });
});

describe("built-in roles", () => {
  test.each([
    ["org admin", orgAdminPermissions, true],
    ["org member", orgMemberPermissions, false]
  ])("%s can edit org audit log settings: %s", (_, rules, expected) => {
    const ability = createMongoAbility(rules as never);
    expect(ability.can(OrgPermissionAuditLogsActions.Edit, OrgPermissionSubjects.AuditLogs)).toBe(expected);
  });

  test.each([
    ["project admin", projectAdminPermissions, true],
    ["Agent Vault admin", agentVaultProjectAdminPermissions, true],
    ["project member", projectMemberPermissions, false],
    ["project viewer", projectViewerPermission, false],
    ["Agent Vault member", agentVaultProjectMemberPermissions, false]
  ])("%s can edit project audit log settings: %s", (_, rules, expected) => {
    const ability = createMongoAbility(rules as never);
    expect(ability.can(ProjectPermissionAuditLogsActions.Edit, ProjectPermissionSub.AuditLogs)).toBe(expected);
  });
});
