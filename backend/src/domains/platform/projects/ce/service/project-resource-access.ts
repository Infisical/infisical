import { AbilityTuple } from "@casl/ability";

import { ProjectType, RESOURCE_SCOPE } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import {
  ActorGrants,
  TAccessControlDomain,
  TPermissionRule,
  withFallback
} from "@app/domains/platform/access-control/ce/module";
import type { TOrganizationsDomain } from "@app/domains/platform/organizations/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";

import { ProjectPermissionService } from "./project-permission-service";
import { ProjectResourcePermission } from "./project-resource-permission";

export type TResourceRef = { resourceType: string; resourceId: string };

// How a product reads the role of a membership on one of its resources.
export type TResourceRoles<TSet extends AbilityTuple> = {
  // The rules for a role slug; throw for one the product does not define.
  resolveRole: (role: string) => TPermissionRule<TSet>[];
  // What a project admin gets on a resource it has no role on, and on top of its role where it has one.
  projectAdminFallback: TPermissionRule<TSet>[];
};

export type TGetProjectResourcePermissionInput<TSet extends AbilityTuple> = {
  actor: TActorContext;
  projectId: string;
  type: ProjectType;
  // The resources whose memberships count, farthest first (a folder, then an account in it). The last one names
  // the resource in the "not a member" error.
  resources: TResourceRef[];
  roles: TResourceRoles<TSet>;
};

export type TProjectResourceAccessDeps = {
  accessControlDomain: Pick<TAccessControlDomain, "fetchGrants">;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  projectPermissions: Pick<ProjectPermissionService, "getProjectRules">;
};

// The one way a product builds a permission on a resource inside a project (a PAM folder or account, a certificate
// application, a signer), so they all treat delegated tokens, non-members and project admins the same.
export class ProjectResourceAccess {
  constructor(private readonly deps: TProjectResourceAccessDeps) {}

  async getProjectResourcePermission<TSet extends AbilityTuple>({
    actor,
    projectId,
    type,
    resources,
    roles
  }: TGetProjectResourcePermissionInput<TSet>): Promise<ProjectResourcePermission<TSet>> {
    const { principal } = actor;
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      throw new BadRequestError({ message: "Invalid actor provided", name: "Get resource permission" });
    }
    // No OAuth scope covers resource memberships, so a delegated token gets nothing on a resource.
    if (principal.type === ActorType.USER && principal.oauth?.scopes) {
      return ProjectResourcePermission.build<TSet>({
        rules: [],
        grants: ActorGrants.empty(),
        isImplicitAdmin: false,
        isProjectAdmin: false
      });
    }

    const isProjectAdmin = await this.projectAdminOrOrgMember({ actor, projectId, type });

    const grantsPerResource = await Promise.all(
      resources.map(({ resourceType, resourceId }) =>
        this.deps.accessControlDomain.fetchGrants({
          actor: { type: principal.type, id: principal.id },
          scope: { scope: RESOURCE_SCOPE, orgId: actor.org.id, projectId, resourceType, resourceId }
        })
      )
    );
    const grants = ActorGrants.restore({
      memberships: grantsPerResource.flatMap((g) => g.memberships.map((m) => m.toJSON())),
      privileges: [],
      attributes: []
    });

    if (grants.hasMembership) {
      const rules = grants.activeEntries("custom").flatMap(({ role }) => roles.resolveRole(role));
      return ProjectResourcePermission.build<TSet>({
        rules: withFallback({ primary: rules, fallback: roles.projectAdminFallback, when: isProjectAdmin }),
        grants,
        isImplicitAdmin: false,
        isProjectAdmin
      });
    }
    if (isProjectAdmin) {
      return ProjectResourcePermission.build<TSet>({
        rules: roles.projectAdminFallback,
        grants,
        isImplicitAdmin: true,
        isProjectAdmin
      });
    }
    const last = resources[resources.length - 1];
    throw new ForbiddenRequestError({ message: `You are not a member of this ${last?.resourceType ?? "resource"}.` });
  }

  // Whether the actor is a built-in admin of the project. Someone who is not a project member may still hold a role
  // on one of its resources, as long as they are in the org.
  private async projectAdminOrOrgMember({
    actor,
    projectId,
    type
  }: {
    actor: TActorContext;
    projectId: string;
    type: ProjectType;
  }): Promise<boolean> {
    try {
      const { grants } = await this.deps.projectPermissions.getProjectRules({ actor, projectId, type });
      return grants.hasActiveBuiltInRole("admin");
    } catch (error) {
      if (!(error instanceof ForbiddenRequestError) || error.name !== "ProjectMembershipNotFound") throw error;
      await this.deps.organizationsDomain.getOrgPermission({ actor });
      return false;
    }
  }
}
