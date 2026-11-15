import { BadRequestError } from "@app/lib/errors";
import { EnforcementLevel } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType } from "./delegated-approval-enums";
import {
  DELEGATED_APPROVAL_CONNECTION_MAP,
  DELEGATED_APPROVAL_NAME_MAP,
  isDelegatedApprovalSupportedPolicyType
} from "./delegated-approval-maps";
import { TDelegatedApprovalListItem } from "./delegated-approval-types";

export const listDelegatedApprovalOptions = (): TDelegatedApprovalListItem[] =>
  Object.values(DelegatedApprovalPolicyType)
    .map((type) => ({
      name: DELEGATED_APPROVAL_NAME_MAP[type],
      type,
      connection: DELEGATED_APPROVAL_CONNECTION_MAP[type]
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

export const assertDelegatedApprovalPolicyConstraints = ({
  enforcementLevel,
  approvers,
  bypassers,
  allowedSelfApprovals
}: {
  enforcementLevel: string;
  approvers?: unknown[];
  bypassers?: unknown[];
  allowedSelfApprovals: boolean;
}) => {
  if (approvers?.length) {
    throw new BadRequestError({
      message:
        "Policies handled by a delegated approval system cannot have approvers, since the delegated approval system reviews their requests. Remove the approvers."
    });
  }
  if (enforcementLevel === EnforcementLevel.Soft) {
    throw new BadRequestError({
      message:
        "Policies handled by a delegated approval system cannot use soft enforcement, since break glass is not available for them. Set enforcementLevel to 'hard'."
    });
  }
  if (bypassers?.length) {
    throw new BadRequestError({
      message:
        "Policies handled by a delegated approval system cannot have bypassers, since break glass is not available for them."
    });
  }
  if (allowedSelfApprovals) {
    throw new BadRequestError({
      message:
        "Policies handled by a delegated approval system cannot allow self approvals. Set allowedSelfApprovals to false."
    });
  }
};

export const assertPolicyTypeSupportsDelegatedApproval = (policyType: string) => {
  if (!isDelegatedApprovalSupportedPolicyType(policyType)) {
    throw new BadRequestError({
      message:
        "Only secret access policies can be handled by a delegated approval system. Remove delegatedApproval from the request."
    });
  }
};
