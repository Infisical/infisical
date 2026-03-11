import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureEntraIdScimSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureEntraIdScim }
  >();

  const servicePrincipalId = watch("destinationConfig.servicePrincipalId");
  const secretKey = watch("destinationConfig.secretKey");

  return (
    <>
      <GenericFieldLabel label="Service Principal ID">{servicePrincipalId}</GenericFieldLabel>
      <GenericFieldLabel label="Secret Key">{secretKey}</GenericFieldLabel>
    </>
  );
};
