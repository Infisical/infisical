import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { SecretsMappingTable } from "./shared";

export const DbtServiceTokenRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DbtServiceToken;
    }
  >();

  const { rotationOption } = useSecretRotationV2Option(SecretRotation.DbtServiceToken);

  const items = [
    {
      name: "Service Token",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.serviceToken}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.serviceToken"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
