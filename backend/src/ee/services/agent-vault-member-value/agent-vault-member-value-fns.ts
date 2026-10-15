import { Knex } from "knex";

import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";

import { TAgentVaultMemberValueDALFactory } from "./agent-vault-member-value-dal";

export type TClearMemberValuesDeps = {
  agentVaultMemberValueDAL: Pick<TAgentVaultMemberValueDALFactory, "deleteForActorsWithoutGrant">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
};

/**
 * Losing a bundle clears the values an actor saved for its services, so a later grant starts from nothing. A
 * group's revoke reaches its members, and anyone who still holds the bundle another way keeps theirs. Without
 * `accessBundleId` this covers every bundle in the project, for an actor leaving Agent Vault.
 */
export const clearMemberValuesAfterRevoke = async (
  { agentVaultMemberValueDAL, userGroupMembershipDAL, identityGroupMembershipDAL }: TClearMemberValuesDeps,
  {
    projectId,
    accessBundleId,
    userIds,
    identityIds,
    groupIds
  }: { projectId: string; accessBundleId?: string; userIds: string[]; identityIds: string[]; groupIds: string[] },
  tx: Knex
) => {
  const [groupUsers, groupIdentities] = groupIds.length
    ? await Promise.all([
        userGroupMembershipDAL.find({ $in: { groupId: groupIds } }, { tx }),
        identityGroupMembershipDAL.find({ $in: { groupId: groupIds } }, { tx })
      ])
    : [[], []];

  return agentVaultMemberValueDAL.deleteForActorsWithoutGrant(
    {
      projectId,
      accessBundleId,
      userIds: [...new Set([...userIds, ...groupUsers.map((row) => row.userId)])],
      identityIds: [...new Set([...identityIds, ...groupIdentities.map((row) => row.identityId)])]
    },
    tx
  );
};
