import { Controller, useFormContext } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FormControl, Input } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const AzureAppConfigurationSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureAppConfiguration }
  >();

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.configurationUrl", "");
        }}
      />
      <Controller
        name="destinationConfig.configurationUrl"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Configuration URL"
            tooltipText="Enter your Azure App Configuration URL. This is the base URL for your Azure App Configuration, e.g. https://resource-name-here.azconfig.io."
          >
            <Input {...field} placeholder="https://resource-name-here.azconfig.io" />
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.label"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Label"
            isOptional
            tooltipText="Enter the label for the secret in Azure App Configuration."
          >
            <Input {...field} placeholder="infisical-secret" />
          </FormControl>
        )}
      />
    </>
  );
};
