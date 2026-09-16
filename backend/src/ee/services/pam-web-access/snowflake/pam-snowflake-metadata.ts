import snowflake from "snowflake-sdk";

import { executeSnowflakeSql } from "@app/services/app-connection/snowflake";

import { type OneShotOptions } from "../pam-data-explorer-session-handler";
import { SCHEMAS_QUERY, TABLES_QUERY } from "./pam-snowflake-data-explorer-metadata";
import { connectThroughRelay } from "./pam-snowflake-relay-client";

export const snowflakeAccountOf = (opts: OneShotOptions) => (opts.connectionDetails as { account: string }).account;

const withClient = async <T>(opts: OneShotOptions, fn: (client: snowflake.Connection) => Promise<T>): Promise<T> => {
  const client = await connectThroughRelay(opts.relayPort, snowflakeAccountOf(opts));
  try {
    return await fn(client);
  } finally {
    client.destroy(() => {});
  }
};

export const fetchSchemasOneShot = (opts: OneShotOptions): Promise<{ name: string }[]> =>
  withClient(opts, (client) => executeSnowflakeSql<{ name: string }>(client, SCHEMAS_QUERY));

export const fetchTablesOneShot = (
  opts: OneShotOptions,
  schema: string
): Promise<{ name: string; tableType: string }[]> =>
  withClient(opts, (client) =>
    executeSnowflakeSql<{ name: string; tableType: string }>(client, TABLES_QUERY, [schema])
  );

export const verifyReachabilityOneShot = (opts: OneShotOptions): Promise<void> =>
  withClient(opts, async (client) => {
    await executeSnowflakeSql(client, "SELECT 1");
  });
