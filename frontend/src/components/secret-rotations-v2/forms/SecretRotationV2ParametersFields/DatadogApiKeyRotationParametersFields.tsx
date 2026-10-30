import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

/** Max length for the generated Datadog API key name (matches backend schema). */
const DATADOG_API_KEY_NAME_MAX_LENGTH = 255;

export const DatadogApiKeyRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatadogApiKey;
    }
  >();

  return (
    <Controller
      name="parameters.name"
      control={control}
      render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip
            htmlFor="datadog-api-key-name"
            tooltip="The name for the generated Datadog API key"
          >
            Key Name
          </FieldLabelWithTooltip>
          <Input
            ref={ref}
            id="datadog-api-key-name"
            value={value}
            onBlur={onBlur}
            onChange={onChange}
            placeholder="Infisical Rotated API Key"
            maxLength={DATADOG_API_KEY_NAME_MAX_LENGTH}
            isError={Boolean(error)}
          />
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );
};
