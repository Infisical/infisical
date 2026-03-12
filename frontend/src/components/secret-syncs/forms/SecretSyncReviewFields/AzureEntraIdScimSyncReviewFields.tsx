import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureEntraIdScimSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureEntraIdScim }
  >();

  const servicePrincipalDisplayName = watch(
    "destinationConfig.servicePrincipalDisplayName" as "destinationConfig.servicePrincipalId"
  );
  const servicePrincipalId = watch("destinationConfig.servicePrincipalId");
  const secretKey = watch("syncOptions.secretKey");

  return (
    <>
      <GenericFieldLabel label="Service Principal">
        {servicePrincipalDisplayName || servicePrincipalId}
      </GenericFieldLabel>
      <GenericFieldLabel label="Secret">{secretKey || "-"}</GenericFieldLabel>
    </>
  );
};
