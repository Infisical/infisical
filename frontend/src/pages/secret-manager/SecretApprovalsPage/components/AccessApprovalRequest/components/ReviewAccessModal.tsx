import { useCallback, useMemo, useState } from "react";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ms from "ms";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import { ProjectPermissionActions } from "@app/context";
import { useReviewAccessRequest } from "@app/hooks/api";
import { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";

export const ReviewAccessRequestModal = ({
  isOpen,
  onOpenChange,
  request,
  projectSlug,
  selectedRequester,
  selectedEnvSlug,
  canBypassApprovalPermission
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  request: TAccessApprovalRequest & {
    user: { firstName?: string; lastName?: string; email?: string } | null;
    isRequestedByCurrentUser: boolean;
    isSelfApproveAllowed: boolean;
    isApprover: boolean;
  };
  projectSlug: string;
  selectedRequester: string | undefined;
  selectedEnvSlug: string | undefined;
  canBypassApprovalPermission: boolean;
}) => {
  const [isLoading, setIsLoading] = useState<"approved" | "rejected" | null>(null);
  const [bypassApproval, setBypassApproval] = useState(false);
  const [bypassReason, setBypassReason] = useState("");

  const isSoftEnforcement = request.policy.enforcementLevel === EnforcementLevel.Soft;

  const accessDetails = {
    env: request.environmentName,
    // secret path will be inside $glob operator
    secretPath: request.policy.secretPath,
    read: request.permissions?.some(({ action }) => action.includes(ProjectPermissionActions.Read)),
    edit: request.permissions?.some(({ action }) => action.includes(ProjectPermissionActions.Edit)),
    create: request.permissions?.some(({ action }) =>
      action.includes(ProjectPermissionActions.Create)
    ),
    delete: request.permissions?.some(({ action }) =>
      action.includes(ProjectPermissionActions.Delete)
    ),

    temporaryAccess: {
      isTemporary: request.isTemporary,
      temporaryRange: request.temporaryRange
    }
  };

  const requestedAccess = useMemo(() => {
    const access: string[] = [];
    if (accessDetails.read) access.push("Read");
    if (accessDetails.edit) access.push("Edit");
    if (accessDetails.create) access.push("Create");
    if (accessDetails.delete) access.push("Delete");

    return access.join(", ");
  }, [accessDetails]);

  const getAccessLabel = () => {
    if (!accessDetails.temporaryAccess.isTemporary || !accessDetails.temporaryAccess.temporaryRange)
      return "Permanent";

    // convert the range to human readable format
    ms(ms(accessDetails.temporaryAccess.temporaryRange), { long: true });

    return (
      <Badge>
        {`Valid for ${ms(ms(accessDetails.temporaryAccess.temporaryRange), {
          long: true
        })} after approval`}
      </Badge>
    );
  };

  const reviewAccessRequest = useReviewAccessRequest();

  const handleReview = useCallback(
    async (status: "approved" | "rejected") => {
      if (bypassApproval && bypassReason.length < 10) {
        createNotification({
          title: "Failed to bypass approval",
          text: "Reason must be 10 characters or longer",
          type: "error"
        });
        return;
      }

      setIsLoading(status);
      try {
        await reviewAccessRequest.mutateAsync({
          requestId: request.id,
          status,
          projectSlug,
          envSlug: selectedEnvSlug,
          requestedBy: selectedRequester,
          bypassReason: bypassApproval ? bypassReason : undefined
        });

        createNotification({
          title: `Request ${status}`,
          text: `The request has been ${status}`,
          type: status === "approved" ? "success" : "info"
        });
      } catch (error) {
        console.error(error);
        setIsLoading(null);
        return;
      }

      setIsLoading(null);
      onOpenChange(false);
    },
    [
      bypassApproval,
      bypassReason,
      reviewAccessRequest,
      request,
      selectedEnvSlug,
      selectedRequester,
      onOpenChange
    ]
  );

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-4xl"
        title="Review Request"
        subTitle="Review the request and approve or deny access."
      >
        <div className="text-sm">
          <span>
            {request.user &&
            (request.user.firstName || request.user.lastName) &&
            request.user.email ? (
              <span className="font-bold">
                {request.user?.firstName} {request.user?.lastName} ({request.user?.email})
              </span>
            ) : (
              <span>A user</span>
            )}{" "}
            is requesting access to the following resource:
          </span>
          <div className="mb-2 mt-4 border-l border-blue-500 bg-blue-500/20 px-3 py-2 text-mineshaft-200">
            <div className="mb-1 lowercase">
              <span className="font-bold capitalize">Requested path: </span>
              <Badge>{accessDetails.env + accessDetails.secretPath || ""}</Badge>
            </div>

            <div className="mb-1">
              <span className="font-bold">Permissions: </span>
              <Badge>{requestedAccess}</Badge>
            </div>

            <div>
              <span className="font-bold">Access Type: </span>
              <span>{getAccessLabel()}</span>
            </div>

            {request.note && (
              <div className="mt-1">
                <span className="font-bold">User Note: </span>
                <span>{request.note}</span>
              </div>
            )}
          </div>
          <div className="space-x-2">
            <Button
              isLoading={isLoading === "approved"}
              isDisabled={
                !!isLoading ||
                (!(
                  request.isApprover &&
                  (!request.isRequestedByCurrentUser || request.isSelfApproveAllowed)
                ) &&
                  !bypassApproval)
              }
              onClick={() => handleReview("approved")}
              className="mt-4"
              size="sm"
              colorSchema={!request.isApprover && isSoftEnforcement ? "danger" : "primary"}
            >
              Approve Request
            </Button>
            <Button
              isLoading={isLoading === "rejected"}
              isDisabled={!!isLoading}
              onClick={() => handleReview("rejected")}
              className="mt-4 border-transparent bg-transparent text-mineshaft-200 hover:border-red hover:bg-red/20 hover:text-mineshaft-200"
              size="sm"
            >
              Reject Request
            </Button>
          </div>
          {isSoftEnforcement &&
            request.isRequestedByCurrentUser &&
            !(request.isApprover && request.isSelfApproveAllowed) &&
            canBypassApprovalPermission && (
              <div className="mt-2 flex flex-col space-y-2">
                <Checkbox
                  onCheckedChange={(checked) => setBypassApproval(checked === true)}
                  isChecked={bypassApproval}
                  id="byPassApproval"
                  checkIndicatorBg="text-white"
                  className={twMerge(
                    "mr-2",
                    bypassApproval ? "border-red bg-red hover:bg-red-600" : ""
                  )}
                >
                  <span className="text-xs text-red">
                    Approve without waiting for requirements to be met (bypass policy protection)
                  </span>
                </Checkbox>
                {bypassApproval && (
                  <FormControl
                    label="Reason for bypass"
                    className="mt-2"
                    isRequired
                    tooltipText="Enter a reason for bypassing the secret change policy"
                  >
                    <Input
                      value={bypassReason}
                      onChange={(e) => setBypassReason(e.currentTarget.value)}
                      placeholder="Enter reason for bypass (min 10 chars)"
                      leftIcon={<FontAwesomeIcon icon={faTriangleExclamation} />}
                    />
                  </FormControl>
                )}
              </div>
            )}
        </div>
      </ModalContent>
    </Modal>
  );
};
