import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

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
        render={({ field: { value, onChange, ...field }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Vault Base URL
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Enter your Azure Key Vault URL. This is the base URL for your Azure Key Vault,
                  e.g. https://example.vault.azure.net.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              {...field}
              value={value ?? ""}
              onChange={onChange}
              placeholder="https://example.vault.azure.net"
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
