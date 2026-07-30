import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

export const ChefPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const dataBagName =
    pkiSync.destinationConfig && "dataBagName" in pkiSync.destinationConfig
      ? pkiSync.destinationConfig.dataBagName
      : undefined;

  return (
    <Detail>
      <DetailLabel>Chef Data Bag Name</DetailLabel>
      <DetailValue>{dataBagName || "Not specified"}</DetailValue>
    </Detail>
  );
};
