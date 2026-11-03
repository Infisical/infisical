import { LoginMethod } from "../super-admin/super-admin-types";
import {
  assertOAuthLoginMethodEnabled,
  isIdpMfaTrusted,
  isMfaProofAccepted,
  isOAuthLoginMethodDisabled,
  isSsoAuthMethod,
  isSsoSessionIssuedByOrg,
  RECOVERY_CODE_MFA_ASSURANCE
} from "./auth-fns";
import { AuthMethod, MfaMethod, SsoMfaTrust } from "./auth-type";

describe("OAuth login method policy", () => {
  test.each([
    [AuthMethod.GOOGLE, LoginMethod.GOOGLE],
    [AuthMethod.GITHUB, LoginMethod.GITHUB],
    [AuthMethod.GITLAB, LoginMethod.GITLAB]
  ] as const)("allows %s when it is enabled", (authMethod, loginMethod) => {
    expect(isOAuthLoginMethodDisabled(authMethod, [loginMethod])).toBe(false);
    expect(() => assertOAuthLoginMethodEnabled({ authMethod, enabledLoginMethods: [loginMethod] })).not.toThrow();
  });

  test.each([AuthMethod.GOOGLE, AuthMethod.GITHUB, AuthMethod.GITLAB] as const)(
    "rejects disabled %s login before a user exists",
    (authMethod) => {
      expect(isOAuthLoginMethodDisabled(authMethod, [LoginMethod.EMAIL])).toBe(true);
      expect(() => assertOAuthLoginMethodEnabled({ authMethod, enabledLoginMethods: [LoginMethod.EMAIL] })).toThrow(
        /disabled by administrator/
      );
    }
  );

  test("preserves the existing organization-admin lockout bypass", () => {
    expect(() =>
      assertOAuthLoginMethodEnabled({
        authMethod: AuthMethod.GOOGLE,
        enabledLoginMethods: [LoginMethod.EMAIL],
        canBypass: true
      })
    ).not.toThrow();
  });

  test("treats an unset allowlist as all methods enabled", () => {
    expect(() =>
      assertOAuthLoginMethodEnabled({ authMethod: AuthMethod.GOOGLE, enabledLoginMethods: null })
    ).not.toThrow();
  });
});

describe("isMfaProofAccepted", () => {
  test("accepts only a factor the action would itself challenge", () => {
    expect(isMfaProofAccepted(MfaMethod.TOTP, [MfaMethod.TOTP])).toBe(true);
    expect(isMfaProofAccepted(MfaMethod.EMAIL, [MfaMethod.TOTP, MfaMethod.EMAIL])).toBe(true);
    expect(isMfaProofAccepted(MfaMethod.EMAIL, [MfaMethod.TOTP])).toBe(false);
    expect(isMfaProofAccepted(MfaMethod.WEBAUTHN, [MfaMethod.TOTP])).toBe(false);
  });

  test("a recovery-code login is accepted everywhere", () => {
    expect(isMfaProofAccepted(RECOVERY_CODE_MFA_ASSURANCE, [MfaMethod.WEBAUTHN])).toBe(true);
  });

  test("a missing or unknown marker is never accepted", () => {
    expect(isMfaProofAccepted(null, [MfaMethod.EMAIL])).toBe(false);
    expect(isMfaProofAccepted(undefined, [MfaMethod.EMAIL])).toBe(false);
    expect(isMfaProofAccepted("1", [MfaMethod.EMAIL])).toBe(false);
  });
});

describe("isSsoSessionIssuedByOrg", () => {
  const rootOrgId = "org-a";

  test.each([
    AuthMethod.OKTA_SAML,
    AuthMethod.AZURE_SAML,
    AuthMethod.KEYCLOAK_SAML,
    AuthMethod.OIDC,
    AuthMethod.LDAP
  ] as const)("accepts a %s session this org's IdP issued", (authMethod) => {
    expect(isSsoAuthMethod(authMethod)).toBe(true);
    expect(isSsoSessionIssuedByOrg({ authMethod, issuingRootOrgId: rootOrgId, rootOrgId })).toBe(true);
  });

  test.each([AuthMethod.OKTA_SAML, AuthMethod.OIDC, AuthMethod.LDAP] as const)(
    "refuses a %s session another org's IdP issued",
    (authMethod) => {
      expect(isSsoSessionIssuedByOrg({ authMethod, issuingRootOrgId: "org-b", rootOrgId })).toBe(false);
    }
  );

  test("takes a token issued before the claim existed at its method", () => {
    expect(isSsoSessionIssuedByOrg({ authMethod: AuthMethod.OKTA_SAML, rootOrgId })).toBe(true);
  });

  test.each([AuthMethod.EMAIL, AuthMethod.GOOGLE, AuthMethod.GITHUB, AuthMethod.GITLAB] as const)(
    "never counts an own-credential %s session as the org's SSO",
    (authMethod) => {
      expect(isSsoAuthMethod(authMethod)).toBe(false);
      expect(isSsoSessionIssuedByOrg({ authMethod, issuingRootOrgId: rootOrgId, rootOrgId })).toBe(false);
    }
  );
});

describe("isIdpMfaTrusted", () => {
  const org = { id: "org-a", enforceMfa: true, ssoMfaTrust: SsoMfaTrust.Signal };

  test.each([AuthMethod.OKTA_SAML, AuthMethod.AZURE_SAML, AuthMethod.OIDC] as const)(
    "trusts a signalled %s login when the org trusts the signal",
    (authMethod) => {
      expect(isIdpMfaTrusted({ org, authMethod, idpMfaOrgId: org.id })).toBe(true);
    }
  );

  test("never trusts a login that carried no signal", () => {
    expect(isIdpMfaTrusted({ org, authMethod: AuthMethod.OKTA_SAML })).toBe(false);
  });

  test("never trusts a signal produced by another organization's IdP", () => {
    expect(isIdpMfaTrusted({ org, authMethod: AuthMethod.OIDC, idpMfaOrgId: "org-b" })).toBe(false);
  });

  test("has nothing to waive while the org does not enforce MFA", () => {
    expect(
      isIdpMfaTrusted({ org: { ...org, enforceMfa: false }, authMethod: AuthMethod.OIDC, idpMfaOrgId: org.id })
    ).toBe(false);
  });

  test.each([AuthMethod.EMAIL, AuthMethod.GOOGLE, AuthMethod.GITHUB, AuthMethod.LDAP] as const)(
    "never trusts a %s login, so break-glass accounts keep the Infisical challenge",
    (authMethod) => {
      expect(isIdpMfaTrusted({ org, authMethod, idpMfaOrgId: org.id })).toBe(false);
    }
  );

  test.each([SsoMfaTrust.None, undefined, null, "delegate"])("ignores the signal when the setting is %s", (mode) => {
    expect(
      isIdpMfaTrusted({ org: { ...org, ssoMfaTrust: mode }, authMethod: AuthMethod.OIDC, idpMfaOrgId: org.id })
    ).toBe(false);
  });
});
