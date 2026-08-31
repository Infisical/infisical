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
import {
  useNetlifyConnectionListAccounts,
  useNetlifyConnectionListSites
} from "@app/hooks/api/appConnections/netlify";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { NetlifySyncContext } from "../schemas/netlify-sync-destination-schema";

export const NetlifySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Netlify }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const accountId = useWatch({ name: "destinationConfig.accountId", control });

  const { data: accounts = [], isPending: isAccountsLoading } = useNetlifyConnectionListAccounts(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: sites = [], isPending: isSitesLoading } = useNetlifyConnectionListSites(
    connectionId,
    accountId,
    {
      enabled: Boolean(accountId)
    }
  );

  const contexts = Object.entries(NetlifySyncContext).map(([key, value]) => ({
    label: key,
    value
  }));

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.accountId", "");
          setValue("destinationConfig.accountName", "");
        }}
      />
      <Controller
        name="destinationConfig.accountId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Account</FieldLabel>
            <FieldContent>
              <Combobox
                isLoading={isAccountsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={accounts.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const v = option;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.accountName", v?.name ?? "");
                }}
                options={accounts}
                placeholder="Select an account..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.siteId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Site (Optional)</FieldLabel>
            <FieldContent>
              <Combobox
                isLoading={isSitesLoading && Boolean(accountId)}
                isDisabled={!accountId}
                value={sites.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const v = option;
                  if (v?.id === value) {
                    onChange(undefined);
                    setValue("destinationConfig.siteName", undefined);
                  } else {
                    onChange(v?.id);
                    setValue("destinationConfig.siteName", v?.name);
                  }
                }}
                options={sites}
                placeholder="Select a site..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                modal
              />
              <FieldDescription>
                If you do not select a site, the secrets will be synced to all sites in the account.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.context"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Context (Optional)</FieldLabel>
            <FieldContent>
              <Combobox
                isDisabled={!accountId}
                value={contexts.find((p) => p.value === value) ?? undefined}
                onValueChange={(option) => {
                  const v = option;
                  if (v) onChange(v.value);
                }}
                options={contexts}
                placeholder="Select a context..."
                getOptionLabel={(option) => option.label}
                getOptionValue={(option) => option.value}
                modal
              />
              <FieldDescription>
                Avoid configuring multiple syncs with overlapping contexts for the same site.
                &quot;All Contexts&quot; overlaps with every context. Overlapping syncs may delete
                each other&apos;s secrets.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
