import { useFormContext } from "react-hook-form";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { TerraformCloudSyncScope } from "@app/hooks/api/appConnections/terraform-cloud";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TerraformCloudSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TerraformCloud }>();
  const orgId = watch("destinationConfig.org");
  const destinationName = watch("destinationConfig.destinationName");
  const scope = watch("destinationConfig.scope");
  const category = watch("destinationConfig.category");

  return (
    <>
      <SecretSyncLabel label="Organization">{orgId}</SecretSyncLabel>
      {scope === TerraformCloudSyncScope.VariableSet && (
        <SecretSyncLabel label="Variable Set">{destinationName}</SecretSyncLabel>
      )}
      {scope === TerraformCloudSyncScope.Workspace && (
        <SecretSyncLabel label="Workspace">{destinationName}</SecretSyncLabel>
      )}
      <SecretSyncLabel label="Category">{category}</SecretSyncLabel>
    </>
  );
};
