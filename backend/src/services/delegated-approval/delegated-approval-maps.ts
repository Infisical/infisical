import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";

export const DELEGATED_APPROVAL_NAME_MAP: Record<DelegatedApprovalPolicyType, string> = {
  [DelegatedApprovalPolicyType.ServiceNow]: "ServiceNow"
};

export const DELEGATED_APPROVAL_CONNECTION_MAP: Record<DelegatedApprovalPolicyType, AppConnection> = {
  [DelegatedApprovalPolicyType.ServiceNow]: AppConnection.ServiceNow
};

export const DELEGATED_APPROVAL_FINAL_STATE = new Set<DelegatedApprovalRequestStatus>([
  DelegatedApprovalRequestStatus.Approved,
  DelegatedApprovalRequestStatus.Rejected,
  DelegatedApprovalRequestStatus.Failed
]);

const DELEGATED_APPROVAL_SUPPORTED_POLICY_TYPES = [ApprovalPolicyType.SecretAccess] as const;

export type DelegatedApprovalSupportedPolicyType = (typeof DELEGATED_APPROVAL_SUPPORTED_POLICY_TYPES)[number];

export const isDelegatedApprovalSupportedPolicyType = (
  policyType: string
): policyType is DelegatedApprovalSupportedPolicyType =>
  (DELEGATED_APPROVAL_SUPPORTED_POLICY_TYPES as readonly string[]).includes(policyType);
