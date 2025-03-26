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
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSyncStatus, TSecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync: TSecretSync;
  className?: string;
  mini?: boolean;
};

export const SecretSyncImportStatusBadge = ({ secretSync, className, mini }: Props) => {
  const { importStatus, lastImportMessage, lastImportedAt, destination } = secretSync;
  const [hide, setHide] = useState(importStatus === SecretSyncStatus.Succeeded);
  const destinationName = SECRET_SYNC_MAP[destination].name;

  useEffect(() => {
    if (importStatus === SecretSyncStatus.Succeeded) {
      setTimeout(() => setHide(true), 3000);
    } else {
      setHide(false);
    }
  }, [importStatus]);

  const failureMessage = useMemo(() => {
    if (importStatus === SecretSyncStatus.Failed) {
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
    case SecretSyncStatus.Pending:
    case SecretSyncStatus.Running:
      variant = "primary";
      label = "Importing Secrets...";
      tooltipContent = `Importing secrets from ${destinationName}. This may take a moment.`;
      icon = faDownload;

      break;
    case SecretSyncStatus.Failed:
      variant = "danger";
      label = "Failed to Import Secrets";
      icon = faTriangleExclamation;
      tooltipContent = (
        <div className="flex flex-col gap-2 whitespace-normal py-1">
          {failureMessage && (
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pr-1.5 pt-0.5 text-sm" />
                <div className="text-xs">
                  {mini ? "Failed to Import Secrets" : "Failure Reason"}
                </div>
              </div>
              <div className="rounded bg-mineshaft-600 p-2 text-xs">{failureMessage}</div>
            </div>
          )}
        </div>
      );

      break;
    case SecretSyncStatus.Succeeded:
    default:
      // only show success for a bit...
      if (lastImportedAt && differenceInSeconds(new Date(), lastImportedAt) > 15) return null;

      tooltipContent = "Successfully imported secrets.";
      variant = "success";
      label = "Secrets Imported";
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
