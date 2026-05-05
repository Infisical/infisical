import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TGiteaSync } from "@app/hooks/api/secretSyncs/types/gitea-sync";

type Props = {
  secretSync: TGiteaSync;
};

export const GiteaSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <GenericFieldLabel label="Repository">
      {`${destinationConfig.owner}/${destinationConfig.repo}`}
    </GenericFieldLabel>
  );
};
