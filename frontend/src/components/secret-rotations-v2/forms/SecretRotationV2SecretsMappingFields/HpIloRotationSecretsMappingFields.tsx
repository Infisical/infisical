import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { Field, FieldFeedback, FieldLabel, Input } from "@app/components/v3";
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
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel>Username</FieldLabel>
            <Input
              ref={ref}
              value={value}
              onBlur={onBlur}
              onChange={onChange}
              placeholder="ILO_USERNAME"
              isError={Boolean(error)}
              aria-describedby="hp-ilo-secrets-mapping-username-feedback"
            />
            <FieldFeedback
              id="hp-ilo-secrets-mapping-username-feedback"
              description="The secret key where the iLO username will be stored"
              error={error?.message}
            />
          </Field>
        )}
      />
      <Controller
        name="secretsMapping.password"
        control={control}
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel>Password</FieldLabel>
            <Input
              ref={ref}
              value={value}
              onBlur={onBlur}
              onChange={onChange}
              placeholder="ILO_PASSWORD"
              isError={Boolean(error)}
              aria-describedby="hp-ilo-secrets-mapping-password-feedback"
            />
            <FieldFeedback
              id="hp-ilo-secrets-mapping-password-feedback"
              description="The secret key where the rotated iLO password will be stored"
              error={error?.message}
            />
          </Field>
        )}
      />
    </>
  );
};
