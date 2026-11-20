import { Knex } from "knex";

import { ActionProjectType, ResourceType } from "@app/db/schemas";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import type { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import type { TAgentVaultSkillBundleDALFactory } from "../agent-vault-skill/agent-vault-skill-bundle-dal";
import { AGENT_VAULT_ROLES_REACHING_EVERY_BUNDLE } from "./agent-vault-enums";

type TProjectPermissionResult = Awaited<ReturnType<TPermissionServiceFactory["getProjectPermission"]>>;

export type TAgentVaultPermission = {
  permission: TProjectPermissionResult["permission"];
};

export type TAgentVaultReachability = TAgentVaultPermission & {
  reachesEveryBundle: boolean;
  accessBundleIds: string[] | null;
};

export const hasRoleReachingEveryBundle = (hasRole: (role: string) => boolean) =>
  AGENT_VAULT_ROLES_REACHING_EVERY_BUNDLE.some((role) => hasRole(role));

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

// null reaches every bundle, so intersecting with it returns the other side unchanged.
export const intersectAccessBundleIds = (a: string[] | null, b: string[] | null): string[] | null => {
  if (a === null) return b;
  if (b === null) return a;
  const inB = new Set(b);
  return a.filter((id) => inB.has(id));
};

// The services a session can name through these bundles: every project service when every bundle is reached (null),
// otherwise those in one of them. Session creation checks names against it and the services list scopes itself to it,
// so the list offers exactly the services a session accepts.
export const serviceIdsReachedThrough = (
  agentVaultServiceDAL: Pick<TAgentVaultServiceDALFactory, "findIdsInBundles">,
  accessBundleIds: string[] | null
): Promise<string[] | null> =>
  accessBundleIds === null ? Promise.resolve(null) : agentVaultServiceDAL.findIdsInBundles(accessBundleIds);

// The skills a session can name through these bundles, the same rule as its services: every project skill when every
// bundle is reached (null), otherwise those in one of them. Session creation checks names against it and the skills
// list scopes itself to it.
export const skillIdsReachedThrough = (
  agentVaultSkillBundleDAL: Pick<TAgentVaultSkillBundleDALFactory, "findSkillIdsInBundles">,
  accessBundleIds: string[] | null
): Promise<string[] | null> =>
  accessBundleIds === null ? Promise.resolve(null) : agentVaultSkillBundleDAL.findSkillIdsInBundles(accessBundleIds);

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
  return { permission, reachesEveryBundle: hasRoleReachingEveryBundle(hasRole), memberships };
};

export const getAgentVaultPermission = async (
  deps: { permissionService: TPermissionDep },
  args: { projectId: string; ctx: TGenericPermission }
): Promise<TAgentVaultPermission> => {
  const { permission } = await $loadAgentVaultPermission(deps, args);
  return { permission };
};

// A service-layer filter rather than a CASL condition: conditions interpolate only identity.id,
// username and metadata.
export const getAgentVaultReachability = async (
  { permissionService, membershipDAL }: { permissionService: TPermissionDep; membershipDAL: TMembershipDep },
  { projectId, ctx }: { projectId: string; ctx: TGenericPermission },
  tx?: Knex
): Promise<TAgentVaultReachability> => {
  const { permission, reachesEveryBundle, memberships } = await $loadAgentVaultPermission(
    { permissionService },
    { projectId, ctx }
  );
  if (reachesEveryBundle) return { reachesEveryBundle, accessBundleIds: null, permission };

  if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
    return { reachesEveryBundle: false, accessBundleIds: [], permission };
  }

  const accessBundleIds = await findReachableAccessBundleIds(
    membershipDAL,
    { projectId, actor: { type: ctx.actor, id: ctx.actorId }, groupIds: liveGroupIdsFrom(memberships) },
    tx
  );

  return { reachesEveryBundle: false, accessBundleIds, permission };
};

/**
 * Reachability, plus the bundles the actor holds through a grant whatever their role. For a member the two are the
 * same; for an actor whose role reaches every bundle, the granted ones are what "mine" means.
 */
export const getAgentVaultGrantedReachability = async (
  { permissionService, membershipDAL }: { permissionService: TPermissionDep; membershipDAL: TMembershipDep },
  { projectId, ctx }: { projectId: string; ctx: TGenericPermission }
): Promise<TAgentVaultReachability & { grantedAccessBundleIds: string[] }> => {
  const { permission, reachesEveryBundle, memberships } = await $loadAgentVaultPermission(
    { permissionService },
    { projectId, ctx }
  );
  if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
    return {
      reachesEveryBundle,
      accessBundleIds: reachesEveryBundle ? null : [],
      grantedAccessBundleIds: [],
      permission
    };
  }

  const grantedAccessBundleIds = await findReachableAccessBundleIds(membershipDAL, {
    projectId,
    actor: { type: ctx.actor, id: ctx.actorId },
    groupIds: liveGroupIdsFrom(memberships)
  });

  return {
    reachesEveryBundle,
    accessBundleIds: reachesEveryBundle ? null : grantedAccessBundleIds,
    grantedAccessBundleIds,
    permission
  };
};
