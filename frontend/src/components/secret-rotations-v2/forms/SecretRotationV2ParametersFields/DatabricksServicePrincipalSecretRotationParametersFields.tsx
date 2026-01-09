import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { useDatabricksConnectionListServicePrincipals } from "@app/hooks/api/appConnections/databricks";
import { TDatabricksServicePrincipal } from "@app/hooks/api/appConnections/databricks/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const DatabricksServicePrincipalSecretRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatabricksServicePrincipalSecret;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: servicePrincipals, isPending: isServicePrincipalsPending } =
    useDatabricksConnectionListServicePrincipals(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <Controller
      name="parameters.servicePrincipalId"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl
          isError={Boolean(error)}
          errorText={error?.message}
          label="Service Principal"
          helperText={
            <Tooltip
              className="max-w-md"
              content={
                <>
                  Ensure that your connection has the necessary permissions to list and manage
                  service principals in your Databricks workspace.
                </>
              }
            >
              <div>
                <span>Don&#39;t see the service principal you&#39;re looking for?</span>{" "}
                <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
              </div>
            </Tooltip>
          }
        >
          <FilterableSelect
            menuPlacement="top"
            isLoading={isServicePrincipalsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={servicePrincipals?.find((sp) => sp.id === value) ?? null}
            onChange={(option) => {
              const selectedSp = option as SingleValue<TDatabricksServicePrincipal>;
              onChange(selectedSp?.id ?? null);
              setValue("parameters.servicePrincipalName", selectedSp?.name ?? "");
              setValue("parameters.clientId", selectedSp?.clientId ?? "");
            }}
            options={servicePrincipals}
            placeholder="Select a service principal..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
          />
        </FormControl>
      )}
    />
  );
};
