import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { useAzureConnectionListClients } from "@app/hooks/api/appConnections/azure";
import { TAzureClient } from "@app/hooks/api/appConnections/azure/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const AzureClientSecretRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.AzureClientSecret;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: clients, isPending: isClientsPending } = useAzureConnectionListClients(
    connectionId,
    { enabled: Boolean(connectionId) }
  );

  return (
    <Controller
      name="parameters.objectId"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl
          isError={Boolean(error)}
          errorText={error?.message}
          label="Application"
          helperText={
            <Tooltip
              className="max-w-md"
              content={
                <>
                  Ensure that your connection has the{" "}
                  <span className="font-semibold">
                    Application.ReadWrite.All, Directory.ReadWrite.All,
                    Application.ReadWrite.OwnedBy, user_impersonation and User.Read
                  </span>{" "}
                  permissions and the application exists in Azure.
                </>
              }
            >
              <div>
                <span>Don&#39;t see the application you&#39;re looking for?</span>{" "}
                <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
              </div>
            </Tooltip>
          }
        >
          <FilterableSelect
            menuPlacement="top"
            isLoading={isClientsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={clients?.find((client) => client.id === value) ?? null}
            onChange={(option) => {
              onChange((option as SingleValue<TAzureClient>)?.id ?? null);
              setValue("parameters.appName", (option as SingleValue<TAzureClient>)?.name ?? "");
              setValue("parameters.clientId", (option as SingleValue<TAzureClient>)?.appId ?? "");
            }}
            options={clients}
            placeholder="Select an application..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
          />
        </FormControl>
      )}
    />
  );
};
