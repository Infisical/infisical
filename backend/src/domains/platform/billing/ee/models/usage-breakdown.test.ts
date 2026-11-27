import { TUsageBreakdown } from "@app/domains/platform/license/ce/module";

import { BreakdownDimension } from "./breakdown-dimension";
import { TBreakdownOrg, UsageBreakdown } from "./usage-breakdown";

const root: TBreakdownOrg = { id: "root", name: "Acme", rootOrgId: null };
const sub: TBreakdownOrg = { id: "sub", name: "Acme EU", rootOrgId: "root" };
const other: TBreakdownOrg = { id: "other", name: "Beta", rootOrgId: null };

const assemble = ({
  dimension = BreakdownDimension.Identities,
  usage,
  orgs = [root, sub],
  projects = [],
  keepEmptyOrgId = "root"
}: {
  dimension?: BreakdownDimension;
  usage: TUsageBreakdown;
  orgs?: TBreakdownOrg[];
  projects?: { id: string; name: string }[];
  keepEmptyOrgId?: string | null;
}) => UsageBreakdown.assemble({ dimension, usage, orgs, projects, keepEmptyOrgId }).toJSON();

describe("UsageBreakdown.assemble", () => {
  test("should keep a row for an org or project missing from the name lists so the parts add up to the total", () => {
    // Setup
    const usage = {
      total: 10,
      users: 0,
      rows: [
        { orgId: "root", projectId: "gone-project", count: 4 },
        { orgId: "gone-org", projectId: null, count: 6 }
      ]
    };

    // Action
    const view = assemble({ usage });

    // Assert
    expect(view.scopes.map((scope) => [scope.name, scope.count])).toEqual([
      ["Acme", 4],
      ["Deleted organization", 6]
    ]);
    expect(view.scopes[0].projects).toEqual([{ id: "gone-project", name: "Deleted project", count: 4 }]);
  });

  test("should keep the root at zero but drop an empty sub-org", () => {
    // Setup
    const usage = { total: 0, users: 0, rows: [] };

    // Action
    const view = assemble({ usage });

    // Assert
    expect(view.scopes.map((scope) => [scope.orgId, scope.count])).toEqual([["root", 0]]);
  });

  test("should drop every empty org on the instance-wide breakdown", () => {
    // Setup
    const usage = { total: 3, users: 0, rows: [{ orgId: "other", projectId: null, count: 3 }] };

    // Action
    const view = assemble({ usage, orgs: [root, sub, other], keepEmptyOrgId: null });

    // Assert
    expect(view.scopes.map((scope) => scope.orgId)).toEqual(["other"]);
  });

  test("should fold project rows into the org-level count for a dimension without project detail", () => {
    // Setup
    const usage = {
      total: 5,
      users: 0,
      rows: [
        { orgId: "root", projectId: "p1", count: 2 },
        { orgId: "root", projectId: null, count: 3 }
      ]
    };

    // Action
    const view = assemble({
      dimension: BreakdownDimension.PamIdentities,
      usage,
      projects: [{ id: "p1", name: "Prod" }]
    });

    // Assert
    expect(view.hasProjectDetail).toBe(false);
    expect(view.scopes[0]).toMatchObject({ count: 5, orgLevelCount: 5, projects: [] });
  });

  test("should not scope user identities, which are one org-wide figure", () => {
    // Setup
    const usage = { total: 8, users: 8, rows: [{ orgId: "root", projectId: null, count: 8 }] };

    // Action
    const view = assemble({ dimension: BreakdownDimension.UserIdentities, usage });

    // Assert
    expect(view).toMatchObject({ scopes: [], scopedCount: 0, userCount: 8, total: 8 });
  });

  test("should count the scoped part as the total minus users", () => {
    // Setup
    const usage = { total: 12, users: 5, rows: [{ orgId: "root", projectId: null, count: 7 }] };

    // Action
    const view = assemble({ usage });

    // Assert
    expect(view).toMatchObject({ total: 12, userCount: 5, scopedCount: 7, unit: "machine identity" });
  });

  test("should sort the root first, then by count descending, then by name", () => {
    // Setup
    const orgs = [
      root,
      { id: "a", name: "Alpha", rootOrgId: "root" },
      { id: "b", name: "Bravo", rootOrgId: "root" },
      { id: "c", name: "Charlie", rootOrgId: "root" }
    ];
    const usage = {
      total: 11,
      users: 0,
      rows: [
        { orgId: "c", projectId: null, count: 5 },
        { orgId: "b", projectId: null, count: 3 },
        { orgId: "a", projectId: null, count: 3 },
        { orgId: "root", projectId: null, count: 1 }
      ]
    };

    // Action
    const view = assemble({ usage, orgs });

    // Assert
    expect(view.scopes.map((scope) => scope.name)).toEqual(["Acme", "Charlie", "Alpha", "Bravo"]);
  });

  test("should name a sub-org's parent and leave a root's parent null", () => {
    // Setup
    const usage = {
      total: 2,
      users: 0,
      rows: [
        { orgId: "root", projectId: null, count: 1 },
        { orgId: "sub", projectId: null, count: 1 }
      ]
    };

    // Action
    const view = assemble({ usage });

    // Assert
    expect(view.scopes.map((scope) => [scope.name, scope.isRoot, scope.parentOrgName])).toEqual([
      ["Acme", true, null],
      ["Acme EU", false, "Acme"]
    ]);
  });

  test("should list an org's projects by count descending", () => {
    // Setup
    const usage = {
      total: 6,
      users: 0,
      rows: [
        { orgId: "root", projectId: "p1", count: 1 },
        { orgId: "root", projectId: "p2", count: 5 }
      ]
    };
    const projects = [
      { id: "p1", name: "Small" },
      { id: "p2", name: "Big" }
    ];

    // Action
    const view = assemble({ usage, projects });

    // Assert
    expect(view.scopes[0].projects.map((project) => project.name)).toEqual(["Big", "Small"]);
  });
});

describe("UsageBreakdown.projectIdsIn", () => {
  test("should return each project id once, without org-level rows", () => {
    // Setup
    const usage = {
      total: 6,
      users: 0,
      rows: [
        { orgId: "root", projectId: "p1", count: 1 },
        { orgId: "sub", projectId: "p1", count: 2 },
        { orgId: "root", projectId: "p2", count: 3 },
        { orgId: "root", projectId: null, count: 4 }
      ]
    };

    // Action
    const ids = UsageBreakdown.projectIdsIn(BreakdownDimension.Identities, usage);

    // Assert
    expect(ids).toEqual(["p1", "p2"]);
  });

  test("should return none for a dimension without project detail", () => {
    // Setup
    const usage = { total: 1, users: 0, rows: [{ orgId: "root", projectId: "p1", count: 1 }] };

    // Action
    const ids = [
      UsageBreakdown.projectIdsIn(BreakdownDimension.PamIdentities, usage),
      UsageBreakdown.projectIdsIn(BreakdownDimension.UserIdentities, usage)
    ];

    // Assert
    expect(ids).toEqual([[], []]);
  });
});
