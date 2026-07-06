import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

/** Max length for OpenAI admin API key name (matches backend schema). */
const OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH = 100;

export const OpenAIAdminApiKeyRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.OpenAIAdminApiKey;
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
          tooltipText="A descriptive name for the generated admin API key"
        >
          <Input
            value={value}
            onChange={onChange}
            placeholder="My Rotated Admin API Key"
            maxLength={OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH}
          />
        </FormControl>
      )}
    />
  );
};
