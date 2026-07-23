import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TNetScalerPkiSync } from "@app/hooks/api/pkiSyncs/types/netscaler-sync";

type Props = {
  pkiSync: TNetScalerPkiSync;
};

export const NetScalerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  if (!pkiSync.destinationConfig.vserverName) {
    return null;
  }

  return (
    <Detail>
      <DetailLabel>SSL vServer Name</DetailLabel>
      <DetailValue>{pkiSync.destinationConfig.vserverName}</DetailValue>
    </Detail>
  );
};
