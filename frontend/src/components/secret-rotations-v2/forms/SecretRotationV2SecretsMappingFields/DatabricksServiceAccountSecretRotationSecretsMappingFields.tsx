import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { SecretsMappingTable } from "./shared";

export const DatabricksServiceAccountSecretRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatabricksServiceAccountSecret;
    }
  >();

  const { rotationOption } = useSecretRotationV2Option(
    SecretRotation.DatabricksServiceAccountSecret
  );

  const items = [
    {
      name: "Client ID",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.clientId}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.clientId"
        />
      )
    },
    {
      name: "Client Secret",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.clientSecret}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.clientSecret"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
