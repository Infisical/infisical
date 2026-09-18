import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TNutanixPrismCentralPkiSync } from "@app/hooks/api/pkiSyncs/types/nutanix-prism-central-sync";

type Props = {
  pkiSync: TNutanixPrismCentralPkiSync;
};

export const NutanixPrismCentralPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const { clusterName, clusterId } = pkiSync.destinationConfig;

  return (
    <>
      <Detail>
        <DetailLabel>Cluster Name</DetailLabel>
        <DetailValue>{clusterName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Cluster ID</DetailLabel>
        <DetailValue>{clusterId}</DetailValue>
      </Detail>
    </>
  );
};
