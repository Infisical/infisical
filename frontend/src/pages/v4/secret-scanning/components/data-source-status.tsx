import { StatusText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import type { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2/types";

export const DataSourceStatus = ({
  dataSource
}: {
  dataSource: Pick<
    TSecretScanningDataSource,
    "type" | "isDisconnected" | "isScanNewCommitsEnabled"
  >;
}) => {
  const resource = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  if (dataSource.isDisconnected)
    return (
      <Tooltip content="The external data source has been removed and can no longer be scanned. Delete this data source and reconnect it.">
        <StatusText tone="bad" icon="alert" tabIndex={0}>
          Disconnected
        </StatusText>
      </Tooltip>
    );
  if (!dataSource.isScanNewCommitsEnabled)
    return (
      <Tooltip
        content={`Auto-scan is disabled. Scans are not triggered when a ${resource.verb} occurs to ${resource.pluralNoun} in this data source.`}
      >
        <StatusText icon="clock" tabIndex={0}>
          Paused
        </StatusText>
      </Tooltip>
    );
  return (
    <StatusText tone="ok" icon="check-c">
      Active
    </StatusText>
  );
};
