import { TAccessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import { BadRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { TApprovalPolicySecretEnvironmentDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { ApproverType } from "@app/services/approval-policy/approval-policy-enums";

type TSecretAccessApprovalPolicyExistsDep = {
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "findPolicyByEnvIdsAndSecretPath"
  >;
};

export const secretAccessApprovalPolicyExists = async (
  { envId, secretPath, excludePolicyId }: { envId: string; secretPath: string; excludePolicyId?: string },
  { accessApprovalPolicyDAL, approvalPolicySecretEnvironmentDAL }: TSecretAccessApprovalPolicyExistsDep
) => {
  const legacyPolicy = await accessApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath({ envIds: [envId], secretPath });
  if (legacyPolicy && legacyPolicy.id !== excludePolicyId) return true;

  const policy = await approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdsAndSecretPath({
    envIds: [envId],
    secretPath,
    excludePolicyId
  });
  return Boolean(policy);
};

// Legacy stores null on approver rows for a step with no approvalsRequired entry and reviews it as 1,
// so the top-level `approvals` must not leak into a step's requirement.
export const buildSecretAccessPolicySteps = <T extends { type: ApproverType; id: string; sequence: number }>(
  approvers: T[],
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[]
) => {
  const approvalsRequiredByStepNumber = groupBy(approvalsRequired || [], (i) => i.stepNumber);
  const approversBySequence = groupBy(approvers, (el) => el.sequence);
  return Object.keys(approversBySequence)
    .map(Number)
    .sort((a, b) => a - b)
    .map((sequence, index) => {
      const seen = new Set<string>();
      const stepApprovers = approversBySequence[sequence].filter((approver) => {
        const key = `${approver.type}:${approver.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const requiredApprovals = approvalsRequiredByStepNumber[sequence]?.[0]?.numberOfApprovals || 1;

      const hasGroupApprover = stepApprovers.some((approver) => approver.type === ApproverType.Group);
      if (!hasGroupApprover && requiredApprovals > stepApprovers.length) {
        throw new BadRequestError({
          message: `Step ${index + 1} requires ${requiredApprovals} approvals but only has ${stepApprovers.length} approver${stepApprovers.length === 1 ? "" : "s"}. Add approvers to the step or lower its required approvals.`
        });
      }

      return { requiredApprovals, approvers: stepApprovers };
    });
};
