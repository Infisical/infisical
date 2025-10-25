import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistance } from "date-fns";
import { CheckIcon, RotateCwIcon, XIcon } from "lucide-react";

import { Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { SecretScanningScanStatus } from "@app/hooks/api/secretScanningV2";

type Props = {
  status: SecretScanningScanStatus;
  statusMessage?: string | null;

  scannedAt?: string | null;
};

export const SecretScanningScanStatusBadge = ({
  status,
  statusMessage,

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
          <div className="flex flex-col gap-2 py-1 whitespace-normal">
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                <div className="text-xs">Failure Reason</div>
              </div>
              <div className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">
                {errorMessage}
              </div>
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
          <Badge variant="danger">
            <XIcon />
            Scan Error
          </Badge>
        </div>
      </Tooltip>
    );
  }

  if (status === SecretScanningScanStatus.Queued || status === SecretScanningScanStatus.Scanning) {
    return (
      <Badge variant="info">
        <RotateCwIcon className="animate-spin" />
        Scanning
      </Badge>
    );
  }

  return (
    <Badge variant="success">
      <CheckIcon />
      Complete
    </Badge>
  );
};
