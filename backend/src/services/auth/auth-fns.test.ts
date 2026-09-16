import { LoginMethod } from "../super-admin/super-admin-types";
import {
  assertOAuthLoginMethodEnabled,
  isMfaProofAccepted,
  isOAuthLoginMethodDisabled,
  RECOVERY_CODE_MFA_ASSURANCE
} from "./auth-fns";
import { AuthMethod, MfaMethod } from "./auth-type";

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
