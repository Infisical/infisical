import { useState } from "react";
import {
  faCheck,
  faClose,
  faLandMineOn,
  faLockOpen,
  faTriangleExclamation,
  faUserLock,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, FormControl, Input } from "@app/components/v2";
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
  isBypasser: boolean;
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
  canApprove,
  isBypasser
}: Props) => {
  const { mutateAsync: performSecretApprovalMerge, isPending: isMerging } =
    usePerformSecretApprovalRequestMerge();

  const { mutateAsync: updateSecretStatusChange, isPending: isStatusChanging } =
    useUpdateSecretApprovalRequestStatus();

  const [byPassApproval, setByPassApproval] = useState(false);
  const [bypassReason, setBypassReason] = useState("");

  const isValidBypassReason = (value: string) => {
    const trimmedValue = value.trim();
    return trimmedValue.length >= 10;
  };

  const handleSecretApprovalRequestMerge = async () => {
    try {
      await performSecretApprovalMerge({
        id: approvalRequestId,
        workspaceId,
        bypassReason: byPassApproval ? bypassReason : undefined
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
      <div className="flex w-full flex-col items-start justify-between py-4 transition-all">
        <div className="flex items-center space-x-4 px-4">
          <div
            className={`flex items-center justify-center rounded-full ${isMergable ? "h-10 w-10 bg-green" : "h-11 w-11 bg-red-600"}`}
          >
            <FontAwesomeIcon
              icon={isMergable ? faCheck : faXmark}
              className={isMergable ? "text-lg text-black" : "text-2xl text-white"}
            />
          </div>
          <span className="flex flex-col">
            <p className={`text-md font-medium ${isMergable && "text-lg"}`}>
              {isMergable ? "Good to merge" : "Merging is blocked"}
            </p>
            {!isMergable && (
              <span className="inline-block text-xs text-bunker-200">
                At least {approvals} approving review{`${approvals > 1 ? "s" : ""}`} required by
                eligible reviewers.
                {Boolean(statusChangeByEmail) && `. Reopened by ${statusChangeByEmail}`}
              </span>
            )}
          </span>
        </div>
        {isSoftEnforcement && !isMergable && isBypasser && (
          <div
            className={`mt-4 w-full border-mineshaft-600 px-5 ${isMergable ? "border-t pb-2" : "border-y pb-4"}`}
          >
            <div className="mt-2 flex flex-col space-y-2 pt-2">
              <Checkbox
                onCheckedChange={(checked) => setByPassApproval(checked === true)}
                isChecked={byPassApproval}
                id="byPassApproval"
                checkIndicatorBg="text-white"
                className={twMerge(
                  "mr-2",
                  byPassApproval ? "border-red bg-red hover:bg-red-600" : ""
                )}
              >
                <span className="text-sm">
                  Merge without waiting for approval (bypass secret change policy)
                </span>
              </Checkbox>
              {byPassApproval && (
                <FormControl
                  label="Reason for bypass"
                  className="mt-2"
                  isRequired
                  tooltipText="Enter a reason for bypassing the secret change policy"
                >
                  <Input
                    value={bypassReason}
                    onChange={(e) => setBypassReason(e.target.value)}
                    placeholder="Enter reason for bypass (min 10 chars)"
                    leftIcon={<FontAwesomeIcon icon={faTriangleExclamation} />}
                  />
                </FormControl>
              )}
            </div>
          </div>
        )}
        <div className="mt-2 flex w-full items-center justify-end space-x-2 px-4">
          {canApprove || isSoftEnforcement ? (
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => handleSecretApprovalStatusChange("close")}
                isLoading={isStatusChanging}
                variant="outline_bg"
                colorSchema="primary"
                leftIcon={<FontAwesomeIcon icon={faClose} />}
                className="hover:border-red/60 hover:bg-red/10"
              >
                Close request
              </Button>
              <Button
                leftIcon={<FontAwesomeIcon icon={!canApprove ? faLandMineOn : faCheck} />}
                isDisabled={
                  !(
                    (isMergable && canApprove) ||
                    (isSoftEnforcement && byPassApproval && isValidBypassReason(bypassReason))
                  )
                }
                isLoading={isMerging}
                onClick={handleSecretApprovalRequestMerge}
                colorSchema={isSoftEnforcement && !canApprove ? "danger" : "primary"}
                variant="solid"
              >
                Merge
              </Button>
            </div>
          ) : (
            <div>Only approvers can merge</div>
          )}
        </div>
      </div>
    );
  }

  if (hasMerged && status === "close")
    return (
      <div className="flex w-full items-center justify-between rounded-md border border-primary/60 bg-primary/10">
        <div className="flex items-start space-x-4 p-4">
          <FontAwesomeIcon icon={faCheck} className="pt-1 text-2xl text-primary" />
          <span className="flex flex-col">
            Change request merged
            <span className="inline-block text-xs text-bunker-200">
              Merged by {statusChangeByEmail}.
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
