import { faArrowRotateForward, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";

import { Badge, Tooltip } from "@app/components/v2";
import { SecretScanningScanStatus } from "@app/hooks/api/secretScanningV2";

type Props = {
  status: SecretScanningScanStatus;
  statusMessage?: string | null;
  className?: string;
  scannedAt?: string | null;
};

export const SecretScanningScanStatusBadge = ({
  status,
  statusMessage,
  className,
  scannedAt
}: Props) => {
  if (status === SecretScanningScanStatus.Failed) {
    let errorMessage = statusMessage;
    if (statusMessage) {
      try {
        errorMessage = JSON.stringify(JSON.parse(statusMessage), null, 2);
      } catch {
        errorMessage = statusMessage;
      }
    }

    return (
      <Tooltip
        position="left"
        className="max-w-sm select-text"
        content={
          <div className="flex flex-col gap-2 whitespace-normal py-1">
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pr-1.5 pt-0.5 text-sm" />
                <div className="text-xs">Failure Reason</div>
              </div>
              <div className="break-words rounded bg-mineshaft-600 p-2 text-xs">{errorMessage}</div>
              {scannedAt && (
                <div className="mt-1 text-xs text-mineshaft-400">
                  Attempted {formatDistance(new Date(scannedAt), new Date(), { addSuffix: true })}
                </div>
              )}
            </div>
          </div>
        }
      >
        <div>
          <Badge
            variant="danger"
            className={twMerge("flex h-5 w-min items-center gap-1.5 whitespace-nowrap", className)}
          >
            <FontAwesomeIcon icon={faXmark} />
            Scan Error
          </Badge>
        </div>
      </Tooltip>
    );
  }

  if (status === SecretScanningScanStatus.Queued || status === SecretScanningScanStatus.Scanning) {
    return (
      <Badge
        className={twMerge("flex h-5 w-min items-center gap-1.5 whitespace-nowrap", className)}
        variant="primary"
      >
        <FontAwesomeIcon icon={faArrowRotateForward} className="animate-spin" />
        <span>Scanning</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="success"
      className={twMerge(
        "flex h-5 w-min items-center gap-1.5 whitespace-nowrap capitalize",
        className
      )}
    >
      <FontAwesomeIcon icon={faCheck} />
      <span>Complete</span>
    </Badge>
  );
};
