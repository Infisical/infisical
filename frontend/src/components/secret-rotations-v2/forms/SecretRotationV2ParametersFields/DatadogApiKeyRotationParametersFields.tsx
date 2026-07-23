import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
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
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl
          isError={Boolean(error)}
          errorText={error?.message}
          label="Key Name"
          tooltipText="The name for the generated Datadog API key"
        >
          <Input
            value={value}
            onChange={onChange}
            placeholder="Infisical Rotated API Key"
            maxLength={DATADOG_API_KEY_NAME_MAX_LENGTH}
          />
        </FormControl>
      )}
    />
  );
};
