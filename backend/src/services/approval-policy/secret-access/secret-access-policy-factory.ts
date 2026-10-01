import { NotFoundError } from "@app/lib/errors";

import { ApprovalRequestGrantStatus } from "../approval-policy-enums";
import {
  TApprovalRequestFactoryCanAccess,
  TApprovalRequestFactoryMatchPolicy,
  TApprovalRequestFactoryPostApprovalRoutine,
  TApprovalRequestFactoryPostRejectionRoutine,
  TApprovalRequestFactoryValidateConstraints,
  TApprovalResourceFactory
} from "../approval-policy-types";
import {
  createSecretAccessGrantWithPrivilege,
  getSecretAccessRequestData,
  hasSameAccessCriteria,
  validateSecretAccessConstraints
} from "./secret-access-policy-fns";
import { SecretAccessPolicyRequestDataSchema } from "./secret-access-policy-schemas";
import {
  TSecretAccessApprovalContext,
  TSecretAccessPolicy,
  TSecretAccessPolicyInputs,
  TSecretAccessRequestData
} from "./secret-access-policy-types";

export const secretAccessPolicyFactory: TApprovalResourceFactory<
  TSecretAccessPolicyInputs,
  TSecretAccessPolicy,
  TSecretAccessRequestData,
  TSecretAccessApprovalContext
> = (policyType) => {
  const matchPolicy: TApprovalRequestFactoryMatchPolicy<TSecretAccessPolicyInputs, TSecretAccessPolicy> = async (
    approvalPolicyDAL,
    projectId,
    inputs
  ) => {
    const policy = await approvalPolicyDAL.findSecretAccessPolicyByEnvIdAndSecretPath({
      projectId,
      envId: inputs.envId,
      secretPath: inputs.secretPath
    });

    return policy as TSecretAccessPolicy | null;
  };

  const canAccess: TApprovalRequestFactoryCanAccess<TSecretAccessPolicyInputs> = async (
    approvalRequestGrantsDAL,
    projectId,
    userId,
    inputs
  ) => {
    const grants = await approvalRequestGrantsDAL.find({
      granteeUserId: userId,
      type: policyType,
      status: ApprovalRequestGrantStatus.Active,
      projectId,
      revokedAt: null
    });

    const now = new Date();

    return (
      grants.find(
        (grant) =>
          (!grant.expiresAt || new Date(grant.expiresAt) > now) &&
          hasSameAccessCriteria(SecretAccessPolicyRequestDataSchema.safeParse(grant.attributes).data ?? null, inputs)
      ) ?? null
    );
  };

  const validateConstraints: TApprovalRequestFactoryValidateConstraints<
    TSecretAccessPolicy,
    TSecretAccessRequestData
  > = (policy, inputs) => validateSecretAccessConstraints(policy.constraints.constraints, inputs);

  const postApprovalRoutine: TApprovalRequestFactoryPostApprovalRoutine<TSecretAccessApprovalContext> = async (
    approvalRequestGrantsDAL,
    request,
    { additionalPrivilegeDAL, tx }
  ) => {
    const { requesterId } = request;
    if (!requesterId) {
      throw new NotFoundError({ message: "The user who created this access request no longer exists" });
    }

    await createSecretAccessGrantWithPrivilege(
      {
        projectId: request.projectId,
        requestId: request.id,
        granteeUserId: requesterId,
        data: getSecretAccessRequestData(request)
      },
      { approvalRequestGrantsDAL, additionalPrivilegeDAL },
      tx
    );
  };

  const postRejectionRoutine: TApprovalRequestFactoryPostRejectionRoutine<
    TSecretAccessApprovalContext
  > = async () => {};

  return {
    matchPolicy,
    canAccess,
    validateConstraints,
    postApprovalRoutine,
    postRejectionRoutine
  };
};
