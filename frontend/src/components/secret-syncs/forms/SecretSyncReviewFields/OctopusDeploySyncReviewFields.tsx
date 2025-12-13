import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { OctopusDeploySyncScope } from "@app/hooks/api/secretSyncs/types/octopus-deploy-sync";

export const OctopusDeploySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.OctopusDeploy }>();
  const spaceName = watch("destinationConfig.spaceName");
  const spaceId = watch("destinationConfig.spaceId");
  const scope = watch("destinationConfig.scope");
  const projectName = watch("destinationConfig.projectName");
  const projectId = watch("destinationConfig.projectId");

  return (
    <>
      <GenericFieldLabel label="Space">{spaceName || spaceId}</GenericFieldLabel>
      <GenericFieldLabel label="Scope" className="capitalize">
        {scope}
      </GenericFieldLabel>
      {scope === OctopusDeploySyncScope.Project && (
        <GenericFieldLabel label="Project">{projectName || projectId}</GenericFieldLabel>
      )}
    </>
  );
};
