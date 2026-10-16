import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType } from "./delegated-approval-enums";

export const DELEGATED_APPROVAL_NAME_MAP: Record<DelegatedApprovalPolicyType, string> = {
  [DelegatedApprovalPolicyType.ServiceNow]: "ServiceNow"
};

export const DELEGATED_APPROVAL_CONNECTION_MAP: Record<DelegatedApprovalPolicyType, AppConnection> = {
  [DelegatedApprovalPolicyType.ServiceNow]: AppConnection.ServiceNow
};

export const DELEGATED_APPROVAL_SUPPORTED_POLICY_TYPES: readonly string[] = [ApprovalPolicyType.SecretAccess];
