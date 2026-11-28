import { describe, expect, test } from "vitest";

import type { TActorAuditConfig, TActorContext } from "@app/domains/lib/actor-context";
import {
  actorContext,
  actorOrg,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";

import { ActorAuditConfig } from "./actor-audit-config";
import type { TAuditConfigSource } from "./audit-config-source";

class CountingAuditConfigSource implements TAuditConfigSource {
  orgCalls: string[] = [];

  projectCalls: string[] = [];

  classCalls: (string | undefined)[] = [];

  failNextOrgLoad = false;

  async forOrg(orgId: string) {
    this.orgCalls.push(orgId);
    if (this.failNextOrgLoad) {
      this.failNextOrgLoad = false;
      throw new Error("license server down");
    }
    return { retentionDays: 30 };
  }

  async forProject(_orgId: string, projectId: string) {
    this.projectCalls.push(projectId);
    return { name: `project ${projectId}`, retentionDays: null };
  }

  async eventClasses(_orgId: string, projectId?: string) {
    this.classCalls.push(projectId);
    return { authentication: true, authorization: false };
  }

  // eslint-disable-next-line class-methods-use-this
  async findProjectConfig() {
    return null;
  }
}

const setup = (orgId = "org-1") => {
  const source = new CountingAuditConfigSource();
  const audit = new ActorAuditConfig(() => orgId, source);
  return { source, audit, orgId };
};

describe("ActorAuditConfig.org", () => {
  test("should load the org once however often it is asked", async () => {
    // Setup
    const { audit, source, orgId } = setup();

    // Action
    const results = await Promise.all([audit.org(), audit.org()]);
    await audit.org();

    // Assert
    expect(results).toEqual([{ retentionDays: 30 }, { retentionDays: 30 }]);
    expect(source.orgCalls).toEqual([orgId]);
  });

  test("should retry after a failed load", async () => {
    // Setup
    const { audit, source } = setup();
    source.failNextOrgLoad = true;
    await expect(audit.org()).rejects.toThrow("license server down");

    // Action
    const retried = await audit.org();

    // Assert
    expect(retried).toEqual({ retentionDays: 30 });
    expect(source.orgCalls).toHaveLength(2);
  });
});

describe("ActorAuditConfig.project", () => {
  test("should load each project once and different projects separately", async () => {
    // Setup
    const { audit, source } = setup();

    // Action
    await audit.project("p1");
    await audit.project("p1");
    const second = await audit.project("p2");

    // Assert
    expect(second?.name).toBe("project p2");
    expect(source.projectCalls).toEqual(["p1", "p2"]);
  });
});

describe("ActorAuditConfig.eventClasses", () => {
  test("should load the org's and each project's switches once", async () => {
    // Setup
    const { audit, source } = setup();

    // Action
    await audit.eventClasses();
    await audit.eventClasses();
    await audit.eventClasses("p1");
    await audit.eventClasses("p1");

    // Assert
    expect(source.classCalls).toEqual([undefined, "p1"]);
  });
});

describe("ActorAuditConfig sharing", () => {
  test("should share the cache with a copy of the context", async () => {
    // Setup
    const { audit, source } = setup();
    const actor: TActorContext = { ...actorContext({ principal: userPrincipal(), org: actorOrg() }), audit };
    const copy = { ...actor };

    // Action
    await actor.audit.org();
    await copy.audit.org();

    // Assert
    expect(copy.audit).toBe(actor.audit);
    expect(source.orgCalls).toHaveLength(1);
  });

  test("should refuse for an unscoped context and load nothing", async () => {
    // Setup
    const source = new CountingAuditConfigSource();
    const unscoped = Object.defineProperty({ principal: userPrincipal() }, "org", {
      enumerable: false,
      get: () => {
        throw new Error("not scoped to an organization");
      }
    }) as unknown as TActorContext;
    const audit: TActorAuditConfig = new ActorAuditConfig(() => unscoped.org.id, source);

    // Action
    const attempts = [() => audit.org(), () => audit.project("p1"), () => audit.eventClasses()];

    // Assert
    attempts.forEach((attempt) => expect(attempt).toThrow("not scoped to an organization"));
    expect(source.orgCalls).toEqual([]);
    expect(source.projectCalls).toEqual([]);
    expect(source.classCalls).toEqual([]);
  });
});
