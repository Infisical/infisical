import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CamundaSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Camunda }>();
  const scope = watch("destinationConfig.scope");
  const clusterName = watch("destinationConfig.clusterName");
  const clusterUUID = watch("destinationConfig.clusterUUID");
  return (
    <>
      <GenericFieldLabel label="Secret Scope">{scope}</GenericFieldLabel>
      <GenericFieldLabel label="Cluster">
        {clusterName} (id:{clusterUUID})
      </GenericFieldLabel>
    </>
  );
};
