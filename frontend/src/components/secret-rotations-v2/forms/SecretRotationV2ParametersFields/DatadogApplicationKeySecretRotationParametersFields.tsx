import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, FilterableSelect } from "@app/components/v3";
import { useListDatadogConnectionServiceAccounts } from "@app/hooks/api/appConnections/datadog";
import { TDatadogServiceAccount } from "@app/hooks/api/appConnections/datadog/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const DatadogApplicationKeySecretRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatadogApplicationKeySecret;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: serviceAccounts, isPending: isServiceAccountsPending } =
    useListDatadogConnectionServiceAccounts(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <Controller
      name="parameters.serviceAccountId"
      control={control}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip htmlFor="datadog-service-account">
            Service Account
          </FieldLabelWithTooltip>
          <FilterableSelect
            inputId="datadog-service-account"
            menuPlacement="top"
            isLoading={isServiceAccountsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={serviceAccounts?.find((serviceAccount) => serviceAccount.id === value) ?? null}
            onBlur={onBlur}
            onChange={(option) => {
              onChange((option as SingleValue<TDatadogServiceAccount>)?.id ?? "");
            }}
            options={serviceAccounts}
            placeholder="Select a service account..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
            isError={Boolean(error)}
          />
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );
};
