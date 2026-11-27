import { randomUUID } from "node:crypto";

import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { ActorOrgCache } from "../../data-access/actor-org-cache";
import { FOREIGN_SSO_SESSION_ERROR_NAME, SSO_REQUIRED_ERROR_NAME } from "../../models/sso-policy";
import { actorOrg, identityPrincipal, userPrincipal } from "../../testing/actor-context-fixture";
import { FakeOrgPermissionService } from "../../testing/fake-org-permission-service";
import { InMemoryOrganizationStore } from "../../testing/in-memory-organization-store";
import { SsoSessionService } from "../sso-session/service";
import { ActorContextService } from "./service";

const arrange = ({ cacheTtlSeconds = 0 }: { cacheTtlSeconds?: number } = {}) => {
  const organizationStore = new InMemoryOrganizationStore();
  const service = new ActorContextService(
    organizationStore,
    new SsoSessionService(new FakeOrgPermissionService()),
    new ActorOrgCache(cacheTtlSeconds)
  );
  const org = actorOrg();
  organizationStore.add(org);
  return { service, organizationStore, org };
};

describe("ActorContextService.forRequest", () => {
  test("should scope the context to the org the request names", async () => {
    // Setup
    const { service, org } = arrange();
    const principal = userPrincipal();

    // Action
    const { actor, org: scopedTo, ssoRefusal } = await service.forRequest({ principal, orgId: org.id });

    // Assert
    expect(actor).toEqual({ principal, org });
    expect(scopedTo).toEqual(org);
    expect(ssoRefusal).toBeNull();
  });

  test.each([
    ["no org", undefined],
    ["an org id that is not a UUID", "not-a-uuid"],
    ["an org that does not exist", randomUUID()]
  ])("should give a context whose org refuses when read, for %s", async (_case, orgId) => {
    // Setup
    const { service } = arrange();

    // Action
    const { actor, ssoRefusal } = await service.forRequest({ principal: userPrincipal(), orgId });

    // Assert
    expect(() => actor.org).toThrow(RuleViolationError);
    expect(() => actor.org).toThrow(
      "This request is not scoped to an organization. Select an organization and try again."
    );
    expect(ssoRefusal).toBeNull();
  });

  test("should keep an unscoped context's org out of a spread or JSON copy", async () => {
    // Setup
    const { service } = arrange();
    const principal = userPrincipal();
    const { actor } = await service.forRequest({ principal, orgId: undefined });

    // Action
    const copied = { ...actor };
    const serialized = JSON.parse(JSON.stringify(actor)) as object;

    // Assert
    expect(Object.keys(actor)).toEqual(["principal"]);
    expect(copied).toEqual({ principal });
    expect(serialized).toEqual(JSON.parse(JSON.stringify({ principal })));
  });

  test("should return the SSO refusal for a session the org's policy refuses, not throw it", async () => {
    // Setup
    const { service, organizationStore } = arrange();
    const enforced = actorOrg({ ssoPolicy: { authEnforced: true } });
    organizationStore.add(enforced);

    // Action
    const { actor, ssoRefusal } = await service.forRequest({ principal: userPrincipal(), orgId: enforced.id });

    // Assert
    expect(actor.org.id).toBe(enforced.id);
    expect(ssoRefusal?.name).toBe(SSO_REQUIRED_ERROR_NAME);
  });

  test("should check a sub-org session against its root org's policy", async () => {
    // Setup
    const { service, organizationStore } = arrange();
    const root = actorOrg({ ssoPolicy: { googleSsoAuthEnforced: true } });
    const sub = actorOrg({ rootOrgId: root.id, parentOrgId: root.id });
    organizationStore.add(root);
    organizationStore.add(sub);

    // Action
    const { ssoRefusal } = await service.forRequest({ principal: userPrincipal(), orgId: sub.id });

    // Assert
    expect(ssoRefusal?.message).toMatch(/Login with Google SSO/);
  });

  test("should use the org the request already read and not read it again", async () => {
    // Setup
    const { service, organizationStore, org } = arrange();
    const findActorOrg = vi.spyOn(organizationStore, "findActorOrg");
    const principal = userPrincipal();

    // Action
    const { actor } = await service.forRequest({ principal, org });

    // Assert
    expect(actor).toEqual({ principal, org });
    expect(findActorOrg).not.toHaveBeenCalled();
  });

  test("should give an unscoped context when the request already found no org", async () => {
    // Setup
    const { service, organizationStore } = arrange();
    const findActorOrg = vi.spyOn(organizationStore, "findActorOrg");

    // Action
    const { actor, org: scopedTo } = await service.forRequest({ principal: userPrincipal(), org: null });

    // Assert
    expect(() => actor.org).toThrow(RuleViolationError);
    expect(scopedTo).toBeNull();
    expect(findActorOrg).not.toHaveBeenCalled();
  });

  test("should check the sign-in policy of the org the request already read", async () => {
    // Setup
    const { service } = arrange();
    const enforced = actorOrg({ ssoPolicy: { authEnforced: true } });

    // Action
    const { ssoRefusal } = await service.forRequest({ principal: userPrincipal(), org: enforced });

    // Assert
    expect(ssoRefusal?.name).toBe(SSO_REQUIRED_ERROR_NAME);
  });

  test("should read a machine actor's org once while it is cached", async () => {
    // Setup
    const { service, organizationStore, org } = arrange({ cacheTtlSeconds: 10 });
    const findActorOrg = vi.spyOn(organizationStore, "findActorOrg");
    const principal = identityPrincipal();

    // Action
    const first = await service.forRequest({ principal, orgId: org.id });
    const second = await service.forRequest({ principal, orgId: org.id });

    // Assert
    expect(first.actor.org).toEqual(org);
    expect(second.actor.org).toEqual(org);
    expect(second.actor.org).not.toBe(first.actor.org);
    expect(findActorOrg).toHaveBeenCalledTimes(1);
  });

  test("should read a user's org on every request, so a sign-in policy change applies at once", async () => {
    // Setup
    const { service, organizationStore } = arrange({ cacheTtlSeconds: 10 });
    const org = actorOrg();
    organizationStore.add(org);
    await service.forRequest({ principal: identityPrincipal(), orgId: org.id });
    await service.forRequest({ principal: userPrincipal(), orgId: org.id });

    // Action
    organizationStore.add({ ...org, ssoPolicy: { ...org.ssoPolicy, authEnforced: true } });
    const { ssoRefusal } = await service.forRequest({ principal: userPrincipal(), orgId: org.id });

    // Assert
    expect(ssoRefusal?.name).toBe(SSO_REQUIRED_ERROR_NAME);
  });
});

describe("ActorContextService.findActorOrg", () => {
  test("should return the org, and null for an id that is not an org id or names no org", async () => {
    // Setup
    const { service, org } = arrange();

    // Action
    const results = await Promise.all([
      service.findActorOrg(org.id),
      service.findActorOrg("API_KEY"),
      service.findActorOrg(randomUUID())
    ]);

    // Assert
    expect(results).toEqual([org, null, null]);
  });
});

describe("ActorContextService.forPrincipal", () => {
  test("should scope the context to an existing org", async () => {
    // Setup
    const { service, org } = arrange();
    const principal = userPrincipal();

    // Action
    const actor = await service.forPrincipal({ principal, orgId: org.id });

    // Assert
    expect(actor).toEqual({ principal, org });
  });

  test("should refuse an org that does not exist", async () => {
    // Setup
    const { service } = arrange();
    const orgId = randomUUID();

    // Action
    const result = service.forPrincipal({ principal: userPrincipal(), orgId });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(`Organization with ID '${orgId}' not found`);
  });
});

describe("ActorContextService.forSession", () => {
  test("should scope the context to the org when its sign-in policy allows the session", async () => {
    // Setup
    const { service, org } = arrange();
    const principal = userPrincipal();

    // Action
    const actor = await service.forSession({ principal, orgId: org.id });

    // Assert
    expect(actor).toEqual({ principal, org });
  });

  test("should refuse a session the org's sign-in policy no longer allows", async () => {
    // Setup
    const { service, organizationStore } = arrange();
    const enforced = actorOrg({ ssoPolicy: { authEnforced: true } });
    organizationStore.add(enforced);

    // Action
    const result = service.forSession({ principal: userPrincipal(), orgId: enforced.id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(result).rejects.toThrow(/Login with SAML SSO/);
    await expect(result).rejects.not.toMatchObject({ name: SSO_REQUIRED_ERROR_NAME });
  });

  test("should name the refusal of a session another org's identity provider issued", async () => {
    // Setup
    const { service, organizationStore } = arrange();
    const enforced = actorOrg({ ssoPolicy: { authEnforced: true } });
    organizationStore.add(enforced);
    const principal = userPrincipal({ authMethod: AuthMethod.OKTA_SAML, sessionRootOrgId: randomUUID() });

    // Action
    const result = service.forSession({ principal, orgId: enforced.id });

    // Assert
    await expect(result).rejects.toMatchObject({ name: FOREIGN_SSO_SESSION_ERROR_NAME });
  });

  test("should not check a session without a sign-in method", async () => {
    // Setup
    const { service, organizationStore } = arrange();
    const enforced = actorOrg({ ssoPolicy: { authEnforced: true } });
    organizationStore.add(enforced);

    // Action
    const result = service.forSession({ principal: userPrincipal({ authMethod: null }), orgId: enforced.id });

    // Assert
    await expect(result).resolves.toMatchObject({ org: enforced });
  });
});

describe("ActorContextService.system", () => {
  test("should act as the platform principal in the org", async () => {
    // Setup
    const { service, org } = arrange();

    // Action
    const actor = await service.system({ orgId: org.id });

    // Assert
    expect(actor).toEqual({ principal: { type: ActorType.PLATFORM, id: "platform" }, org });
  });

  test("should refuse an org that does not exist", async () => {
    // Setup
    const { service } = arrange();

    // Action
    const result = service.system({ orgId: randomUUID() });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
