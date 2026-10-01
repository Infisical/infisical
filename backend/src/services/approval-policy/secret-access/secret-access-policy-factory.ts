import { NotFoundError } from "@app/lib/errors";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";

import { TApprovalPolicyDALFactory } from "../approval-policy-dal";
import { ApprovalPolicyType, ApprovalRequestGrantStatus } from "../approval-policy-enums";
import { TApprovalResource } from "../approval-policy-types";
import { TApprovalRequestGrantsDALFactory } from "../approval-request-dal";
import {
  createSecretAccessGrantWithPrivilege,
  getSecretAccessRequestData,
  hasSameAccessCriteria,
  validateSecretAccessConstraints
} from "./secret-access-policy-fns";
import { SecretAccessPolicyRequestDataSchema } from "./secret-access-policy-schemas";
import { TSecretAccessPolicy, TSecretAccessPolicyInputs, TSecretAccessRequestData } from "./secret-access-policy-types";

type TSecretAccessApprovalResourceDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findSecretAccessPolicyByEnvIdAndSecretPath">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "find" | "create">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "create">;
};

export type TSecretAccessApprovalResource = ReturnType<typeof secretAccessApprovalResourceFactory>;

export const secretAccessApprovalResourceFactory = ({
  approvalPolicyDAL,
  approvalRequestGrantsDAL,
  additionalPrivilegeDAL
}: TSecretAccessApprovalResourceDep) =>
  ({
    matchPolicy: async (projectId, inputs) => {
      const policy = await approvalPolicyDAL.findSecretAccessPolicyByEnvIdAndSecretPath({
        projectId,
        envId: inputs.envId,
        secretPath: inputs.secretPath
      });

      return policy as TSecretAccessPolicy | null;
    },

    canAccess: async (projectId, actorId, inputs) => {
      const grants = await approvalRequestGrantsDAL.find({
        granteeUserId: actorId,
        type: ApprovalPolicyType.SecretAccess,
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
    },

    validateConstraints: (policy, requestData) =>
      validateSecretAccessConstraints(policy.constraints.constraints, requestData),

    postApprovalTxRoutine: async (request, tx) => {
      const { requesterId } = request;
      if (!requesterId) {
        throw new NotFoundError({ message: "The user who created this access request no longer exists" });
      }

      const grant = await createSecretAccessGrantWithPrivilege(
        {
          projectId: request.projectId,
          requestId: request.id,
          granteeUserId: requesterId,
          data: getSecretAccessRequestData(request)
        },
        { approvalRequestGrantsDAL, additionalPrivilegeDAL },
        tx
      );

      return { grantId: grant.id };
    }
  }) satisfies TApprovalResource<TSecretAccessPolicyInputs, TSecretAccessPolicy, TSecretAccessRequestData>;
