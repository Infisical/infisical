import { useFormContext } from "react-hook-form";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { TerraformCloudSyncScope } from "@app/hooks/api/appConnections/terraform-cloud";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TerraformCloudSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TerraformCloud }>();
  const orgId = watch("destinationConfig.org");
  const projectId = watch("destinationConfig.project");
  const workspaceId = watch("destinationConfig.workspace");
  const scope = watch("destinationConfig.scope");

  return (
    <>
      <SecretSyncLabel label="Organization">{orgId}</SecretSyncLabel>
      {scope === TerraformCloudSyncScope.Project && (
        <SecretSyncLabel label="Project">{projectId}</SecretSyncLabel>
      )}
      {scope === TerraformCloudSyncScope.Workspace && (
        <SecretSyncLabel label="Workspace">{workspaceId}</SecretSyncLabel>
      )}
    </>
  );
};
