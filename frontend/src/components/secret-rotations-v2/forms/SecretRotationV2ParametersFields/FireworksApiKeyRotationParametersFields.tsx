import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const FireworksApiKeyRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.FireworksApiKey;
    }
  >();

  return (
    <Controller
      name="parameters.keyName"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl isError={Boolean(error)} errorText={error?.message} label="Key Name">
          <Input value={value} onChange={onChange} placeholder="e.g. MY_SECRET_KEY" />
        </FormControl>
      )}
    />
  );
};
