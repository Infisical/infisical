import { ReactNode, useEffect, useMemo, useState } from "react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { differenceInSeconds } from "date-fns";
import { AlertTriangleIcon, CheckIcon, DownloadIcon, LucideIcon } from "lucide-react";

import { Tooltip } from "@app/components/v2";
import { Badge, TBadgeProps } from "@app/components/v3";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSyncStatus, TSecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync: TSecretSync;
  mini?: boolean;
};

export const SecretSyncImportStatusBadge = ({ secretSync, mini }: Props) => {
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

  let variant: TBadgeProps["variant"];
  let label: string;
  let Icon: LucideIcon;
  let tooltipContent: ReactNode;

  switch (importStatus) {
    case SecretSyncStatus.Pending:
    case SecretSyncStatus.Running:
      variant = "warning";
      label = "Importing Secrets...";
      tooltipContent = `Importing secrets from ${destinationName}. This may take a moment.`;
      Icon = DownloadIcon;

      break;
    case SecretSyncStatus.Failed:
      variant = "danger";
      label = "Failed to Import Secrets";
      Icon = AlertTriangleIcon;
      tooltipContent = (
        <div className="flex flex-col gap-2 py-1 whitespace-normal">
          {failureMessage && (
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                <div className="text-xs">
                  {mini ? "Failed to Import Secrets" : "Failure Reason"}
                </div>
              </div>
              <div className="rounded-sm bg-mineshaft-600 p-2 text-xs">{failureMessage}</div>
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
