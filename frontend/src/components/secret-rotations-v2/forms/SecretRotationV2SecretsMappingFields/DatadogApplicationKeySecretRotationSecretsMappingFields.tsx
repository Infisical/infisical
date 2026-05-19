import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { SecretsMappingTable } from "./shared";

export const DatadogApplicationKeySecretRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatadogApplicationKeySecret;
    }
  >();

  const { rotationOption } = useSecretRotationV2Option(SecretRotation.DatadogApplicationKeySecret);

  const items = [
    {
      name: "Application Key ID",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.applicationKeyId}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.applicationKeyId"
        />
      )
    },
    {
      name: "Application Key",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.applicationKey}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.applicationKey"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
