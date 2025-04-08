import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TCamundaSync } from "@app/hooks/api/secretSyncs/types/camunda-sync";

type Props = {
  secretSync: TCamundaSync;
};

export const CamundaSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { clusterUUID }
  } = secretSync;

  return <GenericFieldLabel label="Cluster UUID">{clusterUUID}</GenericFieldLabel>;
};
