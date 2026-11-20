import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import { describe, expect, test } from "vitest";

import { ProjectMembershipRole } from "@app/db/schemas";
import { conditionsMatcher } from "@app/lib/casl";

import { hasSecretReadValueOrDescribePermission } from "./permission-fns";
import { buildMergedProjectPermissionRules } from "./permission-service";
import { ProjectPermissionSecretActions, ProjectPermissionSet, ProjectPermissionSub } from "./project-permission";

const customRole = (rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[]) => ({
  roles: [{ role: ProjectMembershipRole.Custom, permissions: packRules(rules) }]
});
const canRead = (rules: ReturnType<typeof buildMergedProjectPermissionRules>, secretPath: string) =>
  hasSecretReadValueOrDescribePermission(
    createMongoAbility<ProjectPermissionSet>(rules, { conditionsMatcher }),
    ProjectPermissionSecretActions.ReadValue,
    { environment: "prod", secretPath, secretName: "KEY", secretTags: [] }
  );
const identity = (username: string) => ({ id: "actor", username, metadata: [] });

describe("buildMergedProjectPermissionRules", () => {
  test("lets a group's deny hold against an allow from the direct membership", () => {
    const rules = buildMergedProjectPermissionRules({
      memberships: [
        customRole([
          {
            action: ProjectPermissionSecretActions.ReadValue,
            subject: ProjectPermissionSub.Secrets,
            conditions: { environment: "prod" }
          }
        ]),
        customRole([
          {
            action: ProjectPermissionSecretActions.ReadValue,
            subject: ProjectPermissionSub.Secrets,
            conditions: { environment: "prod", secretPath: "/payments" },
            inverted: true
          }
        ])
      ],
      identity: identity("alice")
    });
    expect(canRead(rules, "/payments")).toBe(false);
    expect(canRead(rules, "/api")).toBe(true);
  });

  test("fills a group role's placeholder with the person's own username", () => {
    const rules = buildMergedProjectPermissionRules({
      memberships: [
        customRole([
          {
            action: ProjectPermissionSecretActions.ReadValue,
            subject: ProjectPermissionSub.Secrets,
            conditions: { environment: "prod", secretPath: "/users/{{identity.username}}" }
          }
        ])
      ],
      identity: identity("bob")
    });
    expect(canRead(rules, "/users/bob")).toBe(true);
    expect(canRead(rules, "/users/alice")).toBe(false);
  });

  test("leaves out folder grants when any membership holds the Admin role", () => {
    const listOnly = [{ id: "grant", folderId: "folder", role: "list", environmentSlug: "prod", secretPath: "/api" }];
    const asMember = buildMergedProjectPermissionRules({
      memberships: [{ roles: [{ role: ProjectMembershipRole.Member }] }],
      folderGrants: listOnly,
      identity: identity("carol")
    });
    const asAdminThroughGroup = buildMergedProjectPermissionRules({
      memberships: [
        { roles: [{ role: ProjectMembershipRole.Member }] },
        { roles: [{ role: ProjectMembershipRole.Admin }] }
      ],
      folderGrants: listOnly,
      identity: identity("carol")
    });
    expect(canRead(asMember, "/api")).toBe(false);
    expect(canRead(asAdminThroughGroup, "/api")).toBe(true);
  });
});
