import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { SecretsMappingTable } from "./shared";

export const SalesforceOauthCredentialsRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SalesforceOauthCredentials;
    }
  >();

  const { rotationOption } = useSecretRotationV2Option(SecretRotation.SalesforceOauthCredentials);

  const items = [
    {
      name: "Consumer Key",
      input: (
        <Controller
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <Input
                ref={ref}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.consumerKey}
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
          control={control}
          name="secretsMapping.consumerKey"
        />
      )
    },
    {
      name: "Consumer Secret",
      input: (
        <Controller
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <Input
                ref={ref}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder={rotationOption?.template.secretsMapping.consumerSecret}
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
          control={control}
          name="secretsMapping.consumerSecret"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
