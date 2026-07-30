import { useMemo } from "react";
import { format } from "date-fns";
import { BanIcon, RefreshCwIcon } from "lucide-react";

import { PkiSyncStatusBadge } from "@app/components/pki-syncs";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { PkiSyncStatus, TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncDetailsSection = ({ pkiSync }: Props) => {
  const { syncStatus, lastSyncMessage, lastSyncedAt, isAutoSyncEnabled } = pkiSync;

  const failureMessage = useMemo(() => {
    if (syncStatus === PkiSyncStatus.Failed) {
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
            <PkiSyncStatusBadge status={syncStatus} />
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
      {syncStatus === PkiSyncStatus.Failed && failureMessage && (
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
