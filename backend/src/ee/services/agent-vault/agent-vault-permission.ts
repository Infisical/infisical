import { Knex } from "knex";

import { ActionProjectType, ProjectMembershipRole, ResourceType } from "@app/db/schemas";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

type TProjectPermissionResult = Awaited<ReturnType<TPermissionServiceFactory["getProjectPermission"]>>;

export type TAgentVaultPermission = {
  permission: TProjectPermissionResult["permission"];
  isAdmin: boolean;
};

export type TAgentVaultReachability = TAgentVaultPermission & {
  accessBundleIds: string[] | null;
};

export type TAgentVaultGrantActor = {
  type: ActorType.USER | ActorType.IDENTITY;
  id: string;
};

type TPermissionDep = Pick<TPermissionServiceFactory, "getProjectPermission">;
type TMembershipDep = Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
type TProjectMemberships = TProjectPermissionResult["memberships"];

// A group's grants count only while the group confers a live Agent Vault role.
export const liveGroupIdsFrom = (memberships: TProjectMemberships): string[] =>
  memberships.filter((m) => m.actorGroupId && m.roles.some((role) => isActiveRole(role))).map((m) => m.actorGroupId!);

export const findReachableAccessBundleIds = async (
  membershipDAL: TMembershipDep,
  { projectId, actor, groupIds }: { projectId: string; actor: TAgentVaultGrantActor; groupIds: string[] },
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

  const liveGroups = new Set(groupIds);
  const reachable = rows.filter((row) => {
    if (!row.isActive) return false;
    if (row.actorGroupId) return liveGroups.has(row.actorGroupId);
    return true;
  });

  return [...new Set(reachable.map((row) => row.scopeResourceId!))];
};

const $loadAgentVaultPermission = async (
  { permissionService }: { permissionService: TPermissionDep },
  { projectId, ctx }: { projectId: string; ctx: TGenericPermission }
) => {
  const { permission, hasRole, memberships } = await permissionService.getProjectPermission({
    actor: ctx.actor,
    actorId: ctx.actorId,
    projectId,
    actorAuthMethod: ctx.actorAuthMethod,
    actorOrgId: ctx.actorOrgId,
    actionProjectType: ActionProjectType.AgentVault
  });
  return { permission, isAdmin: hasRole(ProjectMembershipRole.Admin), memberships };
};

export const getAgentVaultPermission = async (
  deps: { permissionService: TPermissionDep },
  args: { projectId: string; ctx: TGenericPermission }
): Promise<TAgentVaultPermission> => {
  const { permission, isAdmin } = await $loadAgentVaultPermission(deps, args);
  return { permission, isAdmin };
};

// A service-layer filter rather than a CASL condition: conditions interpolate only identity.id,
// username and metadata.
export const getAgentVaultReachability = async (
  { permissionService, membershipDAL }: { permissionService: TPermissionDep; membershipDAL: TMembershipDep },
  { projectId, ctx }: { projectId: string; ctx: TGenericPermission },
  tx?: Knex
): Promise<TAgentVaultReachability> => {
  const { permission, isAdmin, memberships } = await $loadAgentVaultPermission(
    { permissionService },
    { projectId, ctx }
  );
  if (isAdmin) return { isAdmin, accessBundleIds: null, permission };

  if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
    return { isAdmin: false, accessBundleIds: [], permission };
  }

  const accessBundleIds = await findReachableAccessBundleIds(
    membershipDAL,
    { projectId, actor: { type: ctx.actor, id: ctx.actorId }, groupIds: liveGroupIdsFrom(memberships) },
    tx
  );

  return { isAdmin: false, accessBundleIds, permission };
};
