import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import {
  CertRequestPolicyConstraints,
  CertRequestPolicyOperation,
  CertRequestRenewalApproval,
  TApprovalPolicy
} from "@app/hooks/api/approvalPolicies/types";

export const getPolicyOperation = (policy: Pick<TApprovalPolicy, "constraints">) =>
  (policy.constraints?.constraints as CertRequestPolicyConstraints | undefined)?.operation;

export const getPolicyRenewalApproval = (policy: Pick<TApprovalPolicy, "constraints">) =>
  (policy.constraints?.constraints as CertRequestPolicyConstraints | undefined)?.renewalApproval ??
  CertRequestRenewalApproval.OnChange;

export const RENEWAL_APPROVAL_OPTIONS = [
  {
    value: CertRequestRenewalApproval.OnChange,
    title: "When the certificate changes",
    description: "Imported and discovered certificates always require renewal approval."
  },
  {
    value: CertRequestRenewalApproval.Always,
    title: "Every renewal",
    description: "Even when the certificate remains unchanged."
  }
] as const;

export const getCertPolicyTypeLabel = (
  type: ApprovalPolicyType,
  operation?: CertRequestPolicyOperation
) => {
  if (type === ApprovalPolicyType.CertRevocation) return "Revocation";
  if (operation === CertRequestPolicyOperation.Issuance) return "Issuance";
  if (operation === CertRequestPolicyOperation.Renewal) return "Renewal";
  // Policies created before issuance and renewal were split cover both.
  return "Issuance and Renewal";
};
