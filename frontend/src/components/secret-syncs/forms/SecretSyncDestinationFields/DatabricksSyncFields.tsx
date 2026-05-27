import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scope", "");
        }}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Secret Scope
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Infisical recommends creating a designated Databricks secret scope for your sync
                  to prevent removal of secrets not managed by Infisical. Ensure that you&apos;ve
                  created the secret scope in the selected workspace, the service principal has been
                  assigned to the respective workspace and that your service principal has write
                  permissions for the specified secret scope.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
