import { CircleCheckIcon, PauseIcon, UnplugIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

type Props = {
  dataSource: Pick<
    TSecretScanningDataSource,
    "type" | "isDisconnected" | "isScanNewCommitsEnabled"
  >;
};

export const DataSourceStatusBadge = ({ dataSource }: Props) => {
  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  if (dataSource.isDisconnected) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="danger">
            <UnplugIcon />
            Disconnected
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          The external data source has been removed and can no longer be scanned. Delete this data
          source and reconnect it.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!dataSource.isScanNewCommitsEnabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral">
            <PauseIcon />
            Paused
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          Auto-scan is disabled. Scans are not triggered when a {resourceDetails.verb} occurs to{" "}
          {resourceDetails.pluralNoun} in this data source.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Badge variant="success">
      <CircleCheckIcon />
      Active
    </Badge>
  );
};
