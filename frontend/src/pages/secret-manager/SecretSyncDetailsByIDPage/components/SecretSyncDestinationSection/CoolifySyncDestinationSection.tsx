import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { COOLIFY_RESOURCE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import { TCoolifySync } from "@app/hooks/api/secretSyncs/types/coolify-sync";

type Props = {
  secretSync: TCoolifySync;
};

export const CoolifySyncDestinationSection = ({ secretSync }: Props) => {
  const { resourceType, resourceName } = secretSync.destinationConfig;

  return (
    <Detail>
      <DetailLabel>{COOLIFY_RESOURCE_TYPE_LABELS[resourceType]}</DetailLabel>
      <DetailValue>{resourceName}</DetailValue>
    </Detail>
  );
};
