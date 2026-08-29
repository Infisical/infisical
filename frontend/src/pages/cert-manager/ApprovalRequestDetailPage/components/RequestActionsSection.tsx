import { useState } from "react";
import { CheckIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  TextArea
} from "@app/components/v3";
import { useProjectPermission, useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import { ApprovalPolicyType, ApproverType } from "@app/hooks/api/approvalPolicies";
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

  if (request.type === ApprovalPolicyType.CertCodeSigning && request.requesterId === userId) {
    return null;
  }

  const hasAlreadyActed = currentStep.approvals.some(
    (approval) => approval.approverUserId === userId
  );

  if (hasAlreadyActed) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted">
            You have already provided your approval for this request.
          </p>
        </CardContent>
      </Card>
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
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TriangleAlertIcon className="size-4 text-warning" />
            <h3 className="font-medium text-foreground">Action Required</h3>
          </div>
          <p className="text-sm text-muted">
            You are an approver for this request. Please review the details carefully before making
            your decision.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="project"
              onClick={() => handlePopUpOpen("approveModal")}
              isDisabled={isRejecting}
              className="w-full"
            >
              <CheckIcon className="mr-1.5 size-4" />
              Approve Request
            </Button>
            <Button
              variant="danger"
              onClick={() => handlePopUpOpen("rejectModal")}
              isDisabled={isApproving}
              className="w-full"
            >
              <XIcon className="mr-1.5 size-4" />
              Reject Request
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={popUp.approveModal.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("approveModal", isOpen)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve request</DialogTitle>
            <DialogDescription>
              The requester gets the access described on this request as soon as you approve.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>Comment (optional)</FieldLabel>
            <FieldContent>
              <TextArea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment about your approval..."
                rows={3}
                className="resize-y"
              />
            </FieldContent>
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handlePopUpToggle("approveModal", false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="project"
              onClick={handleApprove}
              isPending={isApproving}
              className="flex-1"
            >
              Confirm approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={popUp.rejectModal.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("rejectModal", isOpen)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>
              The request is closed and the requester gets no access. They can open a new one.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>Reason for rejection (optional)</FieldLabel>
            <FieldContent>
              <TextArea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Explain why you're rejecting this request..."
                rows={3}
                className="resize-y"
              />
            </FieldContent>
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handlePopUpToggle("rejectModal", false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              isPending={isRejecting}
              className="flex-1"
            >
              Confirm rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
