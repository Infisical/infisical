import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { useSalesforceConnectionListOauthApps } from "@app/hooks/api/appConnections/salesforce";
import { TSalesforceOauthApp } from "@app/hooks/api/appConnections/salesforce/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const SalesforceOauthCredentialsRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SalesforceOauthCredentials;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: apps, isPending: isAppsPending } = useSalesforceConnectionListOauthApps(
    connectionId,
    { enabled: Boolean(connectionId) }
  );

  return (
    <Controller
      name="parameters.appId"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl
          isError={Boolean(error)}
          errorText={error?.message}
          label="External Client App"
          helperText={
            <Tooltip
              className="max-w-md"
              content={
                <>
                  Ensure that your Salesforce External Client App has OAuth client credentials
                  enabled and is reachable by the connection.
                </>
              }
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
            isLoading={isAppsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={apps?.find((app) => app.identifier === value) ?? null}
            onChange={(option) => {
              const selected = option as SingleValue<TSalesforceOauthApp>;
              onChange(selected?.identifier ?? "");
              setValue("parameters.appName", selected?.developerName ?? "", {
                shouldDirty: true,
                shouldValidate: true
              });
            }}
            options={apps}
            placeholder="Select an external client app..."
            getOptionLabel={(option) => option.developerName}
            getOptionValue={(option) => option.identifier}
          />
        </FormControl>
      )}
    />
  );
};
