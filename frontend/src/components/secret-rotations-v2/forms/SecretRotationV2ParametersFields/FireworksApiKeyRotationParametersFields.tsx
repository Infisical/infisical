import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  TFireworksServiceAccount,
  useFireworksConnectionListServiceAccounts
} from "@app/hooks/api/appConnections/fireworks";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

const getUserId = (name: string) => name.split("/").pop() ?? name;

const formatServiceAccountLabel = (option: TFireworksServiceAccount) => (
  <span>
    {option.displayName} <span className="text-mineshaft-400">({getUserId(option.name)})</span>
  </span>
);

export const FireworksApiKeyRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.FireworksApiKey;
    }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: serviceAccounts = [], isPending: isServiceAccountsLoading } =
    useFireworksConnectionListServiceAccounts(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <Controller
      name="parameters.serviceAccountUserId"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl
          isError={Boolean(error)}
          errorText={error?.message}
          label="Service Account"
          tooltipText="The Fireworks service account to create the API key for"
        >
          <FilterableSelect
            isLoading={isServiceAccountsLoading && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={serviceAccounts.find((sa) => getUserId(sa.name) === value) ?? null}
            onChange={(option) => {
              const selected = option as SingleValue<TFireworksServiceAccount>;
              onChange(selected ? getUserId(selected.name) : null);
            }}
            options={serviceAccounts}
            placeholder="Select a service account..."
            getOptionLabel={(option) => `${option.displayName} (${getUserId(option.name)})`}
            getOptionValue={(option) => getUserId(option.name)}
            formatOptionLabel={formatServiceAccountLabel}
          />
        </FormControl>
      )}
    />
  );
};
