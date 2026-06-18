import { BadRequestError } from "@app/lib/errors";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";

import { TUserGroupMembershipDALFactory } from "../group/user-group-membership-dal";

type TApprovalPolicyMembershipVerifierFactoryDep = {
  projectMembershipDAL: Pick<
    TProjectMembershipDALFactory,
    "findProjectMembershipsByUserIds" | "findProjectMembershipsByGroupIds"
  >;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "findUserGroupMembershipsInProjectByUserIds">;
};

// Shared between access-approval-policy and secret-approval-policy services to verify that the users/groups
// referenced by a policy (approvers, bypassers) are actually members of the project the policy belongs to.
export const approvalPolicyMembershipVerifierFactory = ({
  projectMembershipDAL,
  userGroupMembershipDAL
}: TApprovalPolicyMembershipVerifierFactoryDep) => {
  const verifyProjectUserMembership = async (userIds: string[], orgId: string, projectId: string) => {
    if (userIds.length === 0) return;
    const projectMemberships = (await projectMembershipDAL.findProjectMembershipsByUserIds(orgId, userIds)).filter(
      (v) => v.projectId === projectId
    );

    if (projectMemberships.length !== userIds.length) {
      const projectMemberUserIds = new Set(projectMemberships.map((member) => member.userId));
      const userIdsNotInProject = userIds.filter((id) => !projectMemberUserIds.has(id));

      // Users not added to the project directly may still be members through a group.
      const userIdsWithGroupAccess = new Set(
        await userGroupMembershipDAL.findUserGroupMembershipsInProjectByUserIds(userIdsNotInProject, projectId)
      );
      const userIdsWithoutAccess = userIdsNotInProject.filter((id) => !userIdsWithGroupAccess.has(id));

      if (userIdsWithoutAccess.length) {
        throw new BadRequestError({
          message: `Some users are not members of the project: ${userIdsWithoutAccess.join(", ")}`
        });
      }
    }
  };

  const verifyProjectGroupMembership = async (groupIds: string[], orgId: string, projectId: string) => {
    if (groupIds.length === 0) return;
    const projectMemberships = (await projectMembershipDAL.findProjectMembershipsByGroupIds(orgId, groupIds)).filter(
      (v) => v.projectId === projectId
    );

    const projectGroupIds = new Set(projectMemberships.map((member) => member.groupId));
    const groupIdsNotInProject = groupIds.filter((id) => !projectGroupIds.has(id));
    if (groupIdsNotInProject.length) {
      throw new BadRequestError({
        message: `Some groups are not members of the project: ${groupIdsNotInProject.join(", ")}`
      });
    }
  };

  return { verifyProjectUserMembership, verifyProjectGroupMembership };
};
