import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  useSnowflakeConnectionListDatabases,
  useSnowflakeConnectionListSchemas
} from "@app/hooks/api/appConnections/snowflake";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const SnowflakeSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Snowflake }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const database = useWatch({ name: "destinationConfig.database", control });

  const { data: databases = [], isPending: isDatabasesPending } =
    useSnowflakeConnectionListDatabases(connectionId, {
      enabled: Boolean(connectionId)
    });

  const { data: schemas = [], isPending: isSchemasPending } = useSnowflakeConnectionListSchemas(
    { connectionId, database },
    {
      enabled: Boolean(connectionId) && Boolean(database)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.database", "");
          setValue("destinationConfig.schema", "");
        }}
      />

      <Controller
        name="destinationConfig.database"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Database
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  The Snowflake database that contains the target schema. The database must already
                  exist.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Combobox
                isError={Boolean(error)}
                isLoading={isDatabasesPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={databases.find((db) => db.name === value) ?? null}
                onValueChange={(option) => {
                  setValue("destinationConfig.schema", "");
                  onChange(option.name ?? "");
                }}
                options={databases}
                placeholder="Select a database..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.schema"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Schema
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  The Snowflake schema (within the selected database) where secrets will be created.
                  The schema must already exist.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Combobox
                isError={Boolean(error)}
                isLoading={isSchemasPending && Boolean(connectionId) && Boolean(database)}
                isDisabled={!connectionId || !database}
                value={schemas.find((schema) => schema.name === value) ?? null}
                onValueChange={(option) => onChange(option.name ?? "")}
                options={schemas}
                placeholder="Select a schema..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
