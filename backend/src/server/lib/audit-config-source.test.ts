import { describe, expect, test } from "vitest";

import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { AUDIT_LOG_EVENT_CLASS_DEFAULTS, AuditLogEventClass } from "@app/domains/platform/audit-log/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { KeyStorePrefixes } from "@app/keystore/keystore";

import { AuditConfigSource } from "./audit-config-source";

type TProjectRow = { id: string; orgId: string; name: string; auditLogsRetentionDays: number | null };
type TSettings = {
  org?: Partial<Record<AuditLogEventClass, boolean>>;
  project?: Partial<Record<AuditLogEventClass, boolean>>;
};

const fakeProjectDAL = () => {
  const rows = new Map<string, TProjectRow>();
  return { rows, findById: async (id: string) => rows.get(id) };
};

const fakeSettingsService = () => {
  const fake = {
    settings: {} as TSettings | null,
    calls: [] as { orgId: string; projectId?: string | null }[],
    getEffectiveSettings: async (orgId: string, projectId?: string | null) => {
      fake.calls.push({ orgId, projectId });
      return fake.settings;
    }
  };
  return fake;
};

const setup = () => {
  const license = new FakeLicenseService();
  const projectDAL = fakeProjectDAL();
  const settingsService = fakeSettingsService();
  const keyStore = new InMemoryKeyStore();
  const source = new AuditConfigSource(license, projectDAL as never, settingsService as never, keyStore);
  const addProject = (overrides: Partial<TProjectRow> = {}) => {
    const row: TProjectRow = {
      id: `project-${projectDAL.rows.size + 1}`,
      orgId: "org-1",
      name: "payments",
      auditLogsRetentionDays: 30,
      ...overrides
    };
    projectDAL.rows.set(row.id, row);
    return row;
  };
  return { source, license, projectDAL, settingsService, keyStore, addProject };
};

describe("AuditConfigSource.forOrg", () => {
  test("should return the plan's audit log retention", async () => {
    // Setup
    const { source, license } = setup();
    license.setPlan("org-1", { auditLogsRetentionDays: 90 });

    // Action
    const config = await source.forOrg("org-1");

    // Assert
    expect(config).toEqual({ retentionDays: 90 });
  });
});

describe("AuditConfigSource.forProject", () => {
  test("should return the project's name and own retention", async () => {
    // Setup
    const { source, addProject } = setup();
    const project = addProject({ auditLogsRetentionDays: 14 });

    // Action
    const config = await source.forProject("org-1", project.id);

    // Assert
    expect(config).toEqual({ name: "payments", retentionDays: 14 });
  });

  test("should return null retention for a project with none", async () => {
    // Setup
    const { source, addProject } = setup();
    const project = addProject({ auditLogsRetentionDays: null });

    // Action
    const config = await source.forProject("org-1", project.id);

    // Assert
    expect(config).toEqual({ name: "payments", retentionDays: null });
  });

  test("should return null for another org's project", async () => {
    // Setup
    const { source, addProject } = setup();
    const project = addProject({ orgId: "org-2" });

    // Action
    const config = await source.forProject("org-1", project.id);

    // Assert
    expect(config).toBeNull();
  });

  test("should return null for a project that does not exist", async () => {
    // Setup
    const { source } = setup();

    // Action
    const config = await source.forProject("org-1", "missing");

    // Assert
    expect(config).toBeNull();
  });

  test("should show a changed retention only after the cache key is deleted", async () => {
    // Setup
    const { source, addProject, projectDAL, keyStore } = setup();
    const project = addProject({ auditLogsRetentionDays: 30 });
    await source.forProject("org-1", project.id);
    projectDAL.rows.set(project.id, { ...project, auditLogsRetentionDays: 7 });

    // Action
    const beforeDelete = await source.forProject("org-1", project.id);
    await keyStore.deleteItem(KeyStorePrefixes.AuditLogProjectConfig(project.id));
    const afterDelete = await source.forProject("org-1", project.id);

    // Assert
    expect(beforeDelete?.retentionDays).toBe(30);
    expect(afterDelete?.retentionDays).toBe(7);
  });
});

describe("AuditConfigSource.findProjectConfig", () => {
  test("should return the project's org, name and retention", async () => {
    // Setup
    const { source, addProject } = setup();
    const project = addProject({ orgId: "org-9", auditLogsRetentionDays: 5 });

    // Action
    const config = await source.findProjectConfig(project.id);

    // Assert
    expect(config).toEqual({ orgId: "org-9", name: "payments", retentionDays: 5 });
  });

  test("should return null when the project is gone", async () => {
    // Setup
    const { source } = setup();

    // Action
    const config = await source.findProjectConfig("missing");

    // Assert
    expect(config).toBeNull();
  });
});

describe("AuditConfigSource.eventClasses", () => {
  test("should fall back to the defaults when the org has no overrides", async () => {
    // Setup
    const { source, settingsService } = setup();
    settingsService.settings = { org: {} };

    // Action
    const switches = await source.eventClasses("org-1");

    // Assert
    expect(switches).toEqual({
      authentication: AUDIT_LOG_EVENT_CLASS_DEFAULTS[AuditLogEventClass.Authentication],
      authorization: AUDIT_LOG_EVENT_CLASS_DEFAULTS[AuditLogEventClass.Authorization]
    });
  });

  test("should apply the org's overrides to an org event", async () => {
    // Setup
    const { source, settingsService } = setup();
    settingsService.settings = {
      org: { [AuditLogEventClass.Authentication]: false, [AuditLogEventClass.Authorization]: true }
    };

    // Action
    const switches = await source.eventClasses("org-1");

    // Assert
    expect(switches).toEqual({ authentication: false, authorization: true });
  });

  test("should apply the project's overrides, not the org's, to a project event", async () => {
    // Setup
    const { source, settingsService } = setup();
    settingsService.settings = {
      org: { [AuditLogEventClass.Authentication]: false },
      project: { [AuditLogEventClass.Authorization]: true }
    };

    // Action
    const switches = await source.eventClasses("org-1", "project-1");

    // Assert
    expect(switches).toEqual({ authentication: true, authorization: true });
    expect(settingsService.calls).toEqual([{ orgId: "org-1", projectId: "project-1" }]);
  });

  test("should record everything when the settings can't be read", async () => {
    // Setup
    const { source, settingsService } = setup();
    settingsService.settings = null;

    // Action
    const switches = await source.eventClasses("org-1", "project-1");

    // Assert
    expect(switches).toEqual({ authentication: true, authorization: true });
  });
});
