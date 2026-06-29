import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, it } from "vitest";

import { conditionsMatcher } from "@app/lib/casl";

import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "../permission/project-permission";
import { filterVisibleDuplicationGroups, TInsightsDuplicationGroup } from "./insights-fns";

// Describe grant per environment (no tag condition).
const buildPermission = (environments: string[]) =>
  createMongoAbility<MongoAbility<ProjectPermissionSet>>(
    environments.map(
      (environment) =>
        ({
          action: [ProjectPermissionSecretActions.DescribeSecret],
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment }
        }) as RawRuleOf<MongoAbility<ProjectPermissionSet>>
    ),
    { conditionsMatcher }
  );

// Describe grant scoped to a tag within an environment.
const buildTagScopedPermission = (environment: string, tagSlug: string) =>
  createMongoAbility<MongoAbility<ProjectPermissionSet>>(
    [
      {
        action: [ProjectPermissionSecretActions.DescribeSecret],
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment, secretTags: { $in: [tagSlug] } }
      } as RawRuleOf<MongoAbility<ProjectPermissionSet>>
    ],
    { conditionsMatcher }
  );

const secret = (key: string, slug: string, secretPath = "/", secretTags: string[] = []) => ({
  key,
  environment: { name: slug, slug },
  secretPath,
  secretTags
});

describe("filterVisibleDuplicationGroups", () => {
  it("drops a secret in an environment the caller cannot describe, dropping the now-single group", () => {
    const groups: TInsightsDuplicationGroup[] = [{ secrets: [secret("DB_PASS", "dev"), secret("DB_PASS", "prod")] }];
    expect(filterVisibleDuplicationGroups(groups, buildPermission(["dev"]))).toHaveLength(0);
  });

  it("keeps a group when more than one secret remains visible to the caller", () => {
    const groups: TInsightsDuplicationGroup[] = [
      { secrets: [secret("API_KEY", "dev", "/"), secret("API_KEY", "dev", "/svc")] }
    ];
    const result = filterVisibleDuplicationGroups(groups, buildPermission(["dev"]));
    expect(result).toHaveLength(1);
    expect(result[0].secrets).toHaveLength(2);
  });

  it("returns full groups when the caller can describe every environment", () => {
    const groups: TInsightsDuplicationGroup[] = [{ secrets: [secret("DB_PASS", "dev"), secret("DB_PASS", "prod")] }];
    const result = filterVisibleDuplicationGroups(groups, buildPermission(["dev", "prod"]));
    expect(result).toHaveLength(1);
    expect(result[0].secrets).toHaveLength(2);
  });

  it("filters only the unreadable members of a mixed group", () => {
    const groups: TInsightsDuplicationGroup[] = [
      { secrets: [secret("TOKEN", "dev"), secret("TOKEN", "staging"), secret("TOKEN", "prod")] }
    ];
    const result = filterVisibleDuplicationGroups(groups, buildPermission(["dev", "staging"]));
    expect(result).toHaveLength(1);
    expect(result[0].secrets.map((s) => s.environment.slug).sort()).toEqual(["dev", "staging"]);
  });

  it("honors a tag-conditioned describe grant (group of matching-tag secrets stays visible)", () => {
    const groups: TInsightsDuplicationGroup[] = [
      {
        secrets: [secret("A", "dev", "/", ["shared"]), secret("B", "dev", "/", ["shared"])]
      }
    ];
    const result = filterVisibleDuplicationGroups(groups, buildTagScopedPermission("dev", "shared"));
    expect(result).toHaveLength(1);
    expect(result[0].secrets).toHaveLength(2);
  });

  it("filters out secrets whose tags do not match a tag-conditioned grant", () => {
    const groups: TInsightsDuplicationGroup[] = [
      {
        secrets: [secret("A", "dev", "/", ["shared"]), secret("B", "dev", "/", ["other"])]
      }
    ];
    // only the "shared"-tagged secret is visible -> group reduced to one -> removed
    expect(filterVisibleDuplicationGroups(groups, buildTagScopedPermission("dev", "shared"))).toHaveLength(0);
  });
});
