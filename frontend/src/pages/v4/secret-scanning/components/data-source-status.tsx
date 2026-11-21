import type { ComponentPropsWithRef } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import type { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2/types";

type StatusSize = "md" | "control-sm";

const StatusLabel = ({
  tone,
  icon,
  size,
  ...props
}: ComponentPropsWithRef<"span"> & {
  tone?: "ok" | "bad";
  icon: "alert" | "clock" | "check-c";
  size?: StatusSize;
}) =>
  size ? (
    <Badge
      {...props}
      tone={tone ?? "outline"}
      icon={icon}
      size={size}
      collapse={size === "control-sm"}
    />
  ) : (
    <StatusText {...props} tone={tone} icon={icon} />
  );

export const DataSourceStatus = ({
  dataSource,
  size
}: {
  dataSource: Pick<
    TSecretScanningDataSource,
    "type" | "isDisconnected" | "isScanNewCommitsEnabled"
  >;
  size?: StatusSize;
}) => {
  const resource = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  if (dataSource.isDisconnected)
    return (
      <Tooltip content="The external data source has been removed and can no longer be scanned. Delete this data source and reconnect it.">
        <StatusLabel tone="bad" icon="alert" size={size} tabIndex={0}>
          Disconnected
        </StatusLabel>
      </Tooltip>
    );
  if (!dataSource.isScanNewCommitsEnabled)
    return (
      <Tooltip
        content={`Auto-scan is disabled. Scans are not triggered when a ${resource.verb} occurs to ${resource.pluralNoun} in this data source.`}
      >
        <StatusLabel icon="clock" size={size} tabIndex={0}>
          Paused
        </StatusLabel>
      </Tooltip>
    );
  return (
    <StatusLabel tone="ok" icon="check-c" size={size}>
      Active
    </StatusLabel>
  );
};
