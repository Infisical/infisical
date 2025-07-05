import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Input, Tooltip } from "@app/components/v2";
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
    <>
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
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Vault"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the vault exists in the connection's OnePass instance URL."
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
              isDisabled={!connectionId}
              value={vaults?.find((v) => v.id === value) || null}
              onChange={(option) => onChange((option as SingleValue<TOnePassVault>)?.id ?? null)}
              options={vaults}
              placeholder="Select a vault..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />

      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            isOptional
            label="Value Label"
            tooltipText="It's the label of the 1Password item field which will hold your secret value. For example, if you were to sync Infisical secret 'foo: bar', the 1Password item equivalent would have an item title of 'foo', and a field on that item 'value: bar'. The field label 'value' is what gets changed by this option."
          >
            <Input value={value} onChange={onChange} placeholder="value" />
          </FormControl>
        )}
        control={control}
        name="destinationConfig.valueLabel"
      />
    </>
  );
};
