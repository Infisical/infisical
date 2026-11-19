import { RuleViolationError } from "@app/domains/lib/errors";

import { LoginPolicy } from "./login-policy";

const policy = () =>
  LoginPolicy.restore({
    enabledLoginMethods: ["email"],
    trustLdapEmails: false,
    defaultAuthOrgId: "org-1",
    defaultAuthOrgSlug: "org",
    defaultAuthOrgAuthEnforced: false,
    defaultAuthOrgAuthMethod: "oidc"
  });

describe("LoginPolicy.changeLoginMethods", () => {
  test("should replace the enabled methods", () => {
    // Action
    const changed = policy().changeLoginMethods(["email", "ldap"]);

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
