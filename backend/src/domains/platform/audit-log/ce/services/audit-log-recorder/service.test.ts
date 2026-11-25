import { describe, expect, test, vi } from "vitest";

import type { TActorContext } from "@app/domains/lib/actor-context";
import { FakeActorAuditConfig } from "@app/domains/lib/actor-context/testing/fake-actor-audit-config";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import {
  actorContext,
  actorOrg,
  identityPrincipal,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { ActorType } from "@app/lib/auth/actor-types";

import { UserAgentType } from "../../models/event-type";
import {
  authenticationEvent,
  authorizationEvent,
  dataAccessEvent,
  managementEvent,
  platformActorRecord
} from "../../testing/audit-events";
import { buildAuditLog } from "../../testing/build-audit-log";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const MS_IN_DAY = 24 * 60 * 60 * 1000;

class NoEventClassesAuditConfig extends FakeActorAuditConfig {
  // eslint-disable-next-line class-methods-use-this
  override async eventClasses(): Promise<never> {
    throw new Error("event classes must not be looked up");
  }
}

const setup = (audit: FakeActorAuditConfig = new FakeActorAuditConfig()) => {
  const harness = buildAuditLog();
  const org = actorOrg();
  const principal = userPrincipal();
  const actor: TActorContext = { ...actorContext({ principal, org }), audit };
  return { ...harness, audit, org, principal, actor };
};

const lifetimeDays = (entry: { createdAt: string; expiresAt: string }) =>
  (new Date(entry.expiresAt).getTime() - new Date(entry.createdAt).getTime()) / MS_IN_DAY;

describe("AuditLogRecorderService.record", () => {
  test("should apply the project's retention and name to a project event", async () => {
    // Setup
    const { auditLogRecorderService, audit, actor, org, appended, metrics } = setup();
    audit.orgConfig = { retentionDays: 90 };
    audit.projects.set("project-1", { name: "payments", retentionDays: 30 });

    // Action
    await auditLogRecorderService.record(actor, { event: managementEvent(), projectId: "project-1" });

    // Assert
    const [entry] = await appended();
    expect(entry).toMatchObject({ orgId: org.id, projectId: "project-1", projectName: "payments" });
    expect(lifetimeDays(entry)).toBe(30);
    expect(metrics.enqueued).toEqual([{ eventType: "create-secret", actorType: ActorType.USER }]);
  });

  test("should apply the plan's retention to an org event", async () => {
    // Setup
    const { auditLogRecorderService, audit, actor, appended } = setup();
    audit.orgConfig = { retentionDays: 90 };

    // Action
    await auditLogRecorderService.record(actor, { event: managementEvent() });

    // Assert
    const [entry] = await appended();
    expect(lifetimeDays(entry)).toBe(90);
    expect(entry).not.toHaveProperty("projectId");
    expect(entry).not.toHaveProperty("projectName");
  });

  test("should not look up the event classes for a management event", async () => {
    // Setup
    const { auditLogRecorderService, actor, appended } = setup(new NoEventClassesAuditConfig());

    // Action
    await auditLogRecorderService.record(actor, { event: managementEvent() });
    await auditLogRecorderService.record(actor, { event: dataAccessEvent() });

    // Assert
    expect(await appended()).toHaveLength(2);
  });

  test("should drop an event whose class is switched off", async () => {
    // Setup
    const { auditLogRecorderService, audit, actor, appended, metrics } = setup();
    audit.switches = { authentication: false, authorization: false };

    // Action
    await auditLogRecorderService.record(actor, { event: authenticationEvent() });
    await auditLogRecorderService.record(actor, { event: authorizationEvent() });

    // Assert
    expect(await appended()).toEqual([]);
    expect(metrics.enqueued).toEqual([]);
    expect(metrics.dropped).toEqual([]);
  });

  test("should record an event whose class is switched on", async () => {
    // Setup
    const { auditLogRecorderService, audit, actor, appended } = setup();
    audit.switches = { authentication: true, authorization: true };

    // Action
    await auditLogRecorderService.record(actor, { event: authenticationEvent() });
    await auditLogRecorderService.record(actor, { event: authorizationEvent() });

    // Assert
    expect((await appended()).map((entry) => entry.event.type)).toEqual(["user-login", "permission-denied"]);
  });

  test("should use the project's switches for a project event", async () => {
    // Setup
    const { auditLogRecorderService, audit, actor, appended } = setup();
    audit.projects.set("project-1", { name: "payments", retentionDays: null });
    audit.switches = { authentication: true, authorization: false };
    audit.projectSwitches.set("project-1", { authentication: false, authorization: false });

    // Action
    await auditLogRecorderService.record(actor, { event: authenticationEvent(), projectId: "project-1" });

    // Assert
    expect(await appended()).toEqual([]);
  });

  test("should append nothing when the plan keeps no logs", async () => {
    // Setup
    const { auditLogRecorderService, audit, actor, appended } = setup();
    audit.orgConfig = { retentionDays: 0 };

    // Action
    await auditLogRecorderService.record(actor, { event: managementEvent() });

    // Assert
    expect(await appended()).toEqual([]);
  });

  test("should append nothing and count a refused recording for another org's project", async () => {
    // Setup
    const { auditLogRecorderService, actor, org, appended, metrics } = setup();

    // Action
    await expect(
      auditLogRecorderService.record(actor, { event: managementEvent(), projectId: "foreign-project" })
    ).resolves.toBeUndefined();

    // Assert
    expect(await appended()).toEqual([]);
    expect(metrics.dropped).toEqual([
      { eventType: "create-secret", actorType: ActorType.USER, reason: "recording_refused", orgId: org.id }
    ]);
  });

  test("should not throw and count a failed push when the buffer fails", async () => {
    // Setup
    const keyStore = new InMemoryKeyStore();
    keyStore.streamAdd = async () => {
      throw new Error("redis down");
    };
    const harness = buildAuditLog({ keyStore });
    const org = actorOrg();
    const actor = actorContext({ principal: userPrincipal(), org });

    // Action
    const result = harness.auditLogRecorderService.record(actor, { event: managementEvent() });

    // Assert
    await expect(result).resolves.toBeUndefined();
    expect(harness.metrics.dropped).toEqual([
      { eventType: "create-secret", actorType: ActorType.USER, reason: "ingest_stream_push_failed", orgId: org.id }
    ]);
    expect(harness.metrics.enqueued).toEqual([]);
  });

  test("should take the actor and origin from the context", async () => {
    // Setup
    const { auditLogRecorderService, audit, org, appended } = setup();
    audit.originFacts = {
      ipAddress: "10.0.0.7",
      userAgent: "terraform/1.9",
      userAgentType: UserAgentType.TERRAFORM,
      permissionMetadata: { role: "admin" }
    };
    const principal = identityPrincipal({ name: "deployer" });
    const actor: TActorContext = { ...actorContext({ principal, org }), audit };

    // Action
    await auditLogRecorderService.record(actor, { event: managementEvent() });

    // Assert
    const [entry] = await appended();
    expect(entry.actor).toEqual({
      type: ActorType.IDENTITY,
      metadata: { name: "deployer", identityId: principal.id, permission: { role: "admin" } }
    });
    expect(entry).toMatchObject({ ipAddress: "10.0.0.7", userAgent: "terraform/1.9", userAgentType: "terraform" });
  });

  test("should prefer an explicit actor and origin over the context's", async () => {
    // Setup
    const { auditLogRecorderService, audit, actor, appended } = setup();
    audit.originFacts = { ipAddress: "10.0.0.7", userAgent: "ctx", userAgentType: UserAgentType.OTHER };

    // Action
    await auditLogRecorderService.record(actor, {
      event: managementEvent(),
      actor: platformActorRecord(),
      ipAddress: "192.168.1.1",
      userAgent: "explicit",
      userAgentType: UserAgentType.CLI
    });

    // Assert
    const [entry] = await appended();
    expect(entry.actor).toEqual(platformActorRecord());
    expect(entry).toMatchObject({ ipAddress: "192.168.1.1", userAgent: "explicit", userAgentType: "cli" });
  });
});

describe("AuditLogRecorderService.recordOrThrow", () => {
  test("should throw when the buffer fails", async () => {
    // Setup
    const keyStore = new InMemoryKeyStore();
    keyStore.streamAdd = async () => {
      throw new Error("redis down");
    };
    const harness = buildAuditLog({ keyStore });
    const actor = actorContext({ principal: userPrincipal(), org: actorOrg() });

    // Action
    const result = harness.auditLogRecorderService.recordOrThrow(actor, { event: managementEvent() });

    // Assert
    await expect(result).rejects.toThrow("redis down");
  });

  test("should throw for another org's project and append nothing", async () => {
    // Setup
    const { auditLogRecorderService, actor, appended } = setup();

    // Action
    const result = auditLogRecorderService.recordOrThrow(actor, {
      event: managementEvent(),
      projectId: "foreign-project"
    });

    // Assert
    await expect(result).rejects.toThrow("Project with ID 'foreign-project' not found");
    expect(await appended()).toEqual([]);
  });
});

describe("AuditLogRecorderService.recordResolved", () => {
  test("should apply the project's retention within the plan and store the project's name", async () => {
    // Setup
    const { auditLogRecorderService, appended } = setup();

    // Action
    await auditLogRecorderService.recordResolved({
      orgId: "org-1",
      project: { id: "project-1", name: "payments" },
      policy: { retentionDays: 90, projectRetentionDays: 30 },
      event: managementEvent(),
      actor: platformActorRecord()
    });

    // Assert
    const [entry] = await appended();
    expect(entry).toMatchObject({ orgId: "org-1", projectId: "project-1", projectName: "payments" });
    expect(lifetimeDays(entry)).toBe(30);
  });

  test("should append nothing when the policy drops the event", async () => {
    // Setup
    const { auditLogRecorderService, appended } = setup();

    // Action
    await auditLogRecorderService.recordResolved({
      orgId: "org-1",
      policy: { retentionDays: 30, eventClasses: { authentication: false, authorization: false } },
      event: authenticationEvent(),
      actor: platformActorRecord()
    });

    // Assert
    expect(await appended()).toEqual([]);
  });
});
