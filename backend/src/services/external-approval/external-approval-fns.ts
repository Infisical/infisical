import { BadRequestError } from "@app/lib/errors";
import { EnforcementLevel } from "@app/services/approval-policy/approval-policy-enums";

import { ExternalApprovalPolicyType } from "./external-approval-enums";
import { EXTERNAL_APPROVAL_CONNECTION_MAP, EXTERNAL_APPROVAL_NAME_MAP } from "./external-approval-maps";
import { TExternalApprovalListItem } from "./external-approval-types";

export const listExternalApprovalOptions = (): TExternalApprovalListItem[] =>
  Object.values(ExternalApprovalPolicyType)
    .map((type) => ({
      name: EXTERNAL_APPROVAL_NAME_MAP[type],
      type,
      connection: EXTERNAL_APPROVAL_CONNECTION_MAP[type]
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

export const assertExternalApprovalPolicyConstraints = ({
  enforcementLevel,
  bypassers,
  allowedSelfApprovals
}: {
  enforcementLevel: string;
  bypassers?: unknown[];
  allowedSelfApprovals: boolean;
}) => {
  if (enforcementLevel === EnforcementLevel.Soft) {
    throw new BadRequestError({
      message:
        "Policies handled by an external approval system cannot use soft enforcement, since break glass is not available for them. Set enforcementLevel to 'hard'."
    });
  }
  if (bypassers?.length) {
    throw new BadRequestError({
      message:
        "Policies handled by an external approval system cannot have bypassers, since break glass is not available for them."
    });
  }
  if (allowedSelfApprovals) {
    throw new BadRequestError({
      message:
        "Policies handled by an external approval system cannot allow self approvals. Set allowedSelfApprovals to false."
    });
  }
};
