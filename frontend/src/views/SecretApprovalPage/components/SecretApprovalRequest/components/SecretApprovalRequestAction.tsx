import React, { useState } from "react";
import {
  faCheck,
  faClose,
  faLandMineOn,
  faLockOpen,
  faSquareCheck,
  faSquareXmark,
  faUserLock} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox } from "@app/components/v2";
import {
  usePerformSecretApprovalRequestMerge,
  useUpdateSecretApprovalRequestStatus
} from "@app/hooks/api";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";

type Props = {
  approvalRequestId: string;
  hasMerged?: boolean;
  isMergable?: boolean;
  status: "close" | "open";
  approvals: number;
  canApprove?: boolean;
  statusChangeByEmail?: string;
  workspaceId: string;
  enforcementLevel: EnforcementLevel;
};

export const SecretApprovalRequestAction = ({
  approvalRequestId,
  hasMerged,
  status,
  isMergable,
  approvals,
  statusChangeByEmail,
  workspaceId,  
  enforcementLevel,
  canApprove
}: Props) => {
  const { mutateAsync: performSecretApprovalMerge, isLoading: isMerging } =
    usePerformSecretApprovalRequestMerge();

  const { mutateAsync: updateSecretStatusChange, isLoading: isStatusChanging } =
    useUpdateSecretApprovalRequestStatus();

  const [byPassApproval, setByPassApproval] = useState(false);

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

  const isSoftEnforcement = enforcementLevel === EnforcementLevel.Soft;

  if (!hasMerged && status === "open") {
    return (
      <div className="flex w-full items-center justify-between">
        <div className="flex items-start space-x-4">
          <FontAwesomeIcon
            icon={isMergable ? faSquareCheck : faSquareXmark}
            className={twMerge("pt-1 text-2xl", isMergable ? "text-primary" : "text-red-600")}
          />
          <span className="flex flex-col">
            {isMergable ? "Good to merge" : "Review required"}
            <span className="inline-block text-xs text-bunker-200">
              At least {approvals} approving review required
              {Boolean(statusChangeByEmail) && `. Reopened by ${statusChangeByEmail}`}
            </span>
            {!canApprove && isSoftEnforcement && (
              <div className="mt-1">
                <Checkbox
                  onCheckedChange={(checked) => setByPassApproval(checked === true)}
                  isChecked={byPassApproval}
                  id="byPassApproval"
                  checkIndicatorBg="text-white"
                  className={byPassApproval ? "bg-red hover:bg-red-600 border-red" : ""}
                >
                  <span className="text-red text-sm">
                    Merge without waiting for approval (bypass secret change policy)
                  </span>
                </Checkbox>
              </div>
            )}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {canApprove || isSoftEnforcement ? (
            <>
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
                leftIcon={<FontAwesomeIcon icon={!canApprove ? faLandMineOn : faCheck} />}
                isDisabled={
                  (!isMergable && canApprove)
                  || (!canApprove && isSoftEnforcement && !byPassApproval)
                }
                isLoading={isMerging}
                onClick={handleSecretApprovalRequestMerge}
                colorSchema={isSoftEnforcement && !canApprove ? "danger" : "primary"}
                variant="solid"
              >
                Merge
              </Button>
            </>
          ) : (
            <div>Only approvers can merge</div>
          )}
        </div>
      </div>
    );
  }

  if (hasMerged && status === "close")
    return (
      <div className="flex w-full items-center justify-between">
        <div className="flex items-start space-x-4">
          <FontAwesomeIcon icon={faCheck} className="pt-1 text-2xl text-primary" />
          <span className="flex flex-col">
            Secret approval merged
            <span className="inline-block text-xs text-bunker-200">
              Merged by {statusChangeByEmail}
            </span>
          </span>
        </div>
      </div>
    );

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-start space-x-4">
        <FontAwesomeIcon icon={faUserLock} className="pt-1 text-2xl text-primary" />
        <span className="flex flex-col">
          Secret approval has been closed
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
