import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const AzureAppConfigurationSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureAppConfiguration }
  >();

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.configurationUrl", "");
        }}
      />
      <Controller
        name="destinationConfig.configurationUrl"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Configuration URL
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>
                  Enter your Azure App Configuration URL. This is the base URL for your Azure App
                  Configuration, e.g. https://resource-name-here.azconfig.io.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Input
                {...field}
                placeholder="https://resource-name-here.azconfig.io"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.label"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Label (Optional)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>
                  Enter the label for the secret in Azure App Configuration.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="infisical-secret" isError={Boolean(error)} />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
