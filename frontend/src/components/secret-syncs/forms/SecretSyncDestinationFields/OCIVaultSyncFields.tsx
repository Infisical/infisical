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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  useOCIConnectionListCompartments,
  useOCIConnectionListVaultKeys,
  useOCIConnectionListVaults
} from "@app/hooks/api/appConnections/oci";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const OCIVaultSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.OCIVault }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: compartments, isLoading: isCompartmentsLoading } = useOCIConnectionListCompartments(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const selectedCompartment = useWatch({ name: "destinationConfig.compartmentOcid", control });
  const { data: vaults, isLoading: isVaultsLoading } = useOCIConnectionListVaults(
    { connectionId, compartmentOcid: selectedCompartment },
    {
      enabled: Boolean(connectionId && selectedCompartment)
    }
  );

  const selectedVault = useWatch({ name: "destinationConfig.vaultOcid", control });
  const { data: keys, isLoading: isKeysLoading } = useOCIConnectionListVaultKeys(
    { connectionId, compartmentOcid: selectedCompartment, vaultOcid: selectedVault },
    {
      enabled: Boolean(connectionId && selectedCompartment && selectedVault)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.compartmentOcid", "");
          setValue("destinationConfig.vaultOcid", "");
          setValue("destinationConfig.keyOcid", "");
        }}
      />

      <Controller
        name="destinationConfig.compartmentOcid"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Compartment
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the compartment exists and that the connection has permission to view it.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isCompartmentsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={compartments?.find((c) => c.id === value) ?? null}
                onChange={(option) => {
                  onChange((option as SingleValue<{ id: string }>)?.id ?? null);
                  setValue("destinationConfig.vaultOcid", "");
                  setValue("destinationConfig.keyOcid", "");
                }}
                options={compartments}
                placeholder="Select a compartment..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.vaultOcid"
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
                  Ensure the vault exists in the selected compartment and that the connection has
                  permission to view it.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isVaultsLoading && Boolean(connectionId)}
                isDisabled={!connectionId || !selectedCompartment}
                value={vaults?.find((v) => v.id === value) || null}
                onChange={(option) => {
                  onChange((option as SingleValue<{ id: string }>)?.id ?? null);
                  setValue("destinationConfig.keyOcid", "");
                }}
                options={vaults}
                placeholder="Select a vault..."
                getOptionLabel={(option) => option.displayName}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.keyOcid"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Encryption Key
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the key exists in the selected vault and that the connection has permission
                  to view it.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isKeysLoading && Boolean(connectionId)}
                isDisabled={!connectionId || !selectedCompartment || !selectedVault}
                value={keys?.find((v) => v.id === value) ?? null}
                onChange={(option) => {
                  onChange((option as SingleValue<{ id: string }>)?.id ?? null);
                }}
                options={keys}
                placeholder="Select a key..."
                getOptionLabel={(option) => option.displayName}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
