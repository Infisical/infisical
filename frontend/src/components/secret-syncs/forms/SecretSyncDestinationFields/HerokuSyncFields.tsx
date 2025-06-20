import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { THerokuApp } from "@app/hooks/api/appConnections/heroku";
import { useHerokuConnectionListApps } from "@app/hooks/api/appConnections/heroku/queries";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const HerokuSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Heroku }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: apps, isLoading: isAppsLoading } = useHerokuConnectionListApps(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.appName", "");
        }}
      />

      <Controller
        name="destinationConfig.app"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="App"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the app exists in the connection's Heroku instance URL."
              >
                <div>
                  <span>Don&#39;t see the app you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isAppsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={apps?.find((app) => app.id === value) ?? null}
              onChange={(option) => {
                onChange((option as SingleValue<THerokuApp>)?.id ?? "");
                setValue(
                  "destinationConfig.appName",
                  (option as SingleValue<THerokuApp>)?.name ?? ""
                );
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
