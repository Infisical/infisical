import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TDevinSync } from "@app/hooks/api/secretSyncs/types/devin-sync";

type Props = {
  secretSync: TDevinSync;
};

export const DevinSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <Detail>
      <DetailLabel>Organization ID</DetailLabel>
      <DetailValue>{destinationConfig.orgId}</DetailValue>
    </Detail>
  );
};
