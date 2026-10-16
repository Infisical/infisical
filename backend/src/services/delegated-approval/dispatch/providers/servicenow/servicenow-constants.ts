import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalSupportedPolicyType } from "../../../delegated-approval-maps";
import { ServiceNowRequestType } from "./servicenow-enums";

export const SERVICENOW_ACCESS_REQUEST_PATH = "/api/x_infis_approvals/v1/infisical/access_request";

export const SERVICENOW_DISPATCH_TIMEOUT_MS = 15_000;

export const SERVICENOW_DISPATCH_MAX_CONTENT_LENGTH = 64 * 1024;

export const SERVICENOW_ERROR_DETAIL_MAX_CHARS = 200;

export const SERVICENOW_EVENT_MAP: Record<
  DelegatedApprovalSupportedPolicyType,
  { event: string; requestType: ServiceNowRequestType }
> = {
  [ApprovalPolicyType.SecretAccess]: {
    event: "secrets_management.access_request",
    requestType: ServiceNowRequestType.SecretAccess
  }
};
