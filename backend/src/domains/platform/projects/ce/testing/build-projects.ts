import { ActorContextMemo } from "@app/domains/lib/actor-context";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { buildOrganizations } from "@app/domains/platform/organizations/ce/testing/build-organizations";

import { TProjectRoles } from "../models/standard-project-roles";
import { TProjectAccessListener } from "../services/dependencies";
import { ProjectPermissionService } from "../services/project-permission/service";
import { ProjectResourcePermissionService } from "../services/project-resource-permission/service";
import { InMemoryActorNameStore } from "./in-memory-actor-name-store";
import { InMemoryProjectCache } from "./in-memory-project-cache";
import { InMemoryProjectStore } from "./in-memory-project-store";

// Projects' permission services over in-memory projects and an in-memory Access Control, with the real org
// permission service on the same grants. `seed` writes memberships, roles and privileges; `projectStore.add` writes
// projects.
export const buildProjects = ({
  projectRoles = [],
  onProjectAccess
}: { projectRoles?: TProjectRoles[]; onProjectAccess?: TProjectAccessListener } = {}) => {
  const accessControl = buildAccessControl();
  const projectStore = new InMemoryProjectStore();
  const projectCache = new InMemoryProjectCache();
  const actorNameStore = new InMemoryActorNameStore();
  const { orgPermissionService } = buildOrganizations(accessControl);
  const projectPermissionService = new ProjectPermissionService(
    projectStore,
    projectCache,
    accessControl.actorGrantsService,
    accessControl.roleService,
    accessControl.groupService,
    actorNameStore,
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
    actorNameStore,
    orgPermissionService,
    projectPermissionService,
    projectResourcePermissionService
  };
};
