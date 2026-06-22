import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import {
  TNetlifyAccount,
  TNetlifySite,
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
              <FilterableSelect
                isLoading={isAccountsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={accounts.find((p) => p.id === value) ?? null}
                onChange={(option) => {
                  const v = option as SingleValue<TNetlifyAccount>;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.accountName", v?.name ?? "");
                }}
                options={accounts}
                placeholder="Select an account..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
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
              <FilterableSelect
                isLoading={isSitesLoading && Boolean(accountId)}
                isDisabled={!accountId}
                value={sites.find((p) => p.id === value) ?? null}
                onChange={(option) => {
                  const v = option as SingleValue<TNetlifySite>;
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
              <FilterableSelect
                isDisabled={!accountId}
                value={contexts.find((p) => p.value === value) ?? undefined}
                onChange={(option) => {
                  const v = option as SingleValue<{ label: string; value: NetlifySyncContext }>;
                  if (v) onChange(v.value);
                }}
                options={contexts}
                placeholder="Select a context..."
                getOptionLabel={(option) => option.label}
                getOptionValue={(option) => option.value}
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
