import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TNorthflankSync } from "@app/hooks/api/secretSyncs/types/northflank-sync";

type Props = {
  secretSync: TNorthflankSync;
};

export const NorthflankSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Project">
        {destinationConfig.projectName || destinationConfig.projectId}
      </GenericFieldLabel>
      <GenericFieldLabel label="Secret Group">
        {destinationConfig.secretGroupName || destinationConfig.secretGroupId}
      </GenericFieldLabel>
    </>
  );
};
