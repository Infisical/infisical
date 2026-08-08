import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Alert, AlertDescription, AlertTitle, Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

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
      <Alert variant="info">
        <InfoIcon />
        <AlertTitle>Example Create User Statement</AlertTitle>
        <AlertDescription>
          <p className="mb-3 text-sm">
            Infisical requires two database users to be created for rotation.
          </p>
          <p className="mb-3 text-sm">
            These users are intended to be solely managed by Infisical. Altering their login after
            rotation may cause unexpected failure.
          </p>
          <p className="mb-3 text-sm">
            Below is an example statement for creating the required users. You may need to modify it
            to suit your needs.
          </p>
          <pre className="max-h-40 overflow-y-auto rounded-sm border border-border bg-container p-2 text-sm whitespace-pre-wrap text-muted">
            {rotationOption!.template.createUserStatement}
          </pre>
        </AlertDescription>
      </Alert>
    </>
  );
};
