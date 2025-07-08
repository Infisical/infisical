import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
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

  // Compartments
  const { data: compartments, isLoading: isCompartmentsLoading } = useOCIConnectionListCompartments(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  // Vaults
  const selectedCompartment = useWatch({ name: "destinationConfig.compartmentOcid", control });
  const { data: vaults, isLoading: isVaultsLoading } = useOCIConnectionListVaults(
    { connectionId, compartmentOcid: selectedCompartment },
    {
      enabled: Boolean(connectionId && selectedCompartment)
    }
  );

  // Keys
  const selectedVault = useWatch({ name: "destinationConfig.vaultOcid", control });
  const { data: keys, isLoading: isKeysLoading } = useOCIConnectionListVaultKeys(
    { connectionId, compartmentOcid: selectedCompartment, vaultOcid: selectedVault },
    {
      enabled: Boolean(connectionId && selectedCompartment && selectedVault)
    }
  );

  return (
    <>
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
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Compartment"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the compartment exists and that the connection has permission to view it."
              >
                <div>
                  <span>Don&#39;t see the compartment you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
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
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.vaultOcid"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Vault"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the vault exists in the selected compartment and that the connection has permission to view it."
              >
                <div>
                  <span>Don&#39;t see the vault you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
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
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.keyOcid"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Encryption Key"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the key exists in the selected vault and that the connection has permission to view it."
              >
                <div>
                  <span>Don&#39;t see the key you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
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
          </FormControl>
        )}
      />
    </>
  );
};
