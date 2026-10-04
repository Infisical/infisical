import { formatDistance } from "date-fns";
import { CheckIcon, RotateCwIcon, XIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
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
      <Tooltip selectable>
        <TooltipTrigger
          type="button"
          aria-label="Scan error: failure reason"
          onClick={(event) => event.stopPropagation()}
          className="w-fit rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Badge variant="danger">
            <XIcon />
            Scan Error
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm">
          <div className="flex flex-col gap-2 py-1 whitespace-normal">
            <div>
              <div className="mb-2 flex self-start text-danger">
                <XIcon aria-hidden className="mr-1.5 ml-1 size-3.5" />
                <div className="text-xs">Failure Reason</div>
              </div>
              <div className="rounded-sm bg-surface-active p-2 text-xs break-words">
                {errorMessage}
              </div>
              {scannedAt && (
                <div className="mt-1 text-xs text-muted">
                  Attempted {formatDistance(new Date(scannedAt), new Date(), { addSuffix: true })}
                </div>
              )}
            </div>
          </div>
        </TooltipContent>
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
