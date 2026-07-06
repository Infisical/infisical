import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH } from "@app/components/secret-rotations-v2/forms/schemas/openai-admin-api-key-rotation-schema";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

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
          tooltipText="A descriptive name for the generated admin API key. This will be saved in the OpenAI dashboard for reference with a suffix of the timestamp of the key creation."
        >
          <Input
            value={value}
            onChange={onChange}
            placeholder="OpenAI Admin API Key Name"
            maxLength={OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH}
          />
        </FormControl>
      )}
    />
  );
};
