import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  faCheck,
  faDownload,
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

export const PkiSyncImportStatusBadge = ({ pkiSync, className, mini }: Props) => {
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

  let variant: BadgeProps["variant"];
  let label: string;
  let icon: IconDefinition;
  let tooltipContent: ReactNode;

  switch (importStatus) {
    case PkiSyncStatus.Pending:
    case PkiSyncStatus.Running:
      variant = "primary";
      label = "Importing Certificates...";
      tooltipContent = `Importing certificates from ${destinationName}. This may take a moment.`;
      icon = faDownload;

      break;
    case PkiSyncStatus.Failed:
      variant = "danger";
      label = "Failed to Import Certificates";
      icon = faTriangleExclamation;
      tooltipContent = (
        <div className="flex flex-col gap-2 whitespace-normal py-1">
          {failureMessage && (
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pr-1.5 pt-0.5 text-sm" />
                <div className="text-xs">
                  {mini ? "Failed to Import Certificates" : "Failure Reason"}
                </div>
              </div>
              <div className="rounded bg-mineshaft-600 p-2 text-xs">{failureMessage}</div>
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
