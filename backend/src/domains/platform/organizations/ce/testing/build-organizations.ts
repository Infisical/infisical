import { ActorContextMemo } from "@app/domains/lib/actor-context";
import { TActorGrantsService, TRoleService } from "@app/domains/platform/access-control/ce/module";

import { ActorContextService } from "../services/actor-context/service";
import { OrgPermissionService } from "../services/org-permission/service";
import { SsoSessionService } from "../services/sso-session/service";
import { InMemoryOrganizationStore } from "./in-memory-organization-store";

// Organizations' permission and actor context services over the Access Control a test gives it (usually
// buildAccessControl()), with orgs in memory: `organizationStore.add` writes them.
export const buildOrganizations = ({
  actorGrantsService,
  roleService
}: {
  actorGrantsService: TActorGrantsService;
  roleService: TRoleService;
}) => {
  const organizationStore = new InMemoryOrganizationStore();
  const orgPermissionService = new OrgPermissionService(actorGrantsService, roleService, new ActorContextMemo());
  const ssoSessionService = new SsoSessionService(orgPermissionService);
  const actorContextService = new ActorContextService(organizationStore, ssoSessionService);
  return { organizationStore, orgPermissionService, ssoSessionService, actorContextService };
};
