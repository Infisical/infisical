import { UnrecoverableError } from "bullmq";

import { verifyRequestedPermissions } from "@app/ee/services/access-approval-request/access-approval-request-fns";
import { BadRequestError } from "@app/lib/errors";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { getSecretAccessRequestData } from "@app/services/approval-policy/secret-access/secret-access-policy-fns";

import { TDelegatedApprovalDispatchDetailsBuilder } from "./delegated-approval-dispatch-types";

// A stored row that fails validation will fail the same way on every retry.
export const buildSecretAccessDispatchDetails: TDelegatedApprovalDispatchDetailsBuilder = (request) => {
  try {
    const { permissions, isTemporary, temporaryRange } = getSecretAccessRequestData(request);
    const { envSlug, secretPath, requestedPermissions } = verifyRequestedPermissions({ permissions });

    const rows = requestedPermissions.map(({ subject, actions }) => ({
      label: `${subject}:`,
      actions: actions.join(", ")
    }));
    const labelWidth = Math.max(...rows.map((row) => row.label.length));

    return {
      policyType: ApprovalPolicyType.SecretAccess,
      environment: envSlug,
      secretPath,
      permissions: rows.map((row) => `${row.label.padEnd(labelWidth)} ${row.actions}`),
      isTemporary,
      temporaryRange: isTemporary ? temporaryRange : null
    };
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw new UnrecoverableError(
        `The access request cannot be sent to the delegated approval system: ${error.message}`
      );
    }
    throw error;
  }
};
