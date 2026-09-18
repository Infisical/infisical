import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, FilterableSelect } from "@app/components/v3";
import { useOktaConnectionListApps } from "@app/hooks/api/appConnections/okta";
import { TOktaApp } from "@app/hooks/api/appConnections/okta/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const OktaClientSecretRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.OktaClientSecret;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: apps, isPending: isAppsPending } = useOktaConnectionListApps(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <Controller
      name="parameters.clientId"
      control={control}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip htmlFor="okta-application">
            OpenID Connect Application
          </FieldLabelWithTooltip>
          <FilterableSelect
            inputId="okta-application"
            isLoading={isAppsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={apps?.find((app) => app.id === value) ?? null}
            onBlur={onBlur}
            onChange={(option) => {
              onChange((option as SingleValue<TOktaApp>)?.id ?? null);
              setValue("parameters.clientId", (option as SingleValue<TOktaApp>)?.id ?? "");
            }}
            options={apps}
            placeholder="Select an application..."
            getOptionLabel={(option) => option.label}
            getOptionValue={(option) => option.id}
            isError={Boolean(error)}
          />
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );
};
