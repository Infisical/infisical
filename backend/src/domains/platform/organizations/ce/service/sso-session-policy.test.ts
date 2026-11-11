import { AuthMethod } from "@app/lib/auth/actor-types";

import { FOREIGN_SSO_SESSION_ERROR_NAME, ssoSessionRefusal, SSO_REQUIRED_ERROR_NAME } from "./sso-session-policy";

const policy = (overrides: Partial<{ authEnforced: boolean; googleSsoAuthEnforced: boolean }> = {}) => ({
  authEnforced: false,
  googleSsoAuthEnforced: false,
  bypassOrgAuthEnabled: false,
  ...overrides
});

describe("ssoSessionRefusal", () => {
  test("should allow any session when the org enforces nothing", () => {
    // Setup
    const input = { authMethod: AuthMethod.EMAIL, rootOrgId: "org-a", policy: policy() };

    // Action
    const refusal = ssoSessionRefusal(input);

    // Assert
    expect(refusal).toBeUndefined();
  });

  test.each([AuthMethod.EMAIL, AuthMethod.GITHUB, AuthMethod.LDAP])(
    "should refuse a %s session where SAML or OIDC is enforced",
    (authMethod) => {
      // Setup
      const input = { authMethod, rootOrgId: "org-a", policy: policy({ authEnforced: true }) };

      // Action
      const refusal = ssoSessionRefusal(input);

      // Assert
      expect(refusal?.name).toBe(SSO_REQUIRED_ERROR_NAME);
      expect(refusal?.message).toMatch(/Login with SAML SSO/);
    }
  );

  test.each([AuthMethod.OKTA_SAML, AuthMethod.OIDC])(
    "should allow a %s session where SSO is enforced",
    (authMethod) => {
      // Setup
      const input = { authMethod, rootOrgId: "org-a", policy: policy({ authEnforced: true }) };

      // Action
      const refusal = ssoSessionRefusal(input);

      // Assert
      expect(refusal).toBeUndefined();
    }
  );

  test("should refuse a non-Google session where Google is enforced", () => {
    // Setup
    const input = {
      authMethod: AuthMethod.OKTA_SAML,
      rootOrgId: "org-a",
      policy: policy({ googleSsoAuthEnforced: true })
    };

    // Action
    const refusal = ssoSessionRefusal(input);

    // Assert
    expect(refusal?.message).toMatch(/Login with Google SSO/);
  });

  test.each([AuthMethod.OKTA_SAML, AuthMethod.OIDC])(
    "should refuse a %s session another org's IdP issued where SSO is enforced",
    (authMethod) => {
      // Setup
      const input = {
        authMethod,
        sessionRootOrgId: "org-b",
        rootOrgId: "org-a",
        policy: policy({ authEnforced: true })
      };

      // Action
      const refusal = ssoSessionRefusal(input);

      // Assert
      expect(refusal?.name).toBe(FOREIGN_SSO_SESSION_ERROR_NAME);
    }
  );

  test("should allow a session the org's own IdP issued, and one from before the claim existed", () => {
    // Setup
    const enforced = { authMethod: AuthMethod.OKTA_SAML, rootOrgId: "org-a", policy: policy({ authEnforced: true }) };

    // Action
    const own = ssoSessionRefusal({ ...enforced, sessionRootOrgId: "org-a" });
    const unclaimed = ssoSessionRefusal(enforced);

    // Assert
    expect(own).toBeUndefined();
    expect(unclaimed).toBeUndefined();
  });

  test("should allow a foreign session where the org does not enforce SSO", () => {
    // Setup
    const input = { authMethod: AuthMethod.OKTA_SAML, sessionRootOrgId: "org-b", rootOrgId: "org-a", policy: policy() };

    // Action
    const refusal = ssoSessionRefusal(input);

    // Assert
    expect(refusal).toBeUndefined();
  });

  test("should never check a session without an auth method (deprecated API key)", () => {
    // Setup
    const input = {
      authMethod: null,
      rootOrgId: "org-a",
      policy: policy({ authEnforced: true, googleSsoAuthEnforced: true })
    };

    // Action
    const refusal = ssoSessionRefusal(input);

    // Assert
    expect(refusal).toBeUndefined();
  });
});
