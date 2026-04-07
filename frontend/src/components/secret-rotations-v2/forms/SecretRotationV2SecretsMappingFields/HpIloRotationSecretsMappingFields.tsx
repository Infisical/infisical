import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const HpIloRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.HpIloLocalAccount;
    }
  >();

  return (
    <>
      <Controller
        name="secretsMapping.username"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Username"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="The secret key where the iLO username will be stored"
          >
            <Input {...field} placeholder="ILO_USERNAME" />
          </FormControl>
        )}
      />
      <Controller
        name="secretsMapping.password"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Password"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="The secret key where the rotated iLO password will be stored"
          >
            <Input {...field} placeholder="ILO_PASSWORD" />
          </FormControl>
        )}
      />
    </>
  );
};
