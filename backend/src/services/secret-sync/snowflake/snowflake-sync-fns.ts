import snowflake from "snowflake-sdk";

import { sanitizeSqlLikeString, sanitizeString } from "@app/lib/fn";
import {
  executeSnowflakeSql,
  quoteSnowflakeIdent,
  TSnowflakeConnection,
  withSnowflakeClient
} from "@app/services/app-connection/snowflake";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TSnowflakeSyncWithCredentials } from "./snowflake-sync-types";

const buildFqn = (database: string, schema: string, name: string) =>
  `${quoteSnowflakeIdent(database)}.${quoteSnowflakeIdent(schema)}.${quoteSnowflakeIdent(name)}`;

const databaseExists = async (client: snowflake.Connection, database: string) => {
  const rows = await executeSnowflakeSql(client, "SHOW DATABASES LIKE ?", [sanitizeSqlLikeString(database)]);
  return rows.length > 0;
};

const schemaExists = async (client: snowflake.Connection, database: string, schema: string) => {
  try {
    const rows = await executeSnowflakeSql(client, `SHOW SCHEMAS LIKE ? IN DATABASE ${quoteSnowflakeIdent(database)}`, [
      sanitizeSqlLikeString(schema)
    ]);
    return rows.length > 0;
  } catch (err) {
    const message = (err as Error)?.message ?? "";
    if (/does not exist|not authorized/i.test(message)) return false;
    throw err;
  }
};

const listExistingSecretNames = async (
  client: snowflake.Connection,
  database: string,
  schema: string
): Promise<string[]> => {
  const rows = await executeSnowflakeSql<{ name: string }>(
    client,
    `SHOW SECRETS IN SCHEMA ${quoteSnowflakeIdent(database)}.${quoteSnowflakeIdent(schema)}`
  );
  return rows.map((row) => row.name).filter((name): name is string => typeof name === "string");
};

const upsertSecret = async (
  client: snowflake.Connection,
  database: string,
  schema: string,
  name: string,
  value: string
) => {
  await executeSnowflakeSql(
    client,
    `CREATE OR REPLACE SECRET ${buildFqn(database, schema, name)} TYPE = GENERIC_STRING SECRET_STRING = ?`,
    [value]
  );
};

const dropSecret = async (client: snowflake.Connection, database: string, schema: string, name: string) => {
  await executeSnowflakeSql(client, `DROP SECRET IF EXISTS ${buildFqn(database, schema, name)}`);
};

const wrapSnowflakeError = (err: unknown, credentials: TSnowflakeConnection["credentials"]): SecretSyncError => {
  const sanitized = sanitizeString({
    unsanitizedString: (err as Error)?.message ?? "",
    tokens: [credentials.password, credentials.username, credentials.account]
  });
  return new SecretSyncError({
    message: sanitized || "Unable to communicate with Snowflake",
    shouldRetry: false,
    error: err
  });
};

export const SnowflakeSyncFns = {
  syncSecrets: async (secretSync: TSnowflakeSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig: { database, schema },
      connection
    } = secretSync;

    try {
      await withSnowflakeClient(connection.credentials, async (client) => {
        if (!(await databaseExists(client, database))) {
          throw new SecretSyncError({
            message: `Database "${database}" does not exist or is not accessible with the connected Snowflake user`,
            shouldRetry: false
          });
        }

        if (!(await schemaExists(client, database, schema))) {
          throw new SecretSyncError({
            message: `Schema "${schema}" does not exist in database "${database}" or is not accessible with the connected Snowflake user`,
            shouldRetry: false
          });
        }

        for await (const [key, entry] of Object.entries(secretMap)) {
          try {
            await upsertSecret(client, database, schema, key, entry.value);
          } catch (err) {
            throw new SecretSyncError({ error: err, secretKey: key });
          }
        }

        if (secretSync.syncOptions.disableSecretDeletion) return;

        const existingNames = await listExistingSecretNames(client, database, schema);

        for await (const existingName of existingNames) {
          if (!matchesSchema(existingName, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema)) {
            // eslint-disable-next-line no-continue
            continue;
          }

          if (!(existingName in secretMap)) {
            await dropSecret(client, database, schema, existingName);
          }
        }
      });
    } catch (err) {
      if (err instanceof SecretSyncError) throw err;
      throw wrapSnowflakeError(err, connection.credentials);
    }
  },

  getSecrets: async (secretSync: TSnowflakeSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: TSnowflakeSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig: { database, schema },
      connection
    } = secretSync;

    try {
      await withSnowflakeClient(connection.credentials, async (client) => {
        for await (const key of Object.keys(secretMap)) {
          await dropSecret(client, database, schema, key);
        }
      });
    } catch (err) {
      if (err instanceof SecretSyncError) throw err;
      throw wrapSnowflakeError(err, connection.credentials);
    }
  }
};
