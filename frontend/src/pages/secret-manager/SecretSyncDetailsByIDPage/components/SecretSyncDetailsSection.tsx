import { useMemo } from "react";
import { format } from "date-fns";
import { BanIcon, RefreshCwIcon } from "lucide-react";

import { SecretSyncStatusBadge } from "@app/components/secret-syncs";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSyncStatus, TSecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync: TSecretSync;
};

export const SecretSyncDetailsSection = ({ secretSync }: Props) => {
  const { syncStatus, lastSyncMessage, lastSyncedAt, isAutoSyncEnabled } = secretSync;

  const failureMessage = useMemo(() => {
    if (syncStatus === SecretSyncStatus.Failed) {
      if (lastSyncMessage)
        try {
          return JSON.stringify(JSON.parse(lastSyncMessage), null, 2);
        } catch {
          return lastSyncMessage;
        }

      return "An Unknown Error Occurred.";
    }
    return null;
  }, [syncStatus, lastSyncMessage]);

  return (
    <>
      {syncStatus && (
        <Detail>
          <DetailLabel>Status</DetailLabel>
          <DetailValue>
            <SecretSyncStatusBadge status={syncStatus} />
          </DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Auto-Sync</DetailLabel>
        <DetailValue>
          {isAutoSyncEnabled ? (
            <Badge variant="info">
              <RefreshCwIcon />
              Enabled
            </Badge>
          ) : (
            <Badge variant="neutral">
              <BanIcon />
              Disabled
            </Badge>
          )}
        </DetailValue>
      </Detail>
      {lastSyncedAt && (
        <Detail>
          <DetailLabel>Last Synced</DetailLabel>
          <DetailValue>{format(new Date(lastSyncedAt), "yyyy-MM-dd, hh:mm aaa")}</DetailValue>
        </Detail>
      )}
      {syncStatus === SecretSyncStatus.Failed && failureMessage && (
        <Detail>
          <DetailLabel className="text-red">Last Sync Error</DetailLabel>
          <DetailValue>
            <p className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">{failureMessage}</p>
          </DetailValue>
        </Detail>
      )}
    </>
  );
};
