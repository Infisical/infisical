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
  TSnowflakeDatabase,
  TSnowflakeSchema,
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
              <FilterableSelect
                isLoading={isDatabasesPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={databases.find((db) => db.name === value) ?? null}
                onChange={(option) => {
                  setValue("destinationConfig.schema", "");
                  onChange((option as SingleValue<TSnowflakeDatabase>)?.name ?? "");
                }}
                options={databases}
                placeholder="Select a database..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
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
              <FilterableSelect
                isLoading={isSchemasPending && Boolean(connectionId) && Boolean(database)}
                isDisabled={!connectionId || !database}
                value={schemas.find((schema) => schema.name === value) ?? null}
                onChange={(option) =>
                  onChange((option as SingleValue<TSnowflakeSchema>)?.name ?? "")
                }
                options={schemas}
                placeholder="Select a schema..."
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
