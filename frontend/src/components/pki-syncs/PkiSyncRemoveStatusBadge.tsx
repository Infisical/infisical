import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  faCheck,
  faEraser,
  faTriangleExclamation,
  faXmark,
  IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { differenceInSeconds } from "date-fns";
import { twMerge } from "tailwind-merge";

import { Badge, Tooltip } from "@app/components/v2";
import { BadgeProps } from "@app/components/v2/Badge/Badge";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSyncStatus, TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
  className?: string;
  mini?: boolean;
};

export const PkiSyncRemoveStatusBadge = ({ pkiSync, className, mini }: Props) => {
  const { removeStatus, lastRemoveMessage, lastRemovedAt, destination } = pkiSync;
  const [hide, setHide] = useState(removeStatus === PkiSyncStatus.Succeeded);
  const destinationName = PKI_SYNC_MAP[destination].name;

  useEffect(() => {
    if (removeStatus === PkiSyncStatus.Succeeded) {
      setTimeout(() => setHide(true), 3000);
    } else {
      setHide(false);
    }
  }, [removeStatus]);

  const failureMessage = useMemo(() => {
    if (removeStatus === PkiSyncStatus.Failed) {
      if (lastRemoveMessage)
        try {
          return JSON.stringify(JSON.parse(lastRemoveMessage), null, 2);
        } catch {
          return lastRemoveMessage;
        }

      return "An Unknown Error Occurred.";
    }
    return null;
  }, [removeStatus, lastRemoveMessage]);

  if (!removeStatus || hide) return null;

  let variant: BadgeProps["variant"];
  let label: string;
  let icon: IconDefinition;
  let tooltipContent: ReactNode;

  switch (removeStatus) {
    case PkiSyncStatus.Pending:
    case PkiSyncStatus.Running:
      variant = "primary";
      label = "Removing Certificates...";
      tooltipContent = `Removing certificates from ${destinationName}. This may take a moment.`;
      icon = faEraser;

      break;
    case PkiSyncStatus.Failed:
      variant = "danger";
      label = "Failed to Remove Certificates";
      icon = faTriangleExclamation;
      tooltipContent = (
        <div className="flex flex-col gap-2 py-1 whitespace-normal">
          {failureMessage && (
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                <div className="text-xs">
                  {mini ? "Failed to Remove Certificates" : "Failure Reason"}
                </div>
              </div>
              <div className="rounded-sm bg-mineshaft-600 p-2 text-xs">{failureMessage}</div>
            </div>
          )}
        </div>
      );

      break;
    case PkiSyncStatus.Succeeded:
    default:
      // only show success for a bit...
      if (lastRemovedAt && differenceInSeconds(new Date(), lastRemovedAt) > 15) return null;

      tooltipContent = "Successfully removed certificates.";
      variant = "success";
      label = "Certificates Removed";
      icon = faCheck;
  }

  return (
    <Tooltip position="bottom" className="max-w-sm" content={tooltipContent}>
      <div>
        <Badge
          className={twMerge("flex h-5 w-min items-center gap-1.5 whitespace-nowrap", className)}
          variant={variant}
        >
          <FontAwesomeIcon icon={icon} />
          {!mini && <span>{label}</span>}
        </Badge>
      </div>
    </Tooltip>
  );
};
