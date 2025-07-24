import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { useDigitalOceanConnectionListApps } from "@app/hooks/api/appConnections/digital-ocean";
import { TDigitalOceanApp } from "@app/hooks/api/appConnections/digital-ocean/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const DigitalOceanAppPlatformSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.DigitalOceanAppPlatform }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: apps = [], isPending: isAccountsLoading } = useDigitalOceanConnectionListApps(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.appId", "");
          setValue("destinationConfig.appName", "");
        }}
      />
      <Controller
        name="destinationConfig.appId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Select an app"
            tooltipClassName="max-w-md"
          >
            <FilterableSelect
              isLoading={isAccountsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={apps.find((p) => p.id === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TDigitalOceanApp>;
                onChange(v?.id ?? null);
                setValue("destinationConfig.appName", v?.spec.name ?? "");
              }}
              options={apps}
              placeholder="Select an app..."
              getOptionLabel={(option) => option.spec.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
    </>
  );
};
