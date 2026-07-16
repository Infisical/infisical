import { createMongoAbility, MongoAbility, RawRuleOf, subject } from "@casl/ability";
import { describe, expect, test } from "vitest";

import { conditionsMatcher } from "@app/lib/casl";

import { expandLegacyForbidActions, throwIfMissingSecretPersonalOverridePermission } from "./permission-fns";
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

describe("throwIfMissingSecretPersonalOverridePermission", () => {
  const buildAbility = (rules: Rule[]) => createMongoAbility<ProjectPermissionSet>(rules, { conditionsMatcher });

  test("passes when the actor has PersonalOverride but not the shared fallback action", () => {
    const ability = buildAbility([
      allow({
        action: [ProjectPermissionSecretActions.PersonalOverride],
        subject: ProjectPermissionSub.Secrets
      })
    ]);
    expect(() =>
      throwIfMissingSecretPersonalOverridePermission(ability, ProjectPermissionSecretActions.Create)
    ).not.toThrow();
  });

  test("passes when the actor has the shared fallback action but not PersonalOverride", () => {
    const ability = buildAbility([
      allow({
        action: [ProjectPermissionSecretActions.Create],
        subject: ProjectPermissionSub.Secrets
      })
    ]);
    expect(() =>
      throwIfMissingSecretPersonalOverridePermission(ability, ProjectPermissionSecretActions.Create)
    ).not.toThrow();
  });

  test("throws when the actor has neither PersonalOverride nor the shared fallback action", () => {
    const ability = buildAbility([
      allow({
        action: [ProjectPermissionSecretActions.ReadValue],
        subject: ProjectPermissionSub.Secrets
      })
    ]);
    expect(() =>
      throwIfMissingSecretPersonalOverridePermission(ability, ProjectPermissionSecretActions.Create)
    ).toThrow();
  });

  test("respects conditions on the PersonalOverride rule", () => {
    const ability = buildAbility([
      allow({
        action: [ProjectPermissionSecretActions.PersonalOverride],
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "dev" }
      })
    ]);

    expect(() =>
      throwIfMissingSecretPersonalOverridePermission(ability, ProjectPermissionSecretActions.Create, {
        environment: "dev",
        secretPath: "/"
      })
    ).not.toThrow();

    expect(() =>
      throwIfMissingSecretPersonalOverridePermission(ability, ProjectPermissionSecretActions.Create, {
        environment: "prod",
        secretPath: "/"
      })
    ).toThrow();
  });
});
