import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TKempLoadMasterPkiSync } from "@app/hooks/api/pkiSyncs/types/kemp-loadmaster-sync";

type Props = {
  pkiSync: TKempLoadMasterPkiSync;
};

export const KempLoadMasterPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  if (!pkiSync.destinationConfig.virtualServiceId) {
    return null;
  }

  return (
    <Detail>
      <DetailLabel>Virtual Service</DetailLabel>
      <DetailValue>{pkiSync.destinationConfig.virtualServiceId}</DetailValue>
    </Detail>
  );
};
