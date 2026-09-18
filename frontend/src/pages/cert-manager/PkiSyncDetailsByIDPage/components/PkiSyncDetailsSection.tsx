import { format } from "date-fns";
import { BanIcon, RefreshCwIcon } from "lucide-react";

import { PkiSyncStatusBadge } from "@app/components/pki-syncs";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { getPkiSyncFailureMessage } from "@app/helpers/pkiSyncs";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

import { SyncErrorDetail } from "./SyncErrorDetail";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncDetailsSection = ({ pkiSync }: Props) => {
  const { syncStatus, lastSyncMessage, lastSyncedAt, isAutoSyncEnabled } = pkiSync;

  const failureMessage = getPkiSyncFailureMessage(syncStatus, lastSyncMessage);

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
      {failureMessage && <SyncErrorDetail label="Last Sync Error" message={failureMessage} />}
    </>
  );
};
