import { createMongoAbility, MongoAbility, RawRuleOf, subject } from "@casl/ability";
import { describe, expect, test } from "vitest";

import { conditionsMatcher } from "@app/lib/casl";

import {
  expandLegacyForbidActions,
  handlebarsClient,
  throwIfMissingSecretReadValueOrDescribePermission
} from "./permission-fns";
import {
  ProjectPermissionActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission";

type Rule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

const forbid = (overrides: Partial<Rule>): Rule =>
  ({
    inverted: true,
    action: [],
    subject: ProjectPermissionSub.Secrets,
    ...overrides
  }) as Rule;

const allow = (overrides: Partial<Rule>): Rule =>
  ({
    inverted: false,
    action: [],
    subject: ProjectPermissionSub.Secrets,
    ...overrides
  }) as Rule;

describe("expandLegacyForbidActions", () => {
  test("forbid on Secrets ReadValue is expanded to also forbid legacy DescribeAndReadValue", () => {
    const rules = [
      forbid({
        action: [ProjectPermissionSecretActions.ReadValue],
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "dev" }
      })
    ];
    const result = expandLegacyForbidActions(rules);
    expect(result[0].action).toEqual([
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.DescribeAndReadValue
    ]);
    expect(result[0].conditions).toEqual({ environment: "dev" });
  });

  test("forbid on Secrets DescribeSecret is expanded to also forbid legacy DescribeAndReadValue", () => {
    const rules = [
      forbid({
        action: [ProjectPermissionSecretActions.DescribeSecret],
        subject: ProjectPermissionSub.Secrets
      })
    ];
    expect(expandLegacyForbidActions(rules)[0].action).toEqual([
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.DescribeAndReadValue
    ]);
  });

  test("forbid on Secrets that already includes the legacy action is not modified", () => {
    const rules = [
      forbid({
        action: [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeAndReadValue],
        subject: ProjectPermissionSub.Secrets
      })
    ];
    expect(expandLegacyForbidActions(rules)[0].action).toEqual([
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.DescribeAndReadValue
    ]);
  });

  test("forbid on Secrets that has no new read actions is not modified", () => {
    const rules = [
      forbid({
        action: [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit],
        subject: ProjectPermissionSub.Secrets
      })
    ];
    expect(expandLegacyForbidActions(rules)[0].action).toEqual([
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Edit
    ]);
  });

  test("forbid on Member AssignRole expands to also forbid legacy GrantPrivileges", () => {
    const rules = [
      forbid({
        action: [ProjectPermissionMemberActions.AssignRole],
        subject: ProjectPermissionSub.Member
      })
    ];
    expect(expandLegacyForbidActions(rules)[0].action).toEqual([
      ProjectPermissionMemberActions.AssignRole,
      ProjectPermissionMemberActions.GrantPrivileges
    ]);
  });

  test("forbid on Identity AssignAdditionalPrivileges expands to also forbid legacy GrantPrivileges", () => {
    const rules = [
      forbid({
        action: [ProjectPermissionIdentityActions.AssignAdditionalPrivileges],
        subject: ProjectPermissionSub.Identity
      })
    ];
    expect(expandLegacyForbidActions(rules)[0].action).toEqual([
      ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
      ProjectPermissionIdentityActions.GrantPrivileges
    ]);
  });

  test("forbid on Groups AssignRole expands to also forbid legacy GrantPrivileges", () => {
    const rules = [
      forbid({
        action: [ProjectPermissionGroupActions.AssignRole],
        subject: ProjectPermissionSub.Groups
      })
    ];
    expect(expandLegacyForbidActions(rules)[0].action).toEqual([
      ProjectPermissionGroupActions.AssignRole,
      ProjectPermissionGroupActions.GrantPrivileges
    ]);
  });

  test("allow rules are never modified", () => {
    const rules = [
      allow({
        action: [ProjectPermissionSecretActions.ReadValue],
        subject: ProjectPermissionSub.Secrets
      })
    ];
    expect(expandLegacyForbidActions(rules)[0].action).toEqual([ProjectPermissionSecretActions.ReadValue]);
  });

  test("forbid on unrelated subject is not modified", () => {
    const rules = [
      forbid({
        action: [ProjectPermissionActions.Read],
        subject: ProjectPermissionSub.Webhooks
      })
    ];
    expect(expandLegacyForbidActions(rules)[0].action).toEqual([ProjectPermissionActions.Read]);
  });

  test("end-to-end: admin allow + custom forbid on ReadValue denies legacy read after expansion", () => {
    // Mirrors the production bug: admin role grants both legacy and new read actions
    // with no conditions, custom role forbids only the new actions in env=dev.
    // After expandLegacyForbidActions, the forbid also covers legacy `read`, so
    // legacy fallbacks like hasSecretReadValueOrDescribePermission can no longer
    // be used as a backdoor.
    const rules: Rule[] = expandLegacyForbidActions([
      allow({
        action: [
          ProjectPermissionSecretActions.DescribeAndReadValue,
          ProjectPermissionSecretActions.ReadValue,
          ProjectPermissionSecretActions.DescribeSecret
        ],
        subject: ProjectPermissionSub.Secrets
      }),
      forbid({
        action: [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeSecret],
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "dev" }
      })
    ]).sort((a, b) => Number(Boolean(a.inverted)) - Number(Boolean(b.inverted)));

    const ability = createMongoAbility<ProjectPermissionSet>(rules, { conditionsMatcher });

    const devSecret = subject(ProjectPermissionSub.Secrets, { environment: "dev", secretPath: "/" });
    const prodSecret = subject(ProjectPermissionSub.Secrets, { environment: "prod", secretPath: "/" });

    // In dev: every read-flavored action is denied
    expect(ability.can(ProjectPermissionSecretActions.ReadValue, devSecret)).toBe(false);
    expect(ability.can(ProjectPermissionSecretActions.DescribeSecret, devSecret)).toBe(false);
    expect(ability.can(ProjectPermissionSecretActions.DescribeAndReadValue, devSecret)).toBe(false);
    // In prod: allow rules still apply
    expect(ability.can(ProjectPermissionSecretActions.ReadValue, prodSecret)).toBe(true);
    expect(ability.can(ProjectPermissionSecretActions.DescribeAndReadValue, prodSecret)).toBe(true);
  });
});

describe("throwIfMissingSecretReadValueOrDescribePermission", () => {
  const buildAbility = (rules: Rule[]) => createMongoAbility<ProjectPermissionSet>(rules, { conditionsMatcher });

  test("passes when the actor has the requested action", () => {
    const ability = buildAbility([
      allow({
        action: [ProjectPermissionSecretActions.DescribeSecret],
        subject: ProjectPermissionSub.Secrets
      })
    ]);
    expect(() =>
      throwIfMissingSecretReadValueOrDescribePermission(ability, ProjectPermissionSecretActions.DescribeSecret)
    ).not.toThrow();
  });

  test("passes when the actor only has the legacy DescribeAndReadValue action", () => {
    const ability = buildAbility([
      allow({
        action: [ProjectPermissionSecretActions.DescribeAndReadValue],
        subject: ProjectPermissionSub.Secrets
      })
    ]);
    expect(() =>
      throwIfMissingSecretReadValueOrDescribePermission(ability, ProjectPermissionSecretActions.DescribeSecret)
    ).not.toThrow();
  });

  test("throws when the actor only has write actions on shared secrets", () => {
    const ability = buildAbility([
      allow({
        action: [
          ProjectPermissionSecretActions.Create,
          ProjectPermissionSecretActions.Edit,
          ProjectPermissionSecretActions.Delete
        ],
        subject: ProjectPermissionSub.Secrets
      })
    ]);
    expect(() =>
      throwIfMissingSecretReadValueOrDescribePermission(ability, ProjectPermissionSecretActions.DescribeSecret)
    ).toThrow();
  });

  test("respects conditions on the DescribeSecret rule", () => {
    const ability = buildAbility([
      allow({
        action: [ProjectPermissionSecretActions.DescribeSecret],
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "dev" }
      })
    ]);

    expect(() =>
      throwIfMissingSecretReadValueOrDescribePermission(ability, ProjectPermissionSecretActions.DescribeSecret, {
        environment: "dev",
        secretPath: "/"
      })
    ).not.toThrow();

    expect(() =>
      throwIfMissingSecretReadValueOrDescribePermission(ability, ProjectPermissionSecretActions.DescribeSecret, {
        environment: "prod",
        secretPath: "/"
      })
    ).toThrow();
  });
});

describe("trimSuffix handlebars helper", () => {
  const render = (template: string, value: string) =>
    handlebarsClient.compile(template)({ identity: { auth: { kubernetes: { namespace: value } } } });

  const trim = (value: string, pattern: string) =>
    render(`{{ trimSuffix identity.auth.kubernetes.namespace '${pattern}' }}`, value);

  test("trims a matching glob suffix", () => {
    expect(trim("myapp-pr-1", "-pr-*")).toBe("myapp");
    expect(trim("myapp-pr-42", "-pr-*")).toBe("myapp");
  });

  test("returns the value unchanged when nothing matches the pattern", () => {
    expect(trim("myapp", "-pr-*")).toBe("myapp");
    expect(trim("myapp-mr-1", "-pr-*")).toBe("myapp-mr-1");
  });

  test("removes the shortest matching suffix, not the longest", () => {
    expect(trim("app-pr-1", "-*")).toBe("app-pr");
  });

  test("trims a literal suffix when the pattern has no glob syntax", () => {
    expect(trim("myapp-prod", "-prod")).toBe("myapp");
    expect(trim("myapp", "-prod")).toBe("myapp");
  });

  test("supports the wider glob syntax used by permission conditions", () => {
    expect(trim("myapp-pr-1", "-{pr,mr}-*")).toBe("myapp");
    expect(trim("myapp-pr-1", "-pr-?")).toBe("myapp");
  });

  test("leaves an unresolved attribute literal intact so the condition fails closed", () => {
    expect(trim("{{identity.auth.kubernetes.namespace}}", "-pr-*")).toBe("{{identity.auth.kubernetes.namespace}}");
  });

  test("returns an empty string for an empty value", () => {
    expect(trim("", "-pr-*")).toBe("");
  });

  test("returns the value unchanged for a malformed pattern instead of throwing", () => {
    expect(trim("myapp-pr-1", "-pr-+(")).toBe("myapp-pr-1");
  });

  test("returns the value unchanged when no pattern is supplied", () => {
    expect(render("{{ trimSuffix identity.auth.kubernetes.namespace }}", "myapp-pr-1")).toBe("myapp-pr-1");
  });
});
