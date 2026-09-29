import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { StripeApiKeyPermissionSelector } from "./StripeApiKeyPermissionSelector";
import { FieldLabelWithTooltip } from "../shared";

export const StripeApiKeyRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & { type: SecretRotation.StripeApiKey }
  >();

  const { rotationOption, isLoading: isRotationOptionLoading } = useSecretRotationV2Option(
    SecretRotation.StripeApiKey
  );

  const groups = useMemo(() => rotationOption?.template.permissionGroups ?? [], [rotationOption]);

  return (
    <>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="secret-rotation-key-name"
              tooltip="The name of the key to use for the secret rotation. This is used to identify the key in the Stripe API. This is optional and will default to a random key name in Stripe."
            >
              Key Name
            </FieldLabelWithTooltip>
            <Input
              id="secret-rotation-key-name"
              placeholder="Infisical Managed Stripe Key"
              value={value}
              onChange={onChange}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="parameters.keyName"
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <StripeApiKeyPermissionSelector
              groups={groups}
              value={value ?? []}
              onChange={onChange}
              isLoading={isRotationOptionLoading}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="parameters.permissions"
      />
    </>
  );
};
