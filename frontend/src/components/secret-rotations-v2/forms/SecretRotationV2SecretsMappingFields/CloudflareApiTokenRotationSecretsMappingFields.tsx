import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { SecretsMappingTable } from "./shared";

export const CloudflareApiTokenRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.CloudflareApiToken;
    }
  >();

  const { rotationOption } = useSecretRotationV2Option(SecretRotation.CloudflareApiToken);

  const items = [
    {
      name: "Token ID",
      input: (
        <Controller
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <Input
                ref={ref}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.tokenId}
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
          control={control}
          name="secretsMapping.tokenId"
        />
      )
    },
    {
      name: "API Token",
      input: (
        <Controller
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <Input
                ref={ref}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.apiToken}
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
          control={control}
          name="secretsMapping.apiToken"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
