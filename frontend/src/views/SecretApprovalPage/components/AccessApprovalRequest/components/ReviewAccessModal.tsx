import { useCallback, useMemo, useState } from "react";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import { ProjectPermissionActions } from "@app/context";
import { useReviewAccessRequest } from "@app/hooks/api";
import { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { TWorkspaceUser } from "@app/hooks/api/types";

export const ReviewAccessRequestModal = ({
  isOpen,
  onOpenChange,
  request,
  projectSlug,
  selectedRequester,
  selectedEnvSlug
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  request: TAccessApprovalRequest & { user: TWorkspaceUser["user"] | null };
  projectSlug: string;
  selectedRequester: string | undefined;
  selectedEnvSlug: string | undefined;
}) => {
  const [isLoading, setIsLoading] = useState<"approved" | "rejected" | null>(null);

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

  const handleReview = useCallback(async (status: "approved" | "rejected") => {
    setIsLoading(status);
    try {
      await reviewAccessRequest.mutateAsync({
        requestId: request.id,
        status,
        projectSlug,
        envSlug: selectedEnvSlug,
        requestedBy: selectedRequester
      });
    } catch (error) {
      console.error(error);
      setIsLoading(null);
      return;
    }

    createNotification({
      title: `Request ${status}`,
      text: `The request has been ${status}`,
      type: status === "approved" ? "success" : "info"
    });

    setIsLoading(null);
    onOpenChange(false);
  }, []);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-4xl"
        title="Review Request"
        subTitle="Review the request and approve or deny access."
      >
        <div className="text-sm">
          <span>
            <span className="font-bold">
              {request.user?.firstName} {request.user?.lastName} ({request.user?.email})
            </span>{" "}
            is requesting access to the following resource:
          </span>

          <div className="mt-4 mb-2 border-l border-blue-500 bg-blue-500/20 px-3 py-2 text-mineshaft-200">
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
          </div>

          <div className="space-x-2">
            <Button
              isLoading={isLoading === "approved"}
              isDisabled={!!isLoading}
              onClick={() => handleReview("approved")}
              className="mt-4"
              size="sm"
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
        </div>
      </ModalContent>
    </Modal>
  );
};
