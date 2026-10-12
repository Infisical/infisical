import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import { CLOUDFLARE_SECRETS_STORE_SCOPE_LABELS } from "@app/helpers/secretSyncs";
import { useCloudflareConnectionListSecretsStores } from "@app/hooks/api/appConnections/cloudflare";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CloudflareSecretsStoreScope } from "@app/hooks/api/secretSyncs/types/cloudflare-secrets-store-sync";

import { TSecretSyncForm } from "../schemas";

const SCOPE_OPTIONS = Object.values(CloudflareSecretsStoreScope);

export const CloudflareSecretsStoreSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareSecretsStore }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const {
    data: stores,
    isLoading: isStoresLoading,
    error: storesError
  } = useCloudflareConnectionListSecretsStores(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.storeId", "");
          setValue("destinationConfig.storeName", "");
        }}
      />

      <Controller
        name="destinationConfig.storeId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-cloudflare-secrets-store-store-id-label"
              htmlFor="secret-sync-cloudflare-secrets-store-store-id"
            >
              Secrets Store
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-cloudflare-secrets-store-store-id-label"
                aria-describedby={
                  error ? "secret-sync-cloudflare-secrets-store-store-id-error" : undefined
                }
                id="secret-sync-cloudflare-secrets-store-store-id"
                isError={Boolean(error)}
                isLoading={isStoresLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={stores?.find((store) => store.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option?.id ?? "");
                  setValue("destinationConfig.storeName", option?.name ?? "");
                }}
                options={stores ?? []}
                placeholder="Select a store..."
                emptyMessage={
                  storesError
                    ? "Unable to load Cloudflare Secrets Stores. Check that the connection's API token has the Secrets Store Edit permission."
                    : undefined
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError
                id="secret-sync-cloudflare-secrets-store-store-id-error"
                errors={[error]}
              />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.scopes"
        control={control}
        defaultValue={[CloudflareSecretsStoreScope.Workers]}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-cloudflare-secrets-store-scopes-label"
              htmlFor="secret-sync-cloudflare-secrets-store-scopes"
            >
              Scopes
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-cloudflare-secrets-store-scopes-label"
                aria-describedby={
                  error
                    ? "secret-sync-cloudflare-secrets-store-scopes-description secret-sync-cloudflare-secrets-store-scopes-error"
                    : "secret-sync-cloudflare-secrets-store-scopes-description"
                }
                id="secret-sync-cloudflare-secrets-store-scopes"
                isError={Boolean(error)}
                multiple
                value={SCOPE_OPTIONS.filter((scope) => (value || []).includes(scope))}
                onValueChange={onChange}
                options={SCOPE_OPTIONS}
                placeholder="Select scopes..."
                getOptionLabel={(option) => CLOUDFLARE_SECRETS_STORE_SCOPE_LABELS[option]}
                getOptionValue={(option) => option}
                modal
              />
              <FieldDescription id="secret-sync-cloudflare-secrets-store-scopes-description">
                The Cloudflare services allowed to use the synced secrets.
              </FieldDescription>
              <FieldError id="secret-sync-cloudflare-secrets-store-scopes-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
