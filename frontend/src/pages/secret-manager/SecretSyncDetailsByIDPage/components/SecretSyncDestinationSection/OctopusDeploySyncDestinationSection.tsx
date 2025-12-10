import { GenericFieldLabel } from "@app/components/secret-syncs";
import {
  OctopusDeploySyncScope,
  TOctopusDeploySync
} from "@app/hooks/api/secretSyncs/types/octopus-deploy-sync";

type Props = {
  secretSync: TOctopusDeploySync;
};

export const OctopusDeploySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Space">
        {destinationConfig.spaceName || destinationConfig.spaceId}
      </GenericFieldLabel>
      <GenericFieldLabel label="Scope" className="capitalize">
        {destinationConfig.scope}
      </GenericFieldLabel>
      {destinationConfig.scope === OctopusDeploySyncScope.Project && (
        <GenericFieldLabel label="Project">
          {destinationConfig.projectName || destinationConfig.projectId}
        </GenericFieldLabel>
      )}
    </>
  );
};
