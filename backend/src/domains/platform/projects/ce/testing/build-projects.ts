import { ActorContextMemo } from "@app/domains/lib/actor-context";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { buildOrganizations } from "@app/domains/platform/organizations/ce/testing/build-organizations";

import { TProjectRoles } from "../models/standard-project-roles";
import { TProjectAccessListener } from "../services/dependencies";
import { ProjectPermissionService } from "../services/project-permission/service";
import { ProjectResourcePermissionService } from "../services/project-resource-permission/service";
import { InMemoryProjectCache } from "./in-memory-project-cache";
import { InMemoryProjectStore } from "./in-memory-project-store";

// In-memory projects and Access Control, plus the real org permission service on the same grants. `seed` writes
// memberships, roles and privileges; `projectStore.add` writes projects.
export const buildProjects = ({
  projectRoles = [],
  onProjectAccess
}: { projectRoles?: TProjectRoles[]; onProjectAccess?: TProjectAccessListener } = {}) => {
  const accessControl = buildAccessControl();
  const projectStore = new InMemoryProjectStore();
  const projectCache = new InMemoryProjectCache();
  const { orgPermissionService } = buildOrganizations(accessControl);
  const projectPermissionService = new ProjectPermissionService(
    projectStore,
    projectCache,
    accessControl.actorGrantsService,
    accessControl.roleService,
    accessControl.groupService,
    projectRoles,
    new ActorContextMemo(),
    onProjectAccess
  );
  const projectResourcePermissionService = new ProjectResourcePermissionService(
    projectPermissionService,
    orgPermissionService,
    accessControl.actorGrantsService
  );
  return {
    ...accessControl,
    projectStore,
    projectCache,
    orgPermissionService,
    projectPermissionService,
    projectResourcePermissionService
  };
};
