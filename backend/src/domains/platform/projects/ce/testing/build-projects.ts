import { ProjectType } from "@app/db/schemas";
import { ActorMemo } from "@app/domains/lib/actor-memo";
import type { ActorGrants, TAccessControlDomain } from "@app/domains/platform/access-control/ce/module";
import type { TOrganizationsDomain } from "@app/domains/platform/organizations/ce/module";

import { Project } from "../model/project";
import { TProjectsDomain } from "../module";
import { ProductAccessRegistry } from "../service/product-access-registry";
import { ProjectPermissionService } from "../service/project-permission-service";
import { ProjectResourceAccess } from "../service/project-resource-access";

// Projects' permission functions over a fixed set of projects, for another domain's tests. Built on the Access
// Control the test gives it, so the grants are real.
export const buildProjectsForTests = ({
  accessControlDomain,
  organizationsDomain,
  projects
}: {
  accessControlDomain: TAccessControlDomain;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  projects: { id: string; orgId: string; type: ProjectType; name?: string }[];
}): {
  service: Pick<
    TProjectsDomain,
    "getProjectPermission" | "getProjectRules" | "getProjectResourcePermission" | "findProject"
  >;
  productAccessRegistry: ProductAccessRegistry;
} => {
  const byId = new Map(
    projects.map(({ id, orgId, type, name = "project" }) => [
      id,
      Project.restore({ id, orgId, type, name, slug: name })
    ])
  );
  const registry = new ProductAccessRegistry();
  const permissions = new ProjectPermissionService({
    accessControlDomain,
    registry,
    projects: { findById: async (id) => byId.get(id), findDeletionState: async () => "" },
    memo: new ActorMemo<{ project: Project; grants: ActorGrants }>()
  });
  const resources = new ProjectResourceAccess({
    accessControlDomain,
    organizationsDomain,
    projectPermissions: permissions
  });
  return {
    service: {
      getProjectPermission: (input) => permissions.getProjectPermission(input),
      getProjectRules: (input) => permissions.getProjectRules(input),
      getProjectResourcePermission: (input) => resources.getProjectResourcePermission(input),
      findProject: async ({ projectId }) => byId.get(projectId)
    },
    productAccessRegistry: registry
  };
};
