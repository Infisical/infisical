import {
  faCheck,
  faClose,
  faLockOpen,
  faSquareCheck,
  faSquareXmark,
  faUserLock
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button } from "@app/components/v2";
import {
  usePerformSecretApprovalRequestMerge,
  useUpdateSecretApprovalRequestStatus
} from "@app/hooks/api";

type Props = {
  approvalRequestId: string;
  hasMerged?: boolean;
  isMergable?: boolean;
  status: "close" | "open";
  approvals: number;
  statusChangeByEmail: string;
  workspaceId: string;
};

export const SecretApprovalRequestAction = ({
  approvalRequestId,
  hasMerged,
  status,
  isMergable,
  approvals,
  statusChangeByEmail,
  workspaceId
}: Props) => {
  const { createNotification } = useNotificationContext();
  const { mutateAsync: performSecretApprovalMerge, isLoading: isMerging } =
    usePerformSecretApprovalRequestMerge();

  const { mutateAsync: updateSecretStatusChange, isLoading: isStatusChanging } =
    useUpdateSecretApprovalRequestStatus();

  const handleSecretApprovalRequestMerge = async () => {
    try {
      await performSecretApprovalMerge({
        id: approvalRequestId,
        workspaceId
      });
      createNotification({
        type: "success",
        text: "Successfully merged the request"
      });
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to update the request status"
      });
    }
  };

  const handleSecretApprovalStatusChange = async (reqState: "open" | "close") => {
    try {
      await updateSecretStatusChange({
        id: approvalRequestId,
        status: reqState,
        workspaceId
      });
      createNotification({
        type: "success",
        text: "Successfully updated the request"
      });
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to update the request status"
      });
    }
  };

  if (!hasMerged && status === "open") {
    return (
      <div className="flex justify-between items-center w-full">
        <div className="flex space-x-4 items-start">
          <FontAwesomeIcon
            icon={isMergable ? faSquareCheck : faSquareXmark}
            className={twMerge("text-2xl pt-1", isMergable ? "text-primary" : "text-red-600")}
          />
          <span className="flex flex-col">
            {isMergable ? "Good to merge" : "Review required"}
            <span className="inline-block text-xs text-bunker-200">
              At least {approvals} approving review required
              {Boolean(statusChangeByEmail) && `. Reopened by ${statusChangeByEmail}`}
            </span>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => handleSecretApprovalStatusChange("close")}
            isLoading={isStatusChanging}
            variant="outline_bg"
            colorSchema="secondary"
            leftIcon={<FontAwesomeIcon icon={faClose} />}
          >
            Close request
          </Button>
          <Button
            leftIcon={<FontAwesomeIcon icon={faCheck} />}
            isDisabled={!isMergable}
            isLoading={isMerging}
            onClick={handleSecretApprovalRequestMerge}
            colorSchema="primary"
            variant="solid"
          >
            Merge
          </Button>
        </div>
      </div>
    );
  }

  if (hasMerged && status === "close")
    return (
      <div className="flex justify-between items-center w-full">
        <div className="flex space-x-4 items-start">
          <FontAwesomeIcon icon={faCheck} className="text-2xl text-primary pt-1" />
          <span className="flex flex-col">
            Change request merged
            <span className="inline-block text-xs text-bunker-200">
              Merged by {statusChangeByEmail}
            </span>
          </span>
        </div>
      </div>
    );

  return (
    <div className="flex justify-between items-center w-full">
      <div className="flex space-x-4 items-start">
        <FontAwesomeIcon icon={faUserLock} className="text-2xl text-primary pt-1" />
        <span className="flex flex-col">
          Change request has been closed
          <span className="inline-block text-xs text-bunker-200">
            Closed by {statusChangeByEmail}
          </span>
        </span>
      </div>
      <div className="flex items-center space-x-6">
        <Button
          onClick={() => handleSecretApprovalStatusChange("open")}
          isLoading={isStatusChanging}
          variant="outline_bg"
          leftIcon={<FontAwesomeIcon icon={faLockOpen} />}
        >
          Reopen request
        </Button>
      </div>
    </div>
  );
};
