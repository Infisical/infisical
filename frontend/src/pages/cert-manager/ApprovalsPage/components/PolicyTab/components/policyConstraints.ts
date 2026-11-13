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
    description: "Renewals of imported or discovered certificates also need approval."
  },
  {
    value: CertRequestRenewalApproval.Always,
    title: "Every renewal",
    description: "Includes automatic renewals."
  }
] as const;
