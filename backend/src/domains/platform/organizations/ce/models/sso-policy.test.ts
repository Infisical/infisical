import { AuthMethod } from "@app/lib/auth/actor-types";

import { FOREIGN_SSO_SESSION_ERROR_NAME, SSO_REQUIRED_ERROR_NAME, SsoPolicy } from "./sso-policy";

const policy = (overrides: Partial<{ authEnforced: boolean; googleSsoAuthEnforced: boolean }> = {}) =>
  SsoPolicy.restore({
    rootOrgId: "org-a",
    authEnforced: false,
    googleSsoAuthEnforced: false,
    bypassOrgAuthEnabled: false,
    ...overrides
  });

describe("SsoPolicy.refusalFor", () => {
  test("should allow any session when the org enforces nothing", () => {
    // Setup
    const enforcesNothing = policy();

    // Action
    const refusal = enforcesNothing.refusalFor({ authMethod: AuthMethod.EMAIL });

    // Assert
    expect(refusal).toBeNull();
  });

  test.each([AuthMethod.EMAIL, AuthMethod.GITHUB, AuthMethod.LDAP])(
    "should refuse a %s session where SAML or OIDC is enforced",
    (authMethod) => {
      // Setup
      const enforced = policy({ authEnforced: true });

      // Action
      const refusal = enforced.refusalFor({ authMethod });

      // Assert
      expect(refusal).toEqual({
        name: SSO_REQUIRED_ERROR_NAME,
        message:
          "Organization authentication is enforced. Cannot access org-scoped resource. Login with SAML SSO to access this resource."
      });
    }
  );

  test.each([AuthMethod.OKTA_SAML, AuthMethod.AZURE_SAML, AuthMethod.OIDC])(
    "should allow a %s session where SSO is enforced",
    (authMethod) => {
      // Setup
      const enforced = policy({ authEnforced: true });

      // Action
      const refusal = enforced.refusalFor({ authMethod });

      // Assert
      expect(refusal).toBeNull();
    }
  );

  test("should refuse a non-Google session where Google is enforced", () => {
    // Setup
    const enforced = policy({ googleSsoAuthEnforced: true });

    // Action
    const refusal = enforced.refusalFor({ authMethod: AuthMethod.OKTA_SAML });

    // Assert
    expect(refusal).toEqual({
      name: SSO_REQUIRED_ERROR_NAME,
      message:
        "Organization authentication is enforced. Cannot access org-scoped resource. Login with Google SSO to access this resource."
    });
  });

  test("should allow a Google session where Google is enforced", () => {
    // Setup
    const enforced = policy({ googleSsoAuthEnforced: true });

    // Action
    const refusal = enforced.refusalFor({ authMethod: AuthMethod.GOOGLE });

    // Assert
    expect(refusal).toBeNull();
  });

  test.each([AuthMethod.OKTA_SAML, AuthMethod.OIDC])(
    "should refuse a %s session another org's IdP issued where SSO is enforced",
    (authMethod) => {
      // Setup
      const enforced = policy({ authEnforced: true });

      // Action
      const refusal = enforced.refusalFor({ authMethod, sessionRootOrgId: "org-b" });

      // Assert
      expect(refusal?.name).toBe(FOREIGN_SSO_SESSION_ERROR_NAME);
      expect(refusal?.message).toMatch(/another organization's identity provider/);
    }
  );

  test("should allow a session the org's own IdP issued, and one from before the claim existed", () => {
    // Setup
    const enforced = policy({ authEnforced: true });

    // Action
    const own = enforced.refusalFor({ authMethod: AuthMethod.OKTA_SAML, sessionRootOrgId: "org-a" });
    const unclaimed = enforced.refusalFor({ authMethod: AuthMethod.OKTA_SAML });

    // Assert
    expect(own).toBeNull();
    expect(unclaimed).toBeNull();
  });

  test("should allow a foreign session where the org does not enforce SSO", () => {
    // Setup
    const enforcesNothing = policy();

    // Action
    const refusal = enforcesNothing.refusalFor({ authMethod: AuthMethod.OKTA_SAML, sessionRootOrgId: "org-b" });

    // Assert
    expect(refusal).toBeNull();
  });

  test("should never check a session without an auth method (deprecated API key)", () => {
    // Setup
    const enforced = policy({ authEnforced: true, googleSsoAuthEnforced: true });

    // Action
    const refusal = enforced.refusalFor({ authMethod: null });

    // Assert
    expect(refusal).toBeNull();
  });
});

describe("SsoPolicy.allowsBypass", () => {
  test("should report whether the root org lets a user's roles bypass enforcement", () => {
    // Setup
    const policies = [true, false].map((bypassOrgAuthEnabled) =>
      SsoPolicy.restore({ rootOrgId: "org-a", authEnforced: true, googleSsoAuthEnforced: false, bypassOrgAuthEnabled })
    );

    // Action
    const allows = policies.map((each) => each.allowsBypass);

    // Assert
    expect(allows).toEqual([true, false]);
  });
});
