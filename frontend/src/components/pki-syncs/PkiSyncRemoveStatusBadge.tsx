import { ReactNode, useEffect, useMemo, useState } from "react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { differenceInSeconds } from "date-fns";
import { AlertTriangleIcon, CheckIcon, EraserIcon, LucideIcon } from "lucide-react";

import { Tooltip } from "@app/components/v2";
import { Badge, TBadgeProps } from "@app/components/v3";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSyncStatus, TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
  mini?: boolean;
};

export const PkiSyncRemoveStatusBadge = ({ pkiSync, mini }: Props) => {
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

  let variant: TBadgeProps["variant"];
  let label: string;
  let Icon: LucideIcon;
  let tooltipContent: ReactNode;

  switch (removeStatus) {
    case PkiSyncStatus.Pending:
    case PkiSyncStatus.Running:
      variant = "warning";
      label = "Removing Certificates...";
      tooltipContent = `Removing certificates from ${destinationName}. This may take a moment.`;
      Icon = EraserIcon;

      break;
    case PkiSyncStatus.Failed:
      variant = "danger";
      label = "Failed to Remove Certificates";
      Icon = AlertTriangleIcon;
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
      Icon = CheckIcon;
  }

  return (
    <Tooltip position="bottom" className="max-w-sm" content={tooltipContent}>
      <Badge isSquare={mini} variant={variant}>
        <Icon />
        {!mini && label}
      </Badge>
    </Tooltip>
  );
};
