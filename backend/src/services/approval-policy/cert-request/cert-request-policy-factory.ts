import { ApprovalRequestGrantStatus } from "../approval-policy-enums";
import {
  TApprovalRequestFactoryCanAccess,
  TApprovalRequestFactoryMatchPolicy,
  TApprovalRequestFactoryPostApprovalRoutine,
  TApprovalRequestFactoryValidateConstraints,
  TApprovalResourceFactory
} from "../approval-policy-types";
import { TCertRequestPolicy, TCertRequestPolicyInputs, TCertRequestRequestData } from "./cert-request-policy-types";

export const certRequestPolicyFactory: TApprovalResourceFactory<
  TCertRequestPolicyInputs,
  TCertRequestPolicy,
  TCertRequestRequestData
> = (policyType) => {
  const matchPolicy: TApprovalRequestFactoryMatchPolicy<TCertRequestPolicyInputs, TCertRequestPolicy> = async (
    approvalPolicyDAL,
    projectId,
    inputs
  ) => {
    const policies = await approvalPolicyDAL.findByProjectId(policyType, projectId);

    for (const policy of policies) {
      const p = policy as TCertRequestPolicy;
      if (p.isActive) {
        for (const condition of p.conditions.conditions) {
          if (condition.profileNames.includes(inputs.profileName)) {
            return p;
          }
        }
      }
    }

    return null;
  };

  const canAccess: TApprovalRequestFactoryCanAccess<TCertRequestPolicyInputs> = async () => {
    return false;
  };

  const validateConstraints: TApprovalRequestFactoryValidateConstraints<
    TCertRequestPolicy,
    TCertRequestRequestData
  > = () => {
    return { valid: true };
  };

  const postApprovalRoutine: TApprovalRequestFactoryPostApprovalRoutine = async (approvalRequestGrantsDAL, request) => {
    await approvalRequestGrantsDAL.create({
      projectId: request.projectId,
      requestId: request.id,
      granteeUserId: request.requesterId,
      status: ApprovalRequestGrantStatus.Active,
      type: request.type,
      attributes: request.requestData.requestData,
      expiresAt: null
    });
  };

  return {
    matchPolicy,
    canAccess,
    validateConstraints,
    postApprovalRoutine
  };
};
