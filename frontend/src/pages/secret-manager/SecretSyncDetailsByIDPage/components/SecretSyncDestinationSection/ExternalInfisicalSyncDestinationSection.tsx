import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TExternalInfisicalSync } from "@app/hooks/api/secretSyncs/types/external-infisical-sync";

type Props = {
  secretSync: TExternalInfisicalSync;
};

export const ExternalInfisicalSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Project ID">{destinationConfig.projectId}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">{destinationConfig.environment}</GenericFieldLabel>
      <GenericFieldLabel label="Secret Path">{destinationConfig.secretPath}</GenericFieldLabel>
    </>
  );
};
