import { BadRequestError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TApprovalPolicyMembershipVerifierFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
};

// Shared between access-approval-policy and secret-approval-policy services to verify that the users/groups
// referenced by a policy (approvers, bypassers) are actually members of the project the policy belongs to.
export const approvalPolicyMembershipVerifierFactory = ({
  projectDAL
}: TApprovalPolicyMembershipVerifierFactoryDep) => {
  const verifyProjectSubjectsMembership = async ({
    userIds,
    groupIds,
    orgId,
    projectId
  }: {
    userIds: string[];
    groupIds: string[];
    orgId: string;
    projectId: string;
  }) => {
    const uniqueUserIds = [...new Set(userIds)];
    const uniqueGroupIds = [...new Set(groupIds)];
    if (uniqueUserIds.length === 0 && uniqueGroupIds.length === 0) {
      throw new BadRequestError({
        message: "At least one user or group must be provided for approval policy"
      });
    }
    const { effectiveUserIds, effectiveGroupIds } = await projectDAL.findEffectiveProjectSubjectsMembership({
      orgId,
      projectId,
      userIds: uniqueUserIds,
      groupIds: uniqueGroupIds
    });
    const projectMemberUserIds = new Set(effectiveUserIds);
    const userIdsWithoutAccess = uniqueUserIds.filter((id) => !projectMemberUserIds.has(id));
    const projectGroupIds = new Set(effectiveGroupIds);
    const groupIdsNotInProject = uniqueGroupIds.filter((id) => !projectGroupIds.has(id));

    if (userIdsWithoutAccess.length) {
      throw new BadRequestError({
        message: `Some users are not members of the project: ${userIdsWithoutAccess.join(", ")}`
      });
    }

    if (groupIdsNotInProject.length) {
      throw new BadRequestError({
        message: `Some groups are not members of the project: ${groupIdsNotInProject.join(", ")}`
      });
    }
  };

  return { verifyProjectSubjectsMembership };
};
