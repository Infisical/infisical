import { randomUUID } from "node:crypto";

import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { ActorType } from "@app/lib/auth/actor-types";

import { SSO_REQUIRED_ERROR_NAME } from "../../models/sso-policy";
import { actorOrg, userPrincipal } from "../../testing/actor-context-fixture";
import { FakeOrgPermissionService } from "../../testing/fake-org-permission-service";
import { InMemoryOrganizationStore } from "../../testing/in-memory-organization-store";
import { SsoSessionService } from "../sso-session/service";
import { ActorContextService } from "./service";

const arrange = () => {
  const organizationStore = new InMemoryOrganizationStore();
  const service = new ActorContextService(organizationStore, new SsoSessionService(new FakeOrgPermissionService()));
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
    const { actor, ssoRefusal } = await service.forRequest({ principal, orgId: org.id });

    // Assert
    expect(actor).toEqual({ principal, org });
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
