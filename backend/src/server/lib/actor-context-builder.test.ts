import { describe, expect, test } from "vitest";

import type { TActorContextBase } from "@app/domains/lib/actor-context";
import { RuleViolationError } from "@app/domains/lib/errors";
import type { TActorContextService } from "@app/domains/platform/organizations/ce/module";
import { actorOrg, userPrincipal } from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import type { TPrincipal } from "@app/lib/auth/principal";

import { ActorContextBuilder } from "./actor-context-builder";
import type { TAuditConfigSource } from "./audit-config-source";

const countingAuditConfigSource = () => {
  const orgCalls: string[] = [];
  const source: TAuditConfigSource = {
    forOrg: async (orgId) => {
      orgCalls.push(orgId);
      return { retentionDays: 45 };
    },
    forProject: async () => null,
    eventClasses: async () => ({ authentication: true, authorization: false }),
    findProjectConfig: async () => null
  };
  return { source, orgCalls };
};

const refusal = { name: "SsoSessionRefused", message: "sign in again" } as never;

const notScoped = () => new RuleViolationError({ message: "This request is not scoped to an organization." });

class FakeBaseActorContextService implements TActorContextService<TActorContextBase> {
  constructor(
    private readonly org = actorOrg(),
    private readonly ssoRefusal: unknown = null,
    private readonly unscoped = false
  ) {}

  private context(principal: TPrincipal): TActorContextBase {
    if (this.unscoped) {
      return Object.defineProperty({ principal }, "org", {
        enumerable: false,
        get: () => {
          throw notScoped();
        }
      }) as TActorContextBase;
    }
    return { principal, org: this.org };
  }

  async forRequest({ principal }: { principal: TPrincipal; orgId: string | undefined }) {
    return { actor: this.context(principal), ssoRefusal: this.ssoRefusal as never };
  }

  async forPrincipal({ principal }: { principal: TPrincipal; orgId: string }) {
    return this.context(principal);
  }

  async forSession({ principal }: { principal: TPrincipal; orgId: string }) {
    return this.context(principal);
  }

  async system() {
    return this.context({ type: "platform", id: "platform" } as TPrincipal);
  }
}

const setup = (base = new FakeBaseActorContextService()) => {
  const { source, orgCalls } = countingAuditConfigSource();
  const builder = new ActorContextBuilder(base, source);
  return { builder, orgCalls, principal: userPrincipal(), orgId: "org-1" };
};

describe("ActorContextBuilder", () => {
  test("should attach the audit configuration in forRequest", async () => {
    // Setup
    const { builder, principal, orgId } = setup();

    // Action
    const { actor } = await builder.forRequest({ principal, orgId });

    // Assert
    expect(await actor.audit.org()).toEqual({ retentionDays: 45 });
  });

  test("should attach the audit configuration in forPrincipal", async () => {
    // Setup
    const { builder, principal, orgId } = setup();

    // Action
    const actor = await builder.forPrincipal({ principal, orgId });

    // Assert
    expect(await actor.audit.org()).toEqual({ retentionDays: 45 });
    expect(actor.principal).toBe(principal);
  });

  test("should attach the audit configuration in forSession", async () => {
    // Setup
    const { builder, principal, orgId } = setup();

    // Action
    const actor = await builder.forSession({ principal, orgId });

    // Assert
    expect(await actor.audit.org()).toEqual({ retentionDays: 45 });
  });

  test("should attach the audit configuration in system", async () => {
    // Setup
    const { builder, orgId } = setup();

    // Action
    const actor = await builder.system({ orgId });

    // Assert
    expect(await actor.audit.org()).toEqual({ retentionDays: 45 });
    expect(actor.principal.type).toBe("platform");
  });

  test("should read the audit configuration of the context's own org", async () => {
    // Setup
    const org = actorOrg({ id: "org-42" });
    const { builder, orgCalls, principal } = setup(new FakeBaseActorContextService(org));

    // Action
    const actor = await builder.forPrincipal({ principal, orgId: org.id });
    await actor.audit.org();
    await actor.audit.org();

    // Assert
    expect(orgCalls).toEqual(["org-42"]);
  });

  test("should pass the SSO refusal through unchanged", async () => {
    // Setup
    const { builder, principal, orgId } = setup(new FakeBaseActorContextService(actorOrg(), refusal));

    // Action
    const result = await builder.forRequest({ principal, orgId });

    // Assert
    expect(result.ssoRefusal).toBe(refusal);
  });

  test("should refuse reading the audit org of an unscoped context the same way reading its org does", async () => {
    // Setup
    const { builder, principal, orgCalls } = setup(new FakeBaseActorContextService(actorOrg(), null, true));
    const { actor } = await builder.forRequest({ principal, orgId: undefined });

    // Action
    const readOrg = () => actor.org;
    const readAuditOrg = () => actor.audit.org();

    // Assert
    expect(readOrg).toThrow(RuleViolationError);
    expect(readAuditOrg).toThrow(RuleViolationError);
    expect(readAuditOrg).toThrow("This request is not scoped to an organization.");
    expect(orgCalls).toEqual([]);
  });
});
