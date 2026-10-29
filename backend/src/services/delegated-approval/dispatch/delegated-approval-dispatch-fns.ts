import { UnrecoverableError } from "bullmq";

import { DelegatedApprovalPolicyType } from "../delegated-approval-enums";
import { isDelegatedApprovalSupportedPolicyType } from "../delegated-approval-maps";
import {
  DELEGATED_APPROVAL_DISPATCH_DETAILS_BUILDER_MAP,
  DELEGATED_APPROVAL_PROVIDER_MAP
} from "./delegated-approval-dispatch-maps";
import {
  TDelegatedApprovalDispatchDetailsBuilder,
  TDelegatedApprovalProvider
} from "./delegated-approval-dispatch-types";

export const getDelegatedApprovalProvider = (type: string): TDelegatedApprovalProvider => {
  const provider = DELEGATED_APPROVAL_PROVIDER_MAP[type as DelegatedApprovalPolicyType];
  if (!provider) {
    throw new UnrecoverableError(`The delegated approval system '${type}' is not supported.`);
  }
  return provider;
};

export const getDelegatedApprovalDispatchDetailsBuilder = (
  policyType: string
): TDelegatedApprovalDispatchDetailsBuilder => {
  if (!isDelegatedApprovalSupportedPolicyType(policyType)) {
    throw new UnrecoverableError(`Requests of type '${policyType}' cannot be sent to a delegated approval system.`);
  }
  return DELEGATED_APPROVAL_DISPATCH_DETAILS_BUILDER_MAP[policyType];
};
