import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TChefSync } from "@app/hooks/api/secretSyncs/types/chef-sync";

type Props = {
  secretSync: TChefSync;
};

export const ChefSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Data Bag</DetailLabel>
        <DetailValue>{destinationConfig.dataBagName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Data Bag Item</DetailLabel>
        <DetailValue>{destinationConfig.dataBagItemName}</DetailValue>
      </Detail>
    </>
  );
};
