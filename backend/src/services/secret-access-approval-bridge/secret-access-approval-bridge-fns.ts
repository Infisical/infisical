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
  { envId, secretPath }: { envId: string; secretPath: string },
  { accessApprovalPolicyDAL, approvalPolicySecretEnvironmentDAL }: TSecretAccessApprovalPolicyExistsDep
) => {
  const legacyPolicy = await accessApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath({ envIds: [envId], secretPath });
  if (legacyPolicy) return true;

  const policy = await approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdsAndSecretPath({
    envIds: [envId],
    secretPath
  });
  return Boolean(policy);
};
