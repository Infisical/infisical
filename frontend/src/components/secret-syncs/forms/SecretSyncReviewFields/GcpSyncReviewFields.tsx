import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GcpSyncScope } from "@app/hooks/api/secretSyncs/types/gcp-sync";

export const GcpSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GCPSecretManager }
  >();
  const destinationConfig = watch("destinationConfig");

  return (
    <>
      <GenericFieldLabel label="Project ID">{destinationConfig.projectId}</GenericFieldLabel>
      <GenericFieldLabel label="Scope" className="capitalize">
        {destinationConfig.scope}
      </GenericFieldLabel>
      {destinationConfig.scope === GcpSyncScope.Region && (
        <GenericFieldLabel label="Region">{destinationConfig.locationId}</GenericFieldLabel>
      )}
    </>
  );
};
