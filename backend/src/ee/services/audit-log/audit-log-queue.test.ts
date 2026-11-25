import { describe, expect, test, vi } from "vitest";

import type { TAuditEventClassSwitches, TOrgAuditConfig } from "@app/domains/lib/actor-context";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { AuditLogPolicy } from "@app/domains/platform/audit-log/ce/module";
import { buildAuditLog } from "@app/domains/platform/audit-log/ce/testing/build-audit-log";
import type { TAuditConfigSource, TProjectAuditConfigWithOrg } from "@app/server/lib/audit-config-source";

import { auditLogQueueServiceFactory } from "./audit-log-queue";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const MS_IN_DAY = 24 * 60 * 60 * 1000;

class FakeAuditConfigSource implements TAuditConfigSource {
  plans = new Map<string, TOrgAuditConfig>();

  projects = new Map<string, TProjectAuditConfigWithOrg>();

  switches: TAuditEventClassSwitches = { authentication: true, authorization: false };

  failOrgLookup = false;

  async forOrg(orgId: string) {
    if (this.failOrgLookup) throw new Error("license service down");
    return this.plans.get(orgId) ?? { retentionDays: 30 };
  }

  async forProject(orgId: string, projectId: string) {
    const project = this.projects.get(projectId);
    return project && project.orgId === orgId ? { name: project.name, retentionDays: project.retentionDays } : null;
  }

  async eventClasses() {
    return this.switches;
  }

  async findProjectConfig(projectId: string) {
    return this.projects.get(projectId) ?? null;
  }
}

// A push-time DTO: no resolved metadata yet.
const dto = (overrides: Record<string, unknown> = {}) =>
  ({
    event: { type: "update-secret", metadata: { k: "v" } },
    actor: { type: "platform", metadata: {} },
    orgId: "org-1",
    ...overrides
  }) as never;

const setup = ({ keyStore = new InMemoryKeyStore() }: { keyStore?: InMemoryKeyStore } = {}) => {
  const harness = buildAuditLog({ keyStore });
  const auditConfigSource = new FakeAuditConfigSource();
  const service = auditLogQueueServiceFactory({
    auditLogRecorderService: harness.auditLogRecorderService,
    auditConfigSource
  });
  const addProject = (overrides: Partial<TProjectAuditConfigWithOrg> & { id?: string } = {}) => {
    const { id = "p1", ...rest } = overrides;
    auditConfigSource.projects.set(id, { orgId: "org-1", name: "proj", retentionDays: null, ...rest });
    return id;
  };
  return { ...harness, service, auditConfigSource, addProject };
};

const ttlDays = (entry: { createdAt: string; expiresAt: string }) =>
  (new Date(entry.expiresAt).getTime() - new Date(entry.createdAt).getTime()) / MS_IN_DAY;

describe("auditLogQueueServiceFactory pushToLog", () => {
  test("resolves the entry and appends it with a pinned id, ISO timestamps, and orgId", async () => {
    // Setup
    const { service, appended } = setup();

    // Action
    await service.pushToLog(dto({ orgId: "org-1" }));

    // Assert
    const entries = await appended();
    expect(entries).toHaveLength(1);
    const [parsed] = entries;
    expect(typeof parsed.id).toBe("string");
    expect(new Date(parsed.createdAt).toISOString()).toBe(parsed.createdAt);
    expect(new Date(parsed.expiresAt).toISOString()).toBe(parsed.expiresAt);
    expect(parsed.orgId).toBe("org-1");
  });

  test("resolves orgId + projectName via the project for an org-less (project-scoped) event", async () => {
    // Setup
    const { service, appended, addProject } = setup();
    const projectId = addProject({ name: "proj" });

    // Action
    await service.pushToLog(dto({ orgId: undefined, projectId }));

    // Assert
    const [parsed] = await appended();
    expect(parsed.orgId).toBe("org-1");
    expect(parsed.projectName).toBe("proj");
  });

  test("caps the TTL at the project-level retention when it is lower than the plan", async () => {
    // Setup
    const { service, appended, addProject, auditConfigSource } = setup();
    const projectId = addProject({ retentionDays: 5 });
    auditConfigSource.plans.set("org-1", { retentionDays: 30 });

    // Action
    await service.pushToLog(dto({ orgId: undefined, projectId }));

    // Assert
    const [parsed] = await appended();
    expect(ttlDays(parsed)).toBe(5);
  });

  // Routes spread req.auditLogInfo, which carries orgId, so a project event arrives with both ids.
  test("applies the project-level retention and names the project when the entry carries both orgId and projectId", async () => {
    // Setup
    const { service, appended, addProject, auditConfigSource } = setup();
    const projectId = addProject({ name: "proj", retentionDays: 5 });
    auditConfigSource.plans.set("org-1", { retentionDays: 30 });

    // Action
    await service.pushToLog(dto({ orgId: "org-1", projectId }));

    // Assert
    const [parsed] = await appended();
    const ttl = new Date(parsed.expiresAt).getTime() - new Date(parsed.createdAt).getTime();
    expect(ttl).toBe(5 * MS_IN_DAY);
    expect(parsed.projectName).toBe("proj");
  });

  test("falls back to the plan's retention when the project's exceeds it", async () => {
    // Setup
    const { service, appended, addProject, auditConfigSource } = setup();
    const projectId = addProject({ retentionDays: 365 });
    auditConfigSource.plans.set("org-1", { retentionDays: 30 });

    // Action
    await service.pushToLog(dto({ orgId: "org-1", projectId }));

    // Assert
    const [parsed] = await appended();
    expect(ttlDays(parsed)).toBe(30);
  });

  test("drops an entry with neither orgId nor projectId", async () => {
    // Setup
    const { service, appended } = setup();

    // Action
    await service.pushToLog(dto({ orgId: undefined, projectId: undefined }));

    // Assert
    expect(await appended()).toEqual([]);
  });

  test("drops an entry when the project was deleted", async () => {
    // Setup
    const { service, appended } = setup();

    // Action
    await service.pushToLog(dto({ orgId: undefined, projectId: "gone" }));

    // Assert
    expect(await appended()).toEqual([]);
  });

  test("records a hard-deleted project's entry under the plan's retention when the org is known", async () => {
    // Setup
    const { service, appended } = setup();

    // Action
    await service.pushToLog(dto({ orgId: "org-1", projectId: "gone" }));

    // Assert
    const [entry] = await appended();
    expect(entry).toMatchObject({ orgId: "org-1", projectId: "gone" });
    expect(entry.projectName).toBeUndefined();
    expect((new Date(entry.expiresAt).getTime() - new Date(entry.createdAt).getTime()) / MS_IN_DAY).toBe(30);
  });

  test("drops an entry when the plan's audit log retention is 0", async () => {
    // Setup
    const { service, appended, auditConfigSource } = setup();
    auditConfigSource.plans.set("org-zero", { retentionDays: 0 });

    // Action
    await service.pushToLog(dto({ orgId: "org-zero" }));

    // Assert
    expect(await appended()).toEqual([]);
  });

  test("keeps logs until the expiry cap when the plan's retention is unlimited", async () => {
    // Setup
    const { service, appended, auditConfigSource } = setup();
    auditConfigSource.plans.set("org-unlimited", { retentionDays: null });

    // Action
    await service.pushToLog(dto({ orgId: "org-unlimited" }));

    // Assert
    const [parsed] = await appended();
    expect(parsed.expiresAt).toBe(AuditLogPolicy.MAX_EXPIRES_AT.toISOString());
  });

  test("applies the project-level retention under an unlimited plan", async () => {
    // Setup
    const { service, appended, addProject, auditConfigSource } = setup();
    const projectId = addProject({ retentionDays: 5 });
    auditConfigSource.plans.set("org-1", { retentionDays: null });

    // Action
    await service.pushToLog(dto({ orgId: undefined, projectId }));

    // Assert
    const [parsed] = await appended();
    expect(ttlDays(parsed)).toBe(5);
  });

  test("never throws when the buffer fails", async () => {
    // Setup
    const keyStore = new InMemoryKeyStore();
    keyStore.streamAdd = async () => {
      throw new Error("redis down");
    };
    const { service } = setup({ keyStore });

    // Action
    const result = service.pushToLog(dto({ orgId: "o" }));

    // Assert
    await expect(result).resolves.toBeUndefined();
  });

  test("never throws when a resolution lookup fails", async () => {
    // Setup
    const { service, appended, auditConfigSource } = setup();
    auditConfigSource.failOrgLookup = true;

    // Action
    const result = service.pushToLog(dto({ orgId: "o" }));

    // Assert
    await expect(result).resolves.toBeUndefined();
    expect(await appended()).toEqual([]);
  });
});

describe("auditLogQueueServiceFactory pushToLogOrThrow", () => {
  test("rejects when the buffer fails", async () => {
    // Setup
    const keyStore = new InMemoryKeyStore();
    keyStore.streamAdd = async () => {
      throw new Error("redis down");
    };
    const { service } = setup({ keyStore });

    // Action
    const result = service.pushToLogOrThrow(dto({ orgId: "o" }));

    // Assert
    await expect(result).rejects.toThrow("redis down");
  });
});

describe("auditLogQueueServiceFactory event class settings", () => {
  test("drops an event whose class the settings switched off", async () => {
    // Setup
    const { service, appended, auditConfigSource } = setup();
    auditConfigSource.switches = { authentication: false, authorization: false };

    // Action
    await service.pushToLog(dto({ event: { type: "user-login", metadata: {} } }));

    // Assert
    expect(await appended()).toEqual([]);
  });

  test("stores an event whose class the settings switched on", async () => {
    // Setup
    const { service, appended, auditConfigSource } = setup();
    auditConfigSource.switches = { authentication: true, authorization: false };

    // Action
    await service.pushToLog(dto({ event: { type: "user-login", metadata: {} } }));

    // Assert
    expect(await appended()).toHaveLength(1);
  });

  test("records management and data-access events whatever the settings", async () => {
    // Setup
    const { service, appended, auditConfigSource } = setup();
    auditConfigSource.switches = { authentication: false, authorization: false };

    // Action
    await service.pushToLog(dto({ event: { type: "update-secret", metadata: {} } }));
    await service.pushToLog(dto({ event: { type: "get-secrets", metadata: {} } }));

    // Assert
    expect(await appended()).toHaveLength(2);
  });

  test("drops a permission denial when authorization is switched off", async () => {
    // Setup
    const { service, appended } = setup();

    // Action
    await service.pushToLog(dto({ event: { type: "permission-denied", metadata: {} } }));

    // Assert
    expect(await appended()).toEqual([]);
  });
});
