import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";

import { applyOauthScopeToProjectRules, isValidOauthScope, OauthScope, parseOauthScopeString } from "./oauth-scope";

describe("parseOauthScopeString", () => {
  test("splits, trims, and de-duplicates recognized scopes", () => {
    const { granted, invalid } = parseOauthScopeString("  secrets:read   secrets:read ");
    expect(granted).toEqual([OauthScope.SecretsRead]);
    expect(invalid).toEqual([]);
  });

  test("separates unknown scopes as invalid", () => {
    const { granted, invalid } = parseOauthScopeString("secrets:read admin:everything");
    expect(granted).toEqual([OauthScope.SecretsRead]);
    expect(invalid).toEqual(["admin:everything"]);
  });

  test("empty / undefined input yields no scopes", () => {
    expect(parseOauthScopeString(undefined)).toEqual({ granted: [], invalid: [] });
    expect(parseOauthScopeString("")).toEqual({ granted: [], invalid: [] });
  });
});

describe("isValidOauthScope", () => {
  test("recognizes catalog scopes and rejects others", () => {
    expect(isValidOauthScope("secrets:read")).toBe(true);
    expect(isValidOauthScope("toString")).toBe(false);
    expect(isValidOauthScope("nope")).toBe(false);
  });
});

describe("applyOauthScopeToProjectRules", () => {
  test("drops rules whose subject is out of scope", () => {
    const rules = [
      { action: ["read"], subject: ProjectPermissionSub.Secrets },
      { action: ["read"], subject: ProjectPermissionSub.Member }
    ];
    const scoped = applyOauthScopeToProjectRules(rules, [OauthScope.SecretsRead]);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].subject).toBe(ProjectPermissionSub.Secrets);
  });

  test("narrows actions to the scope-permitted subset (intersection, never expansion)", () => {
    // User can read+write secrets, but the token was only granted secrets:read.
    const rules = [
      {
        action: [
          ProjectPermissionSecretActions.DescribeAndReadValue,
          ProjectPermissionSecretActions.Create,
          ProjectPermissionSecretActions.Edit
        ],
        subject: ProjectPermissionSub.Secrets
      }
    ];
    const scoped = applyOauthScopeToProjectRules(rules, [OauthScope.SecretsRead]);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].action).toEqual([ProjectPermissionSecretActions.DescribeAndReadValue]);
  });

  test("expands a CASL manage rule to exactly the scope-permitted actions", () => {
    const rules = [{ action: "manage", subject: ProjectPermissionSub.Secrets }];
    const scoped = applyOauthScopeToProjectRules(rules, [OauthScope.SecretsRead]);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].action).toEqual(
      expect.arrayContaining([
        ProjectPermissionSecretActions.DescribeAndReadValue,
        ProjectPermissionSecretActions.DescribeSecret,
        ProjectPermissionSecretActions.ReadValue
      ])
    );
    // manage must NOT leak write actions the scope does not grant
    expect(scoped[0].action).not.toContain(ProjectPermissionSecretActions.Create);
  });

  test("fans out an 'all' subject admin rule across in-scope subjects only", () => {
    const rules = [{ action: "manage", subject: "all" }];
    const scoped = applyOauthScopeToProjectRules(rules, [OauthScope.SecretsRead]);
    const subjects = scoped.map((r) => r.subject);
    expect(subjects).toEqual(
      expect.arrayContaining([
        ProjectPermissionSub.Secrets,
        ProjectPermissionSub.SecretFolders,
        ProjectPermissionSub.SecretImports
      ])
    );
    // nothing outside the granted scope
    expect(subjects).not.toContain(ProjectPermissionSub.Member);
  });

  test("preserves rule conditions while narrowing actions", () => {
    const conditions = { environment: { $eq: "prod" } };
    const rules = [{ action: "manage", subject: ProjectPermissionSub.Secrets, conditions }];
    const scoped = applyOauthScopeToProjectRules(rules, [OauthScope.SecretsRead]);
    expect(scoped[0]).toMatchObject({ conditions });
  });

  test("keeps inverted (cannot) rules untouched", () => {
    const rules = [
      { action: ["read"], subject: ProjectPermissionSub.Secrets },
      { action: ["read"], subject: ProjectPermissionSub.Secrets, inverted: true, conditions: { secretPath: "/x" } }
    ];
    const scoped = applyOauthScopeToProjectRules(rules, [OauthScope.SecretsRead]);
    const inverted = scoped.find((r) => r.inverted);
    expect(inverted).toBeDefined();
    expect(inverted).toMatchObject({ inverted: true, conditions: { secretPath: "/x" } });
  });

  test("empty scopes deny all (no allow-rules survive)", () => {
    const rules = [{ action: "manage", subject: "all" }];
    const scoped = applyOauthScopeToProjectRules(rules, []);
    expect(scoped).toEqual([]);
  });
});
