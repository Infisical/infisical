import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TFlyioSync } from "@app/hooks/api/secretSyncs/types/flyio-sync";

type Props = {
  secretSync: TFlyioSync;
};

export const FlyioSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { appId }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>App</DetailLabel>
      <DetailValue>{appId}</DetailValue>
    </Detail>
  );
};
