import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const ConvexAccessKeyRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.ConvexAccessKey;
    }
  >();

  return (
    <Controller
      name="parameters.namePrefix"
      control={control}
      render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip htmlFor="convex-name-prefix">Name Prefix</FieldLabelWithTooltip>
          <Input
            ref={ref}
            id="convex-name-prefix"
            value={value}
            onBlur={onBlur}
            onChange={onChange}
            placeholder="e.g. infisical-rotation"
            isError={Boolean(error)}
          />
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );
};
