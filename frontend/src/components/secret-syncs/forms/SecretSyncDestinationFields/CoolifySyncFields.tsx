import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { useCoolifyConnectionListApplications } from "@app/hooks/api/appConnections/coolify/queries";
import { TCoolifyApplication } from "@app/hooks/api/appConnections/coolify/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { SecretSyncConnectionField } from "../SecretSyncConnectionField";

export const CoolifySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Coolify }
  >();
  const connectionId = useWatch({ name: "connection.id", control });

  const { data: applications, isLoading: isApplicationsLoading } =
    useCoolifyConnectionListApplications(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.appId", "");
        }}
      />

      <Controller
        name="destinationConfig.appId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Vault"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the application exists in the connection's Coolify instance URL."
              >
                <div>
                  <span>Don&#39;t see the application you&#39;re looking for?</span>{" "}
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isApplicationsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={applications?.find((v) => v.uuid === value) ?? null}
              onChange={(option) =>
                onChange((option as SingleValue<TCoolifyApplication>)?.uuid ?? null)
              }
              options={applications}
              placeholder="Select an application..."
              getOptionLabel={(option) =>
                `${option.name} - ${option.environmentName} - ${option.projectName}`
              }
              getOptionValue={(option) => option.uuid}
            />
          </FormControl>
        )}
      />
    </>
  );
};
