import { Knex } from "knex";

import { SecretKeyEncoding, TUsers } from "@app/db/schemas";
import { decryptAsymmetric, encryptAsymmetric, infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError, ScimRequestError } from "@app/lib/errors";

import {
  TAddUsersToGroupByUserIds,
  TAddUsersToGroupDirectly,
  TAddUsersToPendingGroupAdditions,
  TConvertPendingGroupAdditionsToGroupMemberships,
  TRemoveUsersFromGroupByUserIds,
  TRemoveUsersFromGroupDirectly,
  TRemoveUsersFromPendingGroupAdditions
} from "./group-types";

/**
 * Add users with usernames [usernames] to group [group] directly.
 * - Users must have finished completing their account and have private key(s).
 * @param {group} group - group to add user(s) to
 * @param {string[]} usernames - username(s) of user(s) to add to group
 */
export const addUsersToGroupDirectly = async ({
  group,
  usernames,
  userDAL,
  userGroupMembershipDAL,
  orgDAL,
  groupProjectDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  tx: outerTx
}: TAddUsersToGroupDirectly) => {
  const processAddition = async (tx: Knex) => {
    const users = await userDAL.findUserEncKeyByUsernameBatch(
      {
        usernames
      },
      tx
    );

    const usersUsernamesSet = new Set(users.map((u) => u.username));
    usernames.forEach((username) => {
      if (!usersUsernamesSet.has(username)) {
        throw new BadRequestError({
          message: `Failed to find user with username ${username}`
        });
      }
    });

    const userIds = users.map((u) => {
      if (!u.isAccepted) {
        throw new BadRequestError({
          message: `User ${u.username} cannot be added to group because they have not confirmed their account`
        });
      }

      return u.userId;
    });

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

    const existingUserOrgMembershipsUsernamesSet = new Set(existingUserOrgMemberships.map((u) => u.username));

    usernames.forEach((username) => {
      if (!existingUserOrgMembershipsUsernamesSet.has(username))
        throw new BadRequestError({
          message: `User ${username} is not part of the organization`
        });
    });

    await userGroupMembershipDAL.insertMany(
      userIds.map((userId) => ({
        userId,
        groupId: group.id
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
          receiverId: userIds
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

    return users;
  };

  if (outerTx) {
    return processAddition(outerTx);
  }
  return userDAL.transaction(async (tx) => {
    return processAddition(tx);
  });
};

/**
 * Add users with user ids [userIds] to group [group] via pending group additions.
 * - Users must have not finished completing their accounts (i.e. they don't have private key(s) yet).
 * @param {group} group - group to add user(s) to
 * @param {string[]} userIds - id(s) of user(s) to add to group
 */
export const addUsersToPendingGroupAdditions = async ({
  group,
  userIds,
  pendingGroupAdditionDAL,
  userDAL,
  orgDAL,
  tx: outerTx
}: TAddUsersToPendingGroupAdditions) => {
  const processAddition = async (tx: Knex) => {
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

    users.map((u) => {
      if (u.isAccepted) {
        throw new BadRequestError({
          message: `User ${u.username} cannot be added to a pending group addition because they have confirmed their account`
        });
      }

      return u.id;
    });

    // check if user(s) pending group addition(s) already exist
    const existingPendingGroupAdditions = await pendingGroupAdditionDAL.find(
      {
        groupId: group.id,
        $in: {
          userId: userIds
        }
      },
      { tx }
    );

    if (existingPendingGroupAdditions.length) {
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

    await pendingGroupAdditionDAL.insertMany(
      users.map((user) => ({
        userId: user.id,
        groupId: group.id
      })),
      tx
    );

    return users;
  };

  if (outerTx) {
    return processAddition(outerTx);
  }
  return userDAL.transaction(async (tx) => {
    return processAddition(tx);
  });
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
  pendingGroupAdditionDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  tx: outerTx
}: TAddUsersToGroupByUserIds) => {
  const processAddition = async (tx: Knex) => {
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

    const membersToAddToGroupDirectly: TUsers[] = [];
    const membersToAddToGroupPending: TUsers[] = [];

    foundMembers.forEach((member) => {
      if (member.isAccepted) {
        // add accepted member to group
        membersToAddToGroupDirectly.push(member);
      } else {
        // add incomplete member to pending group addition
        membersToAddToGroupPending.push(member);
      }
    });

    let addedUsers: TUsers[] = [];

    if (membersToAddToGroupDirectly.length) {
      addedUsers = addedUsers.concat(
        await addUsersToGroupDirectly({
          group,
          usernames: membersToAddToGroupDirectly.map((member) => member.username),
          userDAL,
          userGroupMembershipDAL,
          orgDAL,
          groupProjectDAL,
          projectKeyDAL,
          projectDAL,
          projectBotDAL,
          tx
        })
      );
    }

    if (membersToAddToGroupPending.length) {
      addedUsers = addedUsers.concat(
        await addUsersToPendingGroupAdditions({
          group,
          userIds: membersToAddToGroupPending.map((member) => member.id),
          pendingGroupAdditionDAL,
          userDAL,
          orgDAL,
          tx
        })
      );
    }

    return addedUsers;
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
 * - Users must be directly added to the group.
 * @param {group} group - group to remove user(s) from
 * @param {string[]} userIds - id(s) of user(s) to remove from group
 */
export const removeUsersFromGroupDirectly = async ({
  group,
  userIds,
  userDAL,
  userGroupMembershipDAL,
  groupProjectDAL,
  projectKeyDAL,
  tx: outerTx
}: TRemoveUsersFromGroupDirectly) => {
  const processRemoval = async (tx: Knex) => {
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

      await userGroupMembershipDAL.delete(
        {
          groupId: group.id,
          userId
        },
        tx
      );
    }

    return users;
  };

  if (outerTx) {
    return processRemoval(outerTx);
  }
  return userDAL.transaction(async (tx) => {
    return processRemoval(tx);
  });
};

/**
 * Remove users with user ids [userIds] from group [group] via pending group additions.
 * - Users must have pending group additions to the group.
 * @param {group} group - group to remove user(s) from
 * @param {string[]} userIds - id(s) of user(s) to remove from group
 */
export const removeUsersFromPendingGroupAdditions = async ({
  group,
  userIds,
  userDAL,
  pendingGroupAdditionDAL,
  tx: outerTx
}: TRemoveUsersFromPendingGroupAdditions) => {
  const processRemoval = async (tx: Knex) => {
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

    // check if user pending group addition already exists
    const existingPendingGroupAdditions = await pendingGroupAdditionDAL.find(
      {
        groupId: group.id,
        $in: {
          userId: userIds
        }
      },
      { tx }
    );

    const existingPendingGroupAdditionsUserIdsSet = new Set(existingPendingGroupAdditions.map((u) => u.userId));

    userIds.forEach((userId) => {
      if (!existingPendingGroupAdditionsUserIdsSet.has(userId))
        throw new BadRequestError({
          message: `User(s) are not part of the group ${group.slug}`
        });
    });

    await pendingGroupAdditionDAL.delete(
      {
        groupId: group.id,
        $in: {
          userId: userIds
        }
      },
      tx
    );

    return users;
  };

  if (outerTx) {
    return processRemoval(outerTx);
  }
  return userDAL.transaction(async (tx) => {
    return processRemoval(tx);
  });
};

/**
 * Remove users with user ids [userIds] from group [group].
 * - Users may be part of the group directly or via pending group additions;
 * this function will handle both cases.
 * @param {group} group - group to remove user(s) from
 * @param {string[]} userIds - id(s) of user(s) to remove from group
 */
export const removeUsersFromGroupByUserIds = async ({
  group,
  userIds,
  userDAL,
  userGroupMembershipDAL,
  groupProjectDAL,
  pendingGroupAdditionDAL,
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

    const membersToRemoveFromGroupDirectly: TUsers[] = [];
    const membersToRemoveFromGroupPending: TUsers[] = [];

    foundMembers.forEach((member) => {
      if (member.isAccepted) {
        // remove accepted member from group
        membersToRemoveFromGroupDirectly.push(member);
      } else {
        // remove incomplete member from pending group addition
        membersToRemoveFromGroupPending.push(member);
      }
    });

    let removedUsers: TUsers[] = [];

    if (membersToRemoveFromGroupDirectly.length) {
      removedUsers = removedUsers.concat(
        await removeUsersFromGroupDirectly({
          group,
          userIds: membersToRemoveFromGroupDirectly.map((member) => member.id),
          userDAL,
          userGroupMembershipDAL,
          groupProjectDAL,
          projectKeyDAL,
          tx
        })
      );
    }

    if (membersToRemoveFromGroupPending.length) {
      removedUsers = removedUsers.concat(
        await removeUsersFromPendingGroupAdditions({
          group,
          userIds: membersToRemoveFromGroupPending.map((member) => member.id),
          pendingGroupAdditionDAL,
          userDAL,
          tx
        })
      );
    }

    return removedUsers;
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
  pendingGroupAdditionDAL,
  userGroupMembershipDAL,
  orgDAL,
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

    const pendingGroupAdditions = await pendingGroupAdditionDAL.deletePendingGroupAdditionsByUserIds(userIds, tx);

    for await (const pendingGroupAddition of pendingGroupAdditions) {
      await addUsersToGroupDirectly({
        group: pendingGroupAddition.group,
        usernames: [pendingGroupAddition.user.username],
        userDAL,
        userGroupMembershipDAL,
        orgDAL,
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
