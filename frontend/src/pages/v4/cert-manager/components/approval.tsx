import { formatDistanceToNow } from "date-fns";

import type { IconName } from "@app/components/v4/ui/icon";
import { StatusText } from "@app/components/v4/ui/text";
import { ApprovalPolicyType, ApproverType } from "@app/hooks/api/approvalPolicies/types";
import {
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  type CertRequestRequestData,
  type CodeSigningRequestData,
  type TApprovalRequest
} from "@app/hooks/api/approvalRequests/types";

import { useV4Adapter } from "../../data/adapters";

const statusView: Record<
  ApprovalRequestStatus,
  { label: string; tone: "neutral" | "ok" | "warn" | "bad"; icon: IconName }
> = {
  [ApprovalRequestStatus.Pending]: { label: "Pending review", tone: "warn", icon: "clock" },
  [ApprovalRequestStatus.Approved]: { label: "Approved", tone: "ok", icon: "check-c" },
  [ApprovalRequestStatus.Rejected]: { label: "Rejected", tone: "bad", icon: "x" },
  [ApprovalRequestStatus.Cancelled]: { label: "Cancelled", tone: "neutral", icon: "x" },
  [ApprovalRequestStatus.Expired]: { label: "Expired", tone: "neutral", icon: "clock" }
};

export const RequestStatus = ({ status }: { status: ApprovalRequestStatus }) => {
  const view = statusView[status] ?? { label: status, tone: "neutral", icon: "info" };
  return (
    <StatusText tone={view.tone} icon={view.icon}>
      {view.label}
    </StatusText>
  );
};

export const certDataOf = (request: TApprovalRequest) => {
  const data = request.requestData?.requestData;
  return data && "profileName" in data ? (data as CertRequestRequestData) : null;
};

export const signingDataOf = (request: TApprovalRequest) => {
  const data = request.requestData?.requestData;
  return data && "signerName" in data ? (data as CodeSigningRequestData) : null;
};

export const requestedAgo = (iso: string) =>
  formatDistanceToNow(new Date(iso), { addSuffix: true });

export const currentStepOf = (request: TApprovalRequest) =>
  request.steps.find((step) => step.status === ApprovalRequestStepStatus.InProgress);

export const isApproverOf = (
  request: TApprovalRequest,
  viewer: { userId: string; groupIds: string[] }
) =>
  Boolean(
    currentStepOf(request)?.approvers.some((approver) =>
      approver.type === ApproverType.User
        ? approver.id === viewer.userId
        : viewer.groupIds.includes(approver.id)
    )
  );

export const decisionBlock = (
  request: TApprovalRequest,
  viewer: { userId: string; groupIds: string[] }
) => {
  const step = currentStepOf(request);
  if (request.status !== ApprovalRequestStatus.Pending || !step)
    return "No step is waiting for a decision";
  if (!isApproverOf(request, viewer)) return "You are not an approver on the current step";
  if (request.type === ApprovalPolicyType.CertCodeSigning && request.requesterId === viewer.userId)
    return "You cannot approve your own signing request";
  if (step.approvals.some((approval) => approval.approverUserId === viewer.userId))
    return "You already responded to this step";
  return undefined;
};

export const needsApprovalFrom = (
  request: TApprovalRequest,
  viewer: { userId: string; groupIds: string[] }
) =>
  isApproverOf(request, viewer) &&
  !currentStepOf(request)?.approvals.some((approval) => approval.approverUserId === viewer.userId);

export const useApproverLabel = (projectId: string, includeGroupMembers = false) => {
  const { data } = useV4Adapter("approvalRequests").useApprovers(projectId, {
    includeGroupMembers
  });
  return (type: ApproverType, id: string) =>
    (type === ApproverType.User ? data?.users : data?.groups)?.find((entry) => entry.id === id)
      ?.label ?? id;
};
