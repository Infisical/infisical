import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { CreateUserStatementAlert } from "./shared";

export const MongoRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.MongoDBCredentials;
    }
  >();
  const type = watch("type");

  const { rotationOption } = useSecretRotationV2Option(type);

  return (
    <>
      <Controller
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip htmlFor="mongodb-username-1">
              Database Username 1
            </FieldLabelWithTooltip>
            <Input
              ref={ref}
              id="mongodb-username-1"
              value={value}
              onBlur={onBlur}
              onChange={onChange}
              placeholder="infisical_user_1"
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="parameters.username1"
      />
      <Controller
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip htmlFor="mongodb-username-2">
              Database Username 2
            </FieldLabelWithTooltip>
            <Input
              ref={ref}
              id="mongodb-username-2"
              value={value}
              onBlur={onBlur}
              onChange={onChange}
              placeholder="infisical_user_2"
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="parameters.username2"
      />
      <CreateUserStatementAlert statement={rotationOption!.template.createUserStatement} />
    </>
  );
};
