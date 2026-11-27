import { ActorContextMemo } from "@app/domains/lib/actor-context";
import { TActorGrantsService, TRoleService } from "@app/domains/platform/access-control/ce/module";

import { ActorOrgCache } from "../data-access/actor-org-cache";
import { ActorContextService } from "../services/actor-context/service";
import { OrgPermissionService } from "../services/org-permission/service";
import { SsoSessionService } from "../services/sso-session/service";
import { InMemoryOrganizationStore } from "./in-memory-organization-store";

// Real permission and actor context services over the given Access Control (usually buildAccessControl()),
// with orgs kept in memory (add them via `organizationStore.add`).
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
  const actorContextService = new ActorContextService(organizationStore, ssoSessionService, new ActorOrgCache(0));
  return { organizationStore, orgPermissionService, ssoSessionService, actorContextService };
};
