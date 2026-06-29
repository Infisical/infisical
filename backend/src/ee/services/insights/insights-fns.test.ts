import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, it } from "vitest";

import { conditionsMatcher } from "@app/lib/casl";

import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "../permission/project-permission";
import { filterVisibleDuplicationGroups, TInsightsDuplicationGroup } from "./insights-fns";

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

const secret = (key: string, slug: string, secretPath = "/") => ({
  key,
  environment: { name: slug, slug },
  secretPath
});

describe("filterVisibleDuplicationGroups", () => {
  it("drops a secret in an environment the caller cannot describe, dropping the now-single group", () => {
    const groups: TInsightsDuplicationGroup[] = [{ secrets: [secret("DB_PASS", "dev"), secret("DB_PASS", "prod")] }];

    const result = filterVisibleDuplicationGroups(groups, buildPermission(["dev"]));

    // dev secret was readable, prod was not -> group reduced to one -> removed entirely
    expect(result).toHaveLength(0);
  });

  it("keeps a group when more than one secret remains visible to the caller", () => {
    const groups: TInsightsDuplicationGroup[] = [
      { secrets: [secret("API_KEY", "dev", "/"), secret("API_KEY", "dev", "/svc")] }
    ];

    const result = filterVisibleDuplicationGroups(groups, buildPermission(["dev"]));

    expect(result).toHaveLength(1);
    expect(result[0].secrets).toHaveLength(2);
    expect(result[0].secrets.every((s) => s.environment.slug === "dev")).toBe(true);
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
});
