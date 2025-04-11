import { useCamundaConnectionListClusters } from "@app/hooks/api/appConnections/camunda";
import { TCamundaSync } from "@app/hooks/api/secretSyncs/types/camunda-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TCamundaSync;
};

export const CamundaSyncDestinationCol = ({ secretSync }: Props) => {
  const { data: clusters, isPending } = useCamundaConnectionListClusters(secretSync.connectionId);

  const { primaryText, secondaryText } = getSecretSyncDestinationColValues({
    ...secretSync,
    destinationConfig: {
      ...secretSync.destinationConfig,
      clusterName: clusters?.find(
        (cluster) => cluster.uuid === secretSync.destinationConfig.clusterUUID
      )?.name
    }
  });

  if (isPending) {
    return <SecretSyncTableCell primaryText="Loading cluster info..." secondaryText="Cluster" />;
  }

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
