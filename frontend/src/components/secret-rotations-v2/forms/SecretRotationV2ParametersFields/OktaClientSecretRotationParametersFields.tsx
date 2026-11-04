import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Combobox, Field, FieldError } from "@app/components/v3";
import { useOktaConnectionListApps } from "@app/hooks/api/appConnections/okta";
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
          <Combobox
            id="okta-application"
            isLoading={isAppsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={apps?.find((app) => app.id === value) ?? null}
            onBlur={onBlur}
            onValueChange={(option) => {
              onChange(option.id);
              setValue("parameters.clientId", option.id);
            }}
            isClearable={false}
            options={apps}
            placeholder="Select an application..."
            getOptionLabel={(option) => option.label}
            getOptionValue={(option) => option.id}
            getOptionKeywords={(option) => [option.id]}
            isError={Boolean(error)}
          />
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );
};
