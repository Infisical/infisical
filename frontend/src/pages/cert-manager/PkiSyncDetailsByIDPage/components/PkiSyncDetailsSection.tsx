import { format } from "date-fns";

import { PkiSyncStatusBadge } from "@app/components/pki-syncs";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncDetailsSection = ({ pkiSync }: Props) => {
  const { syncStatus, lastSyncedAt } = pkiSync;

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
      {lastSyncedAt && (
        <Detail>
          <DetailLabel>Last Synced</DetailLabel>
          <DetailValue>{format(new Date(lastSyncedAt), "yyyy-MM-dd, hh:mm aaa")}</DetailValue>
        </Detail>
      )}
    </>
  );
};
