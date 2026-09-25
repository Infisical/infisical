import { useEffect, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { Combobox, Field, FieldDescription, FieldError, FieldLabel } from "@app/components/v3";
import {
  TStripeApiKey,
  useStripeConnectionListApiKeys
} from "@app/hooks/api/appConnections/stripe";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

export const StripeApiKeyRotationParametersFields = () => {
  const { control, setValue } = useFormContext<
    TSecretRotationV2Form & { type: SecretRotation.StripeApiKey }
  >();

  const [copiedFromKey, setCopiedFromKey] = useState<TStripeApiKey | null>(null);

  const connectionId = useWatch({ control, name: "connection.id" });
  const { rotationOption, isLoading: isRotationOptionLoading } = useSecretRotationV2Option(
    SecretRotation.StripeApiKey
  );
  const { data: apiKeys = [], isPending: isApiKeysPending } = useStripeConnectionListApiKeys(
    connectionId,
    { enabled: Boolean(connectionId) }
  );
  // A disabled query (no connection picked yet) reports isPending forever, so it must not be
  // read on its own as "loading".
  const isApiKeysLoading = isApiKeysPending && Boolean(connectionId);

  // A stale selection from a previous connection is not just visually wrong: the Combobox
  // would keep offering a key that belongs to a different Stripe account.
  useEffect(() => {
    setCopiedFromKey(null);
  }, [connectionId]);

  const permissions = useMemo(() => rotationOption?.template.permissions ?? [], [rotationOption]);

  // Only keys still usable as a source: an expired or revoked key's permissions are not a
  // meaningful default for a new one.
  const activeApiKeys = useMemo(
    () => apiKeys.filter((apiKey) => apiKey.status === "active"),
    [apiKeys]
  );

  const applyKeyPermissions = (apiKey: TStripeApiKey) => {
    setCopiedFromKey(apiKey);

    const allowedPermissions = new Set(permissions);
    const filteredPermissions = apiKey.permissions.filter((permission) =>
      allowedPermissions.has(permission)
    );
    const filteredConnectPermissions = apiKey.connectPermissions.filter((permission) =>
      allowedPermissions.has(permission)
    );

    setValue("parameters.permissions", filteredPermissions, { shouldDirty: true });
    setValue("parameters.connectPermissions", filteredConnectPermissions, { shouldDirty: true });

    const droppedCount =
      apiKey.permissions.length -
      filteredPermissions.length +
      (apiKey.connectPermissions.length - filteredConnectPermissions.length);

    if (droppedCount > 0) {
      createNotification({
        type: "warning",
        text: `${droppedCount} permission${droppedCount === 1 ? "" : "s"} on ${apiKey.name || apiKey.id} ${droppedCount === 1 ? "isn't" : "aren't"} recognized by Infisical and ${droppedCount === 1 ? "was" : "were"} not copied.`
      });
    }
  };

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
              isLoading={isRotationOptionLoading}
            />
            {!error && (
              <FieldDescription>
                Select All only selects the permissions your search currently matches, not the full
                list.
              </FieldDescription>
            )}
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="parameters.permissions"
      />
      {(activeApiKeys.length > 0 || isApiKeysLoading) && (
        <Field>
          <FieldLabel htmlFor="stripe-copy-from-key">
            Copy permissions from an existing key
          </FieldLabel>
          <Combobox
            id="stripe-copy-from-key"
            options={activeApiKeys}
            value={copiedFromKey}
            onValueChange={applyKeyPermissions}
            getOptionValue={(apiKey) => apiKey.id}
            getOptionLabel={(apiKey) => apiKey.name || apiKey.id}
            placeholder="Select a key..."
            searchPlaceholder="Search keys..."
            searchAriaLabel="Search Stripe API keys"
            isLoading={isApiKeysLoading}
            isDisabled={isRotationOptionLoading}
          />
          <FieldDescription>
            Applies that key&apos;s permissions to the fields above. It does not link the rotation
            to the key.
          </FieldDescription>
        </Field>
      )}
    </>
  );
};
