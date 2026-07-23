import { LoginMethod } from "../super-admin/super-admin-types";
import { assertOAuthLoginMethodEnabled, isOAuthLoginMethodDisabled } from "./auth-fns";
import { AuthMethod } from "./auth-type";

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
