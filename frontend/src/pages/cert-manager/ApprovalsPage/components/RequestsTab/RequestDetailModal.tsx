import { useState } from "react";
import { useForm } from "react-hook-form";
import { faCheck, faTimes, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistance } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, TextArea } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useProject, useProjectPermission, useUser } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import { ApprovalPolicyType, ApproverType } from "@app/hooks/api/approvalPolicies";
import {
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  CertRequestRequestData,
  TApprovalRequest,
  useApproveApprovalRequest,
  useCancelApprovalRequest,
  useRejectApprovalRequest
} from "@app/hooks/api/approvalRequests";
import { UsePopUpState } from "@app/hooks/usePopUp";

// Helper function to format validity TTL (e.g., "365d" -> "365 days")
const formatValidity = (ttl: string): string => {
  const match = ttl.match(/^(\d+)([dhmy])$/i);
  if (!match) return ttl;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const unitMap: Record<string, string> = {
    d: value === 1 ? "day" : "days",
    h: value === 1 ? "hour" : "hours",
    m: value === 1 ? "month" : "months",
    y: value === 1 ? "year" : "years"
  };

  return `${value} ${unitMap[unit] || unit}`;
};

type Props = {
  popUp: UsePopUpState<["requestDetail"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["requestDetail"]>, state?: boolean) => void;
};

const commentSchema = z.object({
  comment: z.string().max(500).optional()
});

type TCommentForm = z.infer<typeof commentSchema>;

const getStatusBadgeColor = (status: ApprovalRequestStatus) => {
  switch (status) {
    case ApprovalRequestStatus.Pending:
      return "project";
    case ApprovalRequestStatus.Approved:
      return "success";
    case ApprovalRequestStatus.Rejected:
      return "danger";
    case ApprovalRequestStatus.Expired:
      return "neutral";
    default:
      return "neutral";
  }
};

const getStepNumberClass = (status: ApprovalRequestStepStatus) => {
  if (status === ApprovalRequestStepStatus.Completed) {
    return "bg-green-500/20 text-green-500";
  }
  if (status === ApprovalRequestStepStatus.InProgress) {
    return "bg-primary/20 text-primary";
  }
  return "bg-mineshaft-600 text-mineshaft-400";
};

const getStepBadgeVariant = (status: ApprovalRequestStepStatus) => {
  if (status === ApprovalRequestStepStatus.Completed) {
    return "success" as const;
  }
  if (status === ApprovalRequestStepStatus.InProgress) {
    return "project" as const;
  }
  return "neutral" as const;
};

export const RequestDetailModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { user } = useUser();
  const { memberships } = useProjectPermission();
  const [showCommentForm, setShowCommentForm] = useState<"approve" | "reject" | null>(null);

  const isOpen = popUp?.requestDetail?.isOpen;
  const request = (popUp?.requestDetail?.data as { request: TApprovalRequest })?.request;

  const projectId = currentProject?.id || "";
  const userId = user?.id || "";
  const userGroups = memberships.map((el) => el.actorGroupId).filter(Boolean);

  const { data: members = [] } = useGetWorkspaceUsers(projectId);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);

  const { mutateAsync: approveRequest, isPending: isApproving } = useApproveApprovalRequest();
  const { mutateAsync: rejectRequest, isPending: isRejecting } = useRejectApprovalRequest();
  const { mutateAsync: cancelRequest, isPending: isCancelling } = useCancelApprovalRequest();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<TCommentForm>({
    resolver: zodResolver(commentSchema)
  });

  const getApproverLabel = (approverId: string, approverType: ApproverType) => {
    if (approverType === ApproverType.User) {
      const member = members?.find((m) => m.user.id === approverId);
      if (member) {
        return getMemberLabel(member);
      }
    } else if (approverType === ApproverType.Group) {
      const group = groups?.find(({ group: g }) => g.id === approverId);
      if (group) {
        return group.group.name;
      }
    }
    return approverId;
  };

  const canUserApprove = () => {
    if (!request || request.status !== ApprovalRequestStatus.Pending) return false;

    const currentStep = request.steps.find(
      (step) => step.status === ApprovalRequestStepStatus.InProgress
    );

    if (!currentStep) return false;

    const isApprover = currentStep.approvers.some((approver) =>
      approver.type === ApproverType.User
        ? approver.id === userId
        : userGroups.includes(approver.id)
    );

    if (!isApprover) return false;

    const hasAlreadyApproved = currentStep.approvals.some(
      (approval) => approval.approverUserId === userId
    );

    return !hasAlreadyApproved;
  };

  const canUserCancel = () => {
    if (!request || request.status !== ApprovalRequestStatus.Pending) return false;
    return request.requesterId === userId;
  };

  const handleApprove = async (data: TCommentForm) => {
    if (!request) return;

    try {
      await approveRequest({
        policyType: ApprovalPolicyType.CertRequest,
        requestId: request.id,
        comment: data.comment
      });
      createNotification({
        text: "Request approved successfully",
        type: "success"
      });
      setShowCommentForm(null);
      reset();
      handlePopUpToggle("requestDetail", false);
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to approve request",
        type: "error"
      });
    }
  };

  const handleReject = async (data: TCommentForm) => {
    if (!request) return;

    try {
      await rejectRequest({
        policyType: ApprovalPolicyType.CertRequest,
        requestId: request.id,
        comment: data.comment
      });
      createNotification({
        text: "Request rejected",
        type: "success"
      });
      setShowCommentForm(null);
      reset();
      handlePopUpToggle("requestDetail", false);
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to reject request",
        type: "error"
      });
    }
  };

  const handleCancel = async () => {
    if (!request) return;

    try {
      await cancelRequest({
        policyType: ApprovalPolicyType.CertRequest,
        requestId: request.id
      });
      createNotification({
        text: "Request cancelled",
        type: "success"
      });
      handlePopUpToggle("requestDetail", false);
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to cancel request",
        type: "error"
      });
    }
  };

  if (!request) return null;

  const requestData = request.requestData.requestData as CertRequestRequestData;
  const showApprovalButtons = canUserApprove();
  const showCancelButton = canUserCancel();

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => handlePopUpToggle("requestDetail", open)}>
      <ModalContent
        title="Certificate Issuance Request"
        subTitle="Review the details of this certificate request"
        className="max-w-2xl"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Badge variant={getStatusBadgeColor(request.status)} className="capitalize">
              {request.status.split("-").join(" ")}
            </Badge>
            <span className="text-sm text-mineshaft-400">
              Requested{" "}
              {formatDistance(new Date(request.createdAt), new Date(), { addSuffix: true })}
            </span>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-mineshaft-200">Requester</h4>
            <div className="rounded border border-mineshaft-600 bg-mineshaft-700 p-3">
              <div className="text-sm font-medium text-mineshaft-100">
                {request.requesterName || "Unknown"}
              </div>
              <div className="text-xs text-mineshaft-400">{request.requesterEmail}</div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-mineshaft-200">Certificate Details</h4>
            <div className="space-y-2 rounded border border-mineshaft-600 bg-mineshaft-700 p-3">
              <div className="flex justify-between">
                <span className="text-sm text-mineshaft-400">Profile</span>
                <span className="text-sm text-mineshaft-200">{requestData.profileName}</span>
              </div>
              {requestData.certificateRequest?.commonName && (
                <div className="flex justify-between">
                  <span className="text-sm text-mineshaft-400">Common Name</span>
                  <span className="text-sm text-mineshaft-200">
                    {requestData.certificateRequest.commonName}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-mineshaft-400">Validity</span>
                <span className="text-sm text-mineshaft-200">
                  {requestData.certificateRequest?.validity?.ttl
                    ? formatValidity(requestData.certificateRequest.validity.ttl)
                    : "Not specified"}
                </span>
              </div>
              {requestData.certificateRequest?.altNames &&
                requestData.certificateRequest.altNames.length > 0 && (
                  <div>
                    <span className="text-sm text-mineshaft-400">Alt Names</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {requestData.certificateRequest.altNames.map(
                        (san: { type: string; value: string }) => (
                          <span
                            key={`${san.type}-${san.value}`}
                            className="rounded bg-mineshaft-600 px-2 py-0.5 text-xs text-mineshaft-200"
                          >
                            {san.type}: {san.value}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}
            </div>
          </div>

          {request.justification && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-mineshaft-200">Justification</h4>
              <div className="rounded border border-mineshaft-600 bg-mineshaft-700 p-3 text-sm text-mineshaft-300">
                {request.justification}
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-sm font-medium text-mineshaft-200">Approval Progress</h4>
            <div className="space-y-2">
              {request.steps.map((step, index) => (
                <div
                  key={step.id}
                  className="rounded border border-mineshaft-600 bg-mineshaft-700 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${getStepNumberClass(step.status)}`}
                      >
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-mineshaft-200">
                        {step.name || `Step ${index + 1}`}
                      </span>
                    </div>
                    <Badge variant={getStepBadgeVariant(step.status)} className="capitalize">
                      {step.status.split("-").join(" ")}
                    </Badge>
                  </div>
                  <div className="text-xs text-mineshaft-400">
                    {step.approvals.length} of {step.requiredApprovals} approvals
                  </div>
                  {step.approvals.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {step.approvals.map((approval) => (
                        <div
                          key={approval.id}
                          className="flex items-center gap-1 rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400"
                        >
                          <FontAwesomeIcon icon={faUsers} />
                          {getApproverLabel(approval.approverUserId, ApproverType.User)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {showCommentForm && (
            <form
              onSubmit={handleSubmit(showCommentForm === "approve" ? handleApprove : handleReject)}
            >
              <FormControl
                label="Comment (Optional)"
                isError={Boolean(errors.comment)}
                errorText={errors.comment?.message}
              >
                <TextArea {...register("comment")} placeholder="Add a comment..." rows={3} />
              </FormControl>
              <div className="mt-4 flex gap-2">
                <Button
                  type="submit"
                  colorSchema={showCommentForm === "approve" ? "primary" : "danger"}
                  isLoading={isApproving || isRejecting}
                  isDisabled={isApproving || isRejecting}
                >
                  {showCommentForm === "approve" ? "Confirm Approve" : "Confirm Reject"}
                </Button>
                <Button
                  type="button"
                  variant="outline_bg"
                  onClick={() => {
                    setShowCommentForm(null);
                    reset();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {!showCommentForm && (showApprovalButtons || showCancelButton) && (
            <div className="flex gap-2 border-t border-mineshaft-600 pt-4">
              {showApprovalButtons && (
                <>
                  <Button
                    leftIcon={<FontAwesomeIcon icon={faCheck} />}
                    onClick={() => setShowCommentForm("approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    colorSchema="danger"
                    leftIcon={<FontAwesomeIcon icon={faTimes} />}
                    onClick={() => setShowCommentForm("reject")}
                  >
                    Reject
                  </Button>
                </>
              )}
              {showCancelButton && (
                <Button
                  variant="outline_bg"
                  onClick={handleCancel}
                  isLoading={isCancelling}
                  isDisabled={isCancelling}
                >
                  Cancel Request
                </Button>
              )}
            </div>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
};
