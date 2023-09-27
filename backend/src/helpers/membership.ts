import { Types } from "mongoose";
import { Key, Membership } from "../models";
import { BadRequestError, MembershipNotFoundError } from "../utils/errors";

/**
 * Validate that user with id [userId] is a member of workspace with id [workspaceId]
 * and has at least one of the roles in [acceptedRoles]
 * @param {Object} obj
 * @param {String} obj.userId - id of user to validate
 * @param {String} obj.workspaceId - id of workspace
 * @returns {Membership} membership - membership of user with id [userId] for workspace with id [workspaceId]
 */
export const validateMembership = async ({
  userId,
  workspaceId,
  acceptedRoles
}: {
  userId: Types.ObjectId | string;
  workspaceId: Types.ObjectId | string;
  acceptedRoles?: Array<"admin" | "member" | "custom" | "viewer">;
}) => {
  const membership = await Membership.findOne({
    user: userId,
    workspace: workspaceId
  }).populate("workspace");

  if (!membership) {
    throw MembershipNotFoundError({
      message: "Failed to find workspace membership"
    });
  }

  if (acceptedRoles) {
    if (!acceptedRoles.includes(membership.role)) {
      throw BadRequestError({
        message: "Failed authorization for membership role"
      });
    }
  }

  return membership;
};

/**
 * Return membership matching criteria specified in query [queryObj]
 * @param {Object} queryObj - query object
 * @return {Object} membership - membership
 */
export const findMembership = async (queryObj: any) => {
  const membership = await Membership.findOne(queryObj);
  return membership;
};

/**
 * Add memberships for users with ids [userIds] to workspace with
 * id [workspaceId]
 * @param {Object} obj
 * @param {String[]} obj.userIds - id of users.
 * @param {String} obj.workspaceId - id of workspace.
 * @param {String[]} obj.roles - roles of users.
 */
export const addMemberships = async ({
  userIds,
  workspaceId,
  roles
}: {
  userIds: string[];
  workspaceId: string;
  roles: string[];
}): Promise<void> => {
  const operations = userIds.map((userId, idx) => {
    return {
      updateOne: {
        filter: {
          user: userId,
          workspace: workspaceId,
          role: roles[idx]
        },
        update: {
          user: userId,
          workspace: workspaceId,
          role: roles[idx]
        },
        upsert: true
      }
    };
  });
  await Membership.bulkWrite(operations as any);
};

/**
 * Delete membership with id [membershipId]
 * @param {Object} obj
 * @param {String} obj.membershipId - id of membership to delete
 */
export const deleteMembership = async ({ membershipId }: { membershipId: string }) => {
  const deletedMembership = await Membership.findOneAndDelete({
    _id: membershipId
  });

  // delete keys associated with the membership
  if (deletedMembership?.user) {
    // case: membership had a registered user
    await Key.deleteMany({
      receiver: deletedMembership.user,
      workspace: deletedMembership.workspace
    });
  }

  return deletedMembership;
};
