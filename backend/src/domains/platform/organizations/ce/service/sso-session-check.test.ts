import { randomUUID } from "node:crypto";

import type { TActorOrg } from "@app/domains/lib/actor-context";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";
import { UnauthorizedError } from "@app/lib/errors";

import { SsoSessionCheck } from "./sso-session-check";

const rootOrgId = randomUUID();

const subOrg = (policy: Partial<TActorOrg["ssoPolicy"]>): TActorOrg => ({
  id: randomUUID(),
  name: "sub",
  rootOrgId,
  parentOrgId: rootOrgId,
  shouldUseNewPrivilegeSystem: true,
  ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false, ...policy }
});

const emailUser: TPrincipal = {
  type: ActorType.USER,
  id: randomUUID(),
  username: "u",
  email: null,
  authMethod: AuthMethod.EMAIL,
  isSuperAdmin: false
};

const setup = (canBypass = false) => {
  const canBypassSso = vi.fn(async () => canBypass);
  return { check: new SsoSessionCheck({ canBypassSso }), canBypassSso };
};

describe("SsoSessionCheck.assertSessionAllowed", () => {
  test("should refuse with 401 an email session in a sub-org whose root enforces SSO, without asking about bypass", async () => {
    // Setup
    const { check, canBypassSso } = setup(true);

    // Action
    const result = check.assertSessionAllowed({ principal: emailUser, org: subOrg({ authEnforced: true }) });

    // Assert
    await expect(result).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(result).rejects.toThrow(/Login with SAML SSO/);
    expect(canBypassSso).not.toHaveBeenCalled();
  });

  test("should let a user through whose root org roles may bypass, when the root org allows bypass", async () => {
    // Setup
    const { check, canBypassSso } = setup(true);

    // Action
    const result = check.assertSessionAllowed({
      principal: emailUser,
      org: subOrg({ authEnforced: true, bypassOrgAuthEnabled: true })
    });

    // Assert
    await expect(result).resolves.toBeUndefined();
    expect(canBypassSso).toHaveBeenCalledWith({ userId: emailUser.id, rootOrgId });
  });

  test("should refuse a user whose roles may not bypass, even when the root org allows bypass", async () => {
    // Setup
    const { check } = setup(false);

    // Action
    const result = check.assertSessionAllowed({
      principal: emailUser,
      org: subOrg({ googleSsoAuthEnforced: true, bypassOrgAuthEnabled: true })
    });

    // Assert
    await expect(result).rejects.toThrow(/Login with Google SSO/);
  });

  test("should refuse a session another org's IdP issued", async () => {
    // Setup
    const { check } = setup();
    const foreign = { ...emailUser, authMethod: AuthMethod.OKTA_SAML, sessionRootOrgId: randomUUID() } as TPrincipal;

    // Action
    const result = check.assertSessionAllowed({ principal: foreign, org: subOrg({ authEnforced: true }) });

    // Assert
    await expect(result).rejects.toThrow(/another organization's identity provider/);
  });

  test("should never check an identity", async () => {
    // Setup
    const { check } = setup();
    const identity: TPrincipal = { type: ActorType.IDENTITY, id: randomUUID(), name: "i", isInstanceAdmin: false };

    // Action
    const result = check.assertSessionAllowed({
      principal: identity,
      org: subOrg({ authEnforced: true, googleSsoAuthEnforced: true })
    });

    // Assert
    await expect(result).resolves.toBeUndefined();
  });
});
