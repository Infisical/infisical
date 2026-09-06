import { Knex } from "knex";

import { ActionProjectType, ProjectMembershipRole, ResourceType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { TAgentVaultActorContext } from "./agent-vault-actor-types";

type TProjectPermissionResult = Awaited<ReturnType<TPermissionServiceFactory["getProjectPermission"]>>;

export type TAgentVaultReachability = {
  permission: TProjectPermissionResult["permission"];
  isAdmin: boolean;
  /** Null when the actor is an admin: an admin reaches every bundle, so there is nothing to filter by. */
  accessBundleIds: string[] | null;
};

export type TAgentVaultGrantActor = {
  type: ActorType.USER | ActorType.IDENTITY;
  id: string;
};

type TPermissionDep = Pick<TPermissionServiceFactory, "getProjectPermission">;
type TMembershipDep = Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;

// Grants are resource-scoped rows in the shared memberships table, so "which bundles can this actor reach"
// is the platform's own read: direct rows plus rows held through the actor's groups, expanded through
// user_group_membership for a person and identity_group_membership for a machine identity. Mint, every
// member-facing read and the proxy's resolve all go through this one function.
export const findReachableAccessBundleIds = async (
  membershipDAL: TMembershipDep,
  { projectId, actor }: { projectId: string; actor: TAgentVaultGrantActor },
  tx?: Knex
): Promise<string[]> => {
  const rows = await membershipDAL.findResourceMembershipsForActor(
    {
      projectId,
      resourceType: ResourceType.AgentVaultAccessBundle,
      actorType: actor.type,
      actorId: actor.id
    },
    tx
  );

  return [...new Set(rows.filter((row) => row.isActive).map((row) => row.scopeResourceId!))];
};

// Reachability is a service-layer filter rather than a CASL condition: conditions interpolate only
// identity.id, username and metadata, so "which bundles can this actor reach" would stop being
// answerable in SQL and the members card would have to filter in memory.
export const getAgentVaultReachability = async (
  { permissionService, membershipDAL }: { permissionService: TPermissionDep; membershipDAL: TMembershipDep },
  { projectId, ctx }: { projectId: string; ctx: TAgentVaultActorContext },
  tx?: Knex
): Promise<TAgentVaultReachability> => {
  const { permission, hasRole } = await permissionService.getProjectPermission({
    actor: ctx.actor,
    actorId: ctx.actorId,
    projectId,
    actorAuthMethod: ctx.actorAuthMethod,
    actorOrgId: ctx.actorOrgId,
    actionProjectType: ActionProjectType.AgentVault
  });

  const isAdmin = hasRole(ProjectMembershipRole.Admin);
  if (isAdmin) return { isAdmin, accessBundleIds: null, permission };

  // Only users and machine identities hold grants; anything else reaches nothing rather than everything.
  if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
    return { isAdmin: false, accessBundleIds: [], permission };
  }

  const accessBundleIds = await findReachableAccessBundleIds(
    membershipDAL,
    { projectId, actor: { type: ctx.actor, id: ctx.actorId } },
    tx
  );

  return { isAdmin: false, accessBundleIds, permission };
};
