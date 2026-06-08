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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AzureKeyVaultSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/azure-key-vault-sync";

import { TSecretSyncForm } from "../schemas";

export const AzureKeyVaultSyncFields = () => {
  const { control, setValue, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureKeyVault }
  >();

  const mappingBehavior = watch("destinationConfig.mappingBehavior");

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
      <Controller
        name="destinationConfig.mappingBehavior"
        control={control}
        defaultValue={AzureKeyVaultSyncMappingBehavior.OneToOne}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Mapping Behavior
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-lg">
                  <div className="flex flex-col gap-3">
                    <p>Specify how Infisical should map secrets to Azure Key Vault:</p>
                    <ul className="flex list-disc flex-col gap-3 pl-4">
                      <li>
                        <p className="text-mineshaft-300">
                          <span className="font-medium text-bunker-200">One-To-One</span>: Each
                          Infisical secret will be mapped to a separate Azure Key Vault secret.
                        </p>
                      </li>
                      <li>
                        <p className="text-mineshaft-300">
                          <span className="font-medium text-bunker-200">Many-To-One</span>: All
                          Infisical secrets will be consolidated into a single Azure Key Vault
                          secret as a JSON object.
                        </p>
                      </li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select an option..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureKeyVaultSyncMappingBehavior).map((behavior) => (
                    <SelectItem className="capitalize" value={behavior} key={behavior}>
                      {behavior}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {mappingBehavior === AzureKeyVaultSyncMappingBehavior.ManyToOne && (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Azure Key Vault Secret Name</FieldLabel>
              <FieldContent>
                <Input
                  value={value}
                  onChange={onChange}
                  placeholder="Secret name..."
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
          control={control}
          name="destinationConfig.secretName"
        />
      )}
      {mappingBehavior !== AzureKeyVaultSyncMappingBehavior.ManyToOne && (
        <Alert variant="info">
          <Info />
          <AlertTitle>Key Naming</AlertTitle>
          <AlertDescription>
            Secret keys with underscores (_) will be converted to hyphens (-) when syncing to Azure
            Key Vault.
          </AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  );
};
