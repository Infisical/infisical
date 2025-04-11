import { GenericFieldLabel } from "@app/components/secret-syncs";
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
    return <GenericFieldLabel label="Cluster">Loading...</GenericFieldLabel>;
  }

  const clusterName = clusters?.find((cluster) => cluster.uuid === clusterUUID)?.name;
  return <GenericFieldLabel label="Cluster">{clusterName ?? clusterUUID}</GenericFieldLabel>;
};
