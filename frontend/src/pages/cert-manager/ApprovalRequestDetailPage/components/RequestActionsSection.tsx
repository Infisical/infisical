import { useState } from "react";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Button, FormLabel, Modal, ModalContent, TextArea } from "@app/components/v2";
import { useProjectPermission, useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
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
  const { handlePopUpOpen, handlePopUpToggle, popUp } = usePopUp(["approveModal", "rejectModal"]);

  const userId = user?.id || "";
  const userGroups = memberships.map((el) => el.actorGroupId).filter(Boolean);

  const { mutateAsync: approveRequest, isPending: isApproving } = useApproveApprovalRequest();
  const { mutateAsync: rejectRequest, isPending: isRejecting } = useRejectApprovalRequest();

  if (request.status !== ApprovalRequestStatus.Pending) {
    return null;
  }

  const currentStep = request.steps.find(
    (step) => step.status === ApprovalRequestStepStatus.InProgress
  );

  if (!currentStep) {
    return null;
  }

  const isApprover = currentStep.approvers.some((approver) =>
    approver.type === ApproverType.User ? approver.id === userId : userGroups.includes(approver.id)
  );

  if (!isApprover) {
    return null;
  }

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
      handlePopUpToggle("approveModal", false);
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
      handlePopUpToggle("rejectModal", false);
    } finally {
      setComment("");
    }
  };

  return (
    <>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-4">
        <div className="flex items-center gap-2">
          <TriangleAlertIcon />
          <h3 className="font-medium text-mineshaft-100">Action Required</h3>
        </div>
        <p className="text-sm text-mineshaft-300">
          You are an approver for this certificate request. Please review the details carefully
          before making your decision.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            colorSchema="primary"
            leftIcon={<FontAwesomeIcon icon={faCheck} />}
            onClick={() => handlePopUpOpen("approveModal")}
            isDisabled={isRejecting}
            className="w-full"
          >
            Approve Request
          </Button>
          <Button
            colorSchema="danger"
            variant="outline_bg"
            leftIcon={<FontAwesomeIcon icon={faXmark} />}
            onClick={() => handlePopUpOpen("rejectModal")}
            isDisabled={isApproving}
            className="w-full"
          >
            Reject Request
          </Button>
        </div>
      </div>

      <Modal
        isOpen={popUp.approveModal.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("approveModal", isOpen)}
      >
        <ModalContent title="Approve Request">
          <FormLabel label="Comment (optional)" />
          <TextArea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment about your approval..."
            rows={3}
            reSize="vertical"
            className="mb-4"
          />
          <div className="flex gap-3">
            <Button
              colorSchema="primary"
              onClick={handleApprove}
              isLoading={isApproving}
              className="flex-1"
            >
              Confirm Approval
            </Button>
            <Button
              variant="outline_bg"
              onClick={() => handlePopUpToggle("approveModal", false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={popUp.rejectModal.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("rejectModal", isOpen)}
      >
        <ModalContent title="Reject Request">
          <FormLabel label="Reason for rejection (optional)" />
          <TextArea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Explain why you're rejecting this request..."
            rows={3}
            reSize="vertical"
            className="mb-4"
          />
          <div className="flex gap-3">
            <Button
              colorSchema="danger"
              onClick={handleReject}
              isLoading={isRejecting}
              className="flex-1"
            >
              Confirm Rejection
            </Button>
            <Button
              variant="outline_bg"
              onClick={() => handlePopUpToggle("rejectModal", false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
};
