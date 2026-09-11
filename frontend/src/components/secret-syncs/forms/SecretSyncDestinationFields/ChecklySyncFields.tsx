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
  useChecklyConnectionListAccounts,
  useChecklyConnectionListGroups
} from "@app/hooks/api/appConnections/checkly";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const ChecklySyncFields = () => {
  const { control, setValue, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Checkly }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: accounts = [], isPending: isAccountsLoading } = useChecklyConnectionListAccounts(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const accountId = watch("destinationConfig.accountId");

  const { data: groups = [], isPending: isGroupsLoading } = useChecklyConnectionListGroups(
    connectionId,
    accountId,
    {
      enabled: Boolean(connectionId && accountId)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.accountId", "");
          setValue("destinationConfig.accountName", "");
          setValue("destinationConfig.groupId", "");
          setValue("destinationConfig.groupName", undefined);
        }}
      />
      <Controller
        name="destinationConfig.accountId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-checkly-account-id-label"
              htmlFor="secret-sync-checkly-account-id"
            >
              Select an account
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-checkly-account-id-label"
                aria-describedby={error ? "secret-sync-checkly-account-id-error" : undefined}
                id="secret-sync-checkly-account-id"
                isError={Boolean(error)}
                isLoading={isAccountsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={accounts.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const v = option;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.accountName", v?.name ?? "");
                  setValue("destinationConfig.groupId", "");
                  setValue("destinationConfig.groupName", undefined);
                }}
                options={accounts}
                placeholder="Select an account..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError id="secret-sync-checkly-account-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.groupId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-checkly-group-id-label"
              htmlFor="secret-sync-checkly-group-id"
            >
              Select a group (Optional)
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-checkly-group-id-label"
                aria-describedby={
                  error
                    ? "secret-sync-checkly-group-id-description secret-sync-checkly-group-id-error"
                    : "secret-sync-checkly-group-id-description"
                }
                id="secret-sync-checkly-group-id"
                isError={Boolean(error)}
                isLoading={isGroupsLoading && Boolean(connectionId && accountId)}
                isDisabled={!connectionId || !accountId}
                value={groups.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const v = option;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.groupName", v?.name ?? undefined);
                }}
                onClear={() => {
                  onChange("");
                  setValue("destinationConfig.groupName", undefined);
                }}
                options={groups}
                placeholder="Select a group..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldDescription id="secret-sync-checkly-group-id-description">
                If provided, secrets will be scoped to a check group instead
              </FieldDescription>
              <FieldError id="secret-sync-checkly-group-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
