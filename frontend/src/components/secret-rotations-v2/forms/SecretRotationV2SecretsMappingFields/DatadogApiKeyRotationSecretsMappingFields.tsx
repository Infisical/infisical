import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { SecretsMappingTable } from "./shared";

export const DatadogApiKeyRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatadogApiKey;
    }
  >();

  const { rotationOption } = useSecretRotationV2Option(SecretRotation.DatadogApiKey);

  const items = [
    {
      name: "API Key ID",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.apiKeyId}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.apiKeyId"
        />
      )
    },
    {
      name: "API Key",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.apiKey}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.apiKey"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
