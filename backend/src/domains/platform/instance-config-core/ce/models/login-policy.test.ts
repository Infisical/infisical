import { RuleViolationError } from "@app/domains/lib/errors";

import { LoginMethod, LoginPolicy } from "./login-policy";

const policy = () =>
  LoginPolicy.restore({
    enabledLoginMethods: ["email"],
    trustLdapEmails: false,
    defaultAuthOrgId: "org-1",
    defaultAuthOrgSlug: "org",
    defaultAuthOrgAuthEnforced: false,
    defaultAuthOrgAuthMethod: "oidc"
  });

describe("LoginPolicy.allows", () => {
  test("should allow only the methods in the list", () => {
    // Action
    const loginPolicy = policy();

    // Assert
    expect(loginPolicy.allows(LoginMethod.EMAIL)).toBe(true);
    expect(loginPolicy.allows(LoginMethod.SAML)).toBe(false);
  });

  test.each([[null], [undefined]])("should allow every method when the stored list is %s", (enabledLoginMethods) => {
    // Action
    const loginPolicy = LoginPolicy.restore({ enabledLoginMethods });

    // Assert
    expect(Object.values(LoginMethod).every((method) => loginPolicy.allows(method))).toBe(true);
  });
});

describe("LoginPolicy.trustsLdapEmails", () => {
  test.each([
    [true, true],
    [false, false],
    [null, false]
  ])("should read a stored %s as %s", (trustLdapEmails, expected) => {
    // Action
    const loginPolicy = LoginPolicy.restore({ trustLdapEmails });

    // Assert
    expect(loginPolicy.trustsLdapEmails()).toBe(expected);
  });
});

describe("LoginPolicy.changeLoginMethods", () => {
  test("should refuse a method that does not exist", () => {
    // Action
    const act = () => policy().changeLoginMethods([LoginMethod.EMAIL, "carrier-pigeon" as LoginMethod]);

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow("Unknown login method: carrier-pigeon");
  });

  test("should replace the enabled methods", () => {
    // Action
    const changed = policy().changeLoginMethods([LoginMethod.EMAIL, LoginMethod.LDAP]);

    // Assert
    expect(changed.toJSON().enabledLoginMethods).toEqual(["email", "ldap"]);
  });

  test("should refuse to disable every method", () => {
    // Action
    const act = () => policy().changeLoginMethods([]);

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow("At least one login method should be enabled.");
  });
});

describe("LoginPolicy.changeTrustLdapEmails", () => {
  test("should change only whether LDAP logins skip email verification", () => {
    // Setup
    const before = policy();

    // Action
    const changed = before.changeTrustLdapEmails(true);

    // Assert
    expect(changed.toJSON()).toEqual({ ...before.toJSON(), trustLdapEmails: true });
  });
});

describe("LoginPolicy.changeDefaultAuthOrg", () => {
  test("should change the default auth org and keep the rest", () => {
    // Setup
    const before = policy();

    // Action
    const changed = before.changeDefaultAuthOrg(null);

    // Assert
    expect(changed.toJSON()).toEqual({ ...before.toJSON(), defaultAuthOrgId: null });
  });
});

describe("LoginPolicy.restore", () => {
  test("should read missing columns as null, null methods meaning every method", () => {
    // Action
    const restored = LoginPolicy.restore({});

    // Assert
    expect(restored.toJSON()).toEqual({
      enabledLoginMethods: null,
      trustLdapEmails: null,
      defaultAuthOrgId: null,
      defaultAuthOrgSlug: null,
      defaultAuthOrgAuthEnforced: null,
      defaultAuthOrgAuthMethod: null
    });
  });
});
