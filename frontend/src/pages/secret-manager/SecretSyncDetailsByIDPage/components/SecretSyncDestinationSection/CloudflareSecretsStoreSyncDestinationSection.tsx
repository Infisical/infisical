import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { CLOUDFLARE_SECRETS_STORE_SCOPE_LABELS } from "@app/helpers/secretSyncs";
import { TCloudflareSecretsStoreSync } from "@app/hooks/api/secretSyncs/types/cloudflare-secrets-store-sync";

type Props = {
  secretSync: TCloudflareSecretsStoreSync;
};

export const CloudflareSecretsStoreSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

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
