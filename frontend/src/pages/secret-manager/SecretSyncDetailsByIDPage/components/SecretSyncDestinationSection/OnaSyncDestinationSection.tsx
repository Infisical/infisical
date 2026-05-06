import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TOnaSync } from "@app/hooks/api/secretSyncs/types/ona-sync";

type Props = {
  secretSync: TOnaSync;
};

export const OnaSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <GenericFieldLabel label="Ona Project">
      {destinationConfig.projectName || destinationConfig.projectId}
    </GenericFieldLabel>
  );
};
