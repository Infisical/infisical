import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const Auth0ClientSecretRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.Auth0ClientSecret;
    }
  >();

  return (
    <Controller
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl
          tooltipText="The Client ID of the Auth0 Application you want to rotate the client secret for."
          isError={Boolean(error)}
          errorText={error?.message}
          label="Client ID"
        >
          <Input value={value} onChange={onChange} />
        </FormControl>
      )}
      control={control}
      name="parameters.clientId"
    />
  );
};
