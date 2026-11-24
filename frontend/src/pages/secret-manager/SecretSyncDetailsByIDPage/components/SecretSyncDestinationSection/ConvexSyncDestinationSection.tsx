import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TConvexSync } from "@app/hooks/api/secretSyncs/types/convex-sync";

type Props = {
  secretSync: TConvexSync;
};

export const ConvexSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <Detail>
      <DetailLabel>Deployment</DetailLabel>
      <DetailValue>{destinationConfig.deploymentName}</DetailValue>
    </Detail>
  );
};
