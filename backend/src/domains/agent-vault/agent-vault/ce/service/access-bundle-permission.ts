import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import type { TAccessControlDomain } from "@app/domains/platform/access-control/ce/module";
import type { ProjectPermission, TProjectsDomain } from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

export type TAccessBundlePermission = {
  project: ProjectPermission;
  isAdmin: boolean;
  // The bundles the actor reaches: every one (null) for an admin, otherwise the ones it is granted.
  reachableAccessBundleIds: string[] | null;
  // The bundles granted to the actor, directly or through a group, whatever its role: what "mine" means for an
  // admin, who reaches every bundle.
  grantedAccessBundleIds: string[];
};

export type TAccessBundlePermissionDeps = {
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  accessControlDomain: Pick<TAccessControlDomain, "findResourceMembershipsForActor">;
};

// What the actor may do in an Agent Vault project, and which access bundles it reaches. A bundle grant adds no
// rules: reaching a bundle is a filter the services apply, not a CASL condition.
export const getAccessBundlePermission = async (
  { projectsDomain, accessControlDomain }: TAccessBundlePermissionDeps,
  { actor, projectId }: { actor: TActorContext; projectId: string }
): Promise<TAccessBundlePermission> => {
  const project = await projectsDomain.getProjectPermission({ actor, projectId, type: ProjectType.AgentVault });
  const { isAdmin } = project;
  const { principal } = actor;
  if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
    return { project, isAdmin, reachableAccessBundleIds: isAdmin ? null : [], grantedAccessBundleIds: [] };
  }

  // A group's bundle grants count only while the group holds a live role in the project.
  const liveGroupIds = new Set(
    project.memberships
      .filter((membership) => membership.viaGroupId && membership.activeRoles().length > 0)
      .map((membership) => membership.viaGroupId as string)
  );
  const memberships = await accessControlDomain.findResourceMembershipsForActor({
    actor: { type: principal.type, id: principal.id },
    projectId,
    resourceType: ResourceType.AgentVaultAccessBundle
  });
  const grantedAccessBundleIds = [
    ...new Set(
      memberships
        .filter(
          (membership) => membership.isActive && (!membership.viaGroupId || liveGroupIds.has(membership.viaGroupId))
        )
        .map((membership) => membership.resourceId as string)
    )
  ];

  return {
    project,
    isAdmin,
    reachableAccessBundleIds: isAdmin ? null : grantedAccessBundleIds,
    grantedAccessBundleIds
  };
};
