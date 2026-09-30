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

export type TApproverChangeMetrics = {
  approversChanged: boolean;
  approversCountBefore: number;
  approversCountAfter: number;
};

// Shared between access-approval-policy and secret-approval-policy services. Pure diff of two sets of
// approver keys (e.g. `group:<id>` / `user:<id>`), kept outside the update services so a future caller of
// those services isn't forced to pay for this computation, and so the returned policy resource stays free
// of telemetry-only fields.
export const computeApproverChangeMetrics = (
  beforeKeys: Set<string>,
  afterKeys: Set<string>
): TApproverChangeMetrics => {
  const approversChanged = beforeKeys.size !== afterKeys.size || [...beforeKeys].some((key) => !afterKeys.has(key));

  return {
    approversChanged,
    approversCountBefore: beforeKeys.size,
    approversCountAfter: afterKeys.size
  };
};
