import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType } from "../delegated-approval-enums";
import { DelegatedApprovalSupportedPolicyType } from "../delegated-approval-maps";
import { buildSecretAccessDispatchDetails } from "./delegated-approval-dispatch-builders";
import {
  TDelegatedApprovalDispatchDetailsBuilder,
  TDelegatedApprovalProvider
} from "./delegated-approval-dispatch-types";
import { serviceNowProvider } from "./providers/servicenow";

export const DELEGATED_APPROVAL_PROVIDER_MAP: Record<DelegatedApprovalPolicyType, TDelegatedApprovalProvider> = {
  [DelegatedApprovalPolicyType.ServiceNow]: serviceNowProvider
};

export const DELEGATED_APPROVAL_DISPATCH_DETAILS_BUILDER_MAP: Record<
  DelegatedApprovalSupportedPolicyType,
  TDelegatedApprovalDispatchDetailsBuilder
> = {
  [ApprovalPolicyType.SecretAccess]: buildSecretAccessDispatchDetails
};
