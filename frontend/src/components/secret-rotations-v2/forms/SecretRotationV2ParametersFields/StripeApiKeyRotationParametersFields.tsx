import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import {
  Button,
  Combobox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { useStripeConnectionListApiKeys } from "@app/hooks/api/appConnections/stripe";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

export const StripeApiKeyRotationParametersFields = () => {
  const { control, setValue } = useFormContext<
    TSecretRotationV2Form & { type: SecretRotation.StripeApiKey }
  >();

  const connectionId = useWatch({ control, name: "connection.id" });
  const { rotationOption } = useSecretRotationV2Option(SecretRotation.StripeApiKey);
  const { data: apiKeys = [] } = useStripeConnectionListApiKeys(connectionId, {
    enabled: Boolean(connectionId)
  });

  const permissions = useMemo(() => rotationOption?.template.permissions ?? [], [rotationOption]);

  return (
    <>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="stripe-permissions">Permissions</FieldLabel>
            <Combobox
              id="stripe-permissions"
              multiple
              isSelectAll
              options={permissions}
              value={value ?? []}
              onValueChange={onChange}
              getOptionValue={(permission) => permission}
              getOptionLabel={(permission) => permission}
              placeholder="Select permissions..."
              searchPlaceholder="Search permissions..."
              searchAriaLabel="Search Stripe permissions"
              clearAriaLabel="Clear all permissions"
            />
            {!error && (
              <FieldDescription>
                Select all matching applies only to the permissions your search returns, not the
                full list.
              </FieldDescription>
            )}
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="parameters.permissions"
      />
      {apiKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Copy permissions from an existing key:</span>
          {apiKeys.map((apiKey) => (
            <Button
              key={apiKey.id}
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                setValue("parameters.permissions", apiKey.permissions, { shouldDirty: true });
                setValue("parameters.connectPermissions", apiKey.connectPermissions, {
                  shouldDirty: true
                });
              }}
            >
              {apiKey.name || apiKey.id}
            </Button>
          ))}
        </div>
      )}
    </>
  );
};
