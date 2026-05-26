import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OCIVaultSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.OCIVault }>();
  const compartmentOcid = watch("destinationConfig.compartmentOcid");
  const vaultOcid = watch("destinationConfig.vaultOcid");
  const keyOcid = watch("destinationConfig.keyOcid");

  return (
    <>
      <Detail>
        <DetailLabel>Compartment OCID</DetailLabel>
        <DetailValue className="truncate">{compartmentOcid}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Vault OCID</DetailLabel>
        <DetailValue className="truncate">{vaultOcid}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Key OCID</DetailLabel>
        <DetailValue className="truncate">{keyOcid}</DetailValue>
      </Detail>
    </>
  );
};
