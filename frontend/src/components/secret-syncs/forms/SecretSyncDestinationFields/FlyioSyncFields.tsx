import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { TFlyioApp, useFlyioConnectionListApps } from "@app/hooks/api/appConnections/flyio";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const FlyioSyncFields = () => {
  const { control, setValue, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Flyio }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: apps, isLoading: isAppsLoading } = useFlyioConnectionListApps(connectionId, {
    enabled: Boolean(connectionId)
  });

  const appId = watch("destinationConfig.appId");
  const appName = watch("destinationConfig.appName");

  useEffect(() => {
    if (apps && appId && !appName) {
      const selectedApp = apps.find((v) => v.id === appId);
      if (selectedApp) {
        setValue("destinationConfig.appName", selectedApp.name);
      }
    }
  }, [apps, appId, appName, setValue]);

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
          <FormControl isError={Boolean(error)} errorText={error?.message} label="App">
            <FilterableSelect
              menuPlacement="top"
              isLoading={isAppsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={apps?.find((v) => v.id === value) ?? null}
              onChange={(option) => {
                const selected = option as SingleValue<TFlyioApp>;
                onChange(selected?.id ?? null);
                setValue("destinationConfig.appName", selected?.name ?? "");
              }}
              options={apps}
              placeholder="Select an app..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
    </>
  );
};
