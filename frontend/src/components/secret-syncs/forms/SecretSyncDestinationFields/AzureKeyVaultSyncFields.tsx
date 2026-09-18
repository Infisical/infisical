import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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

export const AzureKeyVaultSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureKeyVault }
  >();

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.vaultBaseUrl", "");
        }}
      />
      <Controller
        name="destinationConfig.vaultBaseUrl"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Vault Base URL
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>
                  Enter your Azure Key Vault URL. This is the base URL for your Azure Key Vault,
                  e.g. https://example.vault.azure.net.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Input
                {...field}
                placeholder="https://example.vault.azure.net"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Alert variant="info">
        <Info />
        <AlertTitle>Key Naming</AlertTitle>
        <AlertDescription>
          Secret keys with underscores (_) will be converted to hyphens (-) when syncing to Azure
          Key Vault.
        </AlertDescription>
      </Alert>
    </FieldGroup>
  );
};
