import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  TChecklyAccount,
  useChecklyConnectionListAccounts
} from "@app/hooks/api/appConnections/checkly";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const ChecklySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Checkly }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: accounts = [], isPending: isAccountsLoading } = useChecklyConnectionListAccounts(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <>
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
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Select an account"
            tooltipClassName="max-w-md"
          >
            <FilterableSelect
              isLoading={isAccountsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={accounts.find((p) => p.id === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TChecklyAccount>;
                onChange(v?.id ?? null);
                setValue("destinationConfig.accountName", v?.name ?? "");
              }}
              options={accounts}
              placeholder="Select an account..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
    </>
  );
};
