import { TDelegatedApprovalRequests } from "@app/db/schemas";
import { logger } from "@app/lib/logger";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { DelegatedApprovalRequestDetailsSchema } from "./delegated-approval-schemas";
import { TDelegatedApprovalRequest, TDelegatedApprovalRequestDetails } from "./delegated-approval-types";
import { DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS } from "./dispatch/delegated-approval-dispatch-constants";

export const toDelegatedApprovalStatusReason = (reason: string) =>
  reason.slice(0, DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS);

// A row whose details cannot be read is served as if it had none, so one bad row cannot take the
// request list down with it.
export const parseDelegatedApprovalRequestDetails = (
  row: Pick<TDelegatedApprovalRequests, "id" | "details">
): TDelegatedApprovalRequestDetails => {
  const parsed = DelegatedApprovalRequestDetailsSchema.safeParse(row.details ?? {});
  if (parsed.success) return parsed.data;

  logger.warn(
    { issues: parsed.error.issues },
    `Delegated approval request has unreadable details, treating them as empty [delegatedRequestId=${row.id}]`
  );
  return {};
};

export const toDelegatedApprovalRequest = (row: TDelegatedApprovalRequests): TDelegatedApprovalRequest => ({
  ...row,
  providerType: row.providerType as DelegatedApprovalPolicyType,
  status: row.status as DelegatedApprovalRequestStatus,
  details: parseDelegatedApprovalRequestDetails(row)
});
