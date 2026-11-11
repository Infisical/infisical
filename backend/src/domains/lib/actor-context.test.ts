import { randomUUID } from "node:crypto";

import type { TPlanProps } from "@app/domains/platform/license/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

import { actorContexts, TActorOrg } from "./actor-context";

const user: TPrincipal = {
  type: ActorType.USER,
  id: randomUUID(),
  username: "u",
  email: "u@example.com",
  authMethod: AuthMethod.EMAIL,
  isSuperAdmin: false
};

const orgRow = (id: string): TActorOrg => ({
  id,
  name: "acme",
  rootOrgId: id,
  parentOrgId: id,
  shouldUseNewPrivilegeSystem: true,
  ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
});

const setup = () => {
  const orgs = new Map<string, TActorOrg>();
  let planLoads = 0;
  const assertSessionAllowed = vi.fn<(input: { principal: TPrincipal; org: TActorOrg }) => Promise<void>>(
    async () => {}
  );
  const contexts = actorContexts({
    findActorOrg: async (orgId) => orgs.get(orgId),
    getPlan: async () => {
      planLoads += 1;
      return { slug: "pro" } as TPlanProps;
    },
    assertSessionAllowed
  });
  const addOrg = () => {
    const org = orgRow(randomUUID());
    orgs.set(org.id, org);
    return org;
  };
  return { contexts, addOrg, assertSessionAllowed, planLoads: () => planLoads };
};

describe("actorContexts.forRequest", () => {
  test("should carry the org the session is scoped to", async () => {
    // Setup
    const { contexts, addOrg } = setup();
    const org = addOrg();

    // Action
    const context = await contexts.forRequest(user, org.id);

    // Assert
    expect(context.org.id).toBe(org.id);
  });

  test("should refuse the request when the org's sign-in policy refuses the session", async () => {
    // Setup
    const { contexts, addOrg, assertSessionAllowed } = setup();
    const org = addOrg();
    assertSessionAllowed.mockRejectedValueOnce(new Error("Organization authentication is enforced"));

    // Action
    const context = contexts.forRequest(user, org.id);

    // Assert
    await expect(context).rejects.toThrow("Organization authentication is enforced");
    expect(assertSessionAllowed).toHaveBeenCalledWith({ principal: user, org });
  });

  test("should not check the session of a request not scoped to an org", async () => {
    // Setup
    const { contexts, assertSessionAllowed } = setup();

    // Action
    await contexts.forRequest(user, "API_KEY");

    // Assert
    expect(assertSessionAllowed).not.toHaveBeenCalled();
  });

  test("should refuse with a readable error when an unscoped session's org is used", async () => {
    // Setup
    const { contexts } = setup();

    // Action
    const context = await contexts.forRequest(user, "API_KEY");

    // Assert
    expect(() => context.org).toThrow("not scoped to an organization");
    await expect(context.plan()).rejects.toThrow("not scoped to an organization");
  });

  test("should let an unscoped context be spread without reading its org", async () => {
    // Setup
    const { contexts } = setup();
    const context = await contexts.forRequest(user, "");

    // Action
    const spread = { ...context };

    // Assert
    expect(spread.principal).toBe(user);
  });

  test("should treat a session for an org that no longer exists as unscoped", async () => {
    // Setup
    const { contexts } = setup();

    // Action
    const context = await contexts.forRequest(user, randomUUID());

    // Assert
    expect(() => context.org).toThrow("not scoped to an organization");
  });

  test("should load the plan once however often it is read", async () => {
    // Setup
    const { contexts, addOrg, planLoads } = setup();
    const context = await contexts.forRequest(user, addOrg().id);

    // Action
    await Promise.all([context.plan(), context.plan(), context.plan()]);

    // Assert
    expect(planLoads()).toBe(1);
  });
});

describe("actorContexts.system", () => {
  test("should act as the platform in the given org", async () => {
    // Setup
    const { contexts, addOrg } = setup();
    const org = addOrg();

    // Action
    const context = await contexts.system(org.id);

    // Assert
    expect(context.principal.type).toBe(ActorType.PLATFORM);
    expect(context.org.id).toBe(org.id);
  });

  test("should refuse an org that does not exist", async () => {
    // Setup
    const { contexts } = setup();
    const orgId = randomUUID();

    // Action
    const result = contexts.system(orgId);

    // Assert
    await expect(result).rejects.toThrow(`Organization with ID '${orgId}' not found`);
  });
});
