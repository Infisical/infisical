import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
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
    <>
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
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Database"
            tooltipClassName="max-w-sm"
            tooltipText="The Snowflake database that contains the target schema. The database must already exist."
          >
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
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.schema"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Schema"
            tooltipClassName="max-w-sm"
            tooltipText="The Snowflake schema (within the selected database) where secrets will be created. The schema must already exist."
          >
            <FilterableSelect
              isLoading={isSchemasPending && Boolean(connectionId) && Boolean(database)}
              isDisabled={!connectionId || !database}
              value={schemas.find((schema) => schema.name === value) ?? null}
              onChange={(option) => onChange((option as SingleValue<TSnowflakeSchema>)?.name ?? "")}
              options={schemas}
              placeholder="Select a schema..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.name}
            />
          </FormControl>
        )}
      />
    </>
  );
};
