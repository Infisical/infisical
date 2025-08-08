import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { SecretsMappingTable } from "./shared";

export const AzureCertificateRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.AzureCertificate;
    }
  >();

  const { rotationOption } = useSecretRotationV2Option(SecretRotation.AzureCertificate);

  const items = [
    {
      name: "Public Key",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.publicKey}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.publicKey"
        />
      )
    },
    {
      name: "Private Key",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.privateKey}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.privateKey"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
