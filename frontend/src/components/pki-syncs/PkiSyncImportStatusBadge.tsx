import { ReactNode, useEffect, useMemo, useState } from "react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { differenceInSeconds } from "date-fns";
import { CheckIcon, DownloadIcon, LucideIcon, TriangleAlertIcon } from "lucide-react";

import { Tooltip } from "@app/components/v2";
import { Badge, TBadgeProps } from "@app/components/v3";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSyncStatus, TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
  mini?: boolean;
};

export const PkiSyncImportStatusBadge = ({ pkiSync, mini }: Props) => {
  const { importStatus, lastImportMessage, lastImportedAt, destination } = pkiSync;
  const [hide, setHide] = useState(importStatus === PkiSyncStatus.Succeeded);
  const destinationName = PKI_SYNC_MAP[destination].name;

  useEffect(() => {
    if (importStatus === PkiSyncStatus.Succeeded) {
      setTimeout(() => setHide(true), 3000);
    } else {
      setHide(false);
    }
  }, [importStatus]);

  const failureMessage = useMemo(() => {
    if (importStatus === PkiSyncStatus.Failed) {
      if (lastImportMessage)
        try {
          return JSON.stringify(JSON.parse(lastImportMessage), null, 2);
        } catch {
          return lastImportMessage;
        }

      return "An Unknown Error Occurred.";
    }
    return null;
  }, [importStatus, lastImportMessage]);

  if (!importStatus || hide) return null;

  let variant: TBadgeProps["variant"];
  let label: string;
  let Icon: LucideIcon;
  let tooltipContent: ReactNode;

  switch (importStatus) {
    case PkiSyncStatus.Pending:
    case PkiSyncStatus.Running:
      variant = "warning";
      label = "Importing Certificates...";
      tooltipContent = `Importing certificates from ${destinationName}. This may take a moment.`;
      Icon = DownloadIcon;

      break;
    case PkiSyncStatus.Failed:
      variant = "danger";
      label = "Failed to Import Certificates";
      Icon = TriangleAlertIcon;
      tooltipContent = (
        <div className="flex flex-col gap-2 py-1 whitespace-normal">
          {failureMessage && (
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                <div className="text-xs">
                  {mini ? "Failed to Import Certificates" : "Failure Reason"}
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
      if (lastImportedAt && differenceInSeconds(new Date(), lastImportedAt) > 15) return null;

      tooltipContent = "Successfully imported certificates.";
      variant = "success";
      label = "Certificates Imported";
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
