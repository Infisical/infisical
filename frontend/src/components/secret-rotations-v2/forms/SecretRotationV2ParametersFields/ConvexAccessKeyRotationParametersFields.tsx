import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const ConvexAccessKeyRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.ConvexAccessKey;
    }
  >();

  return (
    <Controller
      name="parameters.namePrefix"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl isError={Boolean(error)} errorText={error?.message} label="Name Prefix">
          <Input value={value} onChange={onChange} placeholder="e.g. infisical-rotation" />
        </FormControl>
      )}
    />
  );
};
