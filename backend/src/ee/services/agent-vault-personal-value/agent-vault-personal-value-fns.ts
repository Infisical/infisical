import { Knex } from "knex";

import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { PgSqlLock } from "@app/keystore/keystore";

import { TAgentVaultPersonalValueDALFactory } from "./agent-vault-personal-value-dal";

export type TClearPersonalValuesDeps = {
  agentVaultPersonalValueDAL: Pick<TAgentVaultPersonalValueDALFactory, "deleteForActorsOutsideProject">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
};

/**
 * Leaving the project clears the values an actor saved in it, so joining again starts from nothing. A group's removal
 * reaches its members, and anyone still in the project another way, directly or through another group, keeps theirs.
 * Losing a role or a bundle keeps them: roles can't be evaluated in SQL, and resolve sends a value only for a service its
 * owner can use.
 *
 * Call it after the removal is written in `tx`. Cleanups in one project run one at a time, so of two removals that each
 * leave the other's membership in place, the second checks against the first once it has committed instead of both
 * skipping.
 */
export const clearPersonalValuesAfterLeaving = async (
  { agentVaultPersonalValueDAL, userGroupMembershipDAL, identityGroupMembershipDAL }: TClearPersonalValuesDeps,
  {
    projectId,
    userIds = [],
    identityIds = [],
    groupIds = []
  }: {
    projectId: string;
    userIds?: string[];
    identityIds?: string[];
    groupIds?: string[];
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

  return agentVaultPersonalValueDAL.deleteForActorsOutsideProject(
    {
      projectId,
      userIds: [...new Set([...userIds, ...groupUsers.map((row) => row.userId)])],
      identityIds: [...new Set([...identityIds, ...groupIdentities.map((row) => row.identityId)])]
    },
    tx
  );
};

export type TClearPersonalValuesInProjectsDeps = Omit<TClearPersonalValuesDeps, "agentVaultPersonalValueDAL"> & {
  agentVaultPersonalValueDAL: Pick<
    TAgentVaultPersonalValueDALFactory,
    "deleteForActorsOutsideProject" | "findProjectIdsWithValues" | "findProjectIdsWithAnyValues"
  >;
};

/**
 * `clearPersonalValuesAfterLeaving`, run only in the projects among `projectIds` where these actors
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
    await clearPersonalValuesAfterLeaving(
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
