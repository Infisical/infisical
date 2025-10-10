import { faBan, faRotate, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format, formatDistanceToNow } from "date-fns";
import { twMerge } from "tailwind-merge";

import { Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge/Badge";
import { SecretRotationStatus, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

type Props = {
  secretRotation: TSecretRotationV2;
  className?: string;
};

export const SecretRotationV2StatusBadge = ({ secretRotation, className }: Props) => {
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
      <Tooltip
        position="left"
        className="max-w-sm select-text"
        content={
          <div className="flex flex-col gap-2 py-1 whitespace-normal">
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                <div className="text-xs">Failure Reason</div>
              </div>
              <div className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">
                {errorMessage}
              </div>
            </div>
            {nextRotationAt && (
              <span className="text-xs text-mineshaft-300">
                Next rotation attempt on {format(nextRotationAt, "MM/dd/yyyy")} at{" "}
                {format(nextRotationAt, "h:mm aa")}.
              </span>
            )}
          </div>
        }
      >
        <div>
          <Badge
            variant="danger"
            className={twMerge("flex h-5 w-min items-center gap-1.5 whitespace-nowrap", className)}
          >
            <FontAwesomeIcon icon={faXmark} />
            Rotation Failed
          </Badge>
        </div>
      </Tooltip>
    );
  }

  if (!isAutoRotationEnabled) {
    return (
      <Badge
        className={twMerge(
          "flex h-5 w-min items-center gap-1.5 bg-mineshaft-400/50 whitespace-nowrap text-bunker-300",
          className
        )}
      >
        <FontAwesomeIcon icon={faBan} />
        Auto-Rotation Disabled
      </Badge>
    );
  }

  const daysToRotation =
    (new Date(nextRotationAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);

  return (
    <Tooltip
      className="max-w-lg"
      content={
        <>
          <span>
            Rotates on {format(nextRotationAt, "MM/dd/yyyy")} at {format(nextRotationAt, "h:mm aa")}
          </span>{" "}
          <span className="text-mineshaft-300">(Local Time)</span>
        </>
      }
    >
      <div>
        <Badge
          variant={daysToRotation >= 7 ? "success" : "primary"}
          className={twMerge(
            "flex h-5 w-min items-center gap-1.5 whitespace-nowrap capitalize",
            className
          )}
        >
          <FontAwesomeIcon icon={faRotate} />
          {daysToRotation < 0
            ? "Rotating"
            : `Rotates ${formatDistanceToNow(nextRotationAt, { addSuffix: true })}`}
        </Badge>
      </div>
    </Tooltip>
  );
};
