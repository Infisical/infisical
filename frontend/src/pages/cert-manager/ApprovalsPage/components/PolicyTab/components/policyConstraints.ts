import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import {
  CertRequestPolicyConstraints,
  CertRequestPolicyOperation,
  TApprovalPolicy
} from "@app/hooks/api/approvalPolicies/types";

export const getPolicyOperation = (policy: Pick<TApprovalPolicy, "constraints">) =>
  (policy.constraints?.constraints as CertRequestPolicyConstraints | undefined)?.operation ??
  CertRequestPolicyOperation.Issuance;

export const getCertPolicyTypeLabel = (
  type: ApprovalPolicyType,
  operation?: CertRequestPolicyOperation
) => {
  if (type === ApprovalPolicyType.CertRevocation) return "Revocation";
  if (type === ApprovalPolicyType.CertDeletion) return "Deletion";
  return operation === CertRequestPolicyOperation.Renewal ? "Renewal" : "Issuance";
};
