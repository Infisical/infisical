import { TAccessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import { TApprovalPolicySecretEnvironmentDALFactory } from "@app/services/approval-policy/approval-policy-dal";

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
