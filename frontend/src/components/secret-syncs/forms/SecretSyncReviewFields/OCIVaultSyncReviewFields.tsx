import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OCIVaultSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.OCIVault }>();
  const compartmentOcid = watch("destinationConfig.compartmentOcid");
  const vaultOcid = watch("destinationConfig.vaultOcid");
  const keyOcid = watch("destinationConfig.keyOcid");

  return (
    <>
      <GenericFieldLabel label="Compartment OCID">{compartmentOcid}</GenericFieldLabel>
      <GenericFieldLabel label="Vault OCID">{vaultOcid}</GenericFieldLabel>
      <GenericFieldLabel label="Key OCID">{keyOcid}</GenericFieldLabel>
    </>
  );
};
