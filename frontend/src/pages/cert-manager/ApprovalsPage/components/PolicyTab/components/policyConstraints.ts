import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import {
  CertRequestPolicyConstraints,
  CertRequestRenewalApproval,
  TApprovalPolicy
} from "@app/hooks/api/approvalPolicies/types";

export const getPolicyRenewalApproval = (policy: Pick<TApprovalPolicy, "constraints">) =>
  (policy.constraints?.constraints as CertRequestPolicyConstraints | undefined)?.renewalApproval ??
  CertRequestRenewalApproval.OnChange;

export const RENEWAL_APPROVAL_OPTIONS = [
  {
    value: CertRequestRenewalApproval.OnChange,
    title: "When the renewal changes the certificate",
    description:
      "Renewals with changes, as well as renewals of imported and discovered certificates, need approval."
  },
  {
    value: CertRequestRenewalApproval.Always,
    title: "Every renewal",
    description: "Includes automatic renewals."
  }
] as const;

export const CERT_POLICY_TYPE_LABEL = {
  [ApprovalPolicyType.CertRequest]: "Issuance and Renewal",
  [ApprovalPolicyType.CertRevocation]: "Revocation"
} as const;

export const getCertPolicyTypeLabel = (type: ApprovalPolicyType) =>
  type === ApprovalPolicyType.CertRevocation
    ? CERT_POLICY_TYPE_LABEL[ApprovalPolicyType.CertRevocation]
    : CERT_POLICY_TYPE_LABEL[ApprovalPolicyType.CertRequest];
