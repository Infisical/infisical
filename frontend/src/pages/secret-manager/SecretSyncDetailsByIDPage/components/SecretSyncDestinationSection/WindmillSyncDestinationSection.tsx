import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TWindmillSync } from "@app/hooks/api/secretSyncs/types/windmill-sync";

type Props = {
  secretSync: TWindmillSync;
};

export const WindmillSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { path, workspace }
  } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Workspace">{workspace}</GenericFieldLabel>
      <GenericFieldLabel label="Path">{path}</GenericFieldLabel>
    </>
  );
};
