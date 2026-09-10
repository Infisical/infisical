import { BadRequestError } from "@app/lib/errors";
import { EnforcementLevel } from "@app/lib/types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TExternalApprovalPolicyInput } from "../external-approval/external-approval-types";
import {
  TAccessApprovalPolicyExternalApproval,
  TUpdateAccessApprovalPolicy
} from "./access-approval-policy-types";

export const validateExternalPolicyBypassConfig = ({
  bypassers,
  enforcementLevel
}: Pick<TUpdateAccessApprovalPolicy, "bypassers" | "enforcementLevel">) => {
  if (bypassers?.length) {
    throw new BadRequestError({
      message:
        "Bypassers cannot be set on a policy reviewed by an external approval system. Remove the bypassers, or remove the external approval configuration."
    });
  }

  if (enforcementLevel === EnforcementLevel.Soft) {
    throw new BadRequestError({
      message:
        "Soft enforcement cannot be set on a policy reviewed by an external approval system, because its requests cannot be reviewed in Infisical. Use hard enforcement, or remove the external approval configuration."
    });
  }
};

export const validateExternalPolicyPendingRequests = async ({
  policy,
  externalApproval,
  countPendingExternalRequestsByPolicyId
}: {
  policy: {
    id: string;
    name: string;
    externalApprovalPolicyId?: string | null;
    externalApproval: TAccessApprovalPolicyExternalApproval | null;
  };
  externalApproval?: TExternalApprovalPolicyInput | null;
  countPendingExternalRequestsByPolicyId: (policyId: string) => Promise<number>;
}) => {
  const currentExternalApproval = policy.externalApproval;
  const isDetachingExternalApproval =
    externalApproval === null && Boolean(policy.externalApprovalPolicyId);
  const isReroutingExternalApproval = Boolean(
    externalApproval &&
      currentExternalApproval &&
      (currentExternalApproval.type !== externalApproval.type ||
        currentExternalApproval.connectionId !== externalApproval.connectionId ||
        (currentExternalApproval.approverIdentityId ?? null) !== (externalApproval.approverIdentityId ?? null))
  );

  if (!isDetachingExternalApproval && !isReroutingExternalApproval) {
    return;
  }

  const pendingExternalRequests = await countPendingExternalRequestsByPolicyId(policy.id);

  if (pendingExternalRequests > 0) {
    throw new BadRequestError({
      message: isDetachingExternalApproval
        ? `Policy '${policy.name}' has ${pendingExternalRequests} access request(s) still awaiting a decision from its external approval system. Approve or reject them there before switching this policy back to Infisical approvals.`
        : `Policy '${policy.name}' has ${pendingExternalRequests} access request(s) still awaiting a decision from its external approval system. Approve or reject them there before changing the approval service, app connection, or approver identity.`
    });
  }
};

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
