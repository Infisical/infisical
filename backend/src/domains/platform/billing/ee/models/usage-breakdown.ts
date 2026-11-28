import { TUsageBreakdown } from "@app/domains/platform/license/ce/module";

import { BreakdownDimension } from "./breakdown-dimension";

export type TBreakdownProjectView = { id: string; name: string; count: number };

export type TBreakdownScopeView = {
  orgId: string;
  name: string;
  isRoot: boolean;
  parentOrgName: string | null;
  count: number;
  orgLevelCount: number;
  projects: TBreakdownProjectView[];
};

export type TUsageBreakdownView = {
  dimensionKey: string;
  total: number;
  userCount: number;
  scopedCount: number;
  hasProjectDetail: boolean;
  unit: string;
  scopes: TBreakdownScopeView[];
};

// rootOrgId is null for a root org.
export type TBreakdownOrg = { id: string; name: string; rootOrgId: string | null };

export type TBreakdownProject = { id: string; name: string };

type TScope = {
  name: string;
  isRoot: boolean;
  rootOrgId: string | null;
  orgLevelCount: number;
  projects: TBreakdownProjectView[];
};

// A meter's count split by the org and project that hold it.
export class UsageBreakdown {
  private constructor(private readonly view: TUsageBreakdownView) {}

  // keepEmptyOrgId (a tree's root) is listed even at zero, so the user can see it holds nothing; the instance-wide
  // breakdown passes null. A dimension that isn't split by org (user identities) lists no scopes.
  static assemble({
    dimension,
    usage,
    orgs,
    projects,
    keepEmptyOrgId
  }: {
    dimension: BreakdownDimension;
    usage: TUsageBreakdown;
    orgs: TBreakdownOrg[];
    projects: TBreakdownProject[];
    keepEmptyOrgId: string | null;
  }): UsageBreakdown {
    return new UsageBreakdown({
      dimensionKey: dimension.key,
      total: usage.total,
      userCount: usage.users,
      scopedCount: usage.total - usage.users,
      hasProjectDetail: dimension.isScoped && dimension.hasProjectDetail,
      unit: dimension.unit,
      scopes: dimension.isScoped ? UsageBreakdown.scopesOf({ dimension, usage, orgs, projects, keepEmptyOrgId }) : []
    });
  }

  toJSON(): TUsageBreakdownView {
    return this.view;
  }

  // An org is listed only once it contributes, since a tree can carry far more sub-orgs than a product uses. Units held
  // by an org or project deleted since they were counted keep their own row, so the parts still add up to the total.
  private static scopesOf({
    dimension,
    usage,
    orgs,
    projects,
    keepEmptyOrgId
  }: {
    dimension: BreakdownDimension;
    usage: TUsageBreakdown;
    orgs: TBreakdownOrg[];
    projects: TBreakdownProject[];
    keepEmptyOrgId: string | null;
  }): TBreakdownScopeView[] {
    const rows = dimension.hasProjectDetail ? usage.rows : usage.rows.map((row) => ({ ...row, projectId: null }));
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const orgNameById = new Map(orgs.map((org) => [org.id, org.name]));
    const byOrg = new Map<string, TScope>();
    orgs.forEach((org) =>
      byOrg.set(org.id, {
        name: org.name,
        isRoot: !org.rootOrgId,
        rootOrgId: org.rootOrgId,
        orgLevelCount: 0,
        projects: []
      })
    );

    rows.forEach((row) => {
      let target = byOrg.get(row.orgId);
      if (!target) {
        target = { name: "Deleted organization", isRoot: false, rootOrgId: null, orgLevelCount: 0, projects: [] };
        byOrg.set(row.orgId, target);
      }
      if (!row.projectId) {
        target.orgLevelCount += row.count;
        return;
      }
      target.projects.push({
        id: row.projectId,
        name: projectsById.get(row.projectId)?.name ?? "Deleted project",
        count: row.count
      });
    });

    return [...byOrg.entries()]
      .map(([orgId, scope]) => {
        const sorted = scope.projects.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        return {
          orgId,
          name: scope.name,
          isRoot: scope.isRoot,
          parentOrgName: scope.rootOrgId ? (orgNameById.get(scope.rootOrgId) ?? null) : null,
          count: scope.orgLevelCount + sorted.reduce((sum, project) => sum + project.count, 0),
          orgLevelCount: scope.orgLevelCount,
          projects: sorted
        };
      })
      .filter((scope) => scope.count > 0 || scope.orgId === keepEmptyOrgId)
      .sort((a, b) => Number(b.isRoot) - Number(a.isRoot) || b.count - a.count || a.name.localeCompare(b.name));
  }
}
