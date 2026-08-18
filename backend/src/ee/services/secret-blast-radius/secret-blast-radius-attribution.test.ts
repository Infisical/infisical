import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test } from "vitest";

import { TProjectPermissionGrantSource } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { conditionsMatcher, PermissionConditionOperators } from "@app/lib/casl";

import {
  extractGrantConditions,
  resolveAllowedSecretActions,
  resolveGrantPaths,
  TSecretSubjectFields
} from "./secret-blast-radius-attribution";

const buildAbility = (rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[]) =>
  createMongoAbility<ProjectPermissionSet>(rules, { conditionsMatcher });

const subjectFields: TSecretSubjectFields = {
  environment: "prod",
  secretPath: "/prod/api",
  secretName: "DATABASE_URL",
  secretTags: ["critical"]
};

const source = (
  overrides: Partial<TProjectPermissionGrantSource> & { permission: MongoAbility<ProjectPermissionSet> }
): TProjectPermissionGrantSource => ({
  id: "source-1",
  kind: "role",
  name: "prod-reader",
  isTemporary: false,
  ...overrides
});

const globReadRule = (path: string): RawRuleOf<MongoAbility<ProjectPermissionSet>>[] => [
  {
    action: [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeSecret],
    subject: ProjectPermissionSub.Secrets,
    conditions: {
      environment: { [PermissionConditionOperators.$EQ]: "prod" },
      secretPath: { [PermissionConditionOperators.$GLOB]: `${path}/**` }
    }
  }
];

describe("blast radius attribution", () => {
  test("attributes a direct role whose glob matches the secret", () => {
    const paths = resolveGrantPaths([source({ permission: buildAbility(globReadRule("/prod")) })], subjectFields);

    expect(paths).toHaveLength(1);
    expect(paths[0].via).toEqual([
      { kind: "role", roleName: "prod-reader", roleSlug: undefined, isTemporary: false, expiresAt: undefined }
    ]);
    expect(paths[0].conditions).toEqual(
      expect.arrayContaining([{ field: "secretPath", operator: "$glob", value: "/prod/**" }])
    );
  });

  test("does not attribute a role whose glob covers a different path", () => {
    const paths = resolveGrantPaths([source({ permission: buildAbility(globReadRule("/staging")) })], subjectFields);

    expect(paths).toEqual([]);
  });

  test("a group-inherited role reads as group then role", () => {
    const paths = resolveGrantPaths(
      [
        source({
          kind: "groupRole",
          groupId: "group-1",
          groupName: "SRE",
          permission: buildAbility(globReadRule("/prod"))
        })
      ],
      subjectFields
    );

    expect(paths[0].via).toEqual([
      { kind: "group", groupId: "group-1", groupName: "SRE" },
      { kind: "role", roleName: "prod-reader", roleSlug: undefined, isTemporary: false, expiresAt: undefined }
    ]);
  });

  test("an additional privilege carries its expiry", () => {
    const paths = resolveGrantPaths(
      [
        source({
          id: "priv-1",
          kind: "additionalPrivilege",
          name: "incident access",
          isTemporary: true,
          temporaryAccessEndTime: "2026-08-12T12:00:00.000Z",
          permission: buildAbility(globReadRule("/prod"))
        })
      ],
      subjectFields
    );

    expect(paths[0].via).toEqual([
      {
        kind: "additionalPrivilege",
        privilegeId: "priv-1",
        name: "incident access",
        isTemporary: true,
        expiresAt: "2026-08-12T12:00:00.000Z"
      }
    ]);
  });

  test("the legacy combined read action still attributes", () => {
    const paths = resolveGrantPaths(
      [
        source({
          permission: buildAbility([
            {
              action: [ProjectPermissionSecretActions.DescribeAndReadValue],
              subject: ProjectPermissionSub.Secrets
            }
          ])
        })
      ],
      subjectFields
    );

    expect(paths).toHaveLength(1);
  });

  test("a describe-only source is attributed but grants no value read", () => {
    const permission = buildAbility([
      {
        action: [ProjectPermissionSecretActions.DescribeSecret],
        subject: ProjectPermissionSub.Secrets
      }
    ]);

    expect(resolveGrantPaths([source({ permission })], subjectFields)).toHaveLength(1);
    expect(resolveAllowedSecretActions(permission, subjectFields)).toEqual([
      ProjectPermissionSecretActions.DescribeSecret
    ]);
  });

  test("multiple sources produce multiple paths, so removing one leaves the other", () => {
    const paths = resolveGrantPaths(
      [
        source({ id: "role-1", permission: buildAbility(globReadRule("/prod")) }),
        source({
          id: "role-2",
          kind: "groupRole",
          groupId: "group-1",
          groupName: "SRE",
          permission: buildAbility(globReadRule("/prod"))
        })
      ],
      subjectFields
    );

    expect(paths.map((path) => path.sourceId)).toEqual(["role-1", "role-2"]);
  });

  test("tag conditions are reported as the matched condition", () => {
    const paths = resolveGrantPaths(
      [
        source({
          permission: buildAbility([
            {
              action: [ProjectPermissionSecretActions.ReadValue],
              subject: ProjectPermissionSub.Secrets,
              conditions: { secretTags: { [PermissionConditionOperators.$IN]: ["critical"] } }
            }
          ])
        })
      ],
      subjectFields
    );

    expect(paths[0].conditions).toEqual([{ field: "secretTags", operator: "$in", value: ["critical"] }]);
  });

  test("extractGrantConditions treats a bare value as equality", () => {
    expect(extractGrantConditions({ environment: "prod" })).toEqual([
      { field: "environment", operator: "$eq", value: "prod" }
    ]);
  });

  test("extractGrantConditions is empty for an unconditional rule", () => {
    expect(extractGrantConditions(undefined)).toEqual([]);
  });
});
