import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { SecretsMappingTable } from "./shared";

export const AwsIamUserSecretRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.AwsIamUserSecret;
    }
  >();

  const { rotationOption } = useSecretRotationV2Option(SecretRotation.AwsIamUserSecret);

  const items = [
    {
      name: "Access Key ID",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.accessKeyId}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.accessKeyId"
        />
      )
    },
    {
      name: "Secret Access Key",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.secretAccessKey}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.secretAccessKey"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
