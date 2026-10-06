import { Knex } from "knex";

import { TAccessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import { BadRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TApprovalPolicySecretEnvironmentDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalRequestGrantStatus, ApproverType } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequestGrantsDALFactory } from "@app/services/approval-policy/approval-request-dal";

type TSecretAccessApprovalGlobalPolicyExistsDep = {
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "findPolicyByEnvIdsAndSecretPath"
  >;
};

export const secretAccessApprovalGlobalPolicyExists = async (
  { envIds, secretPath, excludePolicyId }: { envIds: string[]; secretPath: string; excludePolicyId?: string },
  { accessApprovalPolicyDAL, approvalPolicySecretEnvironmentDAL }: TSecretAccessApprovalGlobalPolicyExistsDep,
  tx?: Knex
) => {
  const legacyPolicy = await accessApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath(
    { envIds, secretPath, excludePolicyId },
    tx
  );
  if (legacyPolicy) return legacyPolicy.environments[0]?.id ?? envIds[0];

  const policy = await approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdsAndSecretPath(
    {
      envIds,
      secretPath,
      excludePolicyId
    },
    tx
  );
  return policy?.envId;
};

// Reads report `approvals` as the first step's requirement, so that step falls back to it when it has no
// approvalsRequired entry; otherwise a caller that only sets `approvals` would read back a different value.
export const buildSecretAccessPolicySteps = <T extends { type: ApproverType; id: string; sequence: number }>(
  approvers: T[],
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[],
  approvals?: number
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
      const requiredApprovals =
        approvalsRequiredByStepNumber[sequence]?.[0]?.numberOfApprovals || (index === 0 ? approvals : undefined) || 1;

      const hasGroupApprover = stepApprovers.some((approver) => approver.type === ApproverType.Group);
      if (!hasGroupApprover && requiredApprovals > stepApprovers.length) {
        throw new BadRequestError({
          message: `Step ${index + 1} requires ${requiredApprovals} approvals but only has ${stepApprovers.length} approver${stepApprovers.length === 1 ? "" : "s"}. Add approvers to the step or lower its required approvals.`
        });
      }

      return { requiredApprovals, approvers: stepApprovers };
    });
};

type TRevokeActiveSecretAccessGrantsDep = {
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "update">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
};

// additional_privileges.grantId is ON DELETE SET NULL, so deleting the policy would leave the temporary access in place.
export const revokeActiveSecretAccessGrants = async (
  { requestIds, revokedByUserId }: { requestIds: string[]; revokedByUserId: string | null },
  { approvalRequestGrantsDAL, additionalPrivilegeDAL }: TRevokeActiveSecretAccessGrantsDep,
  tx: Knex
) => {
  if (!requestIds.length) return;

  const revokedGrants = await approvalRequestGrantsDAL.update(
    { $in: { requestId: requestIds }, status: ApprovalRequestGrantStatus.Active },
    {
      status: ApprovalRequestGrantStatus.Revoked,
      revokedAt: new Date(),
      revokedByUserId
    },
    tx
  );

  if (!revokedGrants.length) return;

  await additionalPrivilegeDAL.delete({ $in: { grantId: revokedGrants.map((grant) => grant.id) } }, tx);
};
