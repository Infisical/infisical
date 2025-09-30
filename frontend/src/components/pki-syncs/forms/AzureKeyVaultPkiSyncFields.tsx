import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { PkiSyncConnectionField } from "./PkiSyncConnectionField";
import { TPkiSyncForm } from "./schemas";

export const AzureKeyVaultPkiSyncFields = () => {
  const { control, setValue } = useFormContext<
    TPkiSyncForm & { destination: PkiSync.AzureKeyVault }
  >();

  return (
    <>
      <PkiSyncConnectionField
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
