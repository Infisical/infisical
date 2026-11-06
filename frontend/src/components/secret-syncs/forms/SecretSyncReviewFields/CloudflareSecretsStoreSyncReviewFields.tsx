import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { CLOUDFLARE_SECRETS_STORE_SCOPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CloudflareSecretsStoreSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareSecretsStore }
  >();
  const destinationConfig = watch("destinationConfig");

  return (
    <>
      <Detail>
        <DetailLabel>Secrets Store</DetailLabel>
        <DetailValue>{destinationConfig.storeName || destinationConfig.storeId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Scopes</DetailLabel>
        <DetailValue>
          {destinationConfig.scopes
            .map((scope) => CLOUDFLARE_SECRETS_STORE_SCOPE_LABELS[scope])
            .join(", ")}
        </DetailValue>
      </Detail>
    </>
  );
};
