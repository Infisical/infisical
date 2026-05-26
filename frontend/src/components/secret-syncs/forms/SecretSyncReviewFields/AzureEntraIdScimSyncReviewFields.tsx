import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
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
      <Detail>
        <DetailLabel>Service Principal</DetailLabel>
        <DetailValue>{servicePrincipalDisplayName || servicePrincipalId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Secret</DetailLabel>
        {secretKey ? (
          <DetailValue>{secretKey}</DetailValue>
        ) : (
          <DetailValue className="text-muted">—</DetailValue>
        )}
      </Detail>
    </>
  );
};
