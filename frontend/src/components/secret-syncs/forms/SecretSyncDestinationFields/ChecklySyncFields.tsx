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
          setValue("destinationConfig.groupId", undefined);
          setValue("destinationConfig.groupName", undefined);
        }}
      />
      <Controller
        name="destinationConfig.accountId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Select an account</FieldLabel>
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
        name="destinationConfig.groupId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Select a group (Optional)</FieldLabel>
            <FieldContent>
              <Combobox
                isLoading={isGroupsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={groups.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const v = option;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.groupName", v?.name ?? undefined);
                }}
                onClear={() => {
                  onChange(undefined);
                  setValue("destinationConfig.groupName", undefined);
                }}
                options={groups}
                placeholder="Select a group..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                modal
              />
              <FieldDescription>
                If provided, secrets will be scoped to a check group instead
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
