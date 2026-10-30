import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { FieldLabelWithTooltip } from "../shared";
import { StripeApiKeyPermissionSelector } from "./StripeApiKeyPermissionSelector";

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
              tooltip="Optional. The name of each key this rotation creates in Stripe. Infisical adds a timestamp to each name so you can tell the old and new key apart. If empty, the name is infisical-managed."
            >
              Key Name
            </FieldLabelWithTooltip>
            <Input
              id="secret-rotation-key-name"
              placeholder="e.g. payments-service"
              value={value ?? ""}
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
