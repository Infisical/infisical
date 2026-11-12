import { Knex } from "knex";

import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { PgSqlLock } from "@app/keystore/keystore";

import { TAgentVaultPersonalValueDALFactory } from "./agent-vault-personal-value-dal";

export type TClearPersonalValuesDeps = {
  agentVaultPersonalValueDAL: Pick<TAgentVaultPersonalValueDALFactory, "deleteForActorsWithoutGrant">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
};

/**
 * Losing a service clears the values an actor saved for it, so being given it again starts from nothing. A group's
 * revoke reaches its members, and anyone who still reaches the service through any bundle keeps theirs. The services
 * are `accessBundleId`'s, or `serviceIds` (a deleted bundle's, read before its links went), or with neither every
 * service in the project, for an actor leaving Agent Vault. `everyActor` covers everyone who saved a value for them,
 * for a service taken out of a bundle.
 *
 * Call it after the change is written in `tx`. Cleanups in one project run one at a time, so of two changes that
 * each leave the other's access in place (a demotion and the revoke of the last grant), the second checks against
 * the first once it has committed instead of both skipping.
 */
export const clearPersonalValuesAfterRevoke = async (
  { agentVaultPersonalValueDAL, userGroupMembershipDAL, identityGroupMembershipDAL }: TClearPersonalValuesDeps,
  {
    projectId,
    accessBundleId,
    serviceIds,
    userIds = [],
    identityIds = [],
    groupIds = [],
    everyActor = false
  }: {
    projectId: string;
    accessBundleId?: string;
    serviceIds?: string[];
    userIds?: string[];
    identityIds?: string[];
    groupIds?: string[];
    everyActor?: boolean;
  },
  tx: Knex
) => {
  await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.ClearAgentVaultPersonalValues(projectId)]);

  const [groupUsers, groupIdentities] = groupIds.length
    ? await Promise.all([
        userGroupMembershipDAL.find({ $in: { groupId: groupIds } }, { tx }),
        identityGroupMembershipDAL.find({ $in: { groupId: groupIds } }, { tx })
      ])
    : [[], []];

  return agentVaultPersonalValueDAL.deleteForActorsWithoutGrant(
    {
      projectId,
      accessBundleId,
      ...(serviceIds ? { serviceIds } : {}),
      ...(everyActor ? { everyActor } : {}),
      userIds: [...new Set([...userIds, ...groupUsers.map((row) => row.userId)])],
      identityIds: [...new Set([...identityIds, ...groupIdentities.map((row) => row.identityId)])]
    },
    tx
  );
};

export type TClearPersonalValuesInProjectsDeps = Omit<TClearPersonalValuesDeps, "agentVaultPersonalValueDAL"> & {
  agentVaultPersonalValueDAL: Pick<
    TAgentVaultPersonalValueDALFactory,
    "deleteForActorsWithoutGrant" | "findProjectIdsWithValues" | "findProjectIdsWithAnyValues"
  >;
};

/**
 * `clearPersonalValuesAfterRevoke` over every bundle, run only in the projects among `projectIds` where these actors
 * (or the members of these groups) saved a value. The projects come back sorted, so concurrent cleanups across
 * several projects take the per-project advisory locks in one order. A group's members are read only when one of
 * its projects holds a value, so a group exit in an org without Agent Vault values costs one query.
 */
export const clearPersonalValuesInProjects = async (
  deps: TClearPersonalValuesInProjectsDeps,
  {
    projectIds,
    userIds = [],
    identityIds = [],
    groupIds = []
  }: { projectIds: string[]; userIds?: string[]; identityIds?: string[]; groupIds?: string[] },
  tx: Knex
) => {
  if (!projectIds.length || (!userIds.length && !identityIds.length && !groupIds.length)) return;

  const candidateProjectIds = groupIds.length
    ? await deps.agentVaultPersonalValueDAL.findProjectIdsWithAnyValues(projectIds, tx)
    : projectIds;
  if (!candidateProjectIds.length) return;

  const [groupUsers, groupIdentities] = groupIds.length
    ? await Promise.all([
        deps.userGroupMembershipDAL.find({ $in: { groupId: groupIds } }, { tx }),
        deps.identityGroupMembershipDAL.find({ $in: { groupId: groupIds } }, { tx })
      ])
    : [[], []];
  const actorUserIds = [...new Set([...userIds, ...groupUsers.map((row) => row.userId)])];
  const actorIdentityIds = [...new Set([...identityIds, ...groupIdentities.map((row) => row.identityId)])];

  const valueProjectIds = await deps.agentVaultPersonalValueDAL.findProjectIdsWithValues(
    { projectIds: candidateProjectIds, userIds: actorUserIds, identityIds: actorIdentityIds },
    tx
  );
  for (const projectId of valueProjectIds) {
    // eslint-disable-next-line no-await-in-loop
    await clearPersonalValuesAfterRevoke(
      deps,
      { projectId, userIds: actorUserIds, identityIds: actorIdentityIds, groupIds: [] },
      tx
    );
  }
};

// Member-provided field lists are sets: the same fields in another order are the same setting.
export const sameMemberProvidedFields = (
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined
) => [...(a ?? [])].sort().join(",") === [...(b ?? [])].sort().join(",");
