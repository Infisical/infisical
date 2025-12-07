import { useState } from "react";
import { faCheck, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextArea
} from "@app/components/v2";
import { useProjectPermission, useUser } from "@app/context";
import { ApproverType } from "@app/hooks/api/approvalPolicies";
import {
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  TApprovalRequest,
  useApproveApprovalRequest,
  useRejectApprovalRequest
} from "@app/hooks/api/approvalRequests";

type Props = {
  request: TApprovalRequest;
};

export const RequestActionsSection = ({ request }: Props) => {
  const { user } = useUser();
  const { memberships } = useProjectPermission();
  const [comment, setComment] = useState("");

  const userId = user?.id || "";
  const userGroups = memberships.map((el) => el.actorGroupId).filter(Boolean);

  const { mutateAsync: approveRequest, isPending: isApproving } = useApproveApprovalRequest();
  const { mutateAsync: rejectRequest, isPending: isRejecting } = useRejectApprovalRequest();

  // Check if the request is actionable
  if (request.status !== ApprovalRequestStatus.Pending) {
    return null;
  }

  // Find the current active step
  const currentStep = request.steps.find(
    (step) => step.status === ApprovalRequestStepStatus.InProgress
  );

  if (!currentStep) {
    return null;
  }

  // Check if user is an approver in the current step
  const isApprover = currentStep.approvers.some((approver) =>
    approver.type === ApproverType.User ? approver.id === userId : userGroups.includes(approver.id)
  );

  if (!isApprover) {
    return null;
  }

  // Check if user has already approved/rejected
  const hasAlreadyActed = currentStep.approvals.some(
    (approval) => approval.approverUserId === userId
  );

  if (hasAlreadyActed) {
    return (
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <p className="text-sm text-mineshaft-300">
          You have already provided your approval for this request.
        </p>
      </div>
    );
  }

  const handleApprove = async () => {
    try {
      await approveRequest({
        policyType: request.type,
        requestId: request.id,
        comment: comment || undefined
      });
      createNotification({
        text: "Request approved successfully",
        type: "success"
      });
    } finally {
      setComment("");
    }
  };

  const handleReject = async () => {
    try {
      await rejectRequest({
        policyType: request.type,
        requestId: request.id,
        comment: comment || undefined
      });
      createNotification({
        text: "Request rejected successfully",
        type: "success"
      });
    } finally {
      setComment("");
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
      <div className="flex items-center justify-between border-b border-yellow-500/30 pb-2">
        <h3 className="font-medium text-mineshaft-100">Action Required</h3>
        <span className="text-xs text-yellow-500">Awaiting Your Approval</span>
      </div>
      <div className="space-y-4">
        <p className="text-sm text-mineshaft-300">
          You are an approver for the current step. Please review the request details and provide
          your decision.
        </p>
        <Popover>
          <PopoverTrigger>
            <Button
              colorSchema="primary"
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              className="px-2 py-1"
            >
              Review
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" title="Finish your review" className="w-96">
            <FormLabel label="Finish your review" />
            <TextArea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment about your decision..."
              rows={3}
              reSize="vertical"
              className="mt-1 mb-4"
            />
            <div className="flex gap-3">
              <Button
                colorSchema="primary"
                leftIcon={<FontAwesomeIcon icon={faCheck} />}
                onClick={handleApprove}
                isLoading={isApproving}
                isDisabled={isRejecting}
                className="px-2 py-1"
              >
                Approve Request
              </Button>
              <Button
                colorSchema="danger"
                leftIcon={<FontAwesomeIcon icon={faXmark} />}
                onClick={handleReject}
                isLoading={isRejecting}
                isDisabled={isApproving}
                className="px-2 py-1"
              >
                Reject Request
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
