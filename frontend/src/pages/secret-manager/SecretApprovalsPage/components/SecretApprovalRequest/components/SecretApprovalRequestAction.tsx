import { useState } from "react";
import {
  CheckIcon,
  CircleXIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  LockIcon,
  LockOpenIcon,
  ShieldAlertIcon,
  TriangleAlertIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Field,
  FieldLabel,
  Input,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
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
  isCommitter?: boolean;
  isBypasser: boolean;
  statusChangeByEmail?: string;
  enforcementLevel: EnforcementLevel;
};

export const SecretApprovalRequestAction = ({
  approvalRequestId,
  hasMerged,
  status,
  isMergable,
  approvals,
  statusChangeByEmail,
  enforcementLevel,
  canApprove,
  isCommitter,
  isBypasser
}: Props) => {
  const { projectId } = useProject();
  const { mutateAsync: performSecretApprovalMerge, isPending: isMerging } =
    usePerformSecretApprovalRequestMerge();

  const { mutateAsync: updateSecretStatusChange, isPending: isStatusChanging } =
    useUpdateSecretApprovalRequestStatus();

  const [byPassApproval, setByPassApproval] = useState(false);
  const [bypassReason, setBypassReason] = useState("");

  const isValidBypassReason = (value: string) => value.trim().length >= 10;

  const handleSecretApprovalRequestMerge = async () => {
    await performSecretApprovalMerge({
      id: approvalRequestId,
      projectId,
      bypassReason: byPassApproval ? bypassReason : undefined
    });
    createNotification({
      type: "success",
      text: "Successfully merged the request"
    });
  };

  const handleSecretApprovalStatusChange = async (reqState: "open" | "close") => {
    await updateSecretStatusChange({
      id: approvalRequestId,
      status: reqState,
      projectId
    });
    createNotification({
      type: "success",
      text: "Successfully updated the request"
    });
  };

  const isSoftEnforcement = enforcementLevel === EnforcementLevel.Soft;

  if (!hasMerged && status === "open") {
    return (
      <div className="flex w-full flex-col gap-3">
        {isSoftEnforcement && !isMergable && isBypasser && (
          <div className="flex flex-col gap-2 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="byPassApproval"
                isChecked={byPassApproval}
                onCheckedChange={(checked) => setByPassApproval(checked === true)}
                variant="warning"
              />
              <Label htmlFor="byPassApproval" className="text-xs font-normal text-warning">
                Merge without waiting for approval (bypass secret change policy)
              </Label>
            </div>
            {byPassApproval && (
              <Field>
                <FieldLabel htmlFor="bypassReason" className="flex items-center gap-1">
                  Reason for bypass
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TriangleAlertIcon className="size-3.5 text-warning" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Enter a reason for bypassing the secret change policy
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Input
                  id="bypassReason"
                  value={bypassReason}
                  onChange={(e) => setBypassReason(e.target.value)}
                  placeholder="Enter reason for bypass (min 10 chars)"
                />
              </Field>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {isMergable ? (
              <CheckIcon className="size-4 shrink-0 text-success" />
            ) : (
              <CircleXIcon className="size-4 shrink-0 text-danger" />
            )}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {isMergable ? "Good to merge" : "Merging is blocked"}
              </span>
              {!isMergable && (
                <span className="text-xs text-muted">
                  At least {approvals} approving review{approvals > 1 ? "s" : ""} required by
                  eligible reviewers.
                  {statusChangeByEmail ? ` Reopened by ${statusChangeByEmail}.` : ""}
                </span>
              )}
            </div>
          </div>
          {canApprove || isSoftEnforcement || isCommitter ? (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => handleSecretApprovalStatusChange("close")}
                isPending={isStatusChanging}
                variant="danger"
                size="sm"
              >
                <GitPullRequestClosedIcon />
                Close Request
              </Button>
              <Button
                isDisabled={
                  !(
                    (isMergable && canApprove) ||
                    (isSoftEnforcement && byPassApproval && isValidBypassReason(bypassReason))
                  )
                }
                isPending={isMerging}
                onClick={handleSecretApprovalRequestMerge}
                variant={isSoftEnforcement && !canApprove ? "danger" : "project"}
                size="sm"
              >
                {!canApprove ? <ShieldAlertIcon /> : <GitMergeIcon />}
                Merge
              </Button>
            </div>
          ) : (
            <span className="text-sm text-muted">Only approvers can merge</span>
          )}
        </div>
      </div>
    );
  }

  if (hasMerged && status === "close")
    return (
      <Alert variant="success">
        <CheckIcon />
        <AlertTitle>Change request merged</AlertTitle>
        {statusChangeByEmail && (
          <AlertDescription>Merged by {statusChangeByEmail}.</AlertDescription>
        )}
      </Alert>
    );

  return (
    <Alert variant="warning">
      <LockIcon />
      <div className="col-start-2 flex items-center justify-between gap-3">
        <div>
          <AlertTitle>Secret approval has been closed</AlertTitle>
          {statusChangeByEmail && (
            <AlertDescription>Closed by {statusChangeByEmail}.</AlertDescription>
          )}
        </div>
        <Button
          onClick={() => handleSecretApprovalStatusChange("open")}
          isPending={isStatusChanging}
          variant="warning"
          size="sm"
          className="shrink-0"
        >
          <LockOpenIcon />
          Reopen request
        </Button>
      </div>
    </Alert>
  );
};
