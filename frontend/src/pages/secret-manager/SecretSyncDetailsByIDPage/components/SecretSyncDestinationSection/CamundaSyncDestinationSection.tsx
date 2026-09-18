import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { useCamundaConnectionListClusters } from "@app/hooks/api/appConnections/camunda";
import { TCamundaSync } from "@app/hooks/api/secretSyncs/types/camunda-sync";

type Props = {
  secretSync: TCamundaSync;
};

export const CamundaSyncDestinationSection = ({ secretSync }: Props) => {
  const { data: clusters, isPending } = useCamundaConnectionListClusters(secretSync.connectionId);
  const {
    destinationConfig: { clusterUUID }
  } = secretSync;

  if (isPending) {
    return (
      <Detail>
        <DetailLabel>Cluster</DetailLabel>
        <DetailValue>Loading...</DetailValue>
      </Detail>
    );
  }

  const clusterName = clusters?.find((cluster) => cluster.uuid === clusterUUID)?.name;
  return (
    <Detail>
      <DetailLabel>Cluster</DetailLabel>
      <DetailValue>{clusterName ?? clusterUUID}</DetailValue>
    </Detail>
  );
};
