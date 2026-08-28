import { createMongoAbility, MongoAbility, RawRuleOf, subject } from "@casl/ability";
import { describe, expect, test } from "vitest";

import { conditionsMatcher } from "@app/lib/casl";
import { ActorType } from "@app/services/auth/auth-type";

import {
  expandLegacyForbidActions,
  getProjectPermissionFingerprint,
  handlebarsClient,
  interpolatePermissionRules,
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

  const trim = (value: string, suffix: string) =>
    render(`{{ trimSuffix identity.auth.kubernetes.namespace '${suffix}' }}`, value);

  test("trims a matching suffix", () => {
    expect(trim("myapp-prod", "-prod")).toBe("myapp");
  });

  test("returns the value unchanged when it does not end with the suffix", () => {
    expect(trim("myapp", "-prod")).toBe("myapp");
    expect(trim("myapp-staging", "-prod")).toBe("myapp-staging");
  });

  test("leaves an unresolved attribute literal intact so the condition fails closed", () => {
    expect(trim("{{identity.auth.kubernetes.namespace}}", "-prod")).toBe("{{identity.auth.kubernetes.namespace}}");
  });

  test("returns an empty string for an empty value", () => {
    expect(trim("", "-prod")).toBe("");
  });

  test("returns the value unchanged when no suffix is supplied", () => {
    expect(render("{{ trimSuffix identity.auth.kubernetes.namespace }}", "myapp-prod")).toBe("myapp-prod");
  });
});
describe("getProjectPermissionFingerprint", () => {
  const dto = {
    projectId: "project-1",
    orgId: "org-1",
    actorId: "user-1",
    actorType: ActorType.USER as ActorType.USER
  };

  const deps = (folderVersion?: number) =>
    ({
      permissionDAL: { getPermissionFingerprint: async () => "membership-hash" },
      keyStore: { pgGetIntItem: async () => folderVersion }
    }) as unknown as Parameters<typeof getProjectPermissionFingerprint>[1];

  test("appends the project's folder permission version to the membership fingerprint", async () => {
    expect(await getProjectPermissionFingerprint(dto, deps(7))).toBe("membership-hash:7");
  });

  test("changes when the folder permission version is bumped", async () => {
    const [before, after] = await Promise.all([
      getProjectPermissionFingerprint(dto, deps(7)),
      getProjectPermissionFingerprint(dto, deps(8))
    ]);
    expect(before).not.toBe(after);
  });

  test("treats a missing version row as zero", async () => {
    expect(await getProjectPermissionFingerprint(dto, deps(undefined))).toBe("membership-hash:0");
  });
});

describe("interpolatePermissionRules", () => {
  const templatedRule = (value: string): Rule =>
    ({
      action: [ProjectPermissionSecretActions.DescribeSecret],
      subject: ProjectPermissionSub.Secrets,
      conditions: { environment: value }
    }) as Rule;

  test("interpolates identity context when the rules carry a template", () => {
    const [rule] = interpolatePermissionRules([templatedRule("{{ identity.metadata.env }}")], {
      identity: { metadata: { env: "prod" } }
    });

    expect(rule.conditions).toEqual({ environment: "prod" });
  });

  // Untemplated rules are returned as-is rather than copied, so callers share the module-level built-in
  // rule sets. This is what makes mutating a rule in place unsafe.
  test("returns untemplated rules as-is, without copying", () => {
    const rules = [templatedRule("prod"), templatedRule("staging")];

    expect(interpolatePermissionRules(rules, { identity: { metadata: {} } })).toBe(rules);
  });

  test("still templates block helpers and comments, which are not bare expressions", () => {
    const [rule] = interpolatePermissionRules(
      [templatedRule("{{#if identity.metadata.env}}{{ identity.metadata.env }}{{else}}dev{{/if}}")],
      { identity: { metadata: {} } }
    );

    expect(rule.conditions).toEqual({ environment: "dev" });
  });
});
