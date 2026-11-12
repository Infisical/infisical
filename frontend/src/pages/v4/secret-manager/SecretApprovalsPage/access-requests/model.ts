import { format } from "date-fns";

import type { IconName } from "@app/components/v4/ui/icon";
import type { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { DelegatedApprovalRequestStatus } from "@app/hooks/api/delegatedApprovals/enums";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";
import { ApprovalStatus } from "@app/hooks/api/secretApprovalRequest/types";
import {
  formatAccessDuration,
  getAccessRequestState,
  parseAccessDurationMs
} from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/AccessApprovalRequest.utils";

export type RequestDisplay = {
  label: string;
  tone: "neutral" | "ok" | "warn" | "bad";
  icon: IconName;
  loading?: boolean;
  tooltip?: string;
};

export const stamp = (value: Date | string) => format(new Date(value), "MMM d, yyyy h:mm a");

export const personName = (
  person?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
) => [person?.firstName, person?.lastName].filter(Boolean).join(" ") || person?.email || "";

export const durationLabel = (
  request: Pick<TAccessApprovalRequest, "isTemporary" | "temporaryRange">
) => {
  if (!request.isTemporary) return "Permanent";
  const rangeMs = parseAccessDurationMs(request.temporaryRange);
  return rangeMs ? formatAccessDuration(rangeMs) : "Temporary";
};

export const isAccessExpired = (request: TAccessApprovalRequest) =>
  Boolean(
    request.privilege &&
    request.isApproved &&
    request.privilege.temporaryAccessEndTime &&
    new Date() > new Date(request.privilege.temporaryAccessEndTime)
  );

export const canBypassPolicy = (request: TAccessApprovalRequest, userId: string) =>
  request.policy.bypassers.length
    ? request.policy.bypassers.includes(userId)
    : request.policy.allowedSelfApprovals;

export const isSoftEnforced = (request: TAccessApprovalRequest) =>
  request.policy.enforcementLevel === EnforcementLevel.Soft;

export const displayOf = ({
  request,
  userId,
  isRetrying,
  delegatedName
}: {
  request: TAccessApprovalRequest;
  userId: string;
  isRetrying: boolean;
  delegatedName?: string;
}): RequestDisplay => {
  const state = getAccessRequestState(request);
  if (state === "expired")
    return {
      label: "Expired",
      tone: "bad",
      icon: "clock",
      tooltip: request.expiresAt ? `Expired ${stamp(request.expiresAt)}` : undefined
    };
  if (state === "revoked")
    return {
      label: "Revoked",
      tone: "bad",
      icon: "lock",
      tooltip: request.revokedAt ? `Revoked ${stamp(request.revokedAt)}` : undefined
    };
  if (isAccessExpired(request))
    return {
      label: "Access expired",
      tone: "bad",
      icon: "clock",
      tooltip: `Expired ${stamp(request.privilege!.temporaryAccessEndTime!)}`
    };
  if (state === "approved")
    return {
      label: "Access granted",
      tone: "ok",
      icon: "check-c",
      tooltip: `Granted ${stamp(request.updatedAt)}`
    };
  if (state === "rejected")
    return {
      label: "Rejected",
      tone: "bad",
      icon: "x",
      tooltip: `Rejected ${stamp(request.updatedAt)}`
    };
  if (state === "policy-deleted") return { label: "Policy deleted", tone: "bad", icon: "alert" };
  if (isRetrying) return { label: "Retrying", tone: "neutral", icon: "sync", loading: true };
  if (request.delegatedApproval?.status === DelegatedApprovalRequestStatus.FailedDispatch)
    return {
      label: "Not submitted",
      tone: "bad",
      icon: "alert-c",
      tooltip: request.delegatedApproval.statusReason ?? undefined
    };
  if (request.delegatedApproval) {
    if (request.delegatedApproval.status === DelegatedApprovalRequestStatus.PendingDispatch)
      return { label: "Submitting", tone: "neutral", icon: "sync", loading: true };
    return {
      label: delegatedName ? `Pending in ${delegatedName}` : "Pending external review",
      tone: "warn",
      icon: "clock"
    };
  }
  const myReview = request.reviewers.find((reviewer) => reviewer.userId === userId);
  if (myReview?.status === ApprovalStatus.APPROVED)
    return { label: "Pending additional reviews", tone: "warn", icon: "clock" };
  return { label: myReview ? "Pending" : "Review required", tone: "warn", icon: "eye" };
};
