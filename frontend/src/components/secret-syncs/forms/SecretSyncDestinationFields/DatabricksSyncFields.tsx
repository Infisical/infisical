import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import {
  TDatabricksSecretScope,
  useDatabricksConnectionListSecretScopes
} from "@app/hooks/api/appConnections/databricks";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const DatabricksSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Databricks }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: secretScopes = [], isPending: isSecretScopesPending } =
    useDatabricksConnectionListSecretScopes(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scope", "");
        }}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Secret Scope"
            tooltipClassName="max-w-md"
            tooltipText="Infisical recommends creating a designated Databricks secret scope for your sync to prevent removal of secrets not managed by Infisical."
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure that you've created the secret scope in the selected workspace, the service principal has been assigned to the respective workspace and that your service principal has write permissions for the specified secret scope."
              >
                <div>
                  <span>Don&#39;t see the secret scope you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              isLoading={isSecretScopesPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={secretScopes.find((scope) => scope.name === value) ?? null}
              onChange={(option) =>
                onChange((option as SingleValue<TDatabricksSecretScope>)?.name ?? null)
              }
              options={secretScopes}
              placeholder="Select a secret scope..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.name}
            />
          </FormControl>
        )}
      />
    </>
  );
};
