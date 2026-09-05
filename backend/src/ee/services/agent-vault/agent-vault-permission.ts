import { Knex } from "knex";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ActorType } from "@app/services/auth/auth-type";

import { TAgentVaultAccessBundleMemberDALFactory } from "../agent-vault-member/agent-vault-access-bundle-member-dal";
import { TAgentVaultActorContext } from "./agent-vault-actor-types";

type TProjectPermissionResult = Awaited<ReturnType<TPermissionServiceFactory["getProjectPermission"]>>;

export type TAgentVaultReachability = {
  permission: TProjectPermissionResult["permission"];
  isAdmin: boolean;
  /** Null when the actor is an admin: an admin reaches every bundle, so there is nothing to filter by. */
  accessBundleIds: string[] | null;
};

type TPermissionDep = Pick<TPermissionServiceFactory, "getProjectPermission">;
type TMemberDep = Pick<TAgentVaultAccessBundleMemberDALFactory, "findReachableAccessBundleIds">;

// Reachability is a service-layer filter rather than a CASL condition: conditions interpolate only
// identity.id, username and metadata, so "which bundles can this actor reach" would stop being
// answerable in SQL and the members card would have to filter in memory.
export const getAgentVaultReachability = async (
  {
    permissionService,
    agentVaultAccessBundleMemberDAL
  }: { permissionService: TPermissionDep; agentVaultAccessBundleMemberDAL: TMemberDep },
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

  const accessBundleIds = await agentVaultAccessBundleMemberDAL.findReachableAccessBundleIds(
    { projectId, actor: { type: ctx.actor, id: ctx.actorId } },
    tx
  );

  return { isAdmin: false, accessBundleIds, permission };
};
