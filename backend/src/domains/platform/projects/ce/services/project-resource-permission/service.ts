import { AbilityTuple } from "@casl/ability";

import { ProjectMembershipRole, ProjectType, RESOURCE_SCOPE } from "@app/db/schemas";
import { roleHolderOf, TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { ActorGrants, TActorGrantsService } from "@app/domains/platform/access-control/ce/module";
import type { TOrgPermissionService } from "@app/domains/platform/organizations/ce/module";
import { delegatedOauthScopesOf } from "@app/lib/auth/principal";

import { ProjectResourcePermission, TResourceRoles } from "../../models/project-resource-permission";
import { TProjectPermissionService } from "../project-permission/service";

export type TResourceRef = { resourceType: string; resourceId: string };

export type TGetResourcePermissionInput<TSet extends AbilityTuple> = {
  actor: TActorContext;
  projectId: string;
  type: ProjectType;
  // Memberships on all of these count together (e.g. a folder, then an account in it). The last one is the resource
  // named in the "not a member" error.
  resources: TResourceRef[];
  roles: TResourceRoles<TSet>;
};

export type TProjectResourcePermissionService = {
  // Project admins get the product's project-admin rules on top (or alone if they hold no role). Anyone else with no
  // role is refused.
  getResourcePermission<TSet extends AbilityTuple>(
    input: TGetResourcePermissionInput<TSet>
  ): Promise<ProjectResourcePermission<TSet>>;
};

// Every product builds resource permissions here (PAM folders and accounts, cert apps, signers, access bundles), so
// delegated tokens, non-members and project admins get handled the same way everywhere.
export class ProjectResourcePermissionService implements TProjectResourcePermissionService {
  constructor(
    private readonly projectPermissionService: TProjectPermissionService,
    private readonly orgPermissionService: TOrgPermissionService,
    private readonly actorGrantsService: TActorGrantsService
  ) {}

  async getResourcePermission<TSet extends AbilityTuple>({
    actor,
    projectId,
    type,
    resources,
    roles
  }: TGetResourcePermissionInput<TSet>): Promise<ProjectResourcePermission<TSet>> {
    const { principal } = actor;
    const holder = roleHolderOf(principal);
    // No OAuth scope covers resource memberships, so delegated tokens get nothing here.
    if (delegatedOauthScopesOf(principal)) return ProjectResourcePermission.none<TSet>();

    const access = await this.projectPermissionService.findProjectAccess({ actor, projectId, type });
    // Non-members can still hold a role on a resource, but they must be in the org.
    if (!access) await this.orgPermissionService.getOrgPermission({ actor });
    // Matched by slug, so a custom role slugged admin counts too (the folder-grant skip only counts built-in admin).
    const isProjectAdmin = Boolean(access?.grants.hasActiveRole(ProjectMembershipRole.Admin));

    const grantsPerResource = await Promise.all(
      resources.map(({ resourceType, resourceId }) =>
        this.actorGrantsService.getActorGrants({
          actor: holder,
          scope: { scope: RESOURCE_SCOPE, orgId: actor.org.id, projectId, resourceType, resourceId }
        })
      )
    );
    const grants = grantsPerResource.reduce((all, next) => all.merge(next), ActorGrants.empty());

    const project = access?.project ?? null;
    if (grants.hasMembership)
      return ProjectResourcePermission.fromGrants<TSet>({ grants, roles, isProjectAdmin, project });
    if (isProjectAdmin && project) return ProjectResourcePermission.implicitAdmin<TSet>({ roles, project });
    const last = resources[resources.length - 1];
    throw new PermissionDeniedError({ message: `You are not a member of this ${last?.resourceType ?? "resource"}.` });
  }
}
