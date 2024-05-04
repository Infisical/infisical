import { Knex } from "knex";

import { SecretKeyEncoding, TUsers } from "@app/db/schemas";
import { decryptAsymmetric, encryptAsymmetric, infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError, ScimRequestError } from "@app/lib/errors";

import {
  TAddUsersToGroup,
  TAddUsersToGroupByUserIds,
  TConvertPendingGroupAdditionsToGroupMemberships,
  TRemoveUsersFromGroupByUserIds
} from "./group-types";

const addAcceptedUsersToGroup = async ({
  userIds,
  group,
  userGroupMembershipDAL,
  userDAL,
  groupProjectDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  tx
}: TAddUsersToGroup) => {
  const users = await userDAL.findUserEncKeyByUserIdsBatch(
    {
      userIds
    },
    tx
  );

  await userGroupMembershipDAL.insertMany(
    users.map((user) => ({
      userId: user.userId,
      groupId: group.id,
      isPending: false
    })),
    tx
  );

  // check which projects the group is part of
  const projectIds = Array.from(
    new Set(
      (
        await groupProjectDAL.find(
          {
            groupId: group.id
          },
          { tx }
        )
      ).map((gp) => gp.projectId)
    )
  );

  const keys = await projectKeyDAL.find(
    {
      $in: {
        projectId: projectIds,
        receiverId: users.map((u) => u.id)
      }
    },
    { tx }
  );

  const userKeysSet = new Set(keys.map((k) => `${k.projectId}-${k.receiverId}`));

  for await (const projectId of projectIds) {
    const usersToAddProjectKeyFor = users.filter((u) => !userKeysSet.has(`${projectId}-${u.userId}`));

    if (usersToAddProjectKeyFor.length) {
      // there are users who need to be shared keys
      // process adding bulk users to projects for each project individually
      const ghostUser = await projectDAL.findProjectGhostUser(projectId, tx);

      if (!ghostUser) {
        throw new BadRequestError({
          message: "Failed to find sudo user"
        });
      }

      const ghostUserLatestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.id, projectId, tx);

      if (!ghostUserLatestKey) {
        throw new BadRequestError({
          message: "Failed to find sudo user latest key"
        });
      }

      const bot = await projectBotDAL.findOne({ projectId }, tx);

      if (!bot) {
        throw new BadRequestError({
          message: "Failed to find bot"
        });
      }

      const botPrivateKey = infisicalSymmetricDecrypt({
        keyEncoding: bot.keyEncoding as SecretKeyEncoding,
        iv: bot.iv,
        tag: bot.tag,
        ciphertext: bot.encryptedPrivateKey
      });

      const plaintextProjectKey = decryptAsymmetric({
        ciphertext: ghostUserLatestKey.encryptedKey,
        nonce: ghostUserLatestKey.nonce,
        publicKey: ghostUserLatestKey.sender.publicKey,
        privateKey: botPrivateKey
      });

      const projectKeysToAdd = usersToAddProjectKeyFor.map((user) => {
        const { ciphertext: encryptedKey, nonce } = encryptAsymmetric(
          plaintextProjectKey,
          user.publicKey,
          botPrivateKey
        );
        return {
          encryptedKey,
          nonce,
          senderId: ghostUser.id,
          receiverId: user.userId,
          projectId
        };
      });

      await projectKeyDAL.insertMany(projectKeysToAdd, tx);
    }
  }
};

/**
 * Add users with user ids [userIds] to group [group].
 * - Users may or may not have finished completing their accounts; this function will
 * handle both adding users to groups directly and via pending group additions.
 * @param {group} group - group to add user(s) to
 * @param {string[]} userIds - id(s) of user(s) to add to group
 */
export const addUsersToGroupByUserIds = async ({
  group,
  userIds,
  userDAL,
  userGroupMembershipDAL,
  orgDAL,
  groupProjectDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  tx: outerTx
}: TAddUsersToGroupByUserIds) => {
  const processAddition = async (tx: Knex) => {
    const foundMembers = await userDAL.find(
      {
        $in: {
          id: userIds
        }
      },
      { tx }
    );

    const foundMembersIdsSet = new Set(foundMembers.map((member) => member.id));

    const isCompleteMatch = userIds.every((userId) => foundMembersIdsSet.has(userId));

    if (!isCompleteMatch) {
      throw new ScimRequestError({
        detail: "Members not found",
        status: 404
      });
    }

    // check if user(s) group membership(s) already exists
    const existingUserGroupMemberships = await userGroupMembershipDAL.find(
      {
        groupId: group.id,
        $in: {
          userId: userIds
        }
      },
      { tx }
    );

    if (existingUserGroupMemberships.length) {
      throw new BadRequestError({
        message: `User(s) are already part of the group ${group.slug}`
      });
    }

    // check if all user(s) are part of the organization
    const existingUserOrgMemberships = await orgDAL.findMembership(
      {
        orgId: group.orgId,
        $in: {
          userId: userIds
        }
      },
      { tx }
    );

    const existingUserOrgMembershipsUserIdsSet = new Set(existingUserOrgMemberships.map((u) => u.userId));

    userIds.forEach((userId) => {
      if (!existingUserOrgMembershipsUserIdsSet.has(userId))
        throw new BadRequestError({
          message: `User with id ${userId} is not part of the organization`
        });
    });

    const membersToAddToGroupNonPending: TUsers[] = [];
    const membersToAddToGroupPending: TUsers[] = [];

    foundMembers.forEach((member) => {
      if (member.isAccepted) {
        // add accepted member to group
        membersToAddToGroupNonPending.push(member);
      } else {
        // add incomplete member to pending group addition
        membersToAddToGroupPending.push(member);
      }
    });

    if (membersToAddToGroupNonPending.length) {
      await addAcceptedUsersToGroup({
        userIds: membersToAddToGroupNonPending.map((member) => member.id),
        group,
        userDAL,
        userGroupMembershipDAL,
        groupProjectDAL,
        projectKeyDAL,
        projectDAL,
        projectBotDAL,
        tx
      });
    }

    if (membersToAddToGroupPending.length) {
      await userGroupMembershipDAL.insertMany(
        membersToAddToGroupPending.map((member) => ({
          userId: member.id,
          groupId: group.id,
          isPending: true
        })),
        tx
      );
    }

    return membersToAddToGroupNonPending.concat(membersToAddToGroupPending);
  };

  if (outerTx) {
    return processAddition(outerTx);
  }
  return userDAL.transaction(async (tx) => {
    return processAddition(tx);
  });
};

/**
 * Remove users with user ids [userIds] from group [group].
 * - Users may be part of the group (non-pending + pending);
 * this function will handle both cases.
 * @param {group} group - group to remove user(s) from
 * @param {string[]} userIds - id(s) of user(s) to remove from group
 */
export const removeUsersFromGroupByUserIds = async ({
  group,
  userIds,
  userDAL,
  userGroupMembershipDAL,
  accessApprovalRequestDAL,
  secretApprovalRequestDAL,
  secretApprovalPolicyDAL,
  groupProjectDAL,
  projectKeyDAL,
  tx: outerTx
}: TRemoveUsersFromGroupByUserIds) => {
  const processRemoval = async (tx: Knex) => {
    const foundMembers = await userDAL.find({
      $in: {
        id: userIds
      }
    });

    const foundMembersIdsSet = new Set(foundMembers.map((member) => member.id));

    const isCompleteMatch = userIds.every((userId) => foundMembersIdsSet.has(userId));

    if (!isCompleteMatch) {
      throw new ScimRequestError({
        detail: "Members not found",
        status: 404
      });
    }

    // check if user group membership already exists
    const existingUserGroupMemberships = await userGroupMembershipDAL.find(
      {
        groupId: group.id,
        $in: {
          userId: userIds
        }
      },
      { tx }
    );

    const existingUserGroupMembershipsUserIdsSet = new Set(existingUserGroupMemberships.map((u) => u.userId));

    userIds.forEach((userId) => {
      if (!existingUserGroupMembershipsUserIdsSet.has(userId))
        throw new BadRequestError({
          message: `User(s) are not part of the group ${group.slug}`
        });
    });

    const membersToRemoveFromGroupNonPending: TUsers[] = [];
    const membersToRemoveFromGroupPending: TUsers[] = [];

    foundMembers.forEach((member) => {
      if (member.isAccepted) {
        // remove accepted member from group
        membersToRemoveFromGroupNonPending.push(member);
      } else {
        // remove incomplete member from pending group addition
        membersToRemoveFromGroupPending.push(member);
      }
    });

    if (membersToRemoveFromGroupNonPending.length) {
      const groupProjectMemberships = await groupProjectDAL.find(
        {
          groupId: group.id
        },
        { tx }
      );

      // check which projects the group is part of
      const projectIds = Array.from(new Set(groupProjectMemberships.map((gp) => gp.projectId)));

      // TODO: this part can be optimized
      for await (const userId of userIds) {
        const t = await userGroupMembershipDAL.filterProjectsByUserMembership(userId, group.id, projectIds, tx);
        const projectsToDeleteKeyFor = projectIds.filter((p) => !t.has(p));

        if (projectsToDeleteKeyFor.length) {
          await projectKeyDAL.delete(
            {
              receiverId: userId,
              $in: {
                projectId: projectsToDeleteKeyFor
              }
            },
            tx
          );
        }

        await accessApprovalRequestDAL.delete(
          {
            $in: {
              groupMembershipId: groupProjectMemberships
                .filter((gp) => projectsToDeleteKeyFor.includes(gp.projectId))
                .map((gp) => gp.id)
            },
            requestedByUserId: userId
          },
          tx
        );

        const projectSecretApprovalPolicies = await secretApprovalPolicyDAL.findByProjectIds(projectIds);
        await secretApprovalRequestDAL.delete(
          {
            committerUserId: userId,
            $in: {
              policyId: projectSecretApprovalPolicies.map((p) => p.id)
            }
          },
          tx
        );

        await userGroupMembershipDAL.delete(
          {
            groupId: group.id,
            $in: {
              userId: membersToRemoveFromGroupNonPending.map((member) => member.id)
            }
          },
          tx
        );
      }
    }

    if (membersToRemoveFromGroupPending.length) {
      await userGroupMembershipDAL.delete(
        {
          groupId: group.id,
          $in: {
            userId: membersToRemoveFromGroupPending.map((member) => member.id)
          }
        },
        tx
      );
    }

    return membersToRemoveFromGroupNonPending.concat(membersToRemoveFromGroupPending);
  };

  if (outerTx) {
    return processRemoval(outerTx);
  }
  return userDAL.transaction(async (tx) => {
    return processRemoval(tx);
  });
};

/**
 * Convert pending group additions for users with ids [userIds] to group memberships.
 * @param {string[]} userIds - id(s) of user(s) to try to convert pending group additions to group memberships
 */
export const convertPendingGroupAdditionsToGroupMemberships = async ({
  userIds,
  userDAL,
  userGroupMembershipDAL,
  groupProjectDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  tx: outerTx
}: TConvertPendingGroupAdditionsToGroupMemberships) => {
  const processConversion = async (tx: Knex) => {
    const users = await userDAL.find(
      {
        $in: {
          id: userIds
        }
      },
      { tx }
    );

    const usersUserIdsSet = new Set(users.map((u) => u.id));
    userIds.forEach((userId) => {
      if (!usersUserIdsSet.has(userId)) {
        throw new BadRequestError({
          message: `Failed to find user with id ${userId}`
        });
      }
    });

    users.forEach((user) => {
      if (!user.isAccepted) {
        throw new BadRequestError({
          message: `Failed to convert pending group additions to group memberships for user ${user.username} because they have not confirmed their account`
        });
      }
    });

    const pendingGroupAdditions = await userGroupMembershipDAL.deletePendingUserGroupMembershipsByUserIds(userIds, tx);

    for await (const pendingGroupAddition of pendingGroupAdditions) {
      await addAcceptedUsersToGroup({
        userIds: [pendingGroupAddition.user.id],
        group: pendingGroupAddition.group,
        userDAL,
        userGroupMembershipDAL,
        groupProjectDAL,
        projectKeyDAL,
        projectDAL,
        projectBotDAL,
        tx
      });
    }
  };

  if (outerTx) {
    return processConversion(outerTx);
  }
  return userDAL.transaction(async (tx) => {
    await processConversion(tx);
  });
};
