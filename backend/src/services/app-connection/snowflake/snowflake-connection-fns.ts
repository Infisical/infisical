import snowflake from "snowflake-sdk";

import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SnowflakeConnectionMethod } from "./snowflake-connection-enums";
import { TSnowflakeConnection, TSnowflakeConnectionConfig } from "./snowflake-connection-types";

const noop = () => {};

const SNOWFLAKE_EXCLUDED_DATABASES = new Set(["SNOWFLAKE", "SNOWFLAKE_SAMPLE_DATA"]);
const SNOWFLAKE_EXCLUDED_SCHEMAS = new Set(["INFORMATION_SCHEMA"]);

export const SNOWFLAKE_SHOW_PAGE_SIZE = 1000;

const escapeSnowflakeStringLiteral = (value: string) => value.replace(/'/g, "''");

export const quoteSnowflakeIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

const withTimeout = async <T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(onTimeout()), ms);
      })
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

export const getSnowflakeConnectionListItem = () => {
  return {
    name: "Snowflake" as const,
    app: AppConnection.Snowflake as const,
    methods: Object.values(SnowflakeConnectionMethod) as [SnowflakeConnectionMethod.UsernameAndToken]
  };
};

export const getSnowflakeClient = async (credentials: TSnowflakeConnection["credentials"]) => {
  const client = snowflake.createConnection({
    account: credentials.account,
    username: credentials.username,
    password: credentials.password,
    application: "Infisical"
  });

  try {
    await client.connectAsync();

    const isValid = await withTimeout(
      client.isValidAsync(),
      10_000,
      () => new BadRequestError({ message: "Snowflake connection validation timed out" })
    );

    if (!isValid) {
      throw new BadRequestError({
        message:
          "Snowflake connection is not valid - heartbeat failed; verify credentials, network access, and that the account is not locked"
      });
    }

    return client;
  } catch (err) {
    client.destroy(noop);
    throw err;
  }
};

export const executeSnowflakeSql = <TRow = Record<string, unknown>>(
  client: snowflake.Connection,
  sqlText: string,
  binds?: snowflake.Binds
): Promise<TRow[]> =>
  new Promise((resolve, reject) => {
    client.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) return reject(err);
        return resolve((rows ?? []) as TRow[]);
      }
    });
  });

export async function* paginateSnowflakeShow<TRow extends { name?: string | null }>(
  client: snowflake.Connection,
  baseQuery: string,
  pageSize: number = SNOWFLAKE_SHOW_PAGE_SIZE
): AsyncGenerator<TRow[]> {
  let cursor: string | undefined;

  while (true) {
    const sqlText = cursor
      ? `${baseQuery} LIMIT ${pageSize} FROM '${escapeSnowflakeStringLiteral(cursor)}'`
      : `${baseQuery} LIMIT ${pageSize}`;

    // eslint-disable-next-line no-await-in-loop
    const rows = await executeSnowflakeSql<TRow>(client, sqlText);
    if (rows.length === 0) return;

    yield rows;

    if (rows.length < pageSize) return;

    const lastName = rows[rows.length - 1]?.name;
    if (!lastName) return;
    cursor = lastName;
  }
}

export const withSnowflakeClient = async <T>(
  credentials: TSnowflakeConnection["credentials"],
  fn: (client: snowflake.Connection) => Promise<T>
): Promise<T> => {
  let client: snowflake.Connection | undefined;
  try {
    client = await getSnowflakeClient(credentials);
    return await fn(client);
  } finally {
    if (client) client.destroy(noop);
  }
};

const sanitizeSnowflakeError = (
  err: unknown,
  credentials: TSnowflakeConnection["credentials"],
  errorPrefix: string
) => {
  const sanitizedErrorMessage = sanitizeString({
    unsanitizedString: (err as Error)?.message ?? "",
    tokens: [credentials.password, credentials.username, credentials.account]
  });
  return new BadRequestError({
    message: `${errorPrefix}: ${sanitizedErrorMessage || "verify credentials and permissions"}`
  });
};

export const validateSnowflakeConnectionCredentials = async (config: TSnowflakeConnectionConfig) => {
  try {
    await withSnowflakeClient(config.credentials, async () => undefined);
    return config.credentials;
  } catch (err) {
    throw sanitizeSnowflakeError(err, config.credentials, "Unable to validate connection");
  }
};

export const listSnowflakeDatabases = async (credentials: TSnowflakeConnection["credentials"]) => {
  try {
    return await withSnowflakeClient(credentials, async (client) => {
      const databases: { name: string }[] = [];
      for await (const page of paginateSnowflakeShow<{ name?: string }>(client, "SHOW DATABASES")) {
        for (const row of page) {
          // eslint-disable-next-line no-continue
          if (!row.name) continue;
          // eslint-disable-next-line no-continue
          if (SNOWFLAKE_EXCLUDED_DATABASES.has(row.name.toUpperCase())) continue;
          databases.push({ name: row.name });
        }
      }
      return databases;
    });
  } catch (err) {
    throw sanitizeSnowflakeError(err, credentials, "Unable to list Snowflake databases");
  }
};

export const listSnowflakeSchemas = async (credentials: TSnowflakeConnection["credentials"], database: string) => {
  try {
    return await withSnowflakeClient(credentials, async (client) => {
      const schemas: { name: string }[] = [];
      for await (const page of paginateSnowflakeShow<{ name?: string }>(
        client,
        `SHOW SCHEMAS IN DATABASE ${quoteSnowflakeIdent(database)}`
      )) {
        for (const row of page) {
          // eslint-disable-next-line no-continue
          if (!row.name) continue;
          // eslint-disable-next-line no-continue
          if (SNOWFLAKE_EXCLUDED_SCHEMAS.has(row.name.toUpperCase())) continue;
          schemas.push({ name: row.name });
        }
      }
      return schemas;
    });
  } catch (err) {
    throw sanitizeSnowflakeError(err, credentials, "Unable to list Snowflake schemas");
  }
};
