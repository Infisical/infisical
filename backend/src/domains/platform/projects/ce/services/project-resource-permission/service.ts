import { AbilityTuple } from "@casl/ability";

import { ProjectType, RESOURCE_SCOPE } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { ActorGrants, TActorGrantsService } from "@app/domains/platform/access-control/ce/module";
import type { TOrgPermissionService } from "@app/domains/platform/organizations/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { ProjectResourcePermission, TResourceRoles } from "../../models/project-resource-permission";
import { TProjectPermissionService } from "../project-permission/service";

export type TResourceRef = { resourceType: string; resourceId: string };

export type TGetResourcePermissionInput<TSet extends AbilityTuple> = {
  actor: TActorContext;
  projectId: string;
  type: ProjectType;
  // The resources whose memberships count together (a folder, then an account in it). The last one names the
  // resource in the "not a member" error.
  resources: TResourceRef[];
  roles: TResourceRoles<TSet>;
};

export type TProjectResourcePermissionService = {
  // What the actor may do on resources inside a project, from its memberships on them. A project admin gets the
  // product's project-admin rules on top, or alone where it holds no role; anyone else with no role is refused.
  getResourcePermission<TSet extends AbilityTuple>(
    input: TGetResourcePermissionInput<TSet>
  ): Promise<ProjectResourcePermission<TSet>>;
};

// The one way a product builds a permission on a resource inside a project (a PAM folder or account, a certificate
// application, a signer, an access bundle), so they all treat delegated tokens, non-members and project admins alike.
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
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      throw new RuleViolationError({ message: "Invalid actor provided", name: "Get resource permission" });
    }
    // No OAuth scope covers resource memberships, so a delegated token gets nothing on a resource.
    if (principal.type === ActorType.USER && principal.oauth?.scopes) return ProjectResourcePermission.none<TSet>();

    const access = await this.projectPermissionService.findProjectAccess({ actor, projectId, type });
    // Someone who is not a project member may still hold a role on one of its resources, as long as they are in
    // the org.
    if (!access) await this.orgPermissionService.getOrgPermission({ actor });
    const isProjectAdmin = Boolean(access?.isAdmin);

    const grantsPerResource = await Promise.all(
      resources.map(({ resourceType, resourceId }) =>
        this.actorGrantsService.getActorGrants({
          actor: { type: principal.type, id: principal.id },
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
