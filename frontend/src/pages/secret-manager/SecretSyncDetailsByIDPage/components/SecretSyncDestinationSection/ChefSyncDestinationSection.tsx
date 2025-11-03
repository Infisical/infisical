import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TChefSync } from "@app/hooks/api/secretSyncs/types/chef-sync";

type Props = {
  secretSync: TChefSync;
};

export const ChefSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Data Bag">{destinationConfig.dataBagName}</GenericFieldLabel>
      <GenericFieldLabel label="Data Bag Item">
        {destinationConfig.dataBagItemName}
      </GenericFieldLabel>
    </>
  );
};
