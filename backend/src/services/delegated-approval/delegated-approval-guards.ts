import { UnrecoverableError } from "bullmq";

import { TAppConnections, TApprovalRequests } from "@app/db/schemas";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { isApprovalRequestExpired } from "@app/services/approval-policy/approval-policy-service";

import { DelegatedApprovalPolicyType } from "./delegated-approval-enums";
import { DELEGATED_APPROVAL_CONNECTION_MAP } from "./delegated-approval-maps";
import { TRequireDelegatedApprovalConnectionDTO } from "./delegated-approval-types";

export enum DelegatedApprovalRequestBlocker {
  Missing = "missing",
  NotPending = "not_pending",
  Expired = "expired",
  PolicyRemoved = "policy_removed"
}

// Why a request can no longer be handed to, or decided by, a delegated approval system, in the order
// the callers check it. Each caller words the refusal for its own audience.
export const getDelegatedApprovalRequestBlocker = (
  approvalRequest: Pick<TApprovalRequests, "status" | "expiresAt"> | null | undefined,
  delegatedPolicy: object | null | undefined
): DelegatedApprovalRequestBlocker | null => {
  if (!approvalRequest) return DelegatedApprovalRequestBlocker.Missing;
  if (approvalRequest.status !== ApprovalRequestStatus.Pending) return DelegatedApprovalRequestBlocker.NotPending;
  if (isApprovalRequestExpired(approvalRequest)) return DelegatedApprovalRequestBlocker.Expired;
  if (!delegatedPolicy) return DelegatedApprovalRequestBlocker.PolicyRemoved;
  return null;
};

// The connection a policy names must still exist in the request's org; anything else reads as "not
// found" so one org cannot learn another org's connection ids.
export const requireDelegatedApprovalConnection = <T extends Pick<TAppConnections, "orgId">>({
  rawConnection,
  delegatedPolicy,
  organizationId
}: TRequireDelegatedApprovalConnectionDTO<T>): T => {
  if (rawConnection && rawConnection.orgId === organizationId) return rawConnection;

  const connectionApp = DELEGATED_APPROVAL_CONNECTION_MAP[delegatedPolicy.type as DelegatedApprovalPolicyType];
  throw new UnrecoverableError(
    `App Connection with ID '${delegatedPolicy.connectionId}' was not found. Select a ${APP_CONNECTION_NAME_MAP[connectionApp]} Connection on the policy and create the request again.`
  );
};
