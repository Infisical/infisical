import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  TOnePassVault,
  useOnePassConnectionListVaults
} from "@app/hooks/api/appConnections/1password";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const OnePassSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.OnePass }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: vaults, isLoading: isVaultsLoading } = useOnePassConnectionListVaults(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.vaultId", "");
          setValue("destinationConfig.valueLabel", "");
        }}
      />

      <Controller
        name="destinationConfig.vaultId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Vault
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the vault exists in the connection&apos;s OnePass instance URL.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isVaultsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={vaults?.find((v) => v.id === value) || null}
                onChange={(option) => onChange((option as SingleValue<TOnePassVault>)?.id ?? null)}
                options={vaults}
                placeholder="Select a vault..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Value Label (Optional)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  It&apos;s the label of the 1Password item field which will hold your secret value.
                  For example, if you were to sync Infisical secret &apos;foo: bar&apos;, the
                  1Password item equivalent would have an item title of &apos;foo&apos;, and a field
                  on that item &apos;value: bar&apos;. The field label &apos;value&apos; is what
                  gets changed by this option.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Input
                value={value}
                onChange={onChange}
                placeholder="value"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
        control={control}
        name="destinationConfig.valueLabel"
      />
    </FieldGroup>
  );
};
