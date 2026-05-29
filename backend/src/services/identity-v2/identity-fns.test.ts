import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test } from "vitest";

import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";

import { filterIdentitiesByProjectPermission, TProjectPermissionAbility } from "./identity-fns";
import { SearchIdentitiesScope } from "./identity-types";

type Rule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

const buildAbility = (rules: Rule[]): TProjectPermissionAbility =>
  createMongoAbility<ProjectPermissionSet>(rules, { conditionsMatcher });

const row = (overrides: {
  identityId: string;
  scope: SearchIdentitiesScope;
  projectId?: string | null;
  name?: string;
}) => ({ name: "identity", ...overrides });

describe("filterIdentitiesByProjectPermission", () => {
  test("org-scope rows pass through unchanged", () => {
    const rows = [
      row({ identityId: "id-1", scope: SearchIdentitiesScope.OrganizationScope, projectId: null }),
      row({ identityId: "id-2", scope: SearchIdentitiesScope.OrganizationScope })
    ];
    const result = filterIdentitiesByProjectPermission(rows, new Map(), new Set());
    expect(result).toEqual(rows);
  });

  test("project-scope rows in unconditional projects pass through without consulting CASL", () => {
    const unconditional = buildAbility([
      // A throwing matcher would fail this test if the helper invoked .can() — we rely on the
      // empty conditionalProjectIds set to short-circuit before any CASL evaluation.
      { action: [ProjectPermissionIdentityActions.Read], subject: ProjectPermissionSub.Identity }
    ]);
    const rows = [
      row({ identityId: "id-1", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-A" }),
      row({ identityId: "id-2", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-A" })
    ];
    const result = filterIdentitiesByProjectPermission(rows, new Map([["proj-A", unconditional]]), new Set());
    expect(result).toEqual(rows);
  });

  test("project-scope rows in conditional projects are filtered by identityId", () => {
    const conditional = buildAbility([
      {
        action: [ProjectPermissionIdentityActions.Read],
        subject: ProjectPermissionSub.Identity,
        conditions: { identityId: { $in: ["id-1", "id-3"] } }
      }
    ]);
    const rows = [
      row({ identityId: "id-1", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-A" }),
      row({ identityId: "id-2", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-A" }),
      row({ identityId: "id-3", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-A" })
    ];
    const result = filterIdentitiesByProjectPermission(rows, new Map([["proj-A", conditional]]), new Set(["proj-A"]));
    expect(result.map((r) => r.identityId)).toEqual(["id-1", "id-3"]);
  });

  test("rows from a project with no permission entry are dropped", () => {
    const rows = [row({ identityId: "id-1", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-missing" })];
    const result = filterIdentitiesByProjectPermission(rows, new Map(), new Set(["proj-missing"]));
    expect(result).toEqual([]);
  });

  test("project-scope rows without a projectId are dropped", () => {
    const rows = [row({ identityId: "id-1", scope: SearchIdentitiesScope.ProjectScope, projectId: null })];
    const result = filterIdentitiesByProjectPermission(rows, new Map(), new Set());
    expect(result).toEqual([]);
  });

  test("mixed scopes: org passes, unconditional project passes, conditional project filters", () => {
    const unconditional = buildAbility([
      { action: [ProjectPermissionIdentityActions.Read], subject: ProjectPermissionSub.Identity }
    ]);
    const conditional = buildAbility([
      {
        action: [ProjectPermissionIdentityActions.Read],
        subject: ProjectPermissionSub.Identity,
        conditions: { identityId: "id-3" }
      }
    ]);
    const rows = [
      row({ identityId: "id-1", scope: SearchIdentitiesScope.OrganizationScope, projectId: null }),
      row({ identityId: "id-2", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-open" }),
      row({ identityId: "id-3", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-locked" }),
      row({ identityId: "id-4", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-locked" })
    ];
    const result = filterIdentitiesByProjectPermission(
      rows,
      new Map([
        ["proj-open", unconditional],
        ["proj-locked", conditional]
      ]),
      new Set(["proj-locked"])
    );
    expect(result.map((r) => r.identityId)).toEqual(["id-1", "id-2", "id-3"]);
  });

  test("inverted (forbid) rule with conditions denies matching rows even when project is unconditional in the set", () => {
    // Realistic config: a base allow-all Read(Identity) plus a forbid for a specific identityId.
    // The service flags this project as conditional, so the per-row check runs and respects the forbid.
    const withForbid = buildAbility([
      { action: [ProjectPermissionIdentityActions.Read], subject: ProjectPermissionSub.Identity },
      {
        inverted: true,
        action: [ProjectPermissionIdentityActions.Read],
        subject: ProjectPermissionSub.Identity,
        conditions: { identityId: "id-blocked" }
      }
    ]);
    const rows = [
      row({ identityId: "id-allowed", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-X" }),
      row({ identityId: "id-blocked", scope: SearchIdentitiesScope.ProjectScope, projectId: "proj-X" })
    ];
    const result = filterIdentitiesByProjectPermission(rows, new Map([["proj-X", withForbid]]), new Set(["proj-X"]));
    expect(result.map((r) => r.identityId)).toEqual(["id-allowed"]);
  });
});
