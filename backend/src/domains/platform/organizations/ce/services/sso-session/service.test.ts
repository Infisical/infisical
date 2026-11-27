import { randomUUID } from "node:crypto";

import { AuthMethod } from "@app/lib/auth/actor-types";

import { FOREIGN_SSO_SESSION_ERROR_NAME, SSO_REQUIRED_ERROR_NAME } from "../../models/sso-policy";
import { actorOrg, identityPrincipal, userPrincipal } from "../../testing/actor-context-fixture";
import { FakeOrgPermissionService } from "../../testing/fake-org-permission-service";
import { SsoSessionService } from "./service";

const arrange = ({ canBypass = false }: { canBypass?: boolean } = {}) => {
  const orgPermissionService = new FakeOrgPermissionService();
  orgPermissionService.canBypass = canBypass;
  const rootOrgId = randomUUID();
  const subOrg = (ssoPolicy: NonNullable<Parameters<typeof actorOrg>[0]>["ssoPolicy"]) =>
    actorOrg({ rootOrgId, parentOrgId: rootOrgId, ssoPolicy });
  return { service: new SsoSessionService(orgPermissionService), orgPermissionService, rootOrgId, subOrg };
};

describe("SsoSessionService.findSsoSessionRefusal", () => {
  test("should refuse an email session in a sub-org whose root enforces SSO, without looking up the bypass", async () => {
    // Setup
    const { service, orgPermissionService, subOrg } = arrange({ canBypass: true });

    // Action
    const refusal = await service.findSsoSessionRefusal({
      principal: userPrincipal(),
      org: subOrg({ authEnforced: true })
    });

    // Assert
    expect(refusal?.name).toBe(SSO_REQUIRED_ERROR_NAME);
    expect(refusal?.message).toMatch(/Login with SAML SSO/);
    expect(orgPermissionService.bypassLookups).toEqual([]);
  });

  test("should let a user through whose root org roles may bypass, when the root org allows bypass", async () => {
    // Setup
    const { service, orgPermissionService, subOrg, rootOrgId } = arrange({ canBypass: true });
    const principal = userPrincipal();

    // Action
    const refusal = await service.findSsoSessionRefusal({
      principal,
      org: subOrg({ authEnforced: true, bypassOrgAuthEnabled: true })
    });

    // Assert
    expect(refusal).toBeNull();
    expect(orgPermissionService.bypassLookups).toEqual([{ userId: principal.id, rootOrgId }]);
  });

  test("should refuse a user whose roles may not bypass, even when the root org allows bypass", async () => {
    // Setup
    const { service, subOrg } = arrange({ canBypass: false });

    // Action
    const refusal = await service.findSsoSessionRefusal({
      principal: userPrincipal(),
      org: subOrg({ googleSsoAuthEnforced: true, bypassOrgAuthEnabled: true })
    });

    // Assert
    expect(refusal?.message).toMatch(/Login with Google SSO/);
  });

  test("should refuse a session another org's IdP issued", async () => {
    // Setup
    const { service, subOrg } = arrange();
    const principal = userPrincipal({ authMethod: AuthMethod.OKTA_SAML, sessionRootOrgId: randomUUID() });

    // Action
    const refusal = await service.findSsoSessionRefusal({ principal, org: subOrg({ authEnforced: true }) });

    // Assert
    expect(refusal?.name).toBe(FOREIGN_SSO_SESSION_ERROR_NAME);
  });

  test("should let a user who may bypass through with a session another org's IdP issued", async () => {
    // Setup
    const { service, orgPermissionService, subOrg, rootOrgId } = arrange({ canBypass: true });
    const principal = userPrincipal({ authMethod: AuthMethod.OKTA_SAML, sessionRootOrgId: randomUUID() });

    // Action
    const refusal = await service.findSsoSessionRefusal({
      principal,
      org: subOrg({ authEnforced: true, bypassOrgAuthEnabled: true })
    });

    // Assert
    expect(refusal).toBeNull();
    expect(orgPermissionService.bypassLookups).toEqual([{ userId: principal.id, rootOrgId }]);
  });

  test("should not look up the bypass for a session the policy allows", async () => {
    // Setup
    const { service, orgPermissionService, subOrg } = arrange({ canBypass: true });

    // Action
    const refusal = await service.findSsoSessionRefusal({
      principal: userPrincipal({ authMethod: AuthMethod.OIDC }),
      org: subOrg({ authEnforced: true, bypassOrgAuthEnabled: true })
    });

    // Assert
    expect(refusal).toBeNull();
    expect(orgPermissionService.bypassLookups).toEqual([]);
  });

  test("should never check an identity", async () => {
    // Setup
    const { service, subOrg } = arrange();

    // Action
    const refusal = await service.findSsoSessionRefusal({
      principal: identityPrincipal(),
      org: subOrg({ authEnforced: true, googleSsoAuthEnforced: true })
    });

    // Assert
    expect(refusal).toBeNull();
  });
});
