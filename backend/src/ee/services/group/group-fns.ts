import { Knex } from "knex";

import { AccessScope, ProjectVersion, SecretKeyEncoding, TableName, TUsers } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError, ScimRequestError } from "@app/lib/errors";

import {
  TAddIdentitiesToGroup,
  TAddUsersToGroup,
  TAddUsersToGroupByUserIds,
  TConvertPendingGroupAdditionsToGroupMemberships,
  TRemoveIdentitiesFromGroup,
  TRemoveUsersFromGroupByUserIds
} from "./group-types";

const addAcceptedUsersToGroup = async ({
  userIds,
  group,
  userGroupMembershipDAL,
  userDAL,
  membershipGroupDAL,
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
        await membershipGroupDAL.find(
          {
            actorGroupId: group.id,
            scopeOrgId: group.orgId,
            scope: AccessScope.Project
          },
          { tx }
        )
      ).map((gp) => gp.scopeProjectId as string)
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
    const project = await projectDAL.findById(projectId, tx);
    if (!project) {
      throw new NotFoundError({
        message: `Failed to find project with ID '${projectId}'`
      });
    }

    if (project.version !== ProjectVersion.V1 && project.version !== ProjectVersion.V2) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const usersToAddProjectKeyFor = users.filter((u) => !userKeysSet.has(`${projectId}-${u.userId}`));

    if (usersToAddProjectKeyFor.length) {
      // there are users who need to be shared keys
      // process adding bulk users to projects for each project individually
      const ghostUser = await projectDAL.findProjectGhostUser(projectId, tx);

      if (!ghostUser) {
        throw new NotFoundError({
          message: `Failed to find project owner of project with ID '${projectId}'`
        });
      }

      const ghostUserLatestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.id, projectId, tx);

      if (!ghostUserLatestKey) {
        throw new NotFoundError({
          message: `Failed to find project owner's latest key in project with ID '${projectId}'`
        });
      }

      if (!ghostUserLatestKey.sender.publicKey) {
        throw new NotFoundError({
          message: `Failed to find project owner's public key in project with ID '${projectId}'`
        });
      }

      const bot = await projectBotDAL.findOne({ projectId }, tx);

      if (!bot) {
        throw new NotFoundError({
          message: `Failed to find project bot in project with ID '${projectId}'`
        });
      }

      const botPrivateKey = crypto
        .encryption()
        .symmetric()
        .decryptWithRootEncryptionKey({
          keyEncoding: bot.keyEncoding as SecretKeyEncoding,
          iv: bot.iv,
          tag: bot.tag,
          ciphertext: bot.encryptedPrivateKey
        });

      const plaintextProjectKey = crypto.encryption().asymmetric().decrypt({
        ciphertext: ghostUserLatestKey.encryptedKey,
        nonce: ghostUserLatestKey.nonce,
        publicKey: ghostUserLatestKey.sender.publicKey,
        privateKey: botPrivateKey
      });

      const projectKeysToAdd = usersToAddProjectKeyFor.map((user) => {
        if (!user.publicKey) {
          throw new NotFoundError({
            message: `Failed to find user's public key in project with ID '${projectId}'`
          });
        }

        const { ciphertext: encryptedKey, nonce } = crypto
          .encryption()
          .asymmetric()
          .encrypt(plaintextProjectKey, user.publicKey, botPrivateKey);
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
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  tx: outerTx,
  membershipGroupDAL
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
        [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: group.orgId,
        scope: AccessScope.Organization,
        $in: {
          [`${TableName.Membership}.actorUserId` as "actorUserId"]: userIds
        }
      },
      { tx }
    );

    const existingUserOrgMembershipsUserIdsSet = new Set(
      existingUserOrgMemberships.map((u) => u.actorUserId as string)
    );

    userIds.forEach((userId) => {
      if (!existingUserOrgMembershipsUserIdsSet.has(userId))
        throw new ForbiddenRequestError({
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
        membershipGroupDAL,
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
 * Add identities with identity ids [identityIds] to group [group].
 * @param {group} group - group to add identity(s) to
 * @param {string[]} identityIds - id(s) of organization scoped identity(s) to add to group
 * @returns {Promise<{ id: string }[]>} - id(s) of added identity(s)
 */
export const addIdentitiesToGroup = async ({
  group,
  identityIds,
  identityDAL,
  identityGroupMembershipDAL,
  membershipDAL
}: TAddIdentitiesToGroup) => {
  const identityIdsSet = new Set(identityIds);
  const identityIdsArray = Array.from(identityIdsSet);

  // ensure all identities exist and belong to the org via org scoped membership
  const foundIdentitiesMemberships = await membershipDAL.find({
    scope: AccessScope.Organization,
    scopeOrgId: group.orgId,
    $in: {
      actorIdentityId: identityIdsArray
    }
  });

  const existingIdentityOrgMembershipsIdentityIdsSet = new Set(
    foundIdentitiesMemberships.map((u) => u.actorIdentityId as string)
  );

  identityIdsArray.forEach((identityId) => {
    if (!existingIdentityOrgMembershipsIdentityIdsSet.has(identityId)) {
      throw new ForbiddenRequestError({
        message: `Identity with id ${identityId} is not part of the organization`
      });
    }
  });

  // check if identity group membership already exists
  const existingIdentityGroupMemberships = await identityGroupMembershipDAL.find({
    groupId: group.id,
    $in: {
      identityId: identityIdsArray
    }
  });

  if (existingIdentityGroupMemberships.length) {
    throw new BadRequestError({
      message: `${identityIdsArray.length > 1 ? `Identities are` : `Identity is`} already part of the group ${group.slug}`
    });
  }

  return identityDAL.transaction(async (tx) => {
    await identityGroupMembershipDAL.insertMany(
      foundIdentitiesMemberships.map((membership) => ({
        identityId: membership.actorIdentityId as string,
        groupId: group.id
      })),
      tx
    );

    return identityIdsArray.map((identityId) => ({ id: identityId }));
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
  projectKeyDAL,
  tx: outerTx,
  membershipGroupDAL
}: TRemoveUsersFromGroupByUserIds) => {
  const processRemoval = async (tx: Knex) => {
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
        throw new ForbiddenRequestError({
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
      // check which projects the group is part of
      const projectIds = Array.from(
        new Set(
          (
            await membershipGroupDAL.find(
              {
                scope: AccessScope.Project,
                actorGroupId: group.id,
                scopeOrgId: group.orgId
              },
              { tx }
            )
          ).map((gp) => gp.scopeProjectId as string)
        )
      );

      for await (const userId of membersToRemoveFromGroupNonPending.map((m) => m.id)) {
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
 * Remove identities with identity ids [identityIds] from group [group].
 * @param {group} group - group to remove identity(s) from
 * @param {string[]} identityIds - id(s) of identity(s) to remove from group
 * @returns {Promise<{ id: string }[]>} - id(s) of removed identity(s)
 */
export const removeIdentitiesFromGroup = async ({
  group,
  identityIds,
  identityDAL,
  membershipDAL,
  identityGroupMembershipDAL
}: TRemoveIdentitiesFromGroup) => {
  const identityIdsSet = new Set(identityIds);
  const identityIdsArray = Array.from(identityIdsSet);

  // ensure all identities exist and belong to the org via org scoped membership
  const foundIdentitiesMemberships = await membershipDAL.find({
    scope: AccessScope.Organization,
    scopeOrgId: group.orgId,
    $in: {
      actorIdentityId: identityIdsArray
    }
  });

  const foundIdentitiesMembershipsIdentityIdsSet = new Set(
    foundIdentitiesMemberships.map((u) => u.actorIdentityId as string)
  );

  if (foundIdentitiesMembershipsIdentityIdsSet.size !== identityIdsArray.length) {
    throw new NotFoundError({
      message: `Machine identities not found`
    });
  }

  // check if identity group membership already exists
  const existingIdentityGroupMemberships = await identityGroupMembershipDAL.find({
    groupId: group.id,
    $in: {
      identityId: identityIdsArray
    }
  });

  const existingIdentityGroupMembershipsIdentityIdsSet = new Set(
    existingIdentityGroupMemberships.map((u) => u.identityId)
  );

  identityIdsArray.forEach((identityId) => {
    if (!existingIdentityGroupMembershipsIdentityIdsSet.has(identityId)) {
      throw new ForbiddenRequestError({
        message: `Machine identities are not part of the group ${group.slug}`
      });
    }
  });
  return identityDAL.transaction(async (tx) => {
    await identityGroupMembershipDAL.delete(
      {
        groupId: group.id,
        $in: {
          identityId: identityIdsArray
        }
      },
      tx
    );

    return identityIdsArray.map((identityId) => ({ id: identityId }));
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
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  tx: outerTx,
  membershipGroupDAL
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
        throw new NotFoundError({
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
        membershipGroupDAL,
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
