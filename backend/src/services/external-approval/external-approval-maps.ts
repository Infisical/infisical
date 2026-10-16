import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { ExternalApprovalPolicyType } from "./external-approval-enums";

export const EXTERNAL_APPROVAL_NAME_MAP: Record<ExternalApprovalPolicyType, string> = {
  [ExternalApprovalPolicyType.ServiceNow]: "ServiceNow"
};

export const EXTERNAL_APPROVAL_CONNECTION_MAP: Record<ExternalApprovalPolicyType, AppConnection> = {
  [ExternalApprovalPolicyType.ServiceNow]: AppConnection.ServiceNow
};

export const EXTERNAL_APPROVAL_SUPPORTED_POLICY_TYPES: readonly string[] = [ApprovalPolicyType.SecretAccess];
