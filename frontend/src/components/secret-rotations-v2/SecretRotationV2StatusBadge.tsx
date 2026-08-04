import { format, formatDistanceToNow } from "date-fns";
import { BanIcon, RefreshCwIcon, XIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { SecretRotationStatus, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

type Props = {
  secretRotation: TSecretRotationV2;
};

export const SecretRotationV2StatusBadge = ({ secretRotation }: Props) => {
  const { isAutoRotationEnabled, rotationStatus, nextRotationAt, lastRotationMessage } =
    secretRotation;

  if (rotationStatus === SecretRotationStatus.Failed) {
    let errorMessage = lastRotationMessage;
    if (lastRotationMessage) {
      try {
        errorMessage = JSON.stringify(JSON.parse(lastRotationMessage), null, 2);
      } catch {
        errorMessage = lastRotationMessage;
      }
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="danger">
            <XIcon />
            Rotation Failed
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm select-text">
          <div className="flex flex-col gap-2 py-1 whitespace-normal">
            <div>
              <div className="mb-2 flex items-start gap-1.5 text-danger">
                <XIcon className="mt-0.5 size-3.5 shrink-0" />
                <div className="text-xs">Failure Reason</div>
              </div>
              <div className="rounded-sm bg-card p-2 text-xs break-words">{errorMessage}</div>
            </div>
            {nextRotationAt && (
              <span className="text-xs text-muted">
                Next rotation attempt on {format(nextRotationAt, "MM/dd/yyyy")} at{" "}
                {format(nextRotationAt, "h:mm aa")}.
              </span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!isAutoRotationEnabled) {
    return (
      <Badge variant="neutral">
        <BanIcon />
        Auto-Rotation Disabled
      </Badge>
    );
  }

  const daysToRotation =
    (new Date(nextRotationAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={daysToRotation >= 7 ? "info" : "warning"} className="capitalize">
          <RefreshCwIcon />
          {daysToRotation < 0
            ? "Rotating"
            : `Rotates ${formatDistanceToNow(nextRotationAt, { addSuffix: true })}`}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-lg">
        <span>
          Rotates on {format(nextRotationAt, "MM/dd/yyyy")} at {format(nextRotationAt, "h:mm aa")}
        </span>{" "}
        <span className="text-muted">(Local Time)</span>
      </TooltipContent>
    </Tooltip>
  );
};
