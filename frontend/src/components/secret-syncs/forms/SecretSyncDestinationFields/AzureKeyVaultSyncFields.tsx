import { Controller, useFormContext } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FormControl, Input } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const AzureKeyVaultSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureKeyVault }
  >();

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.vaultBaseUrl", "");
        }}
      />
      <Controller
        name="destinationConfig.vaultBaseUrl"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Vault Base URL"
            tooltipText="Enter your Azure Key Vault URL. This is the base URL for your Azure Key Vault, e.g. https://example.vault.azure.net."
          >
            <Input {...field} placeholder="https://example.vault.azure.net" />
          </FormControl>
        )}
      />
    </>
  );
};
