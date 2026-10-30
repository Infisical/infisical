import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
      <Tooltip hoverable selectable delayDuration={50}>
        <TooltipTrigger asChild>
          <Badge variant="danger">
            <XIcon />
            Rotation Failed
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm">
          <div className="flex flex-col gap-2 py-1 whitespace-normal">
            <div>
              <div className="mb-2 flex self-start text-danger">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                <div className="text-xs">Failure Reason</div>
              </div>
              <div className="rounded-sm bg-surface-active p-2 text-xs break-words">
                {errorMessage}
              </div>
            </div>
            {nextRotationAt && (
              <span className="text-xs text-label">
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
    <Tooltip hoverable delayDuration={50}>
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
        <span className="text-label">(Local Time)</span>
      </TooltipContent>
    </Tooltip>
  );
};
