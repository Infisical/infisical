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
 * Losing a bundle clears the values an actor saved for its services, so a later grant starts from nothing. A
 * group's revoke reaches its members, and anyone who still holds the bundle another way keeps theirs. Without
 * `accessBundleId` this covers every bundle in the project, for an actor leaving Agent Vault.
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
    userIds,
    identityIds,
    groupIds
  }: { projectId: string; accessBundleId?: string; userIds: string[]; identityIds: string[]; groupIds: string[] },
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
      userIds: [...new Set([...userIds, ...groupUsers.map((row) => row.userId)])],
      identityIds: [...new Set([...identityIds, ...groupIdentities.map((row) => row.identityId)])]
    },
    tx
  );
};

// Member-provided field lists are sets: the same fields in another order are the same setting.
export const sameMemberProvidedFields = (
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined
) => [...(a ?? [])].sort().join(",") === [...(b ?? [])].sort().join(",");
