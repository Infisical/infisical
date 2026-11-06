import { Controller, useFormContext, useWatch } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Combobox, Field, FieldError } from "@app/components/v3";
import {
  TFireworksServiceAccount,
  useFireworksConnectionListServiceAccounts
} from "@app/hooks/api/appConnections/fireworks";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

const getUserId = (name: string) => name.split("/").pop() ?? name;

const formatServiceAccountLabel = (option: TFireworksServiceAccount) => (
  <span>
    {option.displayName} <span className="text-muted">({getUserId(option.name)})</span>
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
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip
            htmlFor="fireworks-service-account"
            tooltip="The Fireworks service account to create the API key for"
          >
            Service Account
          </FieldLabelWithTooltip>
          <Combobox
            id="fireworks-service-account"
            isLoading={isServiceAccountsLoading && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={serviceAccounts.find((sa) => getUserId(sa.name) === value) ?? null}
            onBlur={onBlur}
            onValueChange={(selected) => onChange(getUserId(selected.name))}
            isClearable={false}
            options={serviceAccounts}
            placeholder="Select a service account..."
            getOptionLabel={(option) => `${option.displayName} (${getUserId(option.name)})`}
            getOptionValue={(option) => getUserId(option.name)}
            renderOption={formatServiceAccountLabel}
            renderValue={formatServiceAccountLabel}
            isError={Boolean(error)}
          />
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );
};
